/* © 2019–2020 Robert Grimm */

import { strict as assert } from 'assert';
import { types } from 'util';

const { freeze, getOwnPropertyNames } = Object;
const { has } = Reflect;
const { isArray } = Array;
const { isNativeError } = types;
const { round } = Math;

export const STYLES = freeze({
  bold: s => `\x1b[1m${s}\x1b[22m`,
  faint: s => `\x1b[90m${s}\x1b[39m`,
  green: s => `\x1b[1;32m${s}\x1b[39;22m`,
  magenta: s => `\x1b[1;35m${s}\x1b[39;22m`,
  orange: s => `\x1b[1;38;5;208m${s}\x1b[39;22m`,
  plain: s => s,
  red: s => `\x1b[1;31m${s}\x1b[39;22m`,
});

export const LEVELS = freeze({
  error: { display: 'ERROR  ', volume: -2, format: STYLES.red },
  warning: { display: 'WARNING', volume: -1, format: STYLES.orange },
  success: { display: 'SUCCESS', volume: 0, format: STYLES.green },
  notice: { display: 'NOTICE ', volume: 0, format: STYLES.bold },
  info: { display: 'INFO   ', volume: 1, format: STYLES.plain },
  debug: { display: 'DEBUG  ', volume: 2, format: STYLES.faint },
});

// -----------------------------------------------------------------------------

export const objectify = value => {
  if (isArray(value)) {
    return value.map(objectify);
  } else if (isNativeError(value)) {
    let { name, stack } = value;
    let index = stack.indexOf('\n');
    if (index !== -1) {
      stack = stack.slice(index + 1);
    }

    const replacement = { name, stack };
    for (const propertyName of getOwnPropertyNames(value)) {
      if (!has(replacement, propertyName)) {
        const propertyValue = value[propertyName];
        if (propertyValue != null) {
          replacement[propertyName] = propertyValue;
        }
      }
    }
    return replacement;
  }

  return value;
};

// -----------------------------------------------------------------------------

export function toCount(quantity, item) {
  return `${quantity} ${item}${quantity !== 1 ? 's' : ''}`;
}

const formats = [
  { unit: 'ms', digits: 3, separator: '' },
  { unit: 's', digits: 2, separator: '.' },
  { unit: 'min', digits: 2, separator: ':' },
];

/**
 * Format the given duration in `MM:SS.LLL UNIT` format. If possible, the
 * minutes or seconds are omitted and the unit is adjusted from `min` to `s`
 * or `ms`. This function accepts durations measured in either of two ways:
 *
 *   * Use `performance.now()` to measure the duration in milliseconds as a
 *     `Number`.
 *   * Use `process.hrtime.bigint()` to measure the duration in nanoseconds
 *     as a `BigInt`.
 */
export function toTime(duration) {
  // ------------------------------------------------ Break into components.
  const type = typeof duration;
  assert.ok(type === 'number' || type === 'bigint');

  let values = [1000, 60];
  if (type === 'bigint') {
    values = values.map(BigInt);
    duration += 500_000n;
    duration /= 1_000_000n;
  }

  for (const [index, unit] of values.entries()) {
    values[index] = duration % unit;
    duration = (duration - values[index]) / unit;
  }
  values.push(duration);

  if (type === 'number') {
    // performance.now() returns non-integral numbers.
    values[0] = round(values[0]);
  }

  // ------------------------------------------------ Format components.
  let leading = true;
  let text = '';
  let unit;

  for (let index = values.length - 1; index >= 0; index--) {
    let value = values[index];

    // eslint-disable-next-line eqeqeq
    if (leading && value == 0) continue;
    value = String(value);

    const format = formats[index];
    if (leading) {
      unit = format.unit;
      leading = false;
    } else {
      value = value.padStart(format.digits, '0');
    }
    text += value + format.separator;
  }

  text += ' ' + unit;
  return text;
}
