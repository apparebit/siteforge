/* © 2020 Robert Grimm */

import { isError, traceErrorPosition } from '@grr/oddjob/error';
import { isBoxed, isMap, isSet, isURL } from '@grr/oddjob/types';
import { types } from 'util';

const { from: toArray, isArray } = Array;
const { getOwnPropertyNames, keys: keysOf } = Object;
const { has } = Reflect;
const { isDate, isRegExp } = types;
const { MAX_SAFE_INTEGER, MIN_SAFE_INTEGER } = Number;
const { stringify } = JSON;

export function replaceError(error, sorted) {
  const replacement = {
    '@type': 'error',
    name: error.name,
    code: error.code,
    message: error.message,
    stack: traceErrorPosition(error),
  };

  const extras = getOwnPropertyNames(error).filter(
    k => k !== '__proto__' && !has(replacement, k)
  );
  if (sorted) extras.sort();
  extras.reduce((o, k) => ((o[k] = error[k]), o), replacement);

  return replacement;
}

function createReplacer({ decycled = false, sorted = false } = {}) {
  const seen = decycled ? new Map() : null;

  return function replacer(key, value) {
    if (isBoxed(value)) value = value.valueOf();
    const type = typeof value;

    if (type === 'bigint') {
      return MIN_SAFE_INTEGER <= value && value <= MAX_SAFE_INTEGER
        ? Number(value)
        : { '@type': 'bigint', value: String(value) };
    } else if (type === 'function') {
      return { '@type': 'function', value: value.toString() };
    } else if (
      value == null ||
      type !== 'object' ||
      isDate(value) ||
      isURL(value)
    ) {
      return value;
    } else if (isRegExp(value)) {
      return value.toString();
    }

    if (decycled) {
      let path = seen.get(value);
      if (path) return { '@ref': path };
      path = seen.get(this);
      seen.set(value, path ? `${path}[${stringify(key)}]` : '$');
    }

    if (isArray(value)) {
      return value;
    } else if (isSet(value)) {
      return toArray(value.values());
    } else if (isMap(value)) {
      return toArray(value.entries());
    } else if (isError(value)) {
      return replaceError(value, sorted);
    } else if (sorted) {
      return keysOf(value)
        .filter(k => k !== '__proto__')
        .sort()
        .reduce((o, k) => ((o[k] = value[k]), o), {});
    } else {
      return value;
    }
  };
}

export default function pickle(value, options) {
  return stringify(value, createReplacer(options));
}
