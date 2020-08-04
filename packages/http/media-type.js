/* © 2020 Robert Grimm */

import { strict as assert } from 'assert';

const {
  create,
  defineProperties,
  defineProperty,
  entries: entriesOf,
  freeze,
  keys: keysOf,
} = Object;

const enumerable = true;

/* eslint-disable no-control-regex */

const CHARCODE_BACKSLASH = `\\`.charCodeAt(0);
const CHARCODE_COMMA = `,`.charCodeAt(0);
const CHARCODE_DQUOTE = `"`.charCodeAt(0);
const CHARSET_UTF8 = freeze({ charset: 'UTF-8' });
const DQUOTE_SLASH = /["\\]/gu;
const END_OF_CLAUSE = /[;]/gu;
const END_OF_CLAUSE_EXT = /[;,]/gu;
const PARAM_SEP = /[=;]/gu;
const PARAM_SEP_EXT = /[=;,]/gu;
const TYPE_SEP = /[/]/gu;
const TYPE_SEP_EXT = /[/,]/gu;

// https://tools.ietf.org/html/rfc7231#section-5.3.1
const QUALITY = /0(\.\d{0,3})?|1(\.0{0,3})?/u;

// https://mimesniff.spec.whatwg.org/#http-quoted-string-token-code-point
const QUOTED_STRING = /^[\u0009\u0020-\u007e\u0080-\u00ff]+$/u;

// https://mimesniff.spec.whatwg.org/#http-token-code-point
const TOKEN = /^[-!#$%&'*+.^`|~\w]+$/u;

const TYPE_NAMES = [
  '*',
  'application',
  'audio',
  'font',
  'image',
  'message',
  'model',
  'multipart',
  'text',
  'video',
];

// https://tools.ietf.org/html/rfc7231#section-3.1.1.2:
// To specify UTF-8 charset, value of parameter must be `UTF-8` ignoring case;
// upper case is canonical. Since Node.js accepts dashless version, do so too.
const UTF_8 = /^utf-?8$/iu;

// =============================================================================
// The Default Export: Class MediaType

/** The in-memory representation of a media type. */
export default function MediaType(type, subtype, params) {
  if (!new.target) {
    return new MediaType(type, subtype, params);
  }

  if (typeof type !== 'string') {
    return undefined;
  }
  type = type.toLowerCase();
  if (!TYPE_NAMES.includes(type) || typeof subtype !== 'string') {
    return undefined;
  }
  subtype = subtype.toLowerCase();
  if (subtype === '' || (subtype !== '*' && type === '*')) {
    return undefined;
  }

  let parameters;
  if (params != null && typeof params === 'object') {
    parameters = params;
  }

  defineProperties(this, {
    type: { enumerable, value: type },
    subtype: { enumerable, value: subtype },
    parameters: { enumerable, value: parameters },
  });
}

for (const type of TYPE_NAMES) {
  const name = type === '*' ? 'Any' : type[0].toUpperCase() + type.slice(1);
  defineProperty(MediaType, name, {
    value: freeze(MediaType(type, '*')),
  });
}

// =============================================================================
// Helper Functions: String Manipulation

// https://fetch.spec.whatwg.org/#http-whitespace
const isSpace = c => {
  switch (c) {
    case 0x20:
    case 0x0a:
    case 0x0d:
    case 0x09:
      return true;
    default:
      return false;
  }
};

const skipLeading = (s, position = 0, length = s.length) => {
  while (position < length && isSpace(s.charCodeAt(position))) position++;
  return position;
};

const skipTrailing = (s, position = s.length) => {
  while (position > 0 && isSpace(s.charCodeAt(position - 1))) position--;
  return position;
};

// -----------------------------------------------------------------------------
// Helper Functions: Media Type Manipulation

// While these functions certainly work with instances of MediaType, they do not
// require them but rather work with plain old JavaScript objects as well.

const withoutParameters = type => new MediaType(type.type, type.subtype);

const withParameters = (type, parameters) => {
  let newParameters;

  const set = (key, value) => {
    if (value != null) {
      if (!newParameters) newParameters = create(null);
      newParameters[key.toLowerCase()] = value;
    }
  };

  for (const [key, value] of entriesOf(Object(type.parameters))) {
    set(key, value);
  }
  for (const [key, value] of entriesOf(Object(parameters))) {
    set(key, value);
  }
  return new MediaType(type.type, type.subtype, newParameters);
};

const charsetOf = type => type.parameters?.charset;
const qualityOf = type => {
  const q = type.parameters?.q ?? 1;
  return typeof q === 'number' ? q : Number(q);
};
const precedenceOf = type => {
  if (type.subtype === '*') {
    return type.type === '*' ? 1 : 2;
  } else {
    if (!type.parameters) return 3;
    const keys = keysOf(type.parameters);
    return keys.length === 1 && keys[0] === 'q' ? 3 : 4;
  }
};

const compare = (type1, type2) => {
  const p1 = precedenceOf(type1);
  const p2 = precedenceOf(type2);
  if (p1 !== p2) return p2 - p1;

  const q1 = qualityOf(type1);
  const q2 = qualityOf(type2);
  return q2 - q1;
};

const matches = (type, range) => {
  // No match necessary.
  if (range.type === '*' && range.subtype === '*') return true;

  // Match on type.
  if (type.type !== range.type) return false;
  if (range.subtype === '*') return true;

  // Match on subtype.
  if (type.subtype !== range.subtype) return false;
  if (range.type !== 'text') return true;

  // Match on charset for text.
  const rangeCharset = range.parameters?.charset;
  if (rangeCharset == null) return true;
  const typeCharset = type.parameters?.charset;
  if (typeCharset == null) return true;

  return typeCharset === rangeCharset;
};

const matchingQuality = (type, ranges) => {
  for (const range of ranges) {
    if (matches(type, range)) return qualityOf(range);
  }
  return 0;
};

const render = type => {
  let s = `${type.type}/${type.subtype}`;

  const { parameters } = type;
  if (parameters) {
    for (let [key, value] of entriesOf(parameters)) {
      value = String(value);
      if (!TOKEN.test(value)) {
        value = `"${value.replace(/[\\"]/gu, `\\$&`)}"`;
      }
      s += `; ${key}=${value}`;
    }
  }

  return s;
};

// =============================================================================
// Parsing: Quoted Strings, Media Types, and Accept Headers

/**
 * Parse a quoted string. The parse starts at the given position, faithfully
 * implements the WhatWG's algorithm from the `fetch` specification, but always
 * extracts the value.
 */
const parseQuotedString = (s, position = 0) => {
  // https://fetch.spec.whatwg.org/#collect-an-http-quoted-string

  // To collect an HTTP quoted string from a string input,
  // given a position variable position and optionally an extract-value flag,
  // run these steps:
  const { length } = s;

  //  1. Let positionStart be position.
  //  2. Let value be the empty string.
  let value = '';

  //  3. Assert: the code point at position within input is U+0022 (").
  assert(s.charCodeAt(position) === CHARCODE_DQUOTE);

  //  4. Advance position by 1.
  position++;

  //  5. While true:
  while (true) {
    //  5. 1. Append the result of collecting a sequence of code points
    //        that are not U+0022 (") or U+005C (\) from input,
    //        given position, to value.
    const start = position;
    DQUOTE_SLASH.lastIndex = start;
    const match = DQUOTE_SLASH.exec(s);
    const end = match?.index ?? length;

    if (start < end) value += s.slice(start, end);
    position = end;

    //  5. 2. If position is past the end of input, then break.
    if (position === length) break;

    //  5. 3. Let quoteOrBackslash be the code point at position within input.
    const quoteOrBackslash = s.charCodeAt(end);

    //  5. 4. Advance position by 1.
    position++;

    //  5. 5. If quoteOrBackslash is U+005C (\), then:
    if (quoteOrBackslash === CHARCODE_BACKSLASH) {
      //  5. 5. 1. If position is past the end of input,
      //           then append U+005C (\) to value and break.
      if (position >= length) {
        value += '\\';
        break;
      }

      //  5. 5. 2. Append the code point at position within input to value.
      value += s[position];

      //  5. 5. 3  Advance position by 1.
      position++;
    } else {
      //  5. 6. Otherwise:
      //  5. 6. 1. Assert: quoteOrBackslash is U+0022 (").
      assert(quoteOrBackslash === CHARCODE_DQUOTE);

      //  5. 6. 2. Break.
      break;
    }
  }

  //  6. If the extract-value flag is set, then return value.
  return { value, next: position };

  // NB. Implementation always extracts value, hence 7 is not implemented.
  //  7. Return the code points from positionStart to position,
  //     inclusive, within input.
};

// -----------------------------------------------------------------------------

const parseMediaType = (s, { position = 0, isRepeated = false } = {}) => {
  // https://mimesniff.spec.whatwg.org/#parsing-a-mime-type

  // To parse a MIME type, given a string input, run these steps:
  const TypeSep = isRepeated ? TYPE_SEP_EXT : TYPE_SEP;
  const InParamSep = isRepeated ? PARAM_SEP_EXT : PARAM_SEP;
  const EndOfClause = isRepeated ? END_OF_CLAUSE_EXT : END_OF_CLAUSE;

  //  1. Remove any leading and trailing HTTP whitespace from input.
  let { length } = s;
  let start = skipLeading(s, position, length);

  //  2. Let position be a position variable for input,
  //     initially pointing at the start of input.
  //  3. Let type be the result of collecting a sequence of code points
  //     that are not U+002F (/) from input, given position.
  TypeSep.lastIndex = start;
  let match = TypeSep.exec(s);
  let end = match?.index ?? length;

  //  4. If type is the empty string or does not solely contain
  //     HTTP token code points, then return failure.
  //  5. If position is past the end of input, then return failure.
  // NB. Delay error returns to finish parsing complete media type up to comma.
  let type = s.slice(start, end);
  let failed = start === end || !TOKEN.test(type);
  if (match?.[0] === ',') return { next: end };

  //  6. Advance position by 1. (This skips past U+002F (/).)
  //  7. Let subtype be the result of collecting a sequence of code points
  //     that are not U+003B (;) from input, given position.
  start = end + 1;
  EndOfClause.lastIndex = start;
  match = EndOfClause.exec(s);
  position = end = match?.index ?? length;

  //  8. Remove any trailing HTTP whitespace from subtype.
  end = skipTrailing(s, end); // May step backwards.

  //  9. If subtype is the empty string or does not solely contain
  //     HTTP token code points, then return failure.
  if (start === end) failed = true;
  let subtype = s.slice(start, end);
  if (!TOKEN.test(subtype)) failed = true;

  // 10. Let mimeType be a new MIME type record whose type is type,
  //     in ASCII lowercase, and subtype is subtype, in ASCII lowercase.
  type = type.toLowerCase();
  subtype = subtype.toLowerCase();

  // NB. If we reached end of input or a comma in repeated mode,
  //     there are no parameters to parse and we can return right here.
  if (end === length || (isRepeated && match?.[0] === ',')) {
    if (failed) {
      // We are at a well-defined boundary: It's ok to return failure now.
      return { next: end };
    } else if (subtype === '*') {
      if (type === '*') {
        return { mediaType: MediaType.Any, next: end };
      } else {
        const name = type[0].toUpperCase() + type.slice(1).toLowerCase();
        return { mediaType: MediaType[name], next: end };
      }
    } else {
      return { mediaType: new MediaType(type, subtype), next: end };
    }
  }

  // NB. If type is text, we normalize the charset parameter below.
  const isText = type === 'text';

  // 11. While position is not past the end of input:
  let parameters;
  while (position < length) {
    //  1. Advance position by 1. (This skips past U+003B (;).)
    //  2. Collect a sequence of code points that are HTTP whitespace
    //     from input given position.
    start = skipLeading(s, position + 1, length);

    //  3. Let parameterName be the result of collecting a sequence of
    //     code points that are not U+003B (;) or U+003D (=) from input,
    //     given position.
    InParamSep.lastIndex = start;
    const match = InParamSep.exec(s);
    position = end = match?.index ?? length;

    // NB. Steps 5 and 6 are mutually exclusive and thus can be reversed.
    //     Step 4 uses variables changed by 5.2 and thus must come before.
    //  6. If position is past the end of input, then break.
    if (end === length) break;

    // NB. Comma indicates a new media type.
    if (isRepeated && match?.[0] === ',') break;

    //  5. If position is not past the end of input, then:
    //  5. 1. If the code point at position within input is U+003B (;),
    //        then continue.
    if (match?.[0] === ';') continue;

    //  4. Set parameterName to parameterName, in ASCII lowercase.
    const name = s.slice(start, end).toLowerCase();

    //  5. 2. Advance position by 1. (This skips past U+003D (=).)
    start = end + 1;

    // NB. We record key, value pair at end of loop, need flag to break out.
    let loopEndBreak = false;
    //  7. Let parameterValue be null.
    let value;

    //  8. If the code point at position within input is U+0022 ("), then:
    if (s.charCodeAt(start) === CHARCODE_DQUOTE) {
      //  8. 1. Set parameterValue to the result of collecting an HTTP quoted
      //        string from input, given position and the extract-value flag.
      ({ value, next: end } = parseQuotedString(s, start));

      //  8. 2. Collect a sequence of code points that are not U+003B (;)
      //        from input, given position.
      EndOfClause.lastIndex = end;
      const match = EndOfClause.exec(s);
      position = match?.index ?? length;

      if (isRepeated && match?.[0] === ',') {
        loopEndBreak = true;
      }
    } else {
      //  9. Otherwise:
      //  9. 1. Set parameterValue to the result of collecting a sequence of
      //        code points that are not U+003B (;) from input, given position.
      EndOfClause.lastIndex = start;
      const match = EndOfClause.exec(s);
      position = end = match?.index ?? length;

      if (isRepeated && match?.[0] === ',') {
        loopEndBreak = true;
      }

      //  9. 2. Remove any trailing HTTP whitespace from parameterValue.
      end = skipTrailing(s, end); // May step backwards.

      //  9. 3. If parameterValue is the empty string, then continue.
      if (!loopEndBreak && start === end) continue;
      value = s.slice(start, end);
    }

    // 10. If all of the following are true
    if (
      // * parameterName is not the empty string
      name !== '' &&
      // * parameterName solely contains HTTP token code points
      TOKEN.test(name) &&
      // * parameterValue solely contains HTTP quoted-string token code points
      QUOTED_STRING.test(value) &&
      // * mimeType’s parameters[parameterName] does not exist
      parameters?.[name] === undefined
    ) {
      // then set mimeType’s parameters[parameterName] to parameterValue.
      if (isText && name === 'charset') {
        // charset
        if (!parameters) parameters = create(null);
        parameters.charset = UTF_8.test(value) ? 'UTF-8' : value.toUpperCase();
      } else if (name !== 'q') {
        if (!parameters) parameters = create(null);
        parameters[name] = value;
      } else if (QUALITY.test(value)) {
        if (!parameters) parameters = create(null);
        parameters[name] = Number(value);
      }
    }

    if (loopEndBreak) break;
  }

  // 12. Return mimeType.
  let mediaType = failed ? undefined : new MediaType(type, subtype, parameters);
  return { mediaType, next: position };
};

// -----------------------------------------------------------------------------

const toMediaType = value => {
  if (value instanceof MediaType) {
    return value;
  } else if (
    value != null &&
    typeof value.type === 'string' &&
    typeof value.subtype === 'string'
  ) {
    return new MediaType(value.type, value.subtype, value.parameters);
  } else if (typeof value === 'string') {
    return parseMediaType(value).mediaType;
  } else {
    throw new Error(`Cannot convert "${value}" to media type`);
  }
};

// -----------------------------------------------------------------------------

const parseMediaRanges = (s, position = 0) => {
  const { length } = s;
  const mediaRanges = [];

  while (true) {
    const { mediaType, next } = parseMediaType(s, {
      position,
      isRepeated: true,
    });

    if (mediaType != null) {
      mediaRanges.push(mediaType);
    }

    if (next < length && s.charCodeAt(next) === CHARCODE_COMMA) {
      position = next + 1;
    } else {
      position = next;
      break;
    }
  }

  return { mediaRanges, next: position };
};

// =============================================================================
// Static Media Type Methods (which operate on POJOs as much as on MediaTypes)

defineProperties(MediaType, {
  /** Parse a quote value and return the equivalent unquoted version. */
  unquote: {
    value(s) {
      return parseQuotedString(s).value;
    },
  },

  /** Return a copy of the given media type without parameters. */
  without: { value: withoutParameters },
  /** Return a copy of the given media type with the given parameters. */
  with: { value: withParameters },

  /** Return the charset parameter for the given media type. */
  charset: { value: charsetOf },
  /** Return the quality parameter for the given media type. */
  quality: { value: qualityOf },
  /** Return the precedence for the given media type. */
  precedence: { value: precedenceOf },

  /** Compare the given two media types for ordering by precedence. */
  compare: { value: compare },
  /** Compare the given media type and range for compatibility. */
  matches: { value: matches },
  /** Compute the quality of the given media type for the accept ranges. */
  matchingQuality: { value: matchingQuality },

  /** Render the given media type as a string. */
  render: { value: render },

  /**
   * Convert value to media type. The value must be a valid media type string, a
   * media type instance, or a POJO with a media type's `type` and `subtype`
   * properties.
   */
  of: {
    value: toMediaType,
  },

  /** Parse the string as a comma-separated sequence of media types. */
  accept: {
    value(s) {
      if (!s) return [MediaType.Any];
      s = s.trim();
      if (s === '*/*') return [MediaType.Any];
      const { mediaRanges } = parseMediaRanges(s);
      if (mediaRanges.length === 0) return [MediaType.Any];

      mediaRanges.sort(compare);
      return mediaRanges;
    },
  },

  /** The canonical plain text media type. */
  PlainText: { value: new MediaType('text', 'plain', CHARSET_UTF8) },
  /** The canonical markdown media type. */
  Markdown: { value: new MediaType('text', 'markdown', CHARSET_UTF8) },
  /** The canonical HTML media type. */
  HTML: { value: new MediaType('text', 'html', CHARSET_UTF8) },
  /** The canonical JSON media type, with explicit charset for security. */
  JSON: { value: new MediaType('application', 'json', CHARSET_UTF8) },
  /** The canonical binary media type.a */
  Binary: { value: new MediaType('application', 'octet-stream') },
});

// -----------------------------------------------------------------------------
// Instance Methods (as alternative API implemented with same static functions).

const MediaTypePrototype = MediaType.prototype;
defineProperties(MediaTypePrototype, {
  /** Create a copy of this media type without any parameters. */
  without: {
    value() {
      return withoutParameters(this);
    },
  },

  /** Create a copy of this media type with the given parameters. */
  with: {
    value(parameters) {
      return withParameters(this, parameters);
    },
  },

  /** Get the `charset` parameter for this media type. */
  charset: {
    get() {
      return charsetOf(this);
    },
  },

  /** Get the quality parameter for this media type. */
  quality: {
    get() {
      return qualityOf(this);
    },
  },

  /** Get the precedence for this media type. */
  precedence: {
    get() {
      return precedenceOf(this);
    },
  },

  /** Compare with another type to determine precedence order. */
  compareTo: {
    value(other) {
      return compare(this, other);
    },
  },

  /** Determine whether this media type is acceptable to the given range. */
  matches: {
    value(range) {
      return matches(this, range);
    },
  },

  /** Determine the matching quality for this media type. */
  matchingQuality: {
    value(ranges) {
      return matchingQuality(this, ranges);
    },
  },

  /** Render this media type to a string. */
  toString: {
    value() {
      return render(this);
    },
  },
});
