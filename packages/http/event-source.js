/* © 2020 Robert Grimm */

import { constants } from 'http2';
import { isAbsolute, join } from 'path';
import { matchMediaTypes, parseAcceptHeader } from './media-type.js';

const EVENT_STREAM = {
  type: 'text',
  subtype: 'event-stream',
  toString() {
    return `${this.type}/${this.subtype}`;
  },
};
const { isSafeInteger } = Number;
const { NGHTTP2_CANCEL } = constants;

const OnTimerStop = (stop, timer) => stop(timer);
const OnConnectionError = (connections, connection) => {
  connection.close();
  connections.delete(connection);
};

// =============================================================================

class Http2Connection {
  #stream;

  constructor(stream) {
    this.#stream = stream;
  }

  get version() {
    return 2;
  }

  get ready() {
    const stream = this.#stream;
    return stream != null && !stream.closed && !stream.destroyed;
  }

  respond(status, headers = {}) {
    const stream = this.#stream;
    if (stream == null) return;

    headers[':status'] = status;
    stream.respond(headers);
  }

  write(string, encoding = 'utf8') {
    const stream = this.#stream;
    if (stream == null) return true;
    return this.#stream.write(string, encoding);
  }

  end(string, encoding = 'utf8') {
    const stream = this.#stream;
    if (stream != null) this.#stream.end(string, encoding);
    return true;
  }

  close() {
    const stream = this.#stream;
    if (stream == null) return;
    if (!stream.closed && !stream.destroyed) stream.close(NGHTTP2_CANCEL);
    this.#stream = null;
  }
}

// -----------------------------------------------------------------------------

export default class EventSource {
  #path;
  #heartbeat;
  #retry;
  #stopTimer;
  #connections = new Set();

  /**
   * Create a new event source mounted at the given path and using the given
   * intervals for heartbeats and for retrying the connection. If either of
   * the intervals is 0 or NaN, it is ignored.
   */
  constructor({
    path = '/',
    heartbeat = 10 * 60 * 1000,
    retry = 500,
    startTimer = setInterval,
    stopTimer = clearInterval,
  } = {}) {
    if (!isAbsolute(path)) path = join('/', path);
    heartbeat = isSafeInteger(heartbeat) ? heartbeat : NaN;

    this.#path = path;
    this.#heartbeat = heartbeat;
    this.#retry = isSafeInteger(retry) ? retry : NaN;

    if (heartbeat) {
      const timer = startTimer(() => this.heartbeat(), heartbeat);
      this.#stopTimer = OnTimerStop(stopTimer, timer);
    }
  }

  /** Try accepting the given HTTP/2 stream with the given headers. */
  accept(stream, headers) {
    const connection = new Http2Connection(stream);
    const method = headers[':method'];
    const path = headers[':path'];
    const accept = headers.accept;

    // Rest of method should be independent of HTTP version.

    const status = this.validate(method, path, accept);
    if (status !== 200) {
      connection.respond(status);
      connection.end();
      return false;
    }

    this.#connections.add(connection);
    connection.onerror(OnConnectionError(this.#connections, connection));

    connection.respond(200, {
      'Content-Type': EVENT_STREAM.toString(),
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no', // NGINX
    });

    if (method === 'HEAD') {
      connection.end();
    } else if (this.#retry) {
      connection.write(`retry: ${this.#retry}\n\n`);
    } else {
      connection.write(`:start\n\n`);
    }

    return true;
  }

  /**
   * Validate the method, path, and accept header. Upon successful validation,
   * this method returns status code 200. Otherwise, it returns an error status
   * between 400 and 599.
   */
  validate(method, path, accept) {
    if (method !== 'GET' && method !== 'HEAD') {
      // Method Not Allowed
      return 405;
    } else if (path !== this.#path) {
      return 400;
    } else if (!accept) {
      return 200;
    }

    const range = parseAcceptHeader(accept);
    if (!range || range.length === 0) {
      return 400;
    }

    for (const entry of range) {
      if ((entry.weight ?? 1 > 0) && matchMediaTypes(EVENT_STREAM, entry)) {
        return 200;
      }
    }

    // Not Acceptable
    return 406;
  }

  /** Invoke the given function on every currently open connection. */
  forEachConnection(fn) {
    const connections = this.#connections;
    if (connections == null) return;

    for (const connection of connections) {
      if (!connection.ready) {
        this.#connections.delete(connection);
      } else {
        fn(connection);
      }
    }
  }

  /** Send a heartbeat to every open connection. */
  heartbeat() {
    this.forEachConnection(c => c.write(`:lub-DUB\n\n`));
  }

  /**
   * Send a message with the given ID, event name, and data to all connected
   * clients.
   */
  send({ id, event, data } = {}) {
    let message = '';
    if (id) message += `id: ${id}\n`;
    if (event) message += `event: ${event}\n`;
    if (data) message += `data: ${data}\n`;
    if (!message) return;
    message += `\n`;

    this.forEachConnection(c => c.write(message));
  }

  /** Close this event source. */
  close() {
    this.forEachConnection(c => c.close());
    this.#connections.clear();
    this.#connections = null;

    if (this.#stopTimer) {
      this.#stopTimer();
      this.#stopTimer = null;
    }
  }
}
