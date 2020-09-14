/* © 2020 Robert Grimm */

const { assign, create, freeze, keys: keysOf } = Object;
const identity = s => s;

// Freeze color depth constants but not the four style lookup tables.
export const COLOR_DEPTH = freeze({
  /** Monochrome output (at 1 bit per pixel). */
  MONO: 1,
  /** Eight base colors in dark and light varieties (at 4 bits per pixel). */
  BASIC: 4,
  /** 256 indexed colors (at 8 bits per pixel). */
  INDEXED: 8,
  /** The full spectrum of 16,777,216 colors (at 24 bits per pixel). */
  FULL: 24,
});

const [PLAIN, SGR4, SGR8, SGR24] = (() => {
  // Provide skeleton style definitions for the four color depths.
  const PLAIN = assign(create(null), {
    colorDepth: COLOR_DEPTH.MONO,
  });

  const SGR4 = assign(create(null), {
    colorDepth: COLOR_DEPTH.BASIC,

    bold: ['1', '22'],
    italic: ['3', '23'],
    underline: ['4', '24'],

    faint: ['90', '39'],
    fainter: ['37', '39'],

    boldGreen: ['32;1', '39;22'],
    green: ['32', '39'],
    overGreen: ['102;1', '49;22'],

    magenta: ['35;1', '39;22'],

    boldOrange: ['33;1', '39;22'],

    boldRed: ['31;1', '39;22'],
    red: ['31', '39'],
    overRed: ['97;41;1', '39;49;22'],

    plain: identity,
  });

  const SGR8 = assign(create(null), {
    colorDepth: COLOR_DEPTH.INDEXED,

    overGreen: ['48;5;119;1', '49;22'],
    boldOrange: ['38;5;208;1', '39;22'],
    overRed: ['38;5;15;41;1', '39;49;22'],
  });

  const SGR24 = assign(create(null), {
    colorDepth: COLOR_DEPTH.FULL,
  });

  // Automatically flesh out style definitions to make them usable.
  for (const key of keysOf(SGR8)) {
    if (key === 'colorDepth') continue;

    const [on, off] = SGR8[key];
    const format = s => `\x1b[${on}m${s}\x1b[${off}m`;

    SGR8[key] = format;
    if (SGR24[key] === undefined) SGR24[key] = format;
  }

  for (const key of keysOf(SGR4)) {
    if (key === 'colorDepth') continue;
    PLAIN[key] = identity;
    if (key === 'plain') continue;

    const [on, off] = SGR4[key];
    const format = s => `\x1b[${on}m${s}\x1b[${off}m`;

    SGR4[key] = format;
    if (SGR8[key] === undefined) SGR8[key] = format;
    if (SGR24[key] === undefined) SGR24[key] = format;
  }

  return [PLAIN, SGR4, SGR8, SGR24];
})();

export function countColors({ env = process.env, stream = process.stderr }) {
  return stream?.getColorDepth?.(env) ?? COLOR_DEPTH.MONO;
}

/**
 * Create a set of candy-colored formatting functions for the given stream and
 * environment.
 */
export default function candy({
  env = process.env,
  stream = process.stderr,
} = {}) {
  const colorDepth = countColors({ env, stream });
  if (colorDepth === COLOR_DEPTH.MONO) return PLAIN;
  if (colorDepth === COLOR_DEPTH.BASIC) return SGR4;
  if (colorDepth === COLOR_DEPTH.INDEXED) return SGR8;
  return SGR24;
}
