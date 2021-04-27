/* © 2020 Robert Grimm */

import Context from './context.js';
import { createSecureServer } from 'http2';
import { finished } from 'stream';
import { MethodName, StatusCode } from './constants.js';
import { identifyEndpoint, isMountedAt, validateRoutePath } from './util.js';
import MediaType from './media-type.js';
import { once } from 'events';
import { posix } from 'path';

const configurable = true;
const { defineProperty, defineProperties } = Object;
const { EventStream } = MediaType;
const { GET, HEAD } = MethodName;
const { isAbsolute, normalize } = posix;
const { isArray } = Array;
const { isSafeInteger } = Number;
const { MethodNotAllowed, NotAcceptable, Ok } = StatusCode;
const returnPromise = (fn, ...args) => {
  try {
    return Promise.resolve(fn(...args));
  } catch (x) {
    return Promise.reject(x);
  }
};

// =============================================================================

/** A minimal request router. */
class Router {
  #routes = [];

  /**
   * Register the route. If the path is omitted or `*`, the handler applies to
   * all requests. If the path ends with `/*`, the handler applies to the tree
   * rooted at that path (modulo the trailing `/*`). Otherwise, the handler only
   * applies to the exact path.
   */
  route(path, handler) {
    if (typeof path === 'function') {
      [path, handler] = [undefined, path];
    } else if (typeof handler !== 'function') {
      throw Context.Error(`Route handler "${handler}" is not a function`);
    }

    if (path != null) {
      if (typeof path !== 'string') {
        throw Context.Error(`Route path "${path}" is not a path`);
      } else if (path !== '*' && !isAbsolute(path)) {
        throw new Context.Error(
          `Route path "${path}" is neither wildcard nor absolute`
        );
      }
      path = normalize(path);
    }

    let match;
    if (path === undefined || path === '*') {
      match = 'all';
      path = undefined;
    } else if (path.endsWith('/*')) {
      match = 'tree';
      path = path.slice(0, -2);
    } else {
      match = 'path';
      path = path.endsWith('/') ? path.slice(0, -1) : path;
    }
    this.#routes.push({ match, path, handler });
  }

  /**
   * Apply registered middleware handlers to the given request, response
   * exchange. This method considers all registered handlers in order, i.e.,
   * executes a simple linear scan, and runs matching ones upon invocation
   * of the `next()` callback.
   */
  /* async */ handle(context, next) {
    const { request } = context;
    let lastCompletedStep = -1;

    const dispatch = /* async */ step => {
      if (step <= lastCompletedStep) {
        return Promise.reject(
          new Error(`next() called repeatedly within same middleware function`)
        );
      }

      lastCompletedStep = step;
      if (step < this.#routes.length) {
        let { match, path, handler } = this.#routes[step];
        if (
          match === 'all' ||
          (match === 'tree' && isMountedAt(request.path, path)) ||
          (match === 'path' && request.path === path)
        ) {
          return returnPromise(handler, context, dispatch.bind(null, step + 1));
        } else {
          return dispatch(step + 1);
        }
      } else {
        return returnPromise(next);
      }
    };

    return dispatch(0);
  }
}

// =============================================================================

/** An HTTP/2 server. */
export default class Server {
  // Essential and Almost Essential Middleware
  // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

  /** Log the request, response interaction. */
  static async log(context, next) {
    const time = Date.now();
    await next();
    context.logger.info(context.toCombinedLogFormat({ time }));
  }

  /** Send the response. */
  static async respond(context, next) {
    await next();
    context.respond();
  }

  /** Apply headers that improve security of the interaction */
  static async hardenResponse(context, next) {
    await next();
    context.hardenResponse();
  }

  /**
   * Respond to any failure with an HTTP/2 error. This method relies on
   * `Context.prototype.failResponse()` and
   * `Context.prototype.failWithInternalError()` both, with the latter and much
   * simpler method handling any exception thrown by the previous method. As a
   * result, no exceptions should escape from this method (though the
   * theoretical possibility remains).
   */
  static async failResponse(context, next) {
    try {
      await next();
    } catch (x) {
      try {
        await context.failResponse(x);
      } catch (x) {
        context.failWithInternalError(x);
      }
    }
  }

  /** Validate the request path. This method normalizes the header value. */
  static validateRequestPath(context, next) {
    context.validateRequestPath();
    return next();
  }

  /**
   * Scaffold middleware processing. This method validates the request path,
   * hands off to middleware, and after middleware has returned ensures a
   * response is sent. It combines the functionality of `respond()`,
   * `hardenResponse()`, `failResponse()`, and `validateRequestPath()` into a
   * single middleware function. Doing so not only simplifies server
   * configuration (you only need to register one basic middleware handler
   * instead of four) but also eliminates the overhead of executing three
   * asynchronous handler functions (it only executes one instead of four). The
   * resulting code duplication is minor and justified by this being essential
   * functionality. In other words, almost every server should be configured
   * with this method as first middleware handler.
   */
  static async scaffold(context, next) {
    // Record start time.
    const time = Date.now();

    try {
      // Run middleware on context with validated path.
      context.validateRequestPath();
      await next();
    } catch (x) {
      // Handle any errors but do not send response.
      try {
        await context.failResponse(x);
      } catch (x) {
        context.failWithInternalError(x);
      }
    }

    // Harden response and actually send it.
    context.hardenResponse();
    context.respond();

    // Log request and response.
    context.logger.info(context.toCombinedLogFormat({ time }));
  }

