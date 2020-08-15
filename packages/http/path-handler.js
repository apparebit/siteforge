/* © 2020 Robert Grimm */

import { strict as assert } from 'assert';
import { toFileMatcher, toTreeMatcher, parsePath } from './util.js';

const {
  defineProperty,
  entries: entriesOf,
  getOwnPropertyDescriptors,
} = Object;

const toPathHandler = (matcher, handler) => (exchange, next) =>
  matcher(exchange) ? handler(exchange, next) : next();

/**
 * Create a new middleware handler that invokes the given middleware handler
 * only if the given path matches the request path. If `exact` is truthy, the
 * given path must equal the parsed request path. Otherwise, the given path must
 * either equal the parsed request path or must name a directory prefix of it.
 */
const createPathHandler = (path, handler, { exact = false } = {}) => {
  assert(typeof handler === 'function');
  const { path: expected } = parsePath(path);

  // Instantiate middleware handler.
  const handlePath = toPathHandler(
    exact ? toFileMatcher(expected) : toTreeMatcher(expected),
    handler
  );

  // Copy properties from original handler to new middleware.
  const descriptors = getOwnPropertyDescriptors(handler);
  for (const [name, descriptor] of entriesOf(descriptors)) {
    if (name !== 'arguments' && name !== 'caller') {
      defineProperty(handlePath, name, descriptor);
    }
  }
  return handlePath;
};

export default createPathHandler;
