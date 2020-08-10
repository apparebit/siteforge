/* © 2020 Robert Grimm */

import { strict as assert } from 'assert';
import { close, settleable } from '@grr/async/promise';
import { connect as doConnect, constants } from 'http2';
import { once } from 'events';

const { create } = Object;
const HTTP2_HEADER_BODY = ':body';
const { HTTP2_HEADER_CONTENT_LENGTH } = constants;

class Client {
  #authority;
  #session;
  #didConnect;
  #logError;

  constructor({ authority, session, didError, didFrameError, logError }) {
    assert(typeof authority === 'string');

    // Increase likelihood that we got a session object.
    assert(typeof session.goaway === 'function');
    assert(typeof session.ping === 'function');

    // Install any of the handlers if specified.
    if (didError != null) {
      assert(typeof didError === 'function');
      this.didError = didError;
    }
    if (didFrameError != null) {
      assert(typeof didFrameError === 'function');
      this.didFrameError = didFrameError;
    }
    if (logError != null) {
      assert(typeof logError === 'function');
      this.#logError = logError;
    } else {
      this.#logError = console.error;
    }

    // Set up internal state.
    this.#authority = authority;
    this.#session = session;
    session
      .on('error', this.didError.bind(this))
      .on('frameError', this.didFrameError.bind(this));
    this.#didConnect = once(session, 'connect');
  }

  /** Get the HTTP/2 session object. */
  get session() {
    return this.#session;
  }

  /** Handle the error. */
  didError(error) {
    this.#logError(`HTTP/2 session with ${this.#authority} failed`, error);
  }

  /** Handle the frame error. */
  didFrameError(type, code, id) {
    this.#logError(
      `HTTP/2 session with ${this.#authority}, stream ${id}, frame ${type} ` +
        `failed with ${code}`
    );
  }

  /** Return a promise that resolves once this client is fully connected. */
  didConnect() {
    return this.#didConnect;
  }

  /**
   * Process a request/response interaction. This method sends the given request
   * to the server and returns a promise for the corresponding response. Each
   * message is represented by a prototype-less object that captures data,
   * metadata, and protocol data. In other words, metadata, i.e., headers, use
   * the familiar names. Protocol data as well as data, i.e., the body, use
   * names that are otherwise illegal for headers. They include `:protocol`,
   * `:path`, `:status`, and also `:body`.
   */
  request(request = create(null)) {
    if (this.#session == null) {
      throw new Error(`Client has been disconnected already`);
    }

    const { promise, resolve } = settleable();
    const stream = this.#session.request(request);

    let response;
    stream.on('response', headers => {
      response = headers;

      const length = response[HTTP2_HEADER_CONTENT_LENGTH];
      if (length != null) {
        response[HTTP2_HEADER_CONTENT_LENGTH] = Number(length);
      }
      response[HTTP2_HEADER_BODY] = '';
    });

    stream.setEncoding('utf8');
    stream.on('data', data => (response[HTTP2_HEADER_BODY] += data));
    stream.on('end', () => resolve(response));

    if (request[HTTP2_HEADER_BODY] != null) {
      stream.write(request[HTTP2_HEADER_BODY]);
    }
    stream.end();
    return promise;
  }

  /** Disconnect this session. */
  disconnect() {
    if (this.#session) {
      const session = this.#session;
      this.#session = undefined;
      return close(session);
    } else {
      return Promise.resolve();
    }
  }
}

/**
 * Establish a session with an HTTP/2 server. The options must include an
 * `authority` for the endpoint. They may include the `didError` and
 * `didFrameError` overrides for error handling as well as any option accepted
 * by the `http2` module's `connect()` function, which include HTTP/2 settings,
 * TLS options, and socket options.
 */
export default function connect(options) {
  const { authority } = options;
  assert(typeof authority === 'string');

  const session = doConnect(authority, options);
  return new Client({ ...options, session });
}
