/* © 2020 Robert Grimm */

import { strict as assert } from 'assert';

/**
 * Identify an HTTP/2 stream. To uniquely identify a resource without making
 * the result too verbose, this function includes the stream ID as well as the
 * remote endpoint.
 */
export const identifyHttp2Stream = stream =>
  `https://${identifyRemote(stream.session.socket)}/#${stream.id}`;

/** Identify the local end of a socket. */
export const identifyLocal = ({ localAddress, localFamily, localPort }) =>
  identifyEndpoint({
    address: localAddress,
    family: localFamily,
    port: localPort,
  });

/** Identify the remote end of a socket. */
export const identifyRemote = ({ remoteAddress, remoteFamily, remotePort }) =>
  identifyEndpoint({
    address: remoteAddress,
    family: remoteFamily,
    port: remotePort,
  });

/**
 * Identify an endpoint. This helper function provides its services directly to
 * server objects and indirectly through adapters.
 */
export const identifyEndpoint = ({ address, family, port }) =>
  family === 'IPv6' ? `[${address}]:${port}` : `${address}:${port}`;

/** Create an error object representing the frame error parameters. */
export const createFrameError = (type, code, id, session) =>
  new Error(
    `Error ${code} sending frame ${type} on stream ${id} for ${identifyRemote(
      session
    )}`
  );

const DATE_FORMAT = new RegExp(
  `^(Mon|Tue|Wed|Thu|Fri|Sat|Sun), ([0-3]\\d) ` +
    `(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) ` +
    `(2\\d[2-9]\\d) ([0-2]\\d):([0-6]\\d):([0-6]\\d) GMT$`,
  'u'
);

const MONTH_INDEX = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11,
};

/** Parse the given string as a date suitable for HTTP headers. */
export function parseDate(value) {
  if (!value) return undefined;

  const components = value.match(DATE_FORMAT);
  if (components == null) return undefined;

  const [, , day, month, year, hours, minutes, seconds] = components;
  return new Date(
    Date.UTC(year, MONTH_INDEX[month], day, hours, minutes, seconds)
  );
}

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
