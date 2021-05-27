/* © 2020-2021 Robert Grimm */

import { createReadStream, promises } from 'fs';
import { EOL } from 'os';
import {
  escapeText,
  parseDateHTTP,
  validateRequestPath,
  validateRoutePath,
} from './util.js';
import { finished, pipeline, Readable } from 'stream';
import {
  Header,
  MethodName,
  StatusCode,
  StatusWithoutBody,
} from './constants.js';
import { inspect, types } from 'util';
import { extname, join } from 'path';
import MediaType from './media-type.js';
import { STATUS_CODES } from 'http';
import templatize from '@grr/temple';

const {
  assign,
  create,
  defineProperties,
  entries: entriesOf,
  keys: keysOf,
} = Object;

const { Binary, HTML, Jason, PlainText } = MediaType;
const { byteLength, isBuffer } = Buffer;
const DOCTYPE = /^<!DOCTYPE html>/iu;
const { HEAD } = MethodName;
const INSPECT = Symbol.for('nodejs.util.inspect.custom');
const { isArray } = Array;
const { isNativeError } = types;
const { isSafeInteger } = Number;
const MAX_BODY_LENGTH = 100;
const PRODUCTION = process.env.NODE_ENV === 'production';
const { readFile, realpath, stat } = promises;
const { has: ReflectHas } = Reflect;
const { stringify: stringifyAsJSON } = JSON;

const {
  Accept,
  AccessControlAllowOrigin,
  Authority,
  CacheControl,
  ContentLength,
  ContentType,
  ContentTypeOptions,
  FrameOptions,
  IfModifiedSince,
  IfUnmodifiedSince,
  LastModified,
  Location,
  Method,
  Path,
  PermittedCrossDomainPolicies,
  Query,
  Referer,
  ReferrerPolicy,
  Scheme,
  Status,
  StrictTransportSecurity,
  TransferEncoding,
  UserAgent,
  XssProtection,
} = Header;

const {
  InternalServerError,
  MovedPermanently,
  NoContent,
  NotFound,
  NotModified,
  Ok,
} = StatusCode;

// =============================================================================

/** A message, which captures the state common to requests and responses. */
class Message {
  #headers;
  #body;

  /** Create a new message, optionally with the headers. */
  constructor(headers = create(null), body = undefined) {
    this.#headers = headers;
    this.#body = body;
  }

  // ---------------------------------------------------------------------------

  // Generic Headers Access
  // ~~~~~~~~~~~~~~~~~~~~~~

  /**
   * Get the underlying header data. Application code should not use the result
   * to access headers and rather use the subsequent methods `clear()`, `has()`,
   * `get()`, `set()`, `setIfUnset()`, and `delete()`. This method exists as a
   * straight-forward solution9 to pass a message's headers to Node.js' HTTP
   * API.
   */
  get headers() {
    return this.#headers;
  }

  /** Clear the header values. */
  clear() {
    const headers = this.headers;
    for (const name of keysOf(headers)) {
      delete headers[name];
    }
    return this;
  }

