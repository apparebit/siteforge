/* © 2021 Robert Grimm */

import { constants } from 'http2';
import Context from './context.js';
import MediaType from './media-type.js';
import { MethodName, StatusCode } from './constants.js';
import { Readable } from 'stream';
import { validateRoutePath } from './util.js';

const { byteLength, isBuffer } = Buffer;
const configurable = true;
const { defineProperties } = Object;
const { EventStream } = MediaType;
const { GET, HEAD } = MethodName;
const { isArray } = Array;
const { isSafeInteger } = Number;
const { MethodNotAllowed, NotAcceptable, Ok, ServiceUnavailable } = StatusCode;
const { NGHTTP2_STREAM_CLOSED } = constants;

/**
 * Provide basic scaffolding for middleware processing. Before the next
 * middleware, it validates the request path. After the next middleware, it
 * converts any middleware error into a proper HTTP error response, improves
 * response security by adding relevant headers, sends the response, and logs
 * both request and response. It should always be the first middleware.
 */
export const scaffold = () => async (context, next) => {
  // Record start time.
  const time = Date.now();

  try {
    // Run middleware on context with validated path.
    context.validateRequestPath();
    await next();
  } catch (x) {
    // Handle any errors but do not send response.
    try {
      await context.fail(x);
    } catch (x) {
      context.failAgain(x);
    }
  }

  // Harden response and actually send it.
  await context.harden().respond();

  // Log request and response.
  context.logger.info(context.toCombinedLogFormat({ time }));
};

/** Redirect a path with trailing slash to the version without it. */
export const redirectOnTrailingSlash = () => async (context, next) => {
  const { path } = context.request;
  if (path !== '/' && path.endsWith('/')) {
    context.redirect(context.origin + path.slice(0, -1));
  } else {
    await next();
  }
};

export const allowGetAndHeadOnly = () => async (context, next) => {
  const { method } = context.request;
  if (method !== GET && method !== HEAD) {
    throw Context.Error(MethodNotAllowed, `Only GET and HEAD are supported`);
  } else {
    await next();
  }
};

export const doNotCache = () => async (context, next) => {
  await next();
  context.response.cache = 'no-store, no-transform';
};

/** Provide the response body by mapping the request path to the file system. */
export const satisfyFromFileSystem = ({ root }) => {
  root = validateRoutePath(root);

  return async context => {
    await context.satisfyFromFileSystem({ root });
  };
};

/** Literally provide the response body. */
export const content = ({ body, type }) => {
  type = MediaType.from(type);

  return context => {
    context.prepare(body);
    context.response.type = type;
  };
};

