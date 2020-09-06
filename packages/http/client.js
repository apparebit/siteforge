/* © 2020 Robert Grimm */

import { strict as assert } from 'assert';
import { connect as doConnect, constants } from 'http2';
import Context from './context.js';
import {
  Header,
  MethodName,
  StatusCode,
  StatusWithoutBody,
} from './constants.js';
import MediaType from './media-type.js';
import { once } from 'events';
import readline from 'readline';
import { STATUS_CODES } from 'http';

const { Accept, LastEventId, Method, Path } = Header;
const { from: ArrayFrom } = Array;
const { concat } = Buffer;
const { EventStream } = MediaType;
const { GET } = MethodName;
const { NGHTTP2_CANCEL } = constants;
const { NoContent, Ok } = StatusCode;
const RETRY_DELAY = 2000; // The initial retry value.
const SPACE = ' '.charCodeAt(0);

const FrameError = (type, code, id) =>
  new Error(`Error ${code} sending frame ${type} on stream ${id}`);

// Unfortunately, V8 does not yet support this new standard error.
const AggregateError = globalThis.AggregateError
  ? globalThis.AggregateError
  : class AggregateError extends Error {
      constructor(errors, message) {
        super(message);
        this.errors = errors;
      }
    };

const checkSubscription = (path, response) => {
  const { status, type } = response;
  if (status === NoContent) return;
  if (status !== Ok) {
    let description = `status ${status}`;
    if (STATUS_CODES[status]) description += ` ${STATUS_CODES[status]}`;
    throw new Error(`Subscription to "${path}" resulted in ${description}`);
  } else if (type != null && !type.matchTo(EventStream)) {
    let description = 'unknown content';
    if (type) description = `content of type "${type.toString()}"`;
    throw new Error(`Subscription to "${path}" resulted in ${description}`);
  }
};

const splitLine = line => {
  const cut = line.indexOf(':');
  if (cut === -1) {
    return [line, ''];
  } else if (cut === 0) {
    return ['', line];
  } else {
    let value = line.slice(cut + 1);
    if (value.charCodeAt(0) === SPACE) value = value.slice(1);
    return [line.slice(0, cut), value];
  }
};

// =============================================================================

export default class Client {
  #authority;
  #session;
  #streams;
  #pending;
  #disconnected;

  /** @private */
  constructor(authority) {
    assert(typeof authority === 'string');

    this.#authority = authority;
    this.#session = undefined;
    this.#streams = new Set();
    this.#pending = [];
    this.#disconnected = undefined;
  }

  /** The origin. */
  get origin() {
    return this.#authority;
  }

  /** The underlying HTTP/2 session. */
  get session() {
    return this.#session;
  }

  /** Flag for session being active, i.e., connected but not closed. */
  get active() {
    const session = this.#session;
    return (
      session && !session.connecting && !session.closed && !session.destroyed
    );
  }

  // ---------------------------------------------------------------------------

  /**
   * Create a new client and connect to the `authority` given in `options`. This
   * method returns a promise for the connected client instance.
   */
  static /*async*/ connect(options) {
    const { authority } = options;
    const client = new Client(authority);
    client._connect(options);
    return client;
  }