  /** Determine whether the header exists. */
  has(name) {
    return ReflectHas(this.#headers, name);
  }

  /** Get the header value. */
  get(name) {
    return this.#headers[name];
  }

  /**
   * Set one or more header values. Assuming that we have a message object,
   *
   * ```js
   * const request = new Message();
   * ```
   *
   * we can either update one header by providing key and value:
   *
   * ```js
   * request.set(Header.ContentLength, byteLength(request.body));
   * request.set(Header.ContentType, MediaType.JSON);
   * ```
   *
   * Or we can update several headers by providing one object:
   *
   * ```js
   * request.set({
   *   [Header.ContentLength]: byteLength(request.body),
   *   [Header.ContentType]: MediaType.JSON,
   * });
   * ```
   *
   * For the `content-length` and `content-type` headers as well as the
   * `:status` pseudo-header, the message's `length`, `type`, and `status`
   * properties serve as short aliases. The message's `body` property completes
   * the data model.
   */
  set(name, value) {
    if (arguments.length === 0) {
      // Nothing to do.
    } else if (arguments.length === 1) {
      if (name != null && typeof name === 'object') {
        assign(this.#headers, name);
      }
    } else {
      this.#headers[name] = value;
    }
    return this;
  }

  /** Set the header value only if it wasn't set before. */
  setIfUnset(name, value) {
    if (!ReflectHas(this.#headers, name)) {
      this.#headers[name] = value;
    }
    return this;
  }

  /** Delete the header value. */
  delete(name) {
    delete this.#headers[name];
    return this;
  }

  // ---------------------------------------------------------------------------

  // Regular Headers
  // ~~~~~~~~~~~~~~~

  /** Get content length. */
  get length() {
    return this.#headers[ContentLength];
  }

  /** Set content length. */
  set length(value) {
    this.#headers[ContentLength] = value;
  }

  /** Get content type. */
  get type() {
    return this.#headers[ContentType];
  }

  /** Set content type. */
  set type(value) {
    this.#headers[ContentType] = value;
  }

  // ---------------------------------------------------------------------------

  // Body
  // ~~~~

  /** Get the body value. */
  get body() {
    return this.#body;
  }

  /** Set the body value. */
  set body(value) {
    this.#body = value;
  }

  // ---------------------------------------------------------------------------

  // Pretty-Printing
  // ~~~~~~~~~~~~~~~

  [INSPECT](depth, options) {
    if (depth < 0) {
      return `${options.stylize(this.constructor.name, 'name')} { ... }`;
    }

    const newOptions = assign({}, options, {
      depth: options.depth == null ? null : options.depth - 1,
    });

    // <Message> {
    const lines = [`${options.stylize(this.constructor.name, 'name')} {`];

    //   <HeaderKey>: <HeaderValue>
    let hasHeader = false;
    for (const [key, value] of entriesOf(this.#headers)) {
      hasHeader = true;
      lines.push(
        `  ${options.stylize(key, 'name')}: ${inspect(value, newOptions)},`
      );
    }
    if (hasHeader) lines.push(``);

    let body;
    if (this.#body == null) {
      body = `  ${options.stylize(`null`, `null`)}`;
    } else if (this.#body instanceof Readable) {
      let source = ' ';
      if (this.#body.path) source = ` path: ${this.#body.path} `;
      body = `  Readable {${source}}`;
    } else if (typeof this.#body === `string`) {
      body = stringifyAsJSON(this.#body);
      if (body.length < MAX_BODY_LENGTH) {
        body = `  ${options.stylize(`"${body.slice(1, -1)}"`, 'string')}`;
      } else {
        body = body.slice(1, MAX_BODY_LENGTH - 5);
        body = `  ${options.stylize(`"${body}..."`, 'string')}`;
      }
    } else {
      body = this.#body.toString('hex');
      if (body.length < MAX_BODY_LENGTH + 2) {
        body = `  ${options.stylize(body, 'special')}`;
      } else {
        body = body.slice(0, MAX_BODY_LENGTH - 3);
        body = `  ${options.stylize(`${body}...`, 'special')}`;
      }
    }
    lines.push(body);
    lines.push('}');
    return lines.join(EOL);
  }
}

// =============================================================================

/**
 * A request. Its `scheme`, `authority`, `method`, and `path` properties
 * provide convenient access to the four valid pseudo-headers.
 */
class Request extends Message {
  // Regular Headers
  // ~~~~~~~~~~~~~~~

  /** Get parsed value for accept header. */
  get accept() {
    let accept = this.get(Accept);
    if (!isArray()) {
      accept = MediaType.parseAll(accept);
      this.set(Accept, accept);
    }
    return accept;
  }

  // Pseudo-Headers
  // ~~~~~~~~~~~~~~

  /** Get scheme. */
  get scheme() {
    return this.get(Scheme);
  }

  /** Set scheme. */
  set scheme(value) {
    this.set(Scheme, value);
  }

  /** Get authority. */
  get authority() {
    return this.get(Authority);
  }

  /** Set authority. */
  set authority(value) {
    this.set(Authority, value);
  }

  /** Get method. */
  get method() {
    return this.get(Method);
  }

  /** Set method. */
  set method(value) {
    this.set(Method, value);
  }

  /** Get path. */
  get path() {
    return this.get(Path);
  }

  /** Set path. */
  set path(value) {
    this.set(Path, value);
  }
}

// =============================================================================

/**
 * A response. The `status` property provides convenient access to the only
 * valid pseudo-header.
 */
class Response extends Message {
  // Regular Headers
  // ~~~~~~~~~~~~~~~

  /** Get cache control. */
  get cache() {
    return this.get(CacheControl);
  }

  /** Set cache control. */
  set cache(value) {
    this.set(CacheControl, value);
  }

  // Pseudo-Headers
  // ~~~~~~~~~~~~~~

  /** Get status. */
  get status() {
    return this.get(Status);
  }

  /** Set status. */
  set status(value) {
    this.set(Status, value);
  }
}

// =============================================================================

/**
 * A request/response context. On client and server alike, a context is
 * instantiated with a request and subsequently completed with a response. Both
 * request and response share the same superclass, which captures the headers
 * and the body. The two subclasses implementing each message differ in valid
 * pseudo-headers. A request has a `scheme`, `authority`, `method` and `path`,
 * whereas a response only has a `status`.
 */
export default class Context {
  /**
   * Create an error suitable for generating an HTTP response. This method
   * accepts a status code, an error message or error, and an headers object,
   * each of which is optional. The returned error has a `status` between 400
   * and 599 and also `headers`, which may be `null` or `undefined`.
   */
  static Error(...args) {
    let err, status, headers;

    // Argument #1 is nothing; an error; an error message; malformed status.
    if (args.length === 0) {
      err = new Error(`Error condition is unknown`);
    } else if (isNativeError(args[0])) {
      err = args.shift();
    } else if (typeof args[0] === 'string') {
      err = new Error(args.shift());
    } else if (!isSafeInteger(args[0]) || args[0] < 400 || 599 < args[0]) {
      err = new TypeError(
        `Status "${args[0]}" is not an integer between 400 and 599`
      );
    } else {
      // Argument #1 is valid status.
      status = args.shift();

      // Argument #2 is nothing/headers; an error; an error message; garbage.
      const noneOrNull = args.length === 0 || args[0] == null;
      if (noneOrNull || typeof args[0] === 'object') {
        err = new Error(STATUS_CODES[status] ?? '');
        if (noneOrNull) args.shift();
      } else if (isNativeError(args[0])) {
        err = args.shift();
      } else if (typeof args[0] === 'string') {
        err = new Error(args.shift());
      } else {
        err = new TypeError(`Error message "${args.shift()}" is not a string`);
      }
    }

    // Argument #n is headers.
    if (args[0] != null && typeof args[0] === 'object') {
      headers = args.shift();
    }

    // Patch status.
    if (!isSafeInteger(err.status) || err.status < 400 || err.status > 599) {
      err.status =
        status ?? (err.code === 'ENOENT' ? NotFound : InternalServerError);
    }

    // Patch headers.
    if (err.headers == null || typeof err.headers !== 'object') {
      err.headers = headers;
    } else if (headers != null) {
      assign(err.headers, headers);
    }

    return err;
  }

  // ---------------------------------------------------------------------------

  #logger;
  #stringify;
  #origin;
  #client;
  #stream;
  #request;
  #response;
  #responded;

  /** Create a new context. */
  constructor({
    origin,
    stream,
    request = create(null),
    logger = console,
    stringify = stringifyAsJSON,
  }) {
    this.#logger = logger;
    this.#stringify = stringify;
    this.#origin = origin;
    this.#client = stream.session.socket.remoteAddress;
    this.#stream = stream;
    this.#request = new Request(request);
    this.#response = new Response();
  }

  /** Get logger. */
  get logger() {
    return this.#logger;
  }

  /** Stringify the value as JSON. */
  stringify(value) {
    return this.#stringify(value);
  }

  // ---------------------------------------------------------------------------

  /** The protocol version as a floating point value. */
  get version() {
    return 2;
  }

  /** The origin. */
  get origin() {
    return this.#origin;
  }

  /** The client. */
  get client() {
    return this.#client;
  }

  /** The underlying connection. */
  get connection() {
    return this.#stream.session;
  }

  /** The underlying stream for HTTP/2. */
  get stream() {
    return this.#stream;
  }

  /** The request message. */
  get request() {
    return this.#request;
  }

  /** The response message. */
  get response() {
    return this.#response;
  }

  // ---------------------------------------------------------------------------

  /** Flag for whether the out-going headers have been sent. */
  get hasSentHeaders() {
    return this.#stream.headersSent;
  }

  /** Determine whether the response has been sent. */
  get hasResponded() {
    return this.#responded;
  }

  /** Mark the response as having been sent. */
  markResponded() {
    this.#responded = true;
  }

  /**
   * Flag for whether this context has terminated. In terms of the Node.js API,
   * a context has terminated if the stream is closed or destroyed. In other
   * words, this flag accounts for regular completion via `stream.end()` or
   * `stream.close()` as well as abrupt termination due to an error.
   */
  get isTerminated() {
    const stream = this.#stream;
    return stream.closed || stream.destroyed;
  }

  /** Invoke the callback upon this context having terminated. */
  onDidTerminate(handler) {
    if (typeof handler !== 'function') {
      throw new TypeError(`Handler "${handler}" is not a function`);
    }
    finished(this.#stream, handler);
  }

  // ===========================================================================

  /**
   * Format a log entry for this request, response interaction in the combined
   * log format, which is the same as the Common Log Format with the values of
   * the `referer` and `user-agent` request headers appended.
   */
  toCombinedLogFormat({ time = Date.now() } = {}) {
    // See http://httpd.apache.org/docs/current/logs.html#accesslog
    const { request, response } = this;

    let message = `${this.client} - - [${new Date(time).toISOString()}]`;
    message += ` "${request.method} ${request.path} HTTP2"`;
    message += ` ${response.status} ${response.length ?? '-'}`;
    message += ` "${request.get(Referer) ?? '-'}"`;
    message += ` "${request.get(UserAgent) ?? '-'}"`;
    return message;
  }

  // ===========================================================================

  /**
   * Set the response body. As much as possible, this method not only updates
   * the stored representation of the response body but also the `:status`,
   * `content-length`, `content-type`, and `transfer-encoding` headers. Since
   * the latter is not supported by HTTP/2, this method only removes it if the
   * new value is `null` or `undefined`. The processing of the body continues in
   * `respond()` below. Notably, that method instantiates the pipeline
   * connecting a readable stream as body with the output stream.
   */
  prepare(value) {
    const { response } = this;

    // Set the status if not yet set.
    if (response.status == null) {
      response.status = value == null ? NoContent : Ok;
    }

    // If the old body is a different stream, close it.
    const previous = response.body;
    if (previous instanceof Readable && previous !== value) {
      // Don't close here, since the stream may still be needed inside pipeline.
      this.onDidTerminate(() => previous.destroy());
    }

    if (value == null) {
      response.body = value;
      response.delete(ContentType);
      response.delete(ContentLength);
      response.delete(TransferEncoding);
    } else if (isBuffer(value)) {
      response.body = value;
      response.setIfUnset(ContentType, Binary);
      response.set(ContentLength, value.length);
    } else if (typeof value === 'string') {
      response.body = value;
      response.setIfUnset(ContentType, DOCTYPE.test(value) ? HTML : PlainText);
      response.set(ContentLength, byteLength(value));
    } else if (value instanceof Readable) {
      // Instantiate actual pipeline for writing data in respond() below.
      response.body = value;
      response.setIfUnset(ContentType, Binary);
      response.delete(ContentLength);
    } else {
      // It may be preferable to serialize the body only in respond() below. As
      // is, serializing the body is wasted work if it gets replaced again.
      // However, JSON serialization may fail and respond() should avoid just
      // that, since it is intended to run as the very last step in the
      // middleware pipeline, after all handlers have completed.
      const serialized = this.stringify(value);
      response.body = serialized;
      response.setIfUnset(ContentType, Jason);
      response.set(ContentLength, byteLength(serialized));
    }

    return this;
  }

  /** Harden the response. */
  harden() {
    if (this.hasSentHeaders) return this;

    // See https://owasp.org/www-project-secure-headers/
    const { response } = this;
    const { type } = response;
    if (type != null) {
      if (type.type === 'font') {
        response.setIfUnset(AccessControlAllowOrigin, this.origin);
      } else if (type.type === 'text' && type.subtype === 'html') {
        response.setIfUnset(ReferrerPolicy, 'origin-when-cross-origin');
        response.setIfUnset(FrameOptions, 'DENY');
        response.setIfUnset(XssProtection, '1; mode=block');
      }
    }

    response.setIfUnset(
      StrictTransportSecurity,
      `max-age=${(PRODUCTION ? 120 : 1) * 24 * 60 * 60}`
    );
    response.setIfUnset(ContentTypeOptions, 'nosniff');
    response.setIfUnset(PermittedCrossDomainPolicies, 'none');

    return this;
  }

  // ---------------------------------------------------------------------------

  /**
   * Send the response. This method returns immediately if this context is
   * marked as `responded` via `markResponded()`.
   */
  respond() {
    if (this.hasResponded || this.isTerminated) return this;
    this.markResponded();

    let { request, response, stream } = this;
    let { body } = response;

    if (response.status == null) {
      response.status = NotFound;
    }

    if (StatusWithoutBody[response.status] || request.method === HEAD) {
      if (body instanceof Readable) body.close();
      body = null;
    }

    if (!this.hasSentHeaders) {
      stream.respond(response.headers, { endStream: body == null });
    }

    if (body != null) {
      if (isBuffer(body)) {
        stream.end(body);
      } else if (typeof body === 'string') {
        stream.end(body, 'utf8');
      } else if (body instanceof Readable) {
        pipeline(body, stream, error => {
          if (error) {
            this.logger.error(
              `Failed streaming body for ${request.path}`,
              error
            );
          }
        });
      }
    }

    return this;
  }

  // ===========================================================================

  /**
   * Turn error into response. This method sets the response to a self-contained
   * HTML document describing the error. That error document includes details on
   * the request and the thrown error when running outside of production.
   * Consistent with best security practices, almost all this information is
   * elided when running in production.
   */
  async fail(error) {
    if (this.hasSentHeaders || this.isTerminated) {
      return this; // Nothing to do.
    } else if (!isNativeError(error)) {
      error = new Error(`Middleware threw non-error "${error}"`);
    }

    // Check for lazily instantiated formatError() first since it may fail.
    if (!this.formatError) {
      this.formatError = await this._errorFormatter();
    }

    // Generate error response.
    const { request, response } = this;
    response.clear().set(error.headers);
    const status =
      error.status ??
      (error.code === 'ENOENT' ? NotFound : InternalServerError);
    response.status = status;

    this.prepare(
      this.formatError({
        status,
        statusMessage: STATUS_CODES[status] ?? 'Error',
        error: PRODUCTION ? undefined : error,
        requestHeaders: PRODUCTION ? undefined : entriesOf(request.headers),
      })
    );

    return this;
  }

  /** Create the template function for formatting an error document. */
  async _errorFormatter() {
    const url = new URL('error.html', import.meta.url);
    return templatize({
      name: 'formatError',
      library: { escape: escapeText },
      data: ['status', 'statusMessage', 'error', 'requestHeaders'],
      source: await readFile(url, 'utf-8'),
    });
  }

  /**
   * Handle any error during a call to `fail()`. Rich error reporting has many
   * opportunities for resulting in errors as well. This method provides the
   * error handler for just that eventuality by creating a simpler plain text
   * response.
   */
  failAgain(error) {
    if (this.hasSentHeaders || this.isTerminated) return this;

    const { response } = this;
    response.clear().set(error.headers);
    response.status = error.status ?? InternalServerError;
    this.prepare(PRODUCTION ? 'Internal Server Error' : error.stack);

    return this;
  }

  // ---------------------------------------------------------------------------

  /** Validate path. */
  validateRequestPath() {
    const { request } = this;
    const { path, query } = validateRequestPath(request.path);
    request.path = path;
    if (query) request.set(Query, query);

    return this;
  }

  // ---------------------------------------------------------------------------

  /** Redirect the request. */
  redirect(location, status = MovedPermanently) {
    const { response } = this;
    response.status = status;
    const { href } = new URL(location);
    response.set(Location, href);

    // The setter for body automatically sets content length and type.
    const display = escapeText(location);
    this.prepare(`<!DOCTYPE html><html lang=en><meta charset=utf-8>
<title>${status} ${STATUS_CODES[status] ?? 'Redirect'}</title>
The resource has moved to <a href="${href}">${display}</a>.
`);

    return this;
  }

  // ---------------------------------------------------------------------------

  /** Determine quality of media type. */
  qualityOf(type) {
    return type.matchForQuality(this.request.accept);
  }

  /** Compute quality-sorted list of media types. */
  qualityOfAll(...types) {
    return types
      .map(type => ({
        type,
        quality: type.matchForQuality(this.request.accept),
      }))
      .sort((t, u) => u.quality - t.quality);
  }

  // ---------------------------------------------------------------------------

  /**
   * Resolve the given path to the effective resource path and status object.
   * This method tries the given path, the given path plus `.html` if the given
   * path does not exist, and the given path plus `/index.html` if the given
   * path is a directory.
   */
  async resolveFile(path) {
    const throwNotFound = () => {
      throw Context.Error(
        NotFound,
        `No resource with path "${path}" could be found`
      );
    };

    let metadata;
    try {
      // Look for file at given path.
      metadata = await stat(path);
    } catch (x) {
      if (x.code !== 'ENOENT') throw x;

      // If given path names nothing, try HTML extension.
      path += '.html';
      metadata = await stat(path);
      if (!metadata.isFile()) throwNotFound();
    }

    if (metadata.isFile()) {
      return { path, metadata };
    } else if (!metadata.isDirectory()) {
      throwNotFound();
    }

    // If given path names directory, try index file.
    path = join(path, 'index.html');
    metadata = await stat(path);
    if (!metadata.isFile()) throwNotFound();
    return { path, metadata };
  }

  /**
   * Determine whether a resource that was last modified at `mtime` is modified
   * relative to any `if-modified-since` or `if-unmodified-since` request
   * header.
   */
  isModified({ mtime }) {
    const { request } = this;
    let validator = parseDateHTTP(request.get(IfModifiedSince));
    if (validator) {
      return mtime > validator;
    }

    validator = parseDateHTTP(request.get(IfUnmodifiedSince));
    if (validator) {
      return mtime <= validator;
    }

    return true;
  }

  /**
   * Try satisfying the request by serving a file from the given file system
   * tree. This method relies on `resolveFile()` to determine the effective file
   * path. It rejects any path that has a segment starting with a dot (unless
   * the path starts with `/.well-known/`)  or that includes a symlink. Both
   * restrictions are security precautions to limit exposed state to content
   * (and not dot files) that is actually stored in the file system tree (and
   * not just reachable via some symbolic link).
   *
   * If this function locates a suitable file for the first time, it sets the
   * response body to a stream of the file's content and returns `true`. If the
   * file has not been modified since last served to the client, this function
   * simply returns `false`. In all other cases, including a file-not-found
   * condition, this function throws a suitable error.
   */
  async satisfyFromFileSystem({ root }) {
    const { request, response } = this;
    const { path } = request;

    root = validateRoutePath(root);
    const fullPath = join(root, path);
    const { path: actualPath, metadata } = await this.resolveFile(fullPath);
    if (actualPath !== (await realpath(actualPath))) {
      throw Context.Error(
        NotFound,
        `Resource "${path}" was found but path is symlinked`
      );
    }

    if (!this.isModified(metadata)) {
      response.status = NotModified;
      return false;
    }

    this.prepare(createReadStream(actualPath, { emitClose: true }));
    response.length = metadata.size;
    const extension = extname(actualPath);
    response.type = MediaType.fromExtension(extension) ?? MediaType.Binary;
    response.set(LastModified, metadata.mtime.toUTCString());
    return true;
  }
}

defineProperties(Context, {
  Message: { value: Message },
  Request: { value: Request },
  Response: { value: Response },
});
