/* © 2020 Robert Grimm */

import { strict as assert } from 'assert';

const { assign, create, freeze, keys: keysOf } = Object;
const { has } = Reflect;

const STYLISH_CI = ['TRAVIS', 'CIRCLECI', 'APPVEYOR', 'GITLAB_CI'];

// -----------------------------------------------------------------------------

/** Constants representing the different color modes. */
export const COLOR = freeze({
  /** Monochrome output. */
  NONE: Symbol.for(`grr/oddjob/candy/colors/2`),
  /** Output in 8 base colors each in dark and light variations. */
  BASIC: Symbol.for(`grr/oddjob/candy/colors/16`),
  /** Output in 256 indexed colors. */
  INDEXED: Symbol.for(`grr/oddjob/candy/colors/256`),
  /** Output in all 16,777,216 colors. */
  FULL: Symbol.for(`grr/oddjob/candy/colors/16_777_216`),
});

/**
 * Determine the number of colors supported by the given stream in the given
 * environment. You probably want to use this module's default export instead.
 * See below.
 */
export const countColors = ({
  env = process.env,
  stream = process.stderr,
} = {}) => {
  const term = env.TERM;

  if (
    has(env, 'NODE_DISABLE_COLORS') ||
    has(env, 'NO_COLOR') ||
    !stream.isTTY ||
    term === 'dumb'
  ) {
    return COLOR.NONE;
  }

  if (has(env, 'CI')) {
    return STYLISH_CI.some(key => has(env, key)) ? COLOR.BASIC : COLOR.NONE;
  }

  const program = env.TERM_PROGRAM;
  if (
    program === 'iTerm.app' ||
    program === 'Apple_Terminal' ||
    /^xterm-256/u.test(term)
  ) {
    return COLOR.INDEXED;
  }

  if (program === 'MacTerm') {
    return COLOR.FULL;
  }

  if (/^screen|^xterm|^vt100|color|ansi|cygwin|linux/u.test(term)) {
    return COLOR.BASIC;
  }

  return COLOR.NONE;
};

// -----------------------------------------------------------------------------

const [SGR16, SGR256] = (function () {
  // Initialize both bindings simultaneously: We both freeze sgr16 and use it as
  // prototype for sgr256. But if we freeze sgr16 before completing sgr256, then
  // we can't complete sgr256.
  const sgr16 = assign(create(null), {
    bold: freeze(['1', '22']),
    faint: freeze(['90', '39']),
    green: freeze(['32;1', '39;22']),
    greenBg: freeze(['102;1', '49;22']),
    magenta: freeze(['35;1', '39;22']),
    orange: freeze(['33;1', '39;22']),
    red: freeze(['31;1', '39:22']),
    redBg: freeze(['97;41;1', '39;49;22']),
    plain: null,
  });

  const sgr256 = assign(create(sgr16), {
    greenBg: freeze(['48;5;119;1', '49;22']),
    orange: freeze(['38;5;208;1', '39;22']),
  });

  return [freeze(sgr16), freeze(sgr256)];
})();

const identity = freeze(s => s);
const createFormatFunction = (on, off) => {
  return freeze(
    // eslint-disable-next-line no-new-func
    new Function('s', `return '\x1b[${on}m' + s + '\x1b[${off}m';`)
  );
};

const candyColorStash = {};
/**
 * Create a set of candy-colored formatting functions for the given color mode.
 * You probably want to use this module's default export instead. See below.
 */
export const candyColorStyles = colors => {
  if (!candyColorStash[colors]) {
    let formatForKey;
    switch (colors) {
      case COLOR.NONE:
        formatForKey = () => identity;
        break;
      case COLOR.BASIC:
        formatForKey = key =>
          key === 'plain' ? identity : createFormatFunction(...SGR16[key]);
        break;
      case COLOR.INDEXED:
      case COLOR.FULL:
        formatForKey = key =>
          key === 'plain' ? identity : createFormatFunction(...SGR256[key]);
        break;
      default:
        assert.fail(`invalid color token "${String(colors)}"`);
    }

    const styles = { colors };
    for (const key of keysOf(SGR16)) {
      styles[key] = formatForKey(key);
    }
    candyColorStash[colors] = freeze(styles);
  }

  return candyColorStash[colors];
};

/**
 * Create a set of candy-colored formatting functions for the given stream and
 * environment.
 */
export default ({ env = process.env, stream = process.stderr } = {}) => {
  return candyColorStyles(countColors({ env, stream }));
};