  /** Redirect requests with path ending with slash to the unslashed version. */
  static async redirectOnTrailingSlash(context, next) {
    const { path } = context.request;
    if (path !== '/' && path.endsWith('/')) {
      context.redirect(context.origin + path.slice(0, -1));
    }
    await next();
  }

  /** Serve static content from the file system root. */
  static makeServeStaticAsset({ root }) {
    // FIXME: This is duplicated work in Context.prototype.serveStaticAsset.
    root = validateRoutePath(root);

    return async function serveStaticAsset(context, next) {
      await context.serveStaticAsset({ root });
      await next();
    };
  }

  /**
   * Create a new event source. This method returns new middleware that accepts
   * client requests for connecting to the event source. The result not only is
   * a function but also has three properties that help manage the event source:
   *
   *  -  `ping()` sends a comment to all connected clients;
   *  -  `emit({ id, event, data })` sends a message to all connected clients,
   *  -  `close()` gracefully shuts down the event source.
   *
   * The data for sending a message should either be a string or an array of
   * strings. In the latter case, the message has as many `data:` lines as the
   * array has elements. Browsers concatenate these lines with a newline.
   */
  static makeEventSource({
    heartbeat = 10 * 60 * 1000,
    reconnect = 2000,
    startTimer = setInterval,
    stopTimer = clearInterval,
  } = {}) {
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

    const acceptReceiver = (context, next) => {
      if (context.hasResponded) return next();

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
  }

  // ===========================================================================

  // Server Implementation
  // ~~~~~~~~~~~~~~~~~~~~~

  /**
   * Create a new server with the `scaffold()` middleware handler already
   * registered.
   */
  static create(options) {
    return new Server(options).route(Server.scaffold);
  }

  #logger;
  #origin;
  #ip;
  #port;
  #cert;
  #key;
  #server;
  #router;
  #sessions;
  #didStartUp;
  #didShutDown;

  /** Create a new server with the given options. */
  constructor({ host, ip, port, cert, key, logger = console }) {
    this.#logger = logger;
    this.#origin = `https://${host ?? ip ?? `127.0.0.1`}:${port}`;
    this.#ip = ip;
    this.#port = port;
    this.#cert = cert;
    this.#key = key;
    this.#router = new Router();
    this.#sessions = new Map();
  }

  /**
   * Register the given handler for the given path. See
   * `Router.prototype.route()` for complete documentation.
   */
  route(path, handler) {
    this.#router.route(path, handler);
    return this;
  }

  // ---------------------------------------------------------------------------

  /** This server's origin. */
  get origin() {
    return this.#origin;
  }

  /** The endpoint this server is listening on when it is listening. */
  get endpoint() {
    const address = this.#server?.address();
    return address ? identifyEndpoint(address) : '<none>';
  }

  /** Start to listen. This method returns a promise that the server listens. */
  /* async */ listen() {
    if (!this.#didStartUp) {
      const server = (this.#server = createSecureServer({
        cert: this.#cert,
        key: this.#key,
      }));

      this.#didStartUp = once(server, 'listening').then(() => {
        server.on('session', this.accept.bind(this));
        server.on('error', this.onError.bind(this));
      });

      const endpoint = [this.#port];
      if (this.#ip) endpoint.push(this.#ip);
      server.listen(...endpoint);
    }

    return this.#didStartUp;
  }

  /** Accept a connection (aka session). */
  accept(session) {
    if (this.#server == null || !this.#server.listening) {
      this.disconnect(session);
      return;
    }

    finished(session, () => this.#sessions.delete(session));
    this.#sessions.set(session, {});
    session.on('stream', this.onRequest.bind(this));
    session.on('close', () => this.#sessions.get(session)?.dispose());
    session.on('error', error => this.onSessionError(error, session));
  }

  /** Handle the request. */
  async onRequest(stream, headers) {
    const context = new Context({
      logger: this.#logger,
      origin: this.#origin,
      stream,
      request: headers,
    });

    this.#logger.trace('Request before middleware', context.request);
    await this.#router.handle(context, () => {});
    this.#logger.trace('Response after middleware', context.response);
  }

  onError(error) {
    this.#logger.error('General error', error);
  }

  onClientError(error, socket) {
    this.#logger.error('Client error', error);
    socket.destroy(error);
  }

  onSessionError(error, session) {
    this.#logger.error('Session error', error);
    session.destroy(error);
  }

  /** Disconnect a session. */
  disconnect(session) {
    session.close();
  }

  /**
   * Shut down this server. This method performs an orderly shut down, i.e.,
   * first stops accepting new connections and new requests on existing
   * connections and then waits for inflight request, response exchanges to
   * complete.
   */
  shutDown() {
    if (!this.#didShutDown) {
      const server = this.#server;
      this.#server = undefined;
      const { listening } = server;

      // Close server to stop accepting new connections.
      this.#didShutDown = new Promise(resolve => {
        if (listening) {
          server.close(resolve);
        } else {
          resolve();
        }
      });

      // Disconnect sessions to accelerate shutdown.
      if (listening) {
        for (const session of this.#sessions) {
          this.disconnect(session);
        }
      }
    }
    return this.#didShutDown;
  }
}

defineProperty(Server, 'Router', { value: Router });
