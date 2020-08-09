/* © 2020 Robert Grimm */

import { strict as assert } from 'assert';
import { constants } from 'http2';
import { escapeBodyText } from '@grr/html/syntax';
import { types } from 'util';
import { identifyEndpoint } from './identity.js';
import { join } from 'path';
import MediaType from './media-type.js';
import mediaTypeForPath from './file-type.js';
import parseDate from './date.js';
import parseRequestPath from './parse-path.js';
import pickle from '@grr/oddjob/pickle';
import { promises } from 'fs';
import { settleable } from '../async/promise.js';
import { STATUS_CODES } from 'http';
import templatize from '@grr/temple';

const {
  HTTP_STATUS_BAD_REQUEST,
  HTTP_STATUS_INTERNAL_SERVER_ERROR,
  HTTP_STATUS_OK,
  HTTP2_HEADER_ACCEPT,
  HTTP2_HEADER_ACCESS_CONTROL_ALLOW_ORIGIN,
  HTTP2_HEADER_CONTENT_LENGTH,
  HTTP2_HEADER_CONTENT_TYPE,
  HTTP2_HEADER_IF_MODIFIED_SINCE,
  HTTP2_HEADER_IF_UNMODIFIED_SINCE,
  HTTP2_HEADER_LAST_MODIFIED,
  HTTP2_HEADER_LOCATION,
  HTTP2_HEADER_METHOD,
  HTTP2_HEADER_PATH,
  HTTP2_HEADER_REFERRER_POLICY,
  HTTP2_HEADER_STATUS,
  HTTP2_HEADER_STRICT_TRANSPORT_SECURITY,
  HTTP2_HEADER_X_CONTENT_TYPE_OPTIONS,
  HTTP2_HEADER_X_FRAME_OPTIONS,
  HTTP2_HEADER_X_XSS_PROTECTION,
  HTTP2_METHOD_HEAD,
} = constants;

const FILE_PATH = Symbol('file-path');
const HTML5_DOCTYPE = /^<!DOCTYPE html>/iu;
const HTTP2_HEADER_X_POWERED_BY = 'x-powered-by';
const PRODUCTION = process.env.NODE_ENV === 'production';

const { byteLength, isBuffer } = Buffer;
const { create, entries: entriesOf, freeze } = Object;
const { isNativeError } = types;
const { isSafeInteger } = Number;
const { readFile } = promises;

const Stage = freeze({
  Ready: Symbol('ready'),
  Responding: Symbol('responding'),
  TryingIndexFile: Symbol('trying "index.html"'),
  TryingDotHtml: Symbol('trying ".html"'),
  Done: Symbol('done'),
});

// =============================================================================

let doFormatRedirect;
const formatRedirect = async data => {
  if (!doFormatRedirect) {
    const url = new URL('redirect.html', import.meta.url);
    doFormatRedirect = templatize({
      bindings: ['status', 'statusMessage', 'location'],
      source: await readFile(url, 'utf-8'),
      name: 'generate(redirect.html)',
    });
  }
  return doFormatRedirect(data);
};

let doFormatError;
const formatError = async data => {
  if (!doFormatError) {
    const url = new URL('error.html', import.meta.url);
    doFormatError = templatize({
      bindings: ['status', 'statusMessage', 'error', 'requestHeaders'],
      source: await readFile(url, 'utf-8'),
      name: 'generate(error.html)',
    });
  }
  if (data.requestHeaders && typeof data.requestHeaders === 'object') {
    data.requestHeaders = entriesOf(data.requestHeaders);
  }
  return doFormatError(data);
};

// =============================================================================

