/* © 2019 Robert Grimm */

// Popular copy pasta refined with local seasoning
// (https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions)
export function escapeRegex(literal) {
  return literal.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

const NOTICE = new RegExp(
  `^` + // Start at the beginning.
  `(?:#![^\\r?\\n]*\\r?\\n)?` + // Ignore the hashbang if present.
  `\\s*` + // Also ignore any space if present.
  `(?:\\/\\/|\\/\\*)` + // Match opening of single- or multi-line comment,...
  `\\s*` + // followed by some space...
  `((?:\\(c\\)|©|copyright).*?)` + // followed by © symbol/word and text...
  `(?:\\*\\/|\\r?\\n|$)`, // ...up to first closing comment, newline, or EOF.
  'iu'
);

/**
 * Extract any copyright notice from the given source code. This function
 * extracts any copyright notice that is contained in a single- or multi-line
 * JavaScript comment at the top of the source code.
 */
export function extractRightsNotice(code) {
  const [ , notice] = NOTICE.exec(code) || [];
  return notice ? notice.trim() : notice;
}

/** If defined, prepend the rights notice to the given CSS or JavaScript. */
export function withRightsNotice(code, notice) {
  return notice ? `/* ${notice} */ ${code}` : code;
}
