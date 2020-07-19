/* © 2020 Robert Grimm */
/* eslint-disable no-control-regex */

import { strict as assert } from 'assert';

const { create } = Object;
const { isArray } = Array;

// This module implements helper functions for dealing with media types. As far
// as syntax is concerned, it uses two strategies. If relevant standards only
// specify declarative grammar rules, then this modules implements those rules
// with minimal tolerance for error. If relevant standards specify an algorithm,
// then this module implements that algorithm, even if it is far more permissive
// than the grammar. Notably, that is the case for parsing media types. Either
// way, all relevant standards are referenced and quoted.

// -----------------------------------------------------------------------------

// https://tools.ietf.org/html/rfc7231#section-3.1.1.2:
// To specify UTF-8 charset, value of parameter must be `UTF-8` ignoring case;
// upper case is canonical. Since Node.js accepts dashless version, do so too.
const UTF_8 = /^utf-?8$/iu;

// Helpers for quotedString() and parse()
const CHARCODE_BACKSLASH = `\\`.charCodeAt(0);
const CHARCODE_COMMA = `,`.charCodeAt(0);
const CHARCODE_DQUOTE = `"`.charCodeAt(0);

const DQUOTE_SLASH = /["\\]/gu;

const PARAM_SEP = /[=;]/gu;
const PARAM_SEP_EXT = /[=;,]/gu;

const END_OF_CLAUSE = /[;]/gu;
const END_OF_CLAUSE_EXT = /[;,]/gu;

// https://tools.ietf.org/html/rfc7231#section-5.3.1
const QUALITY = /0(\.\d{0,3})?|1(\.0{0,3})?/u;

// https://mimesniff.spec.whatwg.org/#http-quoted-string-token-code-point
const QUOTED_STRING = /^[\u0009\u0020-\u007e\u0080-\u00ff]+$/u;

// https://mimesniff.spec.whatwg.org/#http-token-code-point
const TOKEN = /^[-!#$%&'*+.^`|~\w]+$/u;

// -----------------------------------------------------------------------------

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

// =============================================================================

/**
 * Parse a quoted string. The parse starts at the given position, faithfully
 * implements the WhatWG's algorithm from the `fetch` specification, but always
 * extracts the value.
 */
export const parseQuotedString = (s, position = 0) => {
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

// =============================================================================

/**
 * Parse a media type or range. The parse starts at the given position and
 * optionally recognizes a weight parameter and a terminating comma. The
 * function faithfully implements the WhatWG's algorithm from the MIME sniffing
 * specification. The resulting object is guaranteed to have `type` and
 * `subtype` properties. But it only has a `weight` or `parameters` properties
 * if the input contains the corresponding elements.
 */
export const parseMediaType = (
  s,
  { position = 0, withComma = false, withWeight = false } = {}
) => {
  // https://mimesniff.spec.whatwg.org/#parsing-a-mime-type

  // To parse a MIME type, given a string input, run these steps:
  const InParamSep = withComma ? PARAM_SEP_EXT : PARAM_SEP;
  const EndOfClause = withComma ? END_OF_CLAUSE_EXT : END_OF_CLAUSE;

  //  1. Remove any leading and trailing HTTP whitespace from input.
  let { length } = s;
  let start = skipLeading(s, position, length);

  //  2. Let position be a position variable for input,
  //     initially pointing at the start of input.
  //  3. Let type be the result of collecting a sequence of code points
  //     that are not U+002F (/) from input, given position.
  let end = s.indexOf('/', start);

  //  4. If type is the empty string or does not solely contain
  //     HTTP token code points, then return failure.
  //  5. If position is past the end of input, then return failure.
  // NB. Delay some error returns to finish parsing type/subtype pair.
  if (end === -1) return { next: start };
  let isDelayedError = start === end;
  const type = s.slice(start, end);
  if (!TOKEN.test(type)) isDelayedError = true;

  //  6. Advance position by 1. (This skips past U+002F (/).)
  //  7. Let subtype be the result of collecting a sequence of code points
  //     that are not U+003B (;) from input, given position.
  start = end + 1;
  EndOfClause.lastIndex = start;
  const match = EndOfClause.exec(s);
  end = match?.index ?? length;
  position = end;
  if (isDelayedError) return { next: position };

  //  8. Remove any trailing HTTP whitespace from subtype.
  end = skipTrailing(s, end); // May step backwards.

  //  9. If subtype is the empty string or does not solely contain
  //     HTTP token code points, then return failure.
  if (start === end) return { next: position };
  const subtype = s.slice(start, end);
  if (!TOKEN.test(subtype)) return { next: position };

  // 10. Let mimeType be a new MIME type record whose type is type,
  //     in ASCII lowercase, and subtype is subtype, in ASCII lowercase.
  const mediaType = {
    type: type.toLowerCase(),
    subtype: subtype.toLowerCase(),
  };

  // NB. Comma indicates a new media type.
  if (withComma && match?.[0] === ',') {
    return { mediaType, next: position };
  }

  // NB. If type is text, we normalize the charset parameter below.
  const isText = mediaType.type === 'text';

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
    if (withComma && match?.[0] === ',') break;

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

      if (withComma && match?.[0] === ',') {
        loopEndBreak = true;
      }
    } else {
      //  9. Otherwise:
      //  9. 1. Set parameterValue to the result of collecting a sequence of
      //        code points that are not U+003B (;) from input, given position.
      EndOfClause.lastIndex = end;
      const match = EndOfClause.exec(s);
      position = end = match?.index ?? length;

      if (withComma && match?.[0] === ',') {
        loopEndBreak = true;
      }

      //  9. 2. Remove any trailing HTTP whitespace from parameterValue.
      end = skipTrailing(s, end); // May step backwards.

      //  9. 3. If parameterValue is the empty string, then continue.
      if (start === end) continue;
      value = s.slice(start, end);

      // NB. If enabled, weight's value must be valid quality.
      //     weight follows after properties.
      if (withWeight && name === 'q') {
        if (!QUALITY.test(value)) continue;
        mediaType.weight = Number(value);
        break;
      }
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
      if (!parameters) parameters = create(null);
      if (isText && name === 'charset') {
        parameters.charset = UTF_8.test(value) ? 'UTF-8' : value.toUpperCase();
      } else {
        parameters[name] = value;
      }
    }

    if (loopEndBreak) break;
  }

  if (parameters) mediaType.parameters = parameters;

  // 12. Return mimeType.
  return { mediaType, next: position };
};

// =============================================================================

/**
 * Parse the comma-separated list of media types and ranges. The parse starts
 * at the given position and returns the individual media types and ranges
 * in source order.
 */
export const parseMediaRanges = (s, position = 0) => {
  const { length } = s;
  const mediaRanges = [];

  while (true) {
    const { mediaType, next } =
      parseMediaType(s, {
        position,
        withComma: true,
        withWeight: true,
      }) ?? {};

    if (mediaType != null) {
      mediaRanges.push(mediaType);
    }

    if (
      position < next &&
      next < length &&
      s.charCodeAt(next) === CHARCODE_COMMA
    ) {
      position = next + 1;
    } else {
      position = next;
      break;
    }
  }

  return { mediaRanges, next: position };
};

// =============================================================================

const precedenceOf = mediaType => {
  if (mediaType.subtype === '*') {
    if (mediaType.type === '*') {
      return 1;
    } else {
      return 2;
    }
  } else if (mediaType.parameters == null) {
    return 3;
  } else {
    return 4;
  }
};

/**
 * Compare the given media types. Consistent with RFC 7231, this function
 * prioritizes specific media types with parameters over specific media types
 * followed by subtype ranges and then the arbitrary range. It uses the weight
 * as a tie breaker.
 */
export const compareMediaTypes = (type1, type2) => {
  // https://tools.ietf.org/html/rfc7231#section-5.3.2

  // Media ranges can be overridden by more specific media ranges or
  // specific media types.  If more than one media range applies to a
  // given type, the most specific reference has precedence.
  // [...]
  // The media type quality factor associated with a given type is
  // determined by finding the media range with the highest precedence
  // that matches the type.
  const p1 = precedenceOf(type1);
  const p2 = precedenceOf(type2);
  if (p1 !== p2) return p2 - p1;

  const w1 = type1.weight ?? 1;
  const w2 = type2.weight ?? 1;
  return w2 - w1;
};

// -----------------------------------------------------------------------------

/**
 * Parse the accept header's value. This function parses the media types making
 * up the header with `parseMediaRange()` and then sorts them with
 * `compareMediaTypes()`.
 */
export const parseAcceptHeader = value => {
  const { mediaRanges } = parseMediaRanges(value);
  mediaRanges.sort(compareMediaTypes);
  return mediaRanges;
};

// =============================================================================

/**
 * Match the given media type against the media range, which may be a specific
 * media type or a range using wildcards. If the range is a text type with an
 * explicit charset parameter, the type matches only if it omits the charset or
 * has the same parameter (ignoring case).
 */
export const matchMediaType = (type, range) => {
  // The "any" range.
  if (range.type === '*' && range.subtype === '*') return true;

  // Matching type and "any subtype" range.
  if (type.type !== range.type) return false;
  if (range.subtype === '*') return true;

  // Matching type and subtype modulo text.
  if (type.subtype !== range.subtype) return false;
  if (range.type !== 'text') return true;

  // No charset in range or no charset in type.
  const rangeCharset = range.parameters?.charset;
  if (rangeCharset == null) return true;
  const typeCharset = type.parameters?.charset;
  if (typeCharset == null) return true;

  // Matching charsets.
  return typeCharset === rangeCharset;
};

/**
 * Determine the quality factor of the given media type for the given accept
 * header. If the accept header is empty or missing, this function returns a
 * quality factor of 1.
 */
export const qualityFactorOf = (type, accept) => {
  if (!isArray(accept) || accept.length === 0) return 1;

  for (const range of accept) {
    if (matchMediaType(type, range)) {
      return range.weight ?? 1;
    }
  }
  return 0;
};
