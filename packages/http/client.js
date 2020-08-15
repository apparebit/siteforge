/* © 2020 Robert Grimm */

import { strict as assert } from 'assert';
import { connect as doConnect } from 'http2';
import { createFrameError } from './util.js';
import { Header, Method } from './constants.js';
import MediaType from './media-type.js';

export default class Client {
  #authority;
  #session;
  #streams;
  #pending;
  #connected;
  #disconnected;

  constructor(authority) {
    assert(typeof authority === 'string');

    this.#authority = authority;
    this.#session = undefined;
    this.#streams = new Set();
    this.#pending = undefined;
    this.#disconnected = undefined;
  }

  get session() {
    return this.#session;
  }

  get active() {
    const session = this.#session;
    return (
      session && !session.connecting && !session.closed && !session.destroyed
    );
  }

  // ---------------------------------------------------------------------------
  // Connect

  static connect(options) {
    const { authority } = options;
    const client = new Client(authority);
    client.connect(options);
    return client;
  }

  connect(options) {
    assert(this.#session == null);
    return (this.#connected = new Promise((resolve, reject) => {
      const session = (this.#session = doConnect(this.#authority, options));

      const onError = error => {
        session.removeListener('connect', onConnect);
        session.removeListener('frameError', onFrameError);
        session.destroy(error);
        reject(error);
      };

      const onFrameError = (type, code, id) => {
        session.removeListener('connect', onConnect);
        session.removeListener('error', onError);
        reject(createFrameError(type, code, id));
      };

      const onConnect = () => {
        session.removeListener('error', onError);
        session.removeListener('frameError', onFrameError);

        session
          .on('error', error => {
            session.destroy(error);
            this.#pending = error;
          })
          .on('frameError', (type, code, id) => {
            this.#pending = createFrameError(type, code, id, session);
          });

        resolve();
      };

      session
        .once('error', onError)
        .once('frameError', onFrameError)
        .once('connect', onConnect);
    }));
  }

  didConnect() {
    return this.#connected;
  }

  // ---------------------------------------------------------------------------
  // Process Request and Response

  get(request) {
    return this.request({ ...request, [Header.Method]: Method.GET });
  }

  head(request) {
    return this.request({ ...request, [Header.Method]: Method.HEAD });
  }

  request(request = {}) {
    if (this.#pending) {
      const pending = this.#pending;
      this.#pending = undefined;
      return Promise.reject(pending);
    }

    return new Promise((resolve, reject) => {
      const stream = this.#session.request(request);
      this.#streams.add(stream);

      const onError = error => {
        stream.removeListener('response', onResponse);
        stream.removeListener('frameError', onFrameError);

        stream.destroy(error);
        this.#streams.delete(stream);
        reject(error);
      };

      const onFrameError = (type, code, id) => {
        stream.removeListener('response', onResponse);
        stream.removeListener('error', onError);

        this.#streams.delete(stream);
        reject(createFrameError(type, code, id, stream.session));
      };

      const onResponse = response => {
        stream.removeListener('error', onError);
        stream.removeListener('frameError', onFrameError);

        // Make sure content-length is a number, not string.
        const length = response[Header.ContentLength];
        if (length != null) response[Header.ContentLength] = Number(length);

        // Read response body.
        const type = MediaType.from(response[Header.ContentType]);
        if (
          type.type === 'text' ||
          (type.type === 'application' && type.subtype === 'json') ||
          type.suffix === 'json' ||
          type.suffix === 'xml'
        ) {
          response[Header.Body] = '';
          stream.setEncoding('utf8');
          stream.on('data', data => (response[Header.Body] += data));
        } else {
          response[Header.Body] = [];
          stream.on('data', buffer => response[Header.Body].push(buffer));
        }

        stream.on('end', () => resolve(response));
      };

      // Prepare for receiving response and finish sending request.
      stream
        .once('error', onError)
        .once('frameError', onFrameError)
        .once('response', onResponse);
      if (request[Header.Body] != null) {
        stream.write(request[Header.Body]);
      }
      stream.end();
    });
  }

  disconnect() {
    if (this.#pending) {
      const pending = this.#pending;
      this.#pending = undefined;
      return Promise.reject(pending);
    } else if (!this.#disconnected) {
      this.#disconnected = new Promise(resolve => {
        const session = this.#session;

        if (session.destroyed) {
          resolve();
        } else if (session.closed) {
          session.on('close', resolve);
        } else {
          session.close(resolve);
        }
      });
    }

    return this.#disconnected;
  }
}