  /** @private */
  _connect(options) {
    assert(this.#session == null && this.#disconnected == null);
    const session = (this.#session = doConnect(this.#authority, options));

    const onError = error => {
      session.destroy(error);
      this.#pending.push(error);
    };

    const onFrameError = (type, code, id) => {
      this.#pending.push(FrameError(type, code, id));
    };

    // Register error handlers only after the connection has been established,
    // since the promise returned by this method rejects on error.
    return once(session, 'connect').then(() => {
      session.on('error', onError);
      session.on('frameError', onFrameError);
      return this;
    });
  }

  /**
   * Check for pending errors. This class captures errors as they occur, but
   * delays delivery to the application until the next invocation of an
   * asynchronous method. If an error is currently delayed that way, this method
   * returns `true`.
   */
  _hasPendingError() {
    return this.#pending.length > 0;
  }

  /**
   * Consume pending errors. If no errors are pending, this method returns a new
   * error. If one error is pending, this method returns that error. If more
   * than one error is pending, this method returns a new aggregate error
   * containing the errors.
   */
  _pendingError() {
    const { length } = this.#pending;
    if (length === 0) {
      return new Error(`call to pendingError() despite no pending error`);
    } else if (length === 1) {
      const [error] = this.#pending;
      this.#pending.length = 0;
      return error;
    } else {
      const error = new AggregateError(
        ArrayFrom(this.#pending),
        `${length} errors occurred`
      );
      this.#pending.length = 0;
      return error;
    }
  }

  // ---------------------------------------------------------------------------

  /**
   * Send the request with the given headers and body and wait for the response
   * headers. If possible, patch the content length and type with parsed values.
   * In either case, return the response and underlying HTTP/2 stream. This
   * method abstracts over the initial processing of a request, response
   * exchange, leaving handling of the response body to the caller.
   */
  async _send(headers, body) {
    if (this._hasPendingError()) throw this._pendingError();
    const stream = this.#session.request(headers);
    stream.on('close', () => this.#streams.delete(stream));
    this.#streams.add(stream);

    const receivedResponse = once(stream, 'response');

    if (body != null) {
      stream.end(body);
    } else {
      stream.end();
    }

    let [response] = await receivedResponse;
    if (this._hasPendingError()) throw this._pendingError();
    response = new Context.Response(response);

    // Parse content length and type.
    const length = Number(response.length);
    if (!isNaN(length)) response.length = length;

    let type = MediaType.fromOrUndefined(response.type);
    if (type) response.type = type;

    return { response, stream };
  }

  // ---------------------------------------------------------------------------

  /** Return response to executing GET request. */
  /* async */ get(request) {
    return this.request({ ...request, [Header.Method]: MethodName.GET });
  }

  /** Return response to executing HEAD request. */
  /* async */ head(request) {
    return this.request({ ...request, [Header.Method]: MethodName.HEAD });
  }

  /** Return response to executing request. */
  async request(headers, body) {
    const { response, stream } = await this._send(headers, body);
    if (StatusWithoutBody[response.status]) return response;

    return new Promise((resolve, reject) => {
      const onError = error => {
        stream.destroy(error);
        reject(error);
      };

      const onFrameError = (type, code, id) => {
        reject(FrameError(type, code, id));
      };

      const { type } = response;
      if (type?.isTextual?.()) {
        response.body = '';
        stream.setEncoding('utf8');
        stream.on('data', data => (response.body += data));
        stream.on('end', () => resolve(response));
      } else {
        response.body = [];
        stream.on('data', buffer => response.body.push(buffer));
        stream.on('end', () => {
          response.body = concat(response.body);
          resolve(response);
        });
      }

      stream.on('error', onError);
      stream.on('frameError', onFrameError);
    });
  }

  // ---------------------------------------------------------------------------

  /**
   * Subscribe to server events. This method returns an asynchronous iterator
   * over plain objects with the event data.
   */
  async *subscribe(path) {
    // https://html.spec.whatwg.org/multipage/server-sent-events.html#event-stream-interpretation
    let retryDelay = RETRY_DELAY;
    let eventType = '';
    let lastEventId = '';
    let data;

    const handleKeyValue = line => {
      const [key, value] = splitLine(line);

      if (key === 'retry') {
        if (/[\d]+/u.test(value)) {
          retryDelay = Number(value);
        }
      } else if (key === 'id') {
        if (!value.includes('\0')) {
          lastEventId = value;
        }
      } else if (key === 'event') {
        eventType = value;
      } else if (key === 'data') {
        if (data === undefined) {
          data = value;
        } else {
          data += '\n' + value;
        }
      }
    };

    const prepareEvent = () => {
      if (data === undefined) {
        eventType = '';
        return undefined;
      }

      const event = {
        origin: this.origin,
        type: eventType || 'message',
        lastEventId,
        data,
      };
      eventType = '';
      data = undefined;
      return event;
    };

    while (true) {
      const request = {
        [Method]: GET,
        [Path]: path,
        [Accept]: EventStream,
      };
      if (lastEventId !== '') request[LastEventId] = lastEventId;
      const { response, stream } = await this._send(request);
      if (response.status === NoContent) return;
      checkSubscription(path, response);

      stream.setEncoding('utf8');
      let lines = readline.createInterface({ input: stream });

      let yielding;
      try {
        yielding = false;
        for await (const line of lines) {
          if (line === '') {
            const event = prepareEvent();
            if (event) {
              yielding = true;
              yield event;
              yielding = false;
            }
          } else {
            handleKeyValue(line);
          }
        }
      } catch (x) {
        console.error('Unexpected exception', x);
      } finally {
        if (!yielding) {
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          // eslint-disable-next-line no-unsafe-finally
          continue;
        }
      }
    }
  }

  disconnect() {
    const session = this.#session;
    if (session.closed || session.destroyed) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      session.close(() => {
        if (this._hasPendingError()) {
          reject(this._pendingError());
        } else {
          resolve();
        }
      });

      for (const stream of this.#streams) {
        stream.close(NGHTTP2_CANCEL);
      }
    });
  }
}
