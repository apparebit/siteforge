/* © 2020 Robert Grimm */

import { strict as assert } from 'assert';
import { parsePath } from './path-util.js';

const CODE_SLASH = '/'.charCodeAt(0);
const {
  defineProperty,
  entries: entriesOf,
  getOwnPropertyDescriptors,
} = Object;

/**
 * Create a new middleware handler that invokes the given middleware handler
 * only if the given path matches the request path. If `exact` is truthy, the
 * given path must equal the parsed request path. Otherwise, the given path must
 * either equal the parsed request path or must name a directory prefix of it.
 */
export default function createPathHandler(
  path,
  handler,
  { exact = false } = {}
) {
  assert(typeof handler === 'function');
  const { path: expected } = parsePath(path);
  const { length } = expected;

  let predicate = exchange => exchange.path === expected;
  if (!exact) {
    predicate = exchange => {
      const { path } = exchange;
      if (!path.startsWith(expected)) return false;
      return path.length === length || path.charCodeAt(length) === CODE_SLASH;
    };
  }

  const handlePath = (exchange, next) => {
    if (predicate(exchange)) {
      return handler(exchange, next);
    } else {
      return next();
    }
  };

  for (const [name, descriptor] of entriesOf(
    getOwnPropertyDescriptors(handler)
  )) {
    if (name !== 'arguments' && name !== 'caller') {
      defineProperty(handlePath, name, descriptor);
    }
  }

  return handlePath;
}
