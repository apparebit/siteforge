/* © 2020 Robert Grimm */

import { strict as assert } from 'assert';

const CODE_DOT = '.'.charCodeAt(0);
const CODE_SLASH = '/'.charCodeAt(0);
const PATH_AND_QUERY = /^([^?#]*)([^#]*)/u;
const PERCENT_TWO_EFF = /%2f/iu;

const isDotted = s => s.charCodeAt(0) === CODE_DOT;

export default function parseRequestPath(value) {
  // Split `:path` into raw path and raw query.
  if (!value) throw new Error(`No request path`);

  const [, rawPath, rawQuery] = value.match(PATH_AND_QUERY);
  if (rawPath === '') {
    throw new Error(`Request path is empty`);
  } else if (PERCENT_TWO_EFF.test(rawPath)) {
    throw new Error(`Request path "${value}" contains percent-coded slash`);
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
}
