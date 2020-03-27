/* © 2019-2020 Robert Grimm */

const { create } = Object;

const OVERRIDES = [
  ['Aa', 'Å'],
  ['aa', 'å'],
  ['Ae', 'Ä', 'Æ', 'Ǽ', 'Ǣ'],
  ['ae', 'ä', 'æ', 'ǽ', 'ǣ'],
  ['D', 'Ð'],
  ['d', 'ð'],
  ['H', 'Ħ'],
  ['h', 'ħ'],
  ['L', 'Ł'],
  ['l', 'ł'],
  ['Oe', 'Ø', 'Ö', 'Œ'],
  ['oe', 'ø', 'ö', 'œ'],
  ['pH', '㏗'],
  ['SS', 'ẞ'], // Two capitalized 'S' characters indeed!
  ['ss', 'ß'],
  ['Ue', 'Ü'],
  ['ue', 'ü'],
];

const CORRECTIONS = [
  [`'`, '\u02BC', '\u02BE'],
  ['/', '\u2215'],
  ['-', '\u2010', '\u2013', '\u2014'],
];

const toPredicate = equivalences => {
  const chars = equivalences.flatMap(alt => alt.slice(1)).join('');
  return new RegExp(`[${chars}]`, `gu`);
};

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

export function asciify(text) {
  return text
    .replace(IS_OVERRIDE, c => GET_OVERRIDE[c])
    .normalize('NFKD')
    .replace(IS_DIACRITIC, '')
    .replace(IS_CORRECTION, c => GET_CORRECTION[c]);
}

export function slugify(text) {
  return asciify(text)
    .toLowerCase()
    .replace(IS_DASHING_SPACING, '-')
    .replace(IS_NOT_SLUG_SAFE, '');
}