/**
 * An HTTP request/response exchange. This class implements a thin veneer over
 * Node.js' HTTP/2 stream abstraction. It is loosely inspired by Koa.js, which
 * exposes a unified context object to middleware instead of the distinct
 * request and response objects exposed by Node.js and Express.js for HTTP/1.1.
 *
 * Since this class builds on HTTP/2 streams directly, it also is restricted to
 * that protocol version. In contrast, Koa.js builds on the request/response API
 * supported by both protocol versions. However, in case of HTTP/2, the
 * implementation comes with some overhead—after all, it is implemented on top
 * of the HTTP/2 stream API—and also is not entirely faithful—which is not
 * surprising since the two versions have fundamentally different network
 * communications patterns.
 *
 * Each exchange goes through three user-discernible stages, from __Ready__ to
 * __Responding__ to __Done__. During the first stage, user-code uses getters,
 * setters, and helper methods to determine the response headers and body.
 * Invoking `respond()`, `fail()`, or `redirect()` then transitions to the
 * second stage. The exchange now reads any file content from the file system
 * and transmits the response headers and body to the client. Finally, when the
 * underlying stream has been destroyed, the exchange transitions into the third
 * and final stage.
 *
 * The implementation internally recognizes two more stages, __TryingIndexFile__
 * to check for an `index.html` file when the request path names a directory and
 * __TryingDotHtml__ to check for a file with the `.html` extension when the
 * request path does not exist. While both states are necessary for
 * implementation correctness, they also are refinements of the __Responding__
 * stage and thus not exposed to user-code.
 */
export default class Exchange {
  #stage = Stage.Ready;
  #origin;
  #stream;
  #request;
  #method;
  #path;
  #endsInSlash;
  #accept = undefined;
  #status = undefined;
  #response = create(null);
  #body = undefined;
  #didRespond;

  constructor({ origin, stream, headers }) {
    this.#origin = origin;
    this.#stream = stream;
    this.#request = headers;
    this.#method = this.#request[HTTP2_HEADER_METHOD];

    try {
      const { path, endsInSlash } = parseRequestPath(
        this.#request[HTTP2_HEADER_PATH]
      );
      this.#path = path;
      this.#endsInSlash = endsInSlash;
    } catch (x) {
      this.#path = '/.well-known/bad-path';
      this.fail(HTTP_STATUS_BAD_REQUEST, x);
    }
  }

  // ===========================================================================

  /**
   * Handle this exchange with the given series of asynchronous middleware
   * functions.
   */
  handleWith(...handlers) {
    let index = -1;

    const dispatch = step => {
      if (step <= index) throw new Error(`next() called repeatedly`);
      index = step;

      if (step < handlers.length) {
        const fn = handlers[step];
        return fn(this, dispatch.bind(null, step + 1));
      } else {
        return this.respond();
      }
    };

    return dispatch(0);
  }

  // ===========================================================================
  // The Three Stages of an Exchange
  // ===========================================================================

  /** Determine whether this exchange is in the initial ready stage. */
  isReady() {
    return this.#stage === Stage.Ready;
  }

  /** Determine whether this exchange is in the responding stage. */
  isResponding() {
    return this.#stage !== Stage.Ready && this.#stage !== Stage.Done;
  }

  /** Determine whether this exchange is done. */
  isDone() {
    return this.#stage === Stage.Done;
  }

  /** Return a promise that resolves once this exchange is done. */
  didRespond() {
    if (this.#didRespond == null) {
      if (this.#stage !== Stage.Done) {
        const { promise, resolve } = settleable();
        this.#stream.on('close', resolve);
        this.#didRespond = promise;
      } else {
        this.#didRespond = Promise.resolve();
      }
    }
    return this.#didRespond;
  }

  // ===========================================================================
  // Request Headers
  // ===========================================================================

  /** Get the server origin. */
  get origin() {
    return this.#origin;
  }

  /** Get the request method. */
  get method() {
    return this.#method;
  }

  /** Get the cleaned up request path. */
  get path() {
    return this.#path;
  }

  /**
   * Determine whether the raw request path ends in a slash. The cleaned up
   * path does not have a trailing slash.
   */
  get endsInSlash() {
    return this.#endsInSlash;
  }

  // ---------------------------------------------------------------------------

  /** Get the request */
  get request() {
    return this.#request;
  }

