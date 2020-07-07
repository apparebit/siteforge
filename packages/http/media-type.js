/* © 2020 Robert Grimm */
/* eslint-disable no-control-regex */

import { strict as assert } from 'assert';

const { create, keys: keysOf } = Object;

// This module implements helper functions for dealing with media types. As far
// as syntax is concerned, it uses two strategies. If relevant standards only
// specify declarative grammar rules, then this modules implements those rules
// with minimal tolerance for error. If relevant standards specify an algorithm,
// then this module implements that algorithm, even if it is far more permissive
// than the grammar. Notably, that is the case for parsing media types. Either
// way, all relevant standards are referenced and quoted.

// Helpers for quotedString() and parse()
const CHAR_BACKSLASH = `\\`.charCodeAt(0);
const CHAR_COMMA = `,`.charCodeAt(0);
const CHAR_DQUOTE = `"`.charCodeAt(0);

const RX_DQUOTE_SLASH = /["\\]/gu;

const RX_IN_PARAM_SEP = /[=;]/gu;
const RX_IN_PARAM_SEP_EXT = /[=;,]/gu;

const RX_END_OF_CLAUSE = /[;]/gu;
const RX_END_OF_CLAUSE_EXT = /[;,]/gu;

// https://tools.ietf.org/html/rfc7231#section-5.3.1
const QUALITY = /0(\.\d{0,3})?|1(\.0{0,3})?/u;

// https://mimesniff.spec.whatwg.org/#http-quoted-string-token-code-point
const QUOTED_STRING = /^[\u0009\u0020-\u007e\u0080-\u00ff]+$/u;

// https://mimesniff.spec.whatwg.org/#http-token-code-point
const TOKEN = /^[-!#$%&'*+.^`|~\w]+$/u;

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
// https://fetch.spec.whatwg.org/#collect-an-http-quoted-string

// NB. Always extracts value.

// To collect an HTTP quoted string from a string input,
// given a position variable position and optionally an extract-value flag,
// run these steps:
export const parseQuotedString = (s, position = 0) => {
  const { length } = s;

  //  1. Let positionStart be position.
  //  2. Let value be the empty string.
  let value = '';

  //  3. Assert: the code point at position within input is U+0022 (").
  assert(s.charCodeAt(position) === CHAR_DQUOTE);

  //  4. Advance position by 1.
  position++;

  //  5. While true:
  while (true) {
    //  5. 1. Append the result of collecting a sequence of code points
    //        that are not U+0022 (") or U+005C (\) from input,
    //        given position, to value.
    const start = position;
    RX_DQUOTE_SLASH.lastIndex = start;
    const match = RX_DQUOTE_SLASH.exec(s);
    const end = match ? match.index : length;

    if (start < end) value += s.slice(start, end);
    position = end;

    //  5. 2. If position is past the end of input, then break.
    if (position === length) break;

    //  5. 3. Let quoteOrBackslash be the code point at position within input.
    const quoteOrBackslash = s.charCodeAt(end);

    //  5. 4. Advance position by 1.
    position++;

    //  5. 5. If quoteOrBackslash is U+005C (\), then:
    if (quoteOrBackslash === CHAR_BACKSLASH) {
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
      assert(quoteOrBackslash === CHAR_DQUOTE);

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
// https://mimesniff.spec.whatwg.org/#parsing-a-mime-type

// NB. Optionally supports:
//      * Accept header weight
//      * Trailing comma before end of

// To parse a MIME type, given a string input, run these steps:
export const parseMediaType = (
  s,
  { position = 0, withComma = false, withWeight = false } = {}
) => {
  const InParamSep = withComma ? RX_IN_PARAM_SEP_EXT : RX_IN_PARAM_SEP;
  const EndOfClause = withComma ? RX_END_OF_CLAUSE_EXT : RX_END_OF_CLAUSE;

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
  if (!TOKEN.exec(type)) isDelayedError = true;

  //  6. Advance position by 1. (This skips past U+002F (/).)
  //  7. Let subtype be the result of collecting a sequence of code points
  //     that are not U+003B (;) from input, given position.
  start = end + 1;
  EndOfClause.lastIndex = start;
  const match = EndOfClause.exec(s);
  end = match ? match.index : length;
  position = end;
  if (isDelayedError) return { next: position };

  //  8. Remove any trailing HTTP whitespace from subtype.
  end = skipTrailing(s, end); // May step backwards.

  //  9. If subtype is the empty string or does not solely contain
  //     HTTP token code points, then return failure.
  if (start === end) return { next: position };
  const subtype = s.slice(start, end);
  if (!TOKEN.exec(subtype)) return { next: position };

  // 10. Let mimeType be a new MIME type record whose type is type,
  //     in ASCII lowercase, and subtype is subtype, in ASCII lowercase.
  const mediaType = {
    type: type.toLowerCase(),
    subtype: subtype.toLowerCase(),
  };

  if (withComma && match?.[0] === ',') {
    return { mediaType, next: position };
  }

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
    position = end = match ? match.index : length;

    // NB. Steps 5 and 6 exclude each other, they can be safely reordered.
    //     Step 4 uses variables changed by 5.2 and thus must come before
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

    //  7. Let parameterValue be null.
    let loopEndBreak = false;
    let value;

    //  8. If the code point at position within input is U+0022 ("), then:
    if (s.charCodeAt(start) === CHAR_DQUOTE) {
      //  8. 1. Set parameterValue to the result of collecting an HTTP quoted
      //        string from input, given position and the extract-value flag.
      ({ value, next: end } = parseQuotedString(s, start));
      //  8. 2. Collect a sequence of code points that are not U+003B (;)
      //        from input, given position.

      EndOfClause.lastIndex = end;
      const match = EndOfClause.exec(s);
      position = match ? match.index : length;

      if (withComma && match?.[0] === ',') {
        loopEndBreak = true;
      }
    } else {
      //  9. Otherwise:
      //  9. 1. Set parameterValue to the result of collecting a sequence of
      //        code points that are not U+003B (;) from input, given position.
      EndOfClause.lastIndex = end;
      const match = EndOfClause.exec(s);
      position = end = match ? match.index : length;

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
        if (!QUALITY.exec(value)) continue;
        mediaType.weight = Number(value);
        break;
      }
    }

    // 10. If all of the following are true
    //      * parameterName is not the empty string
    //      * parameterName solely contains HTTP token code points
    //      * parameterValue solely contains HTTP quoted-string
    //        token code points
    //      * mimeType’s parameters[parameterName] does not exist
    //     then set mimeType’s parameters[parameterName] to parameterValue.
    if (
      name !== '' &&
      TOKEN.exec(name) &&
      QUOTED_STRING.exec(value) &&
      parameters?.[name] === undefined
    ) {
      if (!parameters) parameters = create(null);
      parameters[name] = value;
    }

    if (loopEndBreak) break;
  }

  if (parameters) mediaType.parameters = parameters;

  // 12. Return mimeType.
  return { mediaType, next: position };
};

// =============================================================================

/**
 * Parse the range of media types acceptable to an HTTP endpoint. It is a
 * comma-separated list of media types, which may have wildcards for type and
 * subtype fields and also a relative weight between 0 and 1 with three digits
 * of precision. This function only parses the range but leaves the parsed media
 * types ordered as found. See `parseAcceptHeader()`.
 */
export const parseMediaRange = (s, position = 0) => {
  const { length } = s;
  const mediaRange = [];

  while (true) {
    const { mediaType, next } =
      parseMediaType(s, {
        position,
        withComma: true,
        withWeight: true,
      }) ?? {};

    if (mediaType != null) {
      mediaRange.push(mediaType);
    }

    if (position < next && next < length && s.charCodeAt(next) === CHAR_COMMA) {
      position = next + 1;
    } else {
      position = next;
      break;
    }
  }

  return { mediaRange, next: position };
};

// =============================================================================

export const compareMediaTypes = (type1, type2) => {
  // -----------------------
  //  -1 implies a before b
  //  +1 implies b before a
  // -----------------------

  const w1 = type1.weight ?? 1;
  const w2 = type2.weight ?? 1;

  if (w1 !== w2) {
    return w2 - w1;
  }

  const compareTypes = key => {
    const t1 = type1[key];
    const t2 = type2[key];

    if (t1 === '*') return 1;
    if (t2 === '*') return -1;
    return t1 < t2 ? -1 : 1;
  };

  if (type1.type !== type2.type) {
    return compareTypes('type');
  }

  if (type1.subtype !== type2.subtype) {
    return compareTypes('subtype');
  }

  const spec1 = type1.parameters ? keysOf(type1.parameters) : [];
  const spec2 = type2.parameters ? keysOf(type2.parameters) : [];
  if (spec1.length !== spec2.length) {
    return spec2.length - spec1.length;
  }

  const label1 = spec1.sort().join('\u200b');
  const label2 = spec2.sort().join('\u200b');
  if (label1 !== label2) {
    return label1 < label2 ? -1 : 1;
  }

  const p1 = type1.position ?? 0;
  const p2 = type2.position ?? 0;
  if (p1 !== p2) {
    return p1 - p2;
  }

  return 0;
};

// =============================================================================

/**
 * Parse the value of an accept header. This function annotates the result of
 * `parseMediaRange()` with each entry's position and then orders the media
 * types according to specificity, favoring larger weights first, then explicit
 * types and subtypes over wildcards, more over fewer parameters, and finally
 * earlier over later positions.
 */
export const parseAcceptHeader = value => {
  const { mediaRange } = parseMediaRange(value);
  mediaRange.forEach((entry, index) => (entry.position = index));
  mediaRange.sort(compareMediaTypes);
  return mediaRange;
};

// =============================================================================

export const matchMediaTypes = (type1, type2) =>
  ((type1.type !== '*' && type2.type !== '*' && type1.type === type2.type) ||
    type1.type === '*' ||
    type2.type === '*') &&
  ((type1.subtype !== '*' &&
    type2.subtype !== '*' &&
    type1.subtype === type2.subtype) ||
    type1.subtype === '*' ||
    type2.subtype === '*');
