/* © 2020 Robert Grimm */

import { strict as assert } from 'assert';
import { connect as doConnect } from 'http2';
import Context from './context.js';
import { Header, MethodName } from './constants.js';
import MediaType from './media-type.js';
import { once } from 'events';

const { concat } = Buffer;
const FrameError = (type, code, id) =>
  new Error(`Error ${code} sending frame ${type} on stream ${id}`);

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
    const session = (this.#session = doConnect(this.#authority, options));

    const onError = error => {
      session.destroy(error);
      this.#pending = error;
    };

    const onFrameError = (type, code, id) => {
      this.#pending = FrameError(type, code, id);
    };

    return once(session, 'connect').then(() => {
      session.on('error', onError);
      session.on('frameError', onFrameError);
      return this;
    });
  }

  didConnect() {
    return this.#connected;
  }

  // ---------------------------------------------------------------------------
  // Process Request and Response

  get(request) {
    return this.request({ ...request, [Header.Method]: MethodName.GET });
  }

  head(request) {
    return this.request({ ...request, [Header.Method]: MethodName.HEAD });
  }

  request(headers, body) {
    if (this.#pending) {
      const pending = this.#pending;
      this.#pending = undefined;
      return Promise.reject(pending);
    }

    return new Promise((resolve, reject) => {
      const stream = this.#session.request(headers);
      this.#streams.add(stream);

      const onError = error => {
        stream.destroy(error);
        reject(error);
      };

      const onFrameError = (type, code, id) => {
        reject(FrameError(type, code, id));
      };

      const onResponse = response => {
        // Wrap in response object.
        response = new Context.Response(response);

        // Try content length.
        const length = Number(response.length);
        if (!isNaN(length)) response.length = length;

        // Try content type.
        let type;
        try {
          type = MediaType.from(response.type);
        } catch {
          // Nothing to do.
        }
        if (type) response.type = type;

        if (
          type?.type === 'text' ||
          (type?.type === 'application' && type?.subtype === 'json') ||
          type?.suffix === 'json' ||
          type?.suffix === 'xml'
        ) {
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
      };

      stream.on('error', onError);
      stream.on('frameError', onFrameError);
      stream.on('response', onResponse);

      if (body != null) {
        stream.end(body);
      } else {
        stream.end();
      }
    });
  }

  disconnect() {
    if (!this.#disconnected) {
      this.#disconnected = new Promise((resolve, reject) => {
        const finish = () => {
          if (this.#pending) {
            reject(this.#pending);
          } else {
            resolve();
          }
        };

        const session = this.#session;
        if (session.destroyed) {
          finish();
        } else if (session.closed) {
          session.on('close', finish);
        } else {
          session.close(finish);
        }
      });
    }

    return this.#disconnected;
  }
}
