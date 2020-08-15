/* © 2020 Robert Grimm */

import { strict as assert } from 'assert';
import { constants, createSecureServer } from 'http2';
import Exchange from './exchange.js';
import { identifyEndpoint, identifyRemote } from './util.js';
import { once } from 'events';

const {
  HTTP_STATUS_INTERNAL_SERVER_ERROR,
  HTTP_STATUS_SERVICE_UNAVAILABLE,
} = constants;

const { apply } = Reflect;
const { assign } = Object;

// =============================================================================

export default class Server {
  #cert;
  #key;
  #origin;
  #ip;
  #port;
  #handlers;
  #server;
  #sessions;
  #logError;
  #stats;

  constructor({ cert, key, host, ip, port, logError = console.error }) {
    assert(host == null || typeof host === 'string');
    assert(host == null || typeof ip === 'string');
    assert(typeof port === 'number');
    assert(typeof logError === 'function');

    this.#cert = cert;
    this.#key = key;
    this.#origin = `https://${host ?? ip ?? '127.0.0.1'}:${port}`;
    this.#ip = ip;
    this.#port = port;
    this.#handlers = [];
    this.#sessions = new Set();
    this.#logError = logError;
    this.#stats = {
      sessions: 0,
      openSessions: 0,
      streams: 0,
      openStreams: 0,
    };
  }

  statistics() {
    return assign({}, this.#stats, { openSessions: this.#sessions.size });
  }

  // ---------------------------------------------------------------------------
  // Register Middleware
  // ---------------------------------------------------------------------------

  /**
   * Register the given functions as middleware. A middleware handler is any
   * function `(exchange, next) => done` that takes an exchange and callback as
   * arguments and returns a promise for the exchange's completion. Typically,
   * the handler performs some operations on the `exchange` object and then
   * invokes `next()` to execute the, ahem, next middleware handler in this
   * server's middleware pipeline. Just like handlers, `next()` is a promise
   * returning, asynchronous function. In fact, it may just return the next
   * middleware handler's promise.
   *
   * If a middleware handler has a function-valued `close` property, it is
   * invoked as a method when closing this server.
   */
  use(...handlers) {
    assert(this.#server == null);
    handlers.forEach(handler => assert(typeof handler === 'function'));
    this.#handlers.push(...handlers);
    return this;
  }

  // ---------------------------------------------------------------------------
  // Listen For and Accept Incoming Connections
  // ---------------------------------------------------------------------------

  /* async */ listen() {
    if (this.#server != null) {
      const endpoint = identifyEndpoint(this.#server.address());
      const message = `Server is already listening at ${endpoint}`;
      return Promise.reject(new Error(message));
    }

    const server = (this.#server = createSecureServer({
      cert: this.#cert,
      key: this.#key,
    }));

    server
      .on('session', this.accept.bind(this))
      .on('error', error =>
        this.didError(error, identifyEndpoint(this.#server))
      );

    const endpoint = [this.#port];
    if (this.#ip) endpoint.push(this.#ip);
    server.listen(...endpoint);

    return once(server, 'listening');
  }

  accept(session) {
    this.#stats.sessions++;

    if (!this.#server) {
      this.disconnect(session);
      return;
    }

    session
      .on('stream', this.request.bind(this))
      .on('close', () => this.#sessions.delete(session))
      .on('error', error =>
        this.didError(error, identifyRemote(session.socket))
      );
    this.#sessions.add(session);
  }

  // ---------------------------------------------------------------------------
  // Handle Requests
  // ---------------------------------------------------------------------------

  async request(stream, headers) {
    this.#stats.streams++;
    this.#stats.openStreams++;

    const exchange = new Exchange({ origin: this.#origin, stream, headers });
    exchange.didRespond().then(() => this.#stats.openStreams--);

    if (!exchange.isReady()) {
      // Parsing of request path has already failed. Nothing else to do.
    } else if (!this.#server) {
      // If there's no server object, there's no service.
      await exchange.fail(HTTP_STATUS_SERVICE_UNAVAILABLE);
    } else {
      try {
        // Apply middleware to the exchange.
        await exchange.handleWith(...this.#handlers);
      } catch (x) {
        this.#logError('[Middleware]', x);
        await exchange.fail(HTTP_STATUS_INTERNAL_SERVER_ERROR, x);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Handle Errors
  // ---------------------------------------------------------------------------

  /** Handle the given error within the given descriptive context. */
  didError(error, context) {
    this.#logError(`${context} failed with`, error);
  }

  /** Handle the given frame error. */
  didFrameError(type, code, id) {
    this.#logError(
      `HTTP/2 server stream ${id}, frame ${type} failed with ${code}`
    );
  }

  // ---------------------------------------------------------------------------
  // Shut Down Gracefully
  // ---------------------------------------------------------------------------

  /** End the given session. */
  disconnect(session) {
    if (!session.closed) {
      session.close();
    }
  }

  /**
   * Close down this server and return a promise that fulfills with a complete
   * shutdown. This method explicitly closes all connections with the server as
   * well as any middleware that has a `close()` method.
   */
  stop() {
    if (this.#server == null) {
      return Promise.resolve();
    }

    // Close server so that it stops accepting new connections.
    const server = this.#server;
    this.#server = undefined;
    const done = new Promise(resolve => {
      if (server.listening) {
        server.close(resolve);
      } else {
        resolve();
      }
    });

    // Close handlers, which may also hold resources including connections.
    for (const handler of this.#handlers) {
      // Protect against the treachery of nondeterministic getters.
      const close = handler.close;
      if (typeof close === 'function') {
        apply(close, handler, []);
      }
    }

    // Close sessions, which also closes underlying connections.
    for (const session of this.#sessions) {
      this.disconnect(session);
    }

    return done.then(() => assert(this.#sessions.size === 0));
  }
}
