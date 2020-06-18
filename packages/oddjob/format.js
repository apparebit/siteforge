/* © 2020 Robert Grimm */

import { strict as assert } from 'assert';

const { round } = Math;

/** Format the given count and noun, adding the plural suffix as necessary. */
export function count(quantity, noun, suffix = 's') {
  suffix = quantity !== 1 ? suffix : '';
  return `${quantity.toLocaleString('en')} ${noun}${suffix}`;
}

const formats = [
  { digits: 3, separator: '', unit: 'ms' },
  { digits: 2, separator: '.', unit: ' s' },
  { digits: 2, separator: ':', unit: ' min' },
  { digits: 2, separator: ':', unit: ' h' },
];

/**
 * Format the given duration in `MM:SS.LLL UNIT` format. This function accepts
 * floating point numbers in milliseconds measured with `performance.now()` as
 * well as big integers in nanoseconds measured with `process.hrtime.bigint()`.
 */
export function duration(value) {
  // Break duration value into parts.
  const type = typeof value;
  assert(type === 'number' || type === 'bigint');

  let parts = [1_000, 60];
  if (type === 'bigint') {
    parts = parts.map(BigInt);
    value += 500_000n;
    value /= 1_000_000n;
  }

  for (const [index, unit] of parts.entries()) {
    parts[index] = value % unit;
    value = (value - parts[index]) / unit;
  }
  parts.push(value);

  if (type === 'number') {
    // performance.now() returns non-integral numbers.
    parts[0] = round(parts[0]);
  }

  // Format parts into a coherent string.
  let leading = true;
  let text = '';
  let unit;

  for (let index = parts.length - 1; index >= 0; index--) {
    let part = parts[index];

    // eslint-disable-next-line eqeqeq
    if (leading && part == 0) continue;
    part = String(part);

    const format = formats[index];
    if (leading) {
      unit = format.unit;
      leading = false;
    } else {
      part = part.padStart(format.digits, '0');
    }
    text += part + format.separator;
  }

  text += unit;
  return text;
}
