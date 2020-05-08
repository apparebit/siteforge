/* © 2020 Robert Grimm */

const { create } = Object;

// =============================================================================

/**
 * Escape the given string for use in a regular expression. The implementation
 * uses popular copy pasta from
 * [MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions).
 * and [Stack
 * Overflow](https://stackoverflow.com/questions/3561493/is-there-a-regexp-escape-function-in-javascript).
 */
export function escapeRegex(literal) {
  return literal.replace(/[.*+\-?^${}()|[\]\\]/gu, '\\$&');
}

// -----------------------------------------------------------------------------

// Overrides to be applied before NFKD normalization written as equivalence
// classes with source characters following their replacement.
const OVERRIDES = [
  ['Aa', 'Å'],
  ['aa', 'å'],
  ['Ae', 'Ä', 'Æ', 'Ǽ', 'Ǣ'],
  ['ae', 'ä', 'æ', 'ǽ', 'ǣ'],
  ['(C)', '©'],
  ['D', 'Ð'],
  ['d', 'ð'],
  ['H', 'Ħ'],
  ['h', 'ħ'],
  ['Hv', 'Ƕ'],
  ['hv', 'ƕ'],
  ['L', 'Ł'],
  ['l', 'ł'],
  ['Oe', 'Ø', 'Ö', 'Œ'],
  ['oe', 'ø', 'ö', 'œ'],
  ['pH', '㏗'],
  ['(R)', '®'],
  ['SS', 'ẞ'], // Two capitalized 'S' characters indeed!
  ['ss', 'ß'],
  ['Ue', 'Ü'],
  ['ue', 'ü'],
  ['w', 'Ƿ'],
  ['+/-', '±'],
  ['<<', '«'],
  ['>>', '»'],
  ['*', '×'],
  ['/', '÷'],
];

// Corrections to be applied after NFKD normalization.
const CORRECTIONS = [
  [`'`, '\u02BC', '\u02BE'],
  ['/', '\u2215'],
  ['-', '\u2010', '\u2013', '\u2014'],
];

// Convert equivalence classes into a predicate matching original characters.
const toPredicate = equivalences => {
  const chars = equivalences.flatMap(alt => alt.slice(1)).join('');
  return new RegExp(`[${chars}]`, `gu`);
};

// Convert equivalence classes into object mapping originals to replacements.
const toTable = equivalences => {
  const table = create(null);
  for (const [value, ...keys] of equivalences) {
    for (const key of keys) {
      table[key] = value;
    }
  }
  return table;
};

const IS_OVERRIDE = toPredicate(OVERRIDES);
const GET_OVERRIDE = toTable(OVERRIDES);
const IS_CORRECTION = toPredicate(CORRECTIONS);
const GET_CORRECTION = toTable(CORRECTIONS);
const IS_DIACRITIC = /[\u0300-\u036f]/gu;
const IS_DASHING_SPACING = /[\s-]+/gu;
const IS_NOT_SLUG_SAFE = /[^-a-z0-9_]/gu;

/** Convert the given extended Latin text to its ASCII equivalent. */
export function asciify(text) {
  return text
    .replace(IS_OVERRIDE, c => GET_OVERRIDE[c])
    .normalize('NFKD')
    .replace(IS_DIACRITIC, '')
    .replace(IS_CORRECTION, c => GET_CORRECTION[c]);
}

/** Convert the given extended Latin text to a slug. */
export function slugify(text) {
  return asciify(text)
    .toLowerCase()
    .replace(IS_DASHING_SPACING, '-')
    .replace(IS_NOT_SLUG_SAFE, '');
}

const KEY_EXPR =
  `\\.(\\*)` + // .*
  `|` +
  `\\.((?:[^.[*]|\\\\\\.|\\\\\\[)+)` + // .<key>
  `|` +
  `\\[(\\*)\\]` + // [*]
  `|` +
  `\\[(\\d+)\\]` + // [<numeric-key>]
  `|` +
  `\\[(['"])((?:[^'"]|\\\\'|\\\\")+)\\5\\]`; // ['<key>'] or ["<key>"]

const DOLLAR = '$'.charCodeAt(0);
const KEY = new RegExp(KEY_EXPR, 'gu');
const KEY_PATH = new RegExp(`^\\$(?:${KEY_EXPR})*$`, 'u');
export const WILDCARD = Symbol.for('@grr/oddjob/wildcard');

/** Convert the key path to its constituent keys. */
export function toKeyPathKeys(path) {
  // Ensure that key path is well formed.
  if (path.charCodeAt(0) !== DOLLAR) {
    throw new Error(`key path "${path}" does not start with "$"`);
  } else if (!KEY_PATH.test(path)) {
    throw new Error(`key path "${path}" contains invalid expressions`);
  }

  const result = [];
  for (const match of path.slice(1).matchAll(KEY)) {
    if (match[1] !== undefined) {
      result.push(WILDCARD);
    } else if (match[2] !== undefined) {
      result.push(match[2]);
    } else if (match[3] !== undefined) {
      result.push(WILDCARD);
    } else if (match[4] !== undefined) {
      result.push(Number(match[4]));
    } else if (match[5] !== undefined) {
      result.push(match[6]);
    }
  }

  // Et voila.
  return result;
}
