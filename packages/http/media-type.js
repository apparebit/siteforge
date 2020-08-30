/* © 2020 Robert Grimm */

import { strict as assert } from 'assert';

/* eslint-disable no-control-regex */

const COMMA = ','.charCodeAt(0);
const DQUOTE = '"'.charCodeAt(0);
const SEMICOLON = ';'.charCodeAt(0);
const ESCAPED_CHAR = /\\(.)/gu;
const TO_BE_ESCAPED = /["\\]/gu;
const INSPECT = Symbol.for('nodejs.util.inspect.custom');

// https://mimesniff.spec.whatwg.org/#parsing-a-mime-type
const PARAMETER = new RegExp(
  // Semicolon
  `;` +
    // Leading space
    `[\\t\\n\\r ]*` +
    // Name
    `([^=;,]*)` +
    // Optional value
    `(?:=` +
    `([^;,\\t\\n\\r ]*)` +
    `)?` +
    // Trailing space
    `[\\t\\n\\r ]*`,
  `uy`
);

// https://mimesniff.spec.whatwg.org/#http-quoted-string-token-code-point
const QUOTED_STRING_CHARS = /^[\u0009\u0020-\u007e\u0080-\u00ff]+$/u;
const QUOTED_STRING = /"((?:[^"\\]|\\.)*)(?:"|(\\?)$)/uy;

// https://www.iana.org/assignments/media-type-structured-suffix/media-type-structured-suffix.xml
const SUFFIX_NAMES = [
  'ber',
  'cbor',
  'cbor-seq',
  'der',
  'fastinfoset',
  'gzip',
  'json',
  'json-seq',
  'jwt',
  'sqlite3',
  'tlv',
  'wbxml',
  'xml',
  'zip',
  'zstd',
];

// https://mimesniff.spec.whatwg.org/#http-token-code-point
const TOKEN = /^[-!#$%&'*+.^`|~\w]+$/u;

// https://www.iana.org/assignments/media-types/media-types.xhtml
const TOP_LEVEL_NAMES = [
  '*',
  'application',
  'audio',
  'example',
  'font',
  'image',
  'message',
  'model',
  'multipart',
  'text',
  'video',
];

// https://mimesniff.spec.whatwg.org/#parsing-a-mime-type
const TYPE_SUBTYPE_SUFFIX = new RegExp(
  // Possibly leading space
  `[\\t\\n\\r ]*` +
    // Type
    `([^/]*)` +
    `\\/` +
    // Subtype
    `([^+;,\\t\\n\\r ]*)` +
    // Optional suffix
    `(?:` +
    `\\+` +
    `([^;,\\t\\n\\r ]+)` +
    `)?` +
    // Possibly trailing space
    `[\\t\\n\\r ]*`,
  `uy`
);

const UTF8 = /^utf-?8$/iu;

const configurable = true;
const {
  create,
  defineProperty,
  entries: entriesOf,
  freeze,
  keys: keysOf,
} = Object;
const enumerable = true;
const { isArray } = Array;

// The registry of canonical media types.
const ComponentRegistry = create(null);
const StringRegistry = create(null);
const ExtensionRegistry = create(null);

const lookUpByComponent = ({ type, subtype, suffix, parameters }) => {
  if (type === '*') return MediaType.Any;
  const bySubtype = ComponentRegistry[type];
  if (bySubtype == null) return undefined;
  const candidate = bySubtype[subtype];
  if (candidate == null || candidate.suffix !== suffix) return undefined;
  if (parameters == null) return candidate;
  const paramNames = keysOf(parameters);
  return paramNames.length > 1 ||
    paramNames[0] !== 'charset' ||
    candidate.parameters?.charset !== parameters.charset
    ? undefined
    : candidate;
};

// =============================================================================

export default class MediaType {
  /**
   * Instantiate a media type. This method handles the following kind of inputs:
   *
   * ```js
   * // Create from two or more components. Either the suffix or the parameters
   * // or both may be omitted.
   * MediaType.from('text', 'plain');
   *
   * // Parse from string:
   * MediaType.from('text/plain');
   *
   * // Extract and validate the components from a plain old object.
   * MediaType.from({ type: 'text', subtype: 'plain' });
   *
   * // Just return a media type argument.
   * MediaType.from(MediaType.PlainText);
   * ```
   *
   * In all cases, this method tries to return one of the preallocated,
   * canonical media type instances.
   */
  static from(...args) {
    let value;
    if (args.length > 1) {
      value = MediaType.collect(args);
      let mediaType = lookUpByComponent(value);
      if (mediaType) return mediaType;
    } else {
      value = args[0];
    }

    if (MediaType.isMediaType(value)) {
      return value;
    }

    const type = typeof value;
    if (type === 'string') {
      let mediaType = StringRegistry[value];
      if (mediaType) return mediaType;

      mediaType = MediaType.parse(value).mediaType;
      if (mediaType) return new MediaType(mediaType);
    } else if (value != null && type === 'object') {
      return new MediaType(MediaType.validate(value));
    }

    throw new Error(`"${value}" is not a valid media type`);
  }

  /** Determine the media type for the given file extension. */
  static fromExtension(extension) {
    return ExtensionRegistry[extension];
  }

  /**
   * Collect the arguments as media type components. The first two arguments
   * for the `type` and `subtype` are required. The `suffix` and `parameters`
   * may each be omitted but not reordered.
   */
  static collect(...args) {
    if (args.length === 1 && isArray(args[0])) args = args[0];
    let [type, subtype, suffix, parameters] = args;

    if (
      suffix != null &&
      typeof suffix === 'object' &&
      parameters === undefined
    ) {
      parameters = suffix;
      suffix = undefined;
    }

    return { type, subtype, suffix, parameters };
  }

  /** Validate a plain old object or media type instance. */
  static validate(value) {
    if (value == null || typeof value !== 'object') {
      throw new Error(`Media type "${value}" is not an object`);
    }

    // Type
    if (typeof value.type !== 'string') {
      throw new Error(`Top-level type "${value.type}" is not a string`);
    }
    const type = value.type.toLowerCase();
    if (!TOP_LEVEL_NAMES.includes(type)) {
      throw new Error(`Top-level type "${value.type}" is invalid`);
    }

    // Subtype
    if (typeof value.subtype !== 'string') {
      throw new Error(`Subtype "${value.subtype}" is not a string`);
    }
    const subtype = value.subtype.toLowerCase();
    if (subtype === '') {
      throw new Error(`Subtype "${value.subtype}" is empty`);
    }

    // Suffix
    let suffix;
    if (value.suffix != null) {
      if (typeof value.suffix !== 'string') {
        throw new Error(
          `Suffix "${value.suffix}" is neither undefined nor a string`
        );
      }
      suffix = value.suffix.toLowerCase();
      if (!SUFFIX_NAMES.includes(suffix)) {
        throw new Error(`Suffix "${value.suffix}" is invalid`);
      }
    }

    // Parameters
    let parameters;
    if (value.parameters != null) {
      if (typeof value.parameters !== 'object') {
        throw new Error(
          `Parameters "${value.parameters}" are neither undefined nor an object`
        );
      }

      parameters = create(null);
      for (const [k, v] of entriesOf(value.parameters)) {
        const key = k.toLowerCase();
        if (key === '') {
          throw new Error(`Parameter name "${k}" is empty`);
        }

        let value;
        if (key === 'q') {
          value = Number(v);
          if (isNaN(value) || value < 0 || 1 < value) {
            throw new Error(`Quality "${v}" is not a number 0 <= q <= 1`);
          }
        } else if (typeof v !== 'string') {
          throw new Error(`Parameter ${key} "${v}" is not a string`);
        } else if (key === 'charset') {
          if (UTF8.test(v)) {
            value = 'UTF-8';
          } else {
            value = v;
          }
        } else {
          value = v;
        }

        parameters[key] = value;
      }
    }

    // Wildcards
    if (type === '*' || subtype === '*') {
      if (type === '*' && subtype !== '*') {
        throw new Error(
          `Top-level wildcard "*" with non-wildcard subtype "${subtype}"`
        );
      } else if (suffix != null) {
        throw new Error(
          `Wildcard "${type}/${subtype}" with suffix "${suffix}"`
        );
      } else if (parameters != null) {
        const keys = keysOf(parameters);
        if (keys.length > 1 || parameters[0] !== 'q') {
          throw new Error(
            `Wildcard "${type}/${subtype} with parameter(s) other than "q"`
          );
        }
      }
    }

    // Done
    return { type, subtype, suffix, parameters };
  }

  /**
   * Parse all media types in the string and return plain old objects with
   * the data.
   */
  static parseAll(s) {
    if (typeof s !== 'string') return [MediaType.Any];

    const { length } = s;
    const patterns = [];

    let position = 0;
    while (true) {
      const { mediaType: pattern, next } = MediaType.parse(s, position);
      if (pattern) patterns.push(pattern);

      if (position < next && next < length && s.charCodeAt(next) === COMMA) {
        position = next + 1;
      } else {
        break;
      }
    }

    return patterns.length === 0 ? [MediaType.Any] : patterns;
  }

  /**
   * Parse the media type at the given string position. This method returns a
   * record with the `mediaType` and the `next` index.
   */
  static parse(s, position = 0) {
    // https://mimesniff.spec.whatwg.org/#parsing-a-mime-type
    const { length } = s;

    // Match permissive pattern for type, subtype, and suffix.
    TYPE_SUBTYPE_SUFFIX.lastIndex = position;
    let [match, type, subtype, suffix] = TYPE_SUBTYPE_SUFFIX.exec(s) ?? [];

    // Perform checks specified in algorithm.
    if (!match) return { next: position };
    position += match.length;

    if (
      type === '' ||
      !TOKEN.test(type) ||
      subtype === '' ||
      !TOKEN.test(subtype)
    ) {
      return { next: position };
    }

    // Normalize type, subtype, and suffix values.
    type = type.toLowerCase();
    subtype = subtype.toLowerCase();
    suffix = suffix != null ? suffix.toLowerCase() : undefined;

    // Parse parameters.
    let parameters;
    while (position < length && s.charCodeAt(position) === SEMICOLON) {
      // Match against permissive parameter regex.
      PARAMETER.lastIndex = position;
      let [match, name, value] = PARAMETER.exec(s) ?? [];
      if (!match) break;
      position += match.length;

      // Perform checks specified in algorithm.
      if (name === '' || !TOKEN.test(name)) continue;
      if (value === undefined || value === '') continue;
      if (value.charCodeAt(0) === DQUOTE) {
        value = MediaType.unquote(value).value;
      }
      if (!QUOTED_STRING_CHARS.test(value)) continue;

      // Normalize parameter name. Treat charset and q as special.
      name = name.toLocaleLowerCase();
      if (name === 'charset' && UTF8.test(value)) {
        value = 'UTF-8';
      } else if (name === 'q') {
        value = Number(value);
      }

      // If the parameter hasn't been declared yet, add it to collection.
      if (!parameters) parameters = create(null);
      if (parameters[name] === undefined) parameters[name] = value;
    }

    // Et voila!
    const mediaType = { type, subtype, suffix, parameters };
    return { mediaType, next: position };
  }

  /** Unquote the quoted string starting at the given position. */
  static unquote(s, position = 0) {
    // https://fetch.spec.whatwg.org/#collect-an-http-quoted-string
    QUOTED_STRING.lastIndex = position;
    const [match, content, trailer] = QUOTED_STRING.exec(s) ?? [];
    assert(String(match).startsWith('"'));

    return {
      value: content.replace(ESCAPED_CHAR, '$1') + (trailer ?? ''),
      next: position + match.length,
    };
  }

  /** Create a new media type from the data. */
  static create(data) {
    return new MediaType(data);
  }

  /** Determine whether the given value is an instance of this class. */
  static isMediaType(value) {
    return value instanceof MediaType;
  }

  /** Compare the two media types. */
  static compare(type1, type2) {
    return type1.compareTo(type2);
  }

  // ===========================================================================

  /**
   * Create a new media type. The constructor does not validate arguments and
   * should thus not be invoked directly. Instead use `MediaType.from()`
   */
  constructor({ type, subtype, suffix, parameters }) {
    this.type = type;
    this.subtype = subtype;
    this.suffix = suffix;
    this.parameters = parameters;
  }

  /** Create a new media type without the parameters. */
  unparameterized() {
    return new MediaType({ ...this, parameters: undefined });
  }

  /** Create a new media type with the additional parameters. */
  with(parameters) {
    parameters = { ...Object(this.parameters), ...Object(parameters) };
    return new MediaType({ ...this, parameters });
  }

  /** Get the charset parameter. */
  get charset() {
    return this.parameters?.charset;
  }

  /** Get the quality parameter. This getter defaults to returning 0. */
  get quality() {
    return this.parameters?.q ?? 1;
  }

  /**
   * Get the precedence. When matching a media type against several others,
   * e.g., for content negotiation through the `accept` header, more specific
   * media types have precedence over less specific ones. This property
   * quantifies that relation. It is `1` for the arbitrary range, `2` for a
   * subrange, `3` for a bare media type without parameters, and `3 + p` for a
   * media type with `p` parameters. The quality factor `q` does not count as a
   * parameter in this computation.
   */
  get precedence() {
    if (this.subtype === '*') {
      return this.type === '*' ? 1 : 2;
    } else if (!this.parameters) {
      return 3;
    } else {
      const keys = keysOf(this.parameters);
      return 3 + keys.length + (keys.includes('q') ? -1 : 0);
    }
  }

  /** Determine whether the media type contains wildcards. */
  hasWildcard() {
    return this.type === '*' || this.subtype === '*';
  }

  /** Compare this media type to the given media type for priority. */
  compareTo(other) {
    assert(MediaType.isMediaType(other));

    const p1 = this.precedence;
    const p2 = other.precedence;
    if (p1 !== p2) return p2 - p1;

    const q1 = this.quality;
    const q2 = other.quality;
    return q2 - q1;
  }

  /** Match this media type against the pattern. */
  matchTo(pattern) {
    // Match wildcard.
    if (pattern.type === '*' && pattern.subtype === '*') return true;

    // Match type only.
    if (this.type !== pattern.type) return false;
    if (pattern.subtype === '*') return true;

    // Match type and subtype.
    if (this.subtype !== pattern.subtype) return false;
    if (pattern.type !== 'text') return true;

    // Match charset for text.
    const patternCharset = pattern.parameters?.charset;
    if (patternCharset == null) return true;
    const typeCharset = this.parameters?.charset;
    if (typeCharset == null) return true;

    return typeCharset === patternCharset;
  }

  /**
   * Match this media type against the patterns and return the quality of first
   * and also highest priority match.
   */
  matchForQuality(...patterns) {
    // Improve method ergonomics
    if (patterns.length === 1 && isArray(patterns[0])) {
      [patterns] = patterns;
    }

    for (const pattern of patterns) {
      if (this.matchTo(pattern)) return pattern.quality;
    }
    return 0;
  }

  /** Render this media type as a string. */
  toString() {
    let s = `${this.type}/${this.subtype}`;

    if (this.suffix) {
      s = `${s}+${this.suffix}`;
    }

    if (this.parameters) {
      for (let [key, value] of entriesOf(this.parameters)) {
        value = String(value);
        if (!TOKEN.test(value)) {
          value = `"${value.replace(TO_BE_ESCAPED, `\\$&`)}"`;
        }

        s = `${s}; ${key}=${value}`;
      }
    }

    return s;
  }

  /** Concisely render this media type during inspection. */
  [INSPECT](_, options) {
    return (
      options.stylize('MediaType', 'name') +
      ' { ' +
      options.stylize(`'${this.toString()}'`, 'string') +
      ' } '
    );
  }

  /** Brand instances of this class. */
  get [Symbol.toStringTag]() {
    return 'MediaType';
  }
}

// =============================================================================

for (const name of TOP_LEVEL_NAMES) {
  const mediaType = freeze(new MediaType(MediaType.collect(name, '*')));
  // When using media type as a key, it is automatically coerced to a string.
  StringRegistry[mediaType] = mediaType;
  if (name === '*') {
    ComponentRegistry['*'] = mediaType;
  } else {
    if (!ComponentRegistry[name]) ComponentRegistry[name] = create(null);
    ComponentRegistry[name]['*'] = mediaType;
  }

  const display = name === '*' ? 'Any' : name[0].toUpperCase() + name.slice(1);
  assert(MediaType[display] === undefined);
  defineProperty(MediaType, display, {
    configurable,
    enumerable,
    value: mediaType,
  });
}

const CHARSET_UTF8 = (() => {
  const parameters = create(null);
  parameters.charset = 'UTF-8';
  return freeze(parameters);
})();

for (let [display, args] of entriesOf({
  AudioMP4: ['audio', 'mp4'],
  Binary: ['application', 'octet-stream'],
  CSS: ['text', 'css'],
  EventStream: ['text', 'event-stream'],
  H264: ['video', 'h264'],
  H265: ['video', 'h265'],
  HTML: ['text', 'html'],
  JavaScript: ['text', 'javascript'],
  // Not named JSON, which conflicts with standard library.
  Jason: ['application', 'json'],
  Markdown: ['text', 'markdown'],
  PlainText: ['text', 'plain'],
  PNG: ['image', 'png'],
  SVG: ['image', 'svg', 'xml'],
  VideoMP4: ['video', 'mp4'],
})) {
  const [type, subtype] = args;
  const hasCharset =
    type === 'text' || (type === 'application' && subtype === 'json');
  if (hasCharset) args.push(undefined, CHARSET_UTF8);
  const mediaType = freeze(new MediaType(MediaType.collect(args)));

  // When using media type as a key, it is automatically coerced to a string.
  if (hasCharset) StringRegistry[mediaType.unparameterized()] = mediaType;
  StringRegistry[mediaType] = mediaType;
  if (!ComponentRegistry[type]) ComponentRegistry[type] = create(null);
  ComponentRegistry[type][subtype] = mediaType;

  assert(MediaType[display] === undefined);
  defineProperty(MediaType, display, {
    configurable,
    enumerable,
    value: mediaType,
  });
}

// -----------------------------------------------------------------------------

const ExtensionsForType = {
  'application/atom+xml': 'atom',
  'application/geo+json': 'geojson',
  'application/json': 'json',
  'application/ld+json': 'jsonld',
  'application/manifest+json': 'webmanifest',
  'application/pdf': 'pdf',
  'application/rdf+xml': 'rdf',
  'application/rss+xml': 'rss',
  'application/wasm': 'wasm',
  'application/zip': 'zip',
  'audio/flac': 'flac',
  'audio/mp4': ['f4a', 'f4b', 'm4a'],
  'audio/mpeg': 'mp3',
  'audio/wave': ['wav', 'wave'],
  'font/otf': 'otf',
  'font/ttf': 'ttf',
  'font/woff': 'woff',
  'font/woff2': 'woff2',
  'image/bmp': 'bmp',
  'image/gif': 'gif',
  'image/jpeg': ['jfif', 'jpg', 'jpeg'],
  'image/png': 'png',
  'image/svg+xml': ['svg'], // svgz?
  'image/tiff': ['tif', 'tiff'],
  'image/webp': 'webp',
  'image/x-icon': ['cur', 'ico'],
  'text/calendar': 'ics',
  'text/css': 'css',
  'text/html': ['htm', 'html'],
  'text/javascript': ['cjs', 'js', 'mjs'], // Per WhatWG
  'text/markdown': ['markdown', 'md'],
  'text/plain': 'txt',
  'text/vcard': ['vcard', 'vcf'],
  'video/mp4': ['f4v', 'f4p', 'm4v', 'mp4'],
  'video/quicktime': ['mov', 'qt'],
  'video/webm': 'webm',
};

for (let [type, extensions] of entriesOf(ExtensionsForType)) {
  const mediaType = MediaType.from(type);

  if (!isArray(extensions)) extensions = [extensions];
  for (const extension of extensions) {
    ExtensionRegistry[`.${extension}`] = mediaType;
  }
}
