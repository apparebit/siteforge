/* © 2020 Robert Grimm */

import { traceErrorPosition } from './error.js';
import { strict as assert } from 'assert';
import { types } from 'util';
import { isSet, isMap } from './types.js';

const { getOwnPropertyNames, keys: keysOf } = Object;
const { isArray } = Array;
const { isNativeError } = types;
const { keyFor } = Symbol;
const { stringify } = JSON;

const wellKnownSymbols = (function () {
  const result = new Map();
  for (const key of getOwnPropertyNames(Symbol)) {
    const value = Symbol[key];
    if (typeof value === 'symbol') {
      result.set(value, `"@@${key}"`);
    }
  }
  return result;
})();

// Only serialize well-known symbols and publicly registered ones.
const pickleSymbol = (symbol, fragments) => {
  let description = wellKnownSymbols.get(symbol);
  if (!description) {
    description = keyFor(symbol);
    if (description) description = stringify(`@@${description}`);
  }
  return fragments.push(description || `null`);
};

export default function pickle(value, { sorted = false } = {}) {
  // The current path and the mapping from objects to paths.
  const path = [];
  const pathsForObjects = new Map();

  // Reference object if repeated, otherwise serialize it.
  const refOrObject = (key, value) => {
    const ref = pathsForObjects.get(value);
    if (ref) return ref;

    path.push(key === undefined ? `@` : `[${stringify(key)}]`);
    pathsForObjects.set(value, path.join(''));
    return undefined;
  };

  // Done serializing object.
  const doneWith = (key, value) => {
    assert(path.pop(), value);
  };

  const fragments = [];
  const putInJar = (key, value) => {
    // Let objects override how they are serialized.
    if (value && typeof value.toJSON === 'function') {
      value = value.toJSON();
    }
    // Unbox primitive values that somehow got boxed.
    if (value && typeof value.valueOf === 'function') {
      value = value.valueOf();
    }

    // Take care of non-object values.
    const type = typeof value;
    switch (type) {
      case 'boolean':
        return fragments.push(String(value));
      case 'number':
        return fragments.push(isFinite(value) ? String(value) : 'null');
      case 'string':
        return fragments.push(stringify(value));
      case 'bigint':
        return fragments.push(String(value));
      case 'undefined':
        return fragments.push('null');
      case 'symbol':
        return pickleSymbol(value, fragments);
      case 'function':
        return fragments.push(`{"@fn":${stringify(value.toString())}}`);
      default:
        assert(type === 'object');
        if (value === null) return fragments.push('null');
    }

    // Emit reference or serialize object?
    const ref = refOrObject(key, value);
    if (ref) return fragments.push(`{"@ref":${stringify(ref)}}`);

    // --------------- Sets and Arrays ---------------
    let elements;
    if (isSet(value)) {
      elements = value.values();
    } else if (isArray(value)) {
      elements = value;
    }

    if (elements) {
      fragments.push('[');
      let index = 0;
      for (const element of elements) {
        if (index > 0) fragments.push(',');
        putInJar(index, element);
        index += 1;
      }
      fragments.push(']');
      return doneWith(key, value);
    }

    // ----- Maps with Primitive Keys as well as Errors -----
    let names, lookup;
    if (isMap(value)) {
      let objectifiable = true;

      names = [...value.keys()];
      for (const name of names) {
        const type = typeof name;
        if (type === 'function' || type === 'object') {
          objectifiable = false;
          break;
        }
      }

      if (objectifiable) {
        lookup = n => value.get(n);
      } else {
        names = undefined;
      }
    } else if (isNativeError(value) || value instanceof Error) {
      names = getOwnPropertyNames(value);
      ['name', 'code'].forEach(name => {
        if (!names.includes(name)) names.unshift(name);
      });

      const trace = traceErrorPosition(value);
      lookup = n => (n === 'stack' ? trace : value[n]);
    }

    if (!names) {
      names = keysOf(value);
      lookup = n => value[n];
    }

    if (sorted) {
      names.sort();
    }

    fragments.push('{');
    let first = true;
    for (const name of names) {
      const propertyValue = lookup(name);

      if (propertyValue !== undefined) {
        if (first) {
          first = false;
        } else {
          fragments.push(',');
        }

        fragments.push(`"${name}":`);
        putInJar(name, propertyValue);
      }
    }
    fragments.push('}');
    return doneWith(key, value);
  };

  if (value === undefined) {
    return undefined;
  }

  putInJar(undefined, value);
  return fragments.join('');
}
