/**
 * @module tooling/text
 * @copyright (C) 2019 Robert Grimm
 */

import { options } from '../config.js';

// Popular copy pasta refined with local seasoning
// (https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions)
export function escapeRegex(literal) {
  return literal.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

/** If defined, prepend the rights notice to the given CSS or JavaScript. */
export function withRightsNotice(code, notice = options.rightsNotice) {
  return notice ? `/* ${notice} */ ${code}` : code;
}
