/* © 2021 Robert Grimm */

import Context from './context.js';
import MediaType from './media-type.js';
import { MethodName, StatusCode } from './constants.js';
import { Readable } from 'stream';
import { validateRoutePath } from './util.js';

const { byteLength, isBuffer } = Buffer;
const configurable = true;
const { defineProperties } = Object;
const { EventStream, HTML } = MediaType;
const { GET, HEAD } = MethodName;
const { isArray } = Array;
const { isSafeInteger } = Number;
const { MethodNotAllowed, NotAcceptable, Ok } = StatusCode;

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
  context.harden().respond();

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
    context.type = type;
  };
};

/** Provide a new server-sent event source as response body. */
export const eventSource = ({
  heartbeat = 10 * 60 * 1000,
  reconnect = 2000,
  startTimer = setInterval,
  stopTimer = clearInterval,
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

  const listening = new Set();

  const acceptReceiver = context => {
    const { request, response, stream } = context;
    if (request.method !== GET && request.method !== HEAD) {
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
    listening.add(context);
    context.onDidTerminate(() => listening.delete(context));

    response.status = Ok;
    response.cache = 'no-store, no-transform';
    response.type = EventStream;

    stream.respond(response.headers);
    stream.setEncoding('utf8');
    if (reconnect >= 0) {
      stream.write(`retry: ${reconnect}\n\n`);
    } else {
      stream.write(`:start\n\n`);
    }
    return Promise.resolve();
  };

  let finished = false;
  const each = fn => {
    if (!finished) {
      for (const context of listening) {
        if (context.isTerminated) {
          listening.delete(context);
        } else {
          fn(context);
        }
      }
    }
  };

  const emit = ({ id, event, data }) => {
    if (!finished) {
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
      each(context => context.stream.write(message));
    }
  };

  const ping = () => each(context => context.stream.write(`:lub-dub\n\n`));
  let timer = heartbeat > 0 ? startTimer(ping, heartbeat) : null;

  const close = () => {
    if (timer) {
      stopTimer(timer);
      timer = null;
    }

    if (!finished) {
      each(context => {
        context.stream.end();
        listening.delete(context);
      });
      finished = true;
    }
  };

  defineProperties(acceptReceiver, {
    emit: { configurable, value: emit },
    ping: { configurable, value: ping },
    close: { configurable, value: close },
  });
  return acceptReceiver;
};

export const ensureBodyIsString = () => async (context, next) => {
  await next();

  const { response } = context;
  const { body } = response;

  if (isBuffer(body)) {
    response.body = body.toString('utf8');
  } else if (body instanceof Readable) {
    body.setEncoding('utf8');

    const chunks = [];
    for await (const chunk of body) {
      chunks.push(chunk);
    }
    response.body = chunks.join('');
  }
};

export const transformHTML = transform => async (context, next) => {
  await next();

  const { response } = context;
  if (MediaType.from(response.type).matchTo(HTML)) {
    const body = transform(response.body);
    response.body = body;
    response.length = byteLength(body);
  }
};
