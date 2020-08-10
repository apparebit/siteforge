/* © 2020 Robert Grimm */

import { strict as assert } from 'assert';

const CODE_DOT = '.'.charCodeAt(0);
const CODE_SLASH = '/'.charCodeAt(0);
const PATH_AND_QUERY = /^([^?#]*)([^#]*)/u;
const PERCENT_TWO_EFF = /%2f/iu;

const isDotted = s => s.charCodeAt(0) === CODE_DOT;

/**
 * Parse the given value.
 *
 * This function ensures that the given value is a string, decodes any
 * percent-coded characters, and then splits the string into raw path and query
 * components.
 *
 * It further parses the raw path to produce a sanitized version: Notably, it
 * ensures that the path contains no remaining percent-coded characters and is
 * an absolute path. It removes empty, single-dotted, and double-dotted path
 * segments and checks that no remaining path segment starts with a dot — with
 * exception of `/.well-known`. Finally, it removes any trailing slash.
 *
 * The result is an object with the raw path, raw query, path, and flag for
 * trailing slash in raw original.
 *
 * This method signals validation errors as exceptions.
 */
export const parsePath = value => {
  if (value == null) {
    throw new Error(`No request path (${value})`);
  } else if (typeof value !== 'string') {
    throw new Error(`Request path "${value}" is not a string`);
  }

  // Split `:path` into raw path and raw query.
  const [, rawPath, rawQuery] = value.match(PATH_AND_QUERY);

  if (rawPath === '') {
    throw new Error(`Request path is empty`);
  } else if (PERCENT_TWO_EFF.test(rawPath)) {
    throw new Error(`Request path "${value}" contains percent-coded slashes`);
  } else if (rawPath.charCodeAt(0) !== CODE_SLASH) {
    throw new Error(`Request path "${value}" is relative`);
  }

  // Decode raw path and normalize segments.
  const rawSegments = decodeURIComponent(rawPath).split('/');
  assert(rawSegments.length >= 2 && rawSegments[0] === '');

  const segments = [];
  for (const segment of rawSegments) {
    if (segment === '' || segment === '.') {
      // Ignore empty or single-dot segment.
    } else if (segment === '..') {
      segments.pop();
    } else if (
      isDotted(segment) &&
      (segment !== '.well-known' || segments.length === 1)
    ) {
      // Reject dotted segment unless it is `/.well-known`
      throw new Error(`Request path "${value}" contains dotted path segment`);
    } else {
      segments.push(segment);
    }
  }

  // Et voila!
  const path = `/${segments.join('/')}`;
  const endsInSlash = path !== '/' && rawPath.endsWith('/');

  return {
    rawPath,
    rawQuery,
    path,
    endsInSlash,
  };
};

/** Create predicate for checking whether object's path has expected value. */
export const toFileMatcher = expected => object => object.path === expected;

/** Create predicate for checking whether object's path as directory prefix. */
export const toTreeMatcher = root => object => {
  const { length } = root;
  const { path } = object;
  return (
    path.startsWith(root) &&
    (path.length === length || path.charCodeAt(length) === CODE_SLASH)
  );
};