  /**
   * Determine the quality factor for the given media type. This method
   * implements the semantics of the `accept` header.
   */
  quality(type) {
    if (typeof type === 'string') {
      type = MediaType.of(type);
    }

    if (!this.#accept) {
      this.#accept = MediaType.accept(this.#request[HTTP2_HEADER_ACCEPT]);
    }
    return MediaType.matchingQuality(type, this.#accept);
  }

  /**
   * Determine whether the resource has been modified. This method implements
   * the semantics of the `last-modified`, `if-modified-since`, and
   * `if-unmodified-since` headers.
   */
  isModified(lastModified) {
    let validator = parseDate(this.#request[HTTP2_HEADER_IF_MODIFIED_SINCE]);
    if (validator) {
      return lastModified > validator;
    }

    validator = parseDate(this.#request[HTTP2_HEADER_IF_UNMODIFIED_SINCE]);
    if (validator) {
      return lastModified <= validator;
    }

    return true;
  }

  // ===========================================================================
  // Response Headers and Body
  // ===========================================================================

  get status() {
    return this.#status;
  }

  /** Set the response status. This setter only works in the ready stage. */
  set status(value) {
    assert(this.#stage === Stage.Ready);
    assert(isSafeInteger(value) && 200 <= value && value <= 599);

    this.#status = value;
  }

  // ---------------------------------------------------------------------------

  get response() {
    return this.#response;
  }

  setResponseHeader(name, value) {
    assert(this.#stage !== Stage.Done);
    assert(name && typeof name === 'string');
    assert(name !== HTTP2_HEADER_STATUS);

    let normalized;
    if (name === HTTP2_HEADER_CONTENT_LENGTH) {
      assert(isSafeInteger(value) && value >= 0);
      normalized = value;
    } else if (name === HTTP2_HEADER_CONTENT_TYPE) {
      normalized = MediaType.of(value);
      assert(normalized != null && typeof normalized === 'object');
    } else {
      assert(typeof value === 'string');
      normalized = value;
    }
    this.#response[name] = normalized;
    return this;
  }

  /** Get the content type. */
  get type() {
    return this.#response[HTTP2_HEADER_CONTENT_TYPE];
  }

  /** Set the content type. */
  set type(value) {
    this.setResponseHeader(HTTP2_HEADER_CONTENT_TYPE, value);
  }

  /** Get the content length. */
  get length() {
    return this.#response[HTTP2_HEADER_CONTENT_LENGTH];
  }

  /** Set the content length. */
  set length(value) {
    this.setResponseHeader(HTTP2_HEADER_CONTENT_LENGTH, value);
  }

  /** Get the `x-powered-by` header value. */
  get poweredBy() {
    return this.#response[HTTP2_HEADER_X_POWERED_BY];
  }

  /** Set the `x-powered-by` header value. */
  set poweredBy(value) {
    this.setResponseHeader(HTTP2_HEADER_X_POWERED_BY, value);
  }

  // ---------------------------------------------------------------------------

  /** Get the body value. */
  get body() {
    return this.#body;
  }

  /**
   * Set the body value. The given value must be `undefined`, `null`, a string,
   * or a buffer. An undefined or null body is semantically equivalent to the
   * absence of a body. In contrast, a zero-length string or buffer as body
   * indicates the presence of a body. The difference is observable: This class
   * automatically adds a `content-length` to a response with body, but does not
   * do so for a response without body. This setter only works in the ready
   * stage.
   */
  set body(value) {
    assert(this.#stage === Stage.Ready);
    assert(value == null || typeof value === 'string' || isBuffer(value));
    this.#body = value;
    this.#response[HTTP2_HEADER_CONTENT_LENGTH] = byteLength(value);
  }

  /**
   * Get the symbol indicating a file path. If the body is an object whose
   * `type` property has this symbol as value, the `path` property indicates
   * the file's path.
   */
  static get FilePath() {
    return FILE_PATH;
  }

  /**
   * Set the response body to the contents of the file with given path. This
   * method only records the path. Actual I/O is initiated by calling
   * `respond()`, which also fills in content type and length.
   */
  file(path) {
    assert(this.#stage === Stage.Ready);
    assert(typeof path === 'string');
    this.#body = { type: FILE_PATH, path };
  }

  /**
   * Set the response body to the given HTML value. This method also sets the
   * content type as HTML.
   */
  html(value) {
    assert(this.#stage === Stage.Ready);
    assert(typeof value === 'string');

    this.body = value; // Sets content-length.
    this.#response[HTTP2_HEADER_CONTENT_TYPE] = MediaType.HTML;
  }

  /**
   * Serialize the given value to JSON and set the response body to the result.
   * This method does not use the `JSON.stringify`also sets the content type as JSON.
   */
  json(value, { stringify = pickle } = {}) {
    assert(this.#stage === Stage.Ready);

    this.body = stringify(value); // Sets content-length.
    this.#response[HTTP2_HEADER_CONTENT_TYPE] = MediaType.JSON;
  }

  // ===========================================================================
  // Initiate I/O via Fail, Redirect, and Respond
  // ===========================================================================

  /**
   * Fail this exchange. The arguments are optional, with a missing status
   * defaulting to a `500 Internal Server Error`. When not running in
   * production, the error object's stack trace is included in the error page to
   * improve debugability. If this exchange is in the ready stage, calling this
   * method transitions it to the responding stage.
   */
  async fail(status, error) {
    if (status != null) {
      assert(isSafeInteger(status) && 400 <= status && status <= 599);
    }
    if (error != null) assert(isNativeError(error));

    // Do not proceed if headers have been sent.
    if (this.#stream.headersSent) return;

    // Set up status, with explicit argument taking priority.
    if (status != null) this.#status = status;
    if (status == null) this.#status = HTTP_STATUS_INTERNAL_SERVER_ERROR;
    const statusMessage = STATUS_CODES[status] ?? '';

    // Set the body.
    if (!PRODUCTION && this.quality(MediaType.HTML) > 0) {
      // Only show detailed error information outside of production.
      this.#body = await formatError({
        status,
        statusMessage,
        error,
        requestHeaders: this.#request,
      });
    } else {
      this.#body = `${status} ${statusMessage}`;
      this.#response[HTTP2_HEADER_CONTENT_TYPE] = MediaType.PlainText;
    }

    this.prepare();
    this.send();
  }

  // ---------------------------------------------------------------------------

  // TODO: Handle 304 Not Modified separately. Minimize headers but do include
  // cache-control, content-location, date, etag, expires, vary.

  /**
   * Redirect the exchange. This method transitions from the ready to the
   * responding stage.
   */
  async redirect(status, location) {
    assert(this.#stage === Stage.Ready);
    assert(301 <= status && status <= 308 && status !== 306);

    // NB: Parsing a URL as a WhatWG's URL encodes non-ASCII characters in the
    // domain name and escapes path characters as necessary. That's just what's
    // needed here, but it does rule out URL for routing.
    const url = new URL(location).href;

    this.#status = status;
    this.#response[HTTP2_HEADER_LOCATION] = url;
    this.#body = await formatRedirect({
      status,
      statusMessage: STATUS_CODES[status] ?? '',
      // Escape the original location string for embedding in HTML.
      location: escapeBodyText(location),
    });

    this.prepare();
    this.send();
  }

  // ---------------------------------------------------------------------------

  /**
   * Send a response. If neither status nor body have been set, this method
   * sends a `500 Internal Server Error`. Otherwise, if the body is not a file
   * path, this method prepares the body and its headers and thereafter sends
   * them. Finally, if the body is a file path, this method tries to respond
   * with the contents of the file at that path, at file `path + "/index.html"`
   * if that path is a directory, and at the file `path + ".html"` if that path
   * does not exist.
   */
  async respond() {
    assert(this.#stage === Stage.Ready);
    this.#stage = Stage.Responding;

    // If status and body are missing, middleware didn't do its job. That's an
    // internal server error.
    if (this.#status == null && this.#body == null) {
      await this.fail(HTTP_STATUS_INTERNAL_SERVER_ERROR);
      return;
    }

    // Otherwise, if the status is missing, we assume everything is aok. After
    // all, we have a body.
    if (this.#status == null) {
      this.#status = HTTP_STATUS_OK;
    }

    // The body's data is right there. We just need to prepare and send.
    if (this.#body == null || this.#body.type !== FILE_PATH) {
      this.prepare();
      this.send();
      return;
    }

    // .........................................................................

    // Load the content from a file while also allowing for cool URLs.
    const { path, type } = this.#body;
    assert(type === FILE_PATH);

    const statCheck = (fileStatus, headers) => {
      this.#response = this.prepare({ headers, fileStatus });
    };

    const onError = error => {
      const headers = this.#response;

      if (this.#stream.headersSent) {
        // Nothing to do.
      } else if (error.code === 'ENOENT') {
        if (this.#stage === Stage.Responding) {
          this.#stage = Stage.TryingDotHtml;
          const path2 = path + '.html';
          headers[HTTP2_HEADER_CONTENT_TYPE] = MediaType.HTML;
          this.#stream.respondWithFile(path2, headers, { statCheck, onError });
        } else {
          this.fail(404, error);
        }
      } else if (error.code === 'EISDIR' && this.#stage === Stage.Responding) {
        this.#stage = Stage.TryingIndexFile;
        const path2 = join(path, 'index.html');
        headers[HTTP2_HEADER_CONTENT_TYPE] = MediaType.HTML;
        this.#stream.respondWithFile(path2, headers, { statCheck, onError });
      } else {
        this.fail(500, error);
      }
    };

    this.#response[HTTP2_HEADER_CONTENT_TYPE] = mediaTypeForPath(path);
    this.#stream.respondWithFile(path, this.#response, {
      statCheck,
      onError,
    });
  }

  // ===========================================================================

  /** Prepare the response by filling in common headers. */
  prepare({ headers = this.#response, fileStatus } = {}) {
    assert(this.#stage !== Stage.Done);
    if (this.#stage === Stage.Ready) this.#stage = Stage.Respondding;

    // Fill in status.
    headers[HTTP2_HEADER_STATUS] = this.#status ?? HTTP_STATUS_OK;

    if (this.#body != null && headers[HTTP2_HEADER_CONTENT_TYPE] == null) {
      // Fill in content-type.
      if (typeof this.#body === 'string' && HTML5_DOCTYPE.test(this.#body)) {
        headers[HTTP2_HEADER_CONTENT_TYPE] = MediaType.HTML;
      } else {
        headers[HTTP2_HEADER_CONTENT_TYPE] = MediaType.Binary;
      }

      // Fill in content-length.
      if (headers[HTTP2_HEADER_CONTENT_LENGTH] === undefined) {
        headers[HTTP2_HEADER_CONTENT_LENGTH] = byteLength(this.#body);
      }
    }

    // FIXME: Set up cache-control.
    if (fileStatus) {
      if (!headers[HTTP2_HEADER_LAST_MODIFIED]) {
        headers[HTTP2_HEADER_LAST_MODIFIED] = fileStatus.mtime.toUTCString();
      }
    }

    const type = headers[HTTP2_HEADER_CONTENT_TYPE];
    if (type.type === 'font') {
      // Enable CORS for font preloading to work.
      if (!headers[HTTP2_HEADER_ACCESS_CONTROL_ALLOW_ORIGIN]) {
        headers[HTTP2_HEADER_ACCESS_CONTROL_ALLOW_ORIGIN] = this.origin;
      }
    } else if (type.type === 'text' && type.subtype === 'html') {
      if (!headers[HTTP2_HEADER_REFERRER_POLICY]) {
        headers[HTTP2_HEADER_REFERRER_POLICY] = 'origin-when-cross-origin';
      }
      if (!headers[HTTP2_HEADER_X_FRAME_OPTIONS]) {
        headers[HTTP2_HEADER_X_FRAME_OPTIONS] = 'DENY';
      }
      if (!headers[HTTP2_HEADER_X_XSS_PROTECTION]) {
        headers[HTTP2_HEADER_X_XSS_PROTECTION] = '1; mode-block';
      }
    }

    if (!headers[HTTP2_HEADER_STRICT_TRANSPORT_SECURITY]) {
      // Per Mozilla, two years is best current practice.
      headers[HTTP2_HEADER_STRICT_TRANSPORT_SECURITY] = `max-age=${
        2 * 365 * 24 * 60 * 60
      }`;
    }
    if (!headers[HTTP2_HEADER_X_CONTENT_TYPE_OPTIONS]) {
      headers[HTTP2_HEADER_X_CONTENT_TYPE_OPTIONS] = 'nosniff';
    }

    return headers;
  }

  /** Send the response headers and body. */
  send() {
    assert(this.#stage !== Stage.Ready && this.#stage !== Stage.Done);

    const endStream = this.#method === HTTP2_METHOD_HEAD || this.#body == null;
    this.#stream.respond(this.#response, { endStream });
    if (!endStream) this.#stream.end(this.#body);
  }
}
