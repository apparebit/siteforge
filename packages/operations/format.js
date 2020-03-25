/* © 2019–2020 Robert Grimm */

import { types } from 'util';

const { freeze, getOwnPropertyNames } = Object;
const { has } = Reflect;
const { isArray } = Array;
const { isNativeError } = types;

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

export function toTime(duration) {
  // Break duration into milliseconds, seconds, and minutes.
  const units = [1000, 60];
  for (const [index, unit] of units.entries()) {
    units[index] = duration % unit;
    duration = (duration - units[index]) / unit;
  }
  units.push(duration);

  // NowNow format every component.
  if (units[1] === 0 && units[2] === 0) {
    return `${units[0]}ms`;
  }
  units[0] = `${units[0]}`.padStart(3, '0');
  if (units[2] === 0) {
    return `${units[1]}.${units[0]}s`;
  }
  units[1] = `${units[1]}`.padStart(2, '0');
  return `${units[2]}:${units[1]}.${units[0]}m`;
}
