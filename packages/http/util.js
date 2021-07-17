/* © 2020 Robert Grimm */

import Context from './context.js';
import { StatusCode } from './constants.js';

// Endpoints
// ~~~~~~~~~

/** Identify an endpoint. */
export const identifyEndpoint = ({ address, family, port }) =>
  family === 'IPv6' ? `[${address}]:${port}` : `${address}:${port}`;

// =============================================================================

// Dates
// ~~~~~

const HTTP_DATE_FORMAT = new RegExp(
  `^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), ([0-3]\\d) ` +
    `(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) ` +
    `(2\\d[2-9]\\d) ([0-2]\\d):([0-6]\\d):([0-6]\\d) GMT$`,
  'u'
);

const OPENSSL_DATE_FORMAT = new RegExp(
  `(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) ` +
    `([ 0-3]\\d) ` +
    `([0-2]\\d):([0-6]\\d):([0-6]\\d) ` +
    `(2\\d{3}) ` +
    `GMT$`,
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

/** Parse the HTTP header date/time into a timestamp for the current epoch. */
export function parseDateHTTP(value) {
  const components = String(value).match(HTTP_DATE_FORMAT);
  if (components == null) return undefined;

  const [, day, month, year, hours, minutes, seconds] = components;
  return Date.UTC(year, MONTH_INDEX[month], day, hours, minutes, seconds);
}

/** Parse the OpenSSL date/time into a timestamp for the current epoch. */
export function parseDateOpenSSL(value) {
  const components = String(value).match(OPENSSL_DATE_FORMAT);
  if (components == null) return undefined;

  const [, month, day, hours, minutes, seconds, year] = components;
  return Date.UTC(year, MONTH_INDEX[month], day, hours, minutes, seconds);
}

// =============================================================================

// Paths
// ~~~~~

const { BadRequest } = StatusCode;
const DOT = '.'.charCodeAt(0);
const SLASH = '/'.charCodeAt(0);

export const checkString = value => {
  if (typeof value !== 'string') {
    throw Context.Error(BadRequest, `Path "${value}" is not a string`);
  }
  return value;
};

export const checkPath = value => {
  if (value.length === 0) {
    throw Context.Error(BadRequest, `Path is empty`);
  } else if (value.charCodeAt(0) !== SLASH) {
    throw Context.Error(BadRequest, `Path "${value}" is not absolute`);
  }
  return value;
};

const decompose = value => {
  let cut = value.lastIndexOf('#');
  if (cut >= 0) value = value.slice(0, cut);

  let path = value;
  let query = '';

  cut = value.indexOf('?');
  if (cut >= 0) {
    query = path.slice(cut);
    path = path.slice(0, cut);
  }

  return { path, query };
};

const decode = (value, label) => {
  try {
    return decodeURIComponent(value);
  } catch {
    throw Context.Error(`${label} "${value}" is incorrectly encoded`);
  }
};

// Control characters and character illegal in Windows path segments.
const INVALID_CHAR = /[\u{00}-\u{1f}<>:"/\\|?*]/u;

const normalize = (path, { checkDotted = true, checkChars = true } = {}) => {
  const segmented = path.split('/');
  const cleaned = [];

  for (const segment of segmented) {
    if (segment === '' || segment === '.') {
      // Nothing to do.
    } else if (segment === '..') {
      cleaned.pop();
    } else if (
      checkDotted &&
      segment.charCodeAt(0) === DOT &&
      (segment !== '.well-known' || cleaned.length !== 0)
    ) {
      throw new Context.Error(
        `Path "${path}" contains segment starting with '.'`
      );
    } else if (checkChars && INVALID_CHAR.test(segment)) {
      throw new Context.Error(
        BadRequest,
        `Path "${path}" contains invalid characters`
      );
    } else {
      cleaned.push(segment);
    }
  }

  const normalized = `/${cleaned.join('/')}`;
  return cleaned.length > 0 && path.charCodeAt(path.length - 1) === SLASH
    ? `${normalized}/`
    : normalized;
};

/** Validate the request path. */
export const validateRequestPath = value => {
  checkString(value);
  let { path, query } = decompose(value);

  checkPath(path);
  path = decode(path, 'Path');
  path = normalize(path);

  query = decode(query, 'Query');
  return { path, query };
};

/** Validate routing path. */
export const validateRoutePath = value => {
  let path = checkPath(checkString(value));
  path = unslash(normalize(path));
  return path;
};

/** Add trailing slash to the path. */
export const slash = path => {
  const { length } = path;
  return path.charCodeAt(length - 1) !== SLASH ? `${path}/` : path;
};

/** Remove any trailing slash from the path. */
export const unslash = path => {
  const { length } = path;
  return length > 1 && path.charCodeAt(length - 1) === SLASH
    ? path.slice(0, length - 1)
    : path;
};

const EXTENSION = new RegExp(
  `\\.(atom|cjs|css|cur|f4[abpv]|flac|geojson|gif|html?|` +
    `ico|ics|jfif|jpe?g|js|json|jsonld|` +
    `m4[av]|markdown|md|mov|mp[34]|mjs|otf|pdf|png|` +
    `qt|rdf|rss|svg|tiff?|ttf|txt|` +
    `vcard|vcf|wasm|wave?|web[mp]|webmanifest|woff2?|zip)$`,
  'iu'
);

/** Determine whether the path has a well known file extension. */
export const hasExtension = path => EXTENSION.test(path);

/**
 * Determine whether the path is mounted at given root (without trailing slash).
 */
export const isMountedAt = (path, root) =>
  path.startsWith(root) &&
  (path.length === root.length || path.charCodeAt(root.length) === SLASH);

// =============================================================================

// HTML
// ~~~~

const ESCAPABLE = /[&<>]/gu;
const ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
};

/** Escape the HTML body text. */
export const escapeText = s => s.replace(ESCAPABLE, c => ESCAPES[c]);
