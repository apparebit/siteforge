/* © 2020 Robert Grimm */

import { strict as assert } from 'assert';
import { close } from '@grr/async/promise';
import { constants, createSecureServer } from 'http2';
import Exchange from './exchange.js';
import { identifyEndpoint, identifyRemote } from './identity.js';
import { once } from 'events';

const {
  HTTP_STATUS_INTERNAL_SERVER_ERROR,
  HTTP_STATUS_SERVICE_UNAVAILABLE,
} = constants;

const { assign } = Object;

// =============================================================================

export default class Server {
  #cert;
  #key;
  #host;
  #port;
  #handlers;
  #server;
  #sessions;
  #logError;
  #stats;

  constructor({ cert, key, host, port, logError }) {
    this.#cert = cert;
    this.#key = key;
    this.#host = host;
    this.#port = port;
    this.#handlers = [];
    this.#sessions = new Set();
    this.#logError = logError != null ? logError : console.error;
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

  use(...handlers) {
    assert(this.#server == null);

    for (const handler of handlers) {
      assert(typeof handler === 'function');
    }
    this.#handlers.push(...handlers);
    return this;
  }

  // ---------------------------------------------------------------------------
  // Listen for incoming connections

  /* async */ listen() {
    if (this.#server != null) return Promise.resolve();

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
    if (this.#host) endpoint.push(this.#host);
    server.listen(...endpoint);

    return once(server, 'listening');
  }

  // ---------------------------------------------------------------------------
  // Accept a connection or session

  accept(session) {
    this.#stats.sessions++;

    if (!this.#server) {
      this.end(session);
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
  // Handle Streams

  async request(stream, headers) {
    this.#stats.streams++;
    this.#stats.openStreams++;

    const exchange = new Exchange(stream, headers);
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
        this.#logError('Middleware failed', x);
        await exchange.fail(HTTP_STATUS_INTERNAL_SERVER_ERROR, x);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Handle Errors

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
  // Shut Down Effectively and Gracefully

  /** End the given session. */
  disconnect(session) {
    if (!session.closed) {
      session.close();
    }
  }

  /**
   * Start to asynchronously shut down the server and return a promise
   * that fulfills with a completed shutdown.
   */
  stop() {
    if (this.#server == null) {
      return Promise.resolve();
    }

    const server = this.#server;
    this.#server = undefined;
    const done = close(server);

    for (const session of this.#sessions) {
      this.disconnect(session);
    }
    return done.then(() => assert(this.#sessions.size === 0));
  }
}
