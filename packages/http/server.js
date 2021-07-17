/* © 2020-2021 Robert Grimm */

import { constants, createSecureServer } from 'http2';
import { kSessionId } from './constants.js';
import Context from './context.js';
import { identifyEndpoint, isMountedAt } from './util.js';
import { once } from 'events';
import { posix } from 'path';

const { defineProperty } = Object;
const { isAbsolute, normalize } = posix;
const { NGHTTP2_CANCEL } = constants;

// =============================================================================

/**
 * Perform a "promise-call" per the W3C's guidance on [Writing Promise-Using
 * Specifications](https://www.w3.org/2001/tag/doc/promises-guide#should-promise-call).
 */
const asyncCall = (fn, ...args) => {
  try {
    return Promise.resolve(fn(...args));
  } catch (x) {
    return Promise.reject(x);
  }
};

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
        throw Context.Error(
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
          return asyncCall(handler, context, dispatch.bind(null, step + 1));
        } else {
          return dispatch(step + 1);
        }
      } else {
        return asyncCall(next);
      }
    };

    return dispatch(0);
  }
}

// =============================================================================

/** An HTTP/2 server. */
export default class Server {
  #logger;
  #origin;
  #ip;
  #port;
  #cert;
  #key;
  #server;
  #router;
  #sessionCount;
  #sessions;
  #streamCount;
  #didStartUp;
  #didShutDown;

  /** Create a new server with the given options. */
  constructor({
    host,
    ip = `127.0.0.1`,
    port = 8080,
    cert,
    key,
    logger = console,
  } = {}) {
    this.#logger = logger;
    this.#origin = `https://${host ?? ip ?? `127.0.0.1`}:${port}`;
    this.#ip = ip;
    this.#port = port;
    this.#cert = cert;
    this.#key = key;
    this.#router = new Router();
    this.#sessionCount = 0;
    this.#sessions = new Set();
    this.#streamCount = 0;
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

  /** Start to listen. This method returns a promise that the server listens. */
  /* async */ listen() {
    if (!this.#didStartUp) {
      const server = (this.#server = createSecureServer({
        cert: this.#cert,
        key: this.#key,
      }));

      this.#didStartUp = once(server, 'listening').then(() => {
        this.#logger.trace(`Started up ${this.#origin}`);
        server.on('session', this.accept.bind(this));
        server.on('error', this.onServerError.bind(this));
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
      if (!session.destroyed) {
        session.destroy(NGHTTP2_CANCEL);
      }
      return;
    }

    session[kSessionId] = ++this.#sessionCount;

    if (this.#logger.volume >= 3) {
      const { socket } = session;
      let remote;
      if (socket.remoteFamily === 'IPv6') {
        remote = `[${socket.remoteAddress}]:${socket.remotePort}`;
      } else {
        remote = `${socket.remoteAddress}:${socket.remotePort}`;
      }

      this.#logger.trace(
        `Accepted session ${session[kSessionId]} from ${remote}`
      );
    }

    this.#sessions.add(session);
    session.on('close', () => {
      this.#logger.trace(`Did close session ${session[kSessionId]}`);
      this.#sessions.delete(session);
    });
    session.on('stream', this.onRequest.bind(this));
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

    const { request } = context;
    context.logger.trace(`Begin ${request.method} ${request.path}`);
    await this.#router.handle(context, () => { });
    context.logger.trace(`End ${request.method} ${request.path}`);
  }

  onServerError(error) {
    this.#logger.error(`Server ${this.#origin} failed`, error);
    this.close();
  }

  onSessionError(error, session) {
    this.#logger.error(`Session ${session[kSessionId]} failed`, error);
    if (!session.destroyed) session.destroy(error);
  }

  /** Disconnect a session. */
  disconnect(session) {
    if (!session.closed && !session.destroyed) {
      this.#logger.trace(`Closing session ${session[kSessionId]}`);
      session.close();
    }
  }

  /**
   * Shut down this server. This method performs an orderly shut down, i.e.,
   * first stops accepting new connections and new requests on existing
   * connections and then waits for inflight request, response exchanges to
   * complete.
   */
  close() {
    if (!this.#didStartUp || this.#didShutDown) {
      return Promise.resolve();
    }

    this.#logger.trace(`Shutting down ${this.#origin}`);
    const server = this.#server;
    this.#server = null;
    this.#didShutDown = new Promise((resolve, reject) => {
      server.close(error => {
        if (error) {
          this.#logger.error(`Shutdown of ${this.#origin} failed`, error);
          reject(error);
        } else {
          this.#logger.trace(`Did shut down ${this.#origin}`);
          resolve();
        }
      });
    });

    for (const session of this.#sessions) {
      this.disconnect(session);
    }

    return this.#didShutDown;
  }
}

defineProperty(Server, 'Router', { value: Router });