/** Provide a new server-sent event source as response body. */
export const eventSource = ({
  heartbeat = 10 * 60 * 1000,
  reconnect = 2000,
  startTimer = setInterval,
  stopTimer = clearInterval,
  logger = { trace() { } }, // Only method called from within eventSource()
} = {}) => {
  if (!isSafeInteger(heartbeat)) {
    throw new TypeError(`Heartbeat interval "${heartbeat}" isn't an integer`);
  } else if (!isSafeInteger(reconnect)) {
    throw new TypeError(`Reconnect delay "${reconnect}" isn't an integer`);
  } else if (typeof startTimer !== 'function') {
    throw new TypeError(`Start timer "${startTimer}" isn't a function`);
  } else if (typeof stopTimer !== 'function') {
    throw new TypeError(`Stop timer "${stopTimer}" isn't a function`);
  }

  const listeners = new Set();
  let closed = false;

  const acceptReceiver = context => {
    if (closed) {
      throw Context.Error(ServiceUnavailable, `Server is shutting down`);
    }

    const { request, response, stream } = context;
    const { method } = request;
    if (method !== GET && method !== HEAD) {
      throw Context.Error(
        MethodNotAllowed,
        `Use GET not ${request.method} for subscribing to event source "${request.path}"`
      );
    } else if (EventStream.matchForQuality(...request.accept) === 0) {
      throw Context.Error(
        NotAcceptable,
        `Event source "${request.path}" supports "text/event-stream" format only`
      );
    }

    context.markResponded();
    listeners.add(context);
    context.onDidTerminate(() => listeners.delete(context));

    response.status = Ok;
    response.cache = 'no-store, no-transform';
    response.type = EventStream;

    stream.respond(response.headers);
    stream.setEncoding('utf8');

    if (method === GET) {
      if (reconnect >= 0) {
        stream.write(`retry: ${reconnect}\n\n`);
      } else {
        stream.write(`:start\n\n`);
      }
    }
    return Promise.resolve();
  };

  const each = fn => {
    for (const context of listeners) {
      if (context.isTerminated) {
        listeners.delete(context);
      } else {
        fn(context);
      }
    }
  };

  const doEmit = ({ id, event, data }) => {
    let message = '';
    if (id) message += `id: ${id}\n`;
    if (event) message += `event: ${event}\n`;
    if (data) {
      if (isArray(data)) {
        message += data.map(data => `data: ${data}\n`).join('');
      } else {
        message += `data: ${data}\n`;
      }
    }
    if (!message) return;
    message += '\n';

    logger.trace(
      `Emit server-sent event ${event ?? 'message'}(${data}) to ${listeners.size
      } listener${listeners.size === 1 ? '' : 's'}`
    );

    each(context => context.stream.write(message));
  };

  const emit = ({ id, event, data }) => {
    if (closed) return;
    doEmit({ id, event, data });
  };

  const ping = () => {
    if (closed) return;
    each(context => context.stream.write(`:lub-dub\n\n`));
  };
  let timer = heartbeat > 0 ? startTimer(ping, heartbeat) : null;

  const close = () => {
    if (closed) return;
    closed = true;

    // When receiving a close event, a well-behaved client should close its
    // event source. It does speed up server shutdown.
    doEmit({ event: 'close', data: 'now!' });

    stopTimer(timer);
    timer = null;

    each(context => {
      context.stream.close(NGHTTP2_STREAM_CLOSED);
      listeners.delete(context);
    });
  };

  defineProperties(acceptReceiver, {
    emit: { configurable, value: emit },
    ping: { configurable, value: ping },
    close: { configurable, value: close },
  });
  return acceptReceiver;
};

/**
 * If the predicate matches the context, apply the transform to the stringified
 * body. If the predicate is a string specifying a media type or a media type
 * object, the transform is applied to all responses of that media type. If the
 * predicate is a function, the transform is applied when the function applied
 * to the context returns `true`. Before applying the transform, a body in
 * stream or buffer representation is converted to a string.
 */
export const transformMatchingBodyText = (predicate, transform) => {
  // Turn the predicate argument into an actual test function.
  let test;
  if (typeof predicate === 'string' || MediaType.isMediaType(predicate)) {
    predicate = MediaType.from(predicate); // Fail early on a malformed type.
    test = context => MediaType.from(context.response.type).matchTo(predicate);
  } else if (typeof predicate === 'function') {
    test = predicate;
  } else {
    throw new TypeError(
      `Predicate "${predicate}" is neither a media type nor a function`
    );
  }

  return async (context, next) => {
    await next();

    const { response } = context;
    let { body } = response;

    if (body != null && test(context)) {
      if (isBuffer(body)) {
        body = body.toString('utf8');
      } else if (body instanceof Readable) {
        body.setEncoding('utf8');

        const chunks = [];
        for await (const chunk of body) {
          chunks.push(chunk);
        }
        body = chunks.join('');
      }

      body = transform(body);
      response.body = body;
      response.length = byteLength(body);
    }
  };
};

const EndOfBody = /<\/body>/iu;
const EndOfDocument = /<\/html>/iu;

export function createAppendToBody(snippet) {
  return body => {
    const inject = ({ index }) =>
      body.slice(0, index) + snippet + body.slice(index);

    let match = EndOfBody.exec(body);
    if (match) return inject(match);

    match = EndOfDocument.exec(body);
    if (match) return inject(match);

    return body + snippet;
  };
}
