/* © 2020 Robert Grimm */

import { strict as assert } from 'assert';

const CODE_SLASH = '/'.charCodeAt(0);
const PERCENT_ENCODED_SLASH = /%2f/iu;
const PATH_ONLY = /^([^?#]*)(.*)$/u;

const endsWithSlash = s => s.charCodeAt(s.length - 1) === CODE_SLASH;

const parseRequestPath = uri => {
  // Chop off query and hash. Check for obvious errors.
  const [, rawPath, queryAndHash] = String(uri).match(PATH_ONLY);
  if (rawPath === '') {
    throw new Error(`Resource URI "${uri}" has no path component`);
  } else if (PERCENT_ENCODED_SLASH.test(rawPath)) {
    throw new Error(`Resource URI "${uri}" contains percent-coded slash`);
  } else if (rawPath.charCodeAt(0) !== CODE_SLASH) {
    throw new Error(`Resource URI "${uri}" has relative path`);
  }

  // Decode path and split into segments.
  const rawSegments = decodeURIComponent(rawPath).split('/');
  assert(rawSegments.shift() === '');

  const segments = [];
  for (const segment of rawSegments) {
    if (segment === '' || segment === '.') {
      // Ignore.
    } else if (segment === '..') {
      segments.pop();
    } else {
      segments.push(segment);
    }
  }

  // Determine file and extension.
  let file = '';
  let extension = '';
  if (segments.length) {
    file = segments.pop();

    const dot = file.lastIndexOf('.');
    if (dot !== -1) {
      extension = file.slice(dot);
      file = file.slice(0, dot);
    }
  }

  // Determine directory and clean path.
  const directory = `/` + segments.join('/');
  let path = directory;
  if (file || extension) {
    if (!endsWithSlash(path)) path = path + '/';
    path = path + file + extension;
  }
  const trailingSlash = path !== '/' && endsWithSlash(rawPath);

  // Done.
  return {
    directory,
    file,
    extension,
    path,
    trailingSlash,
    queryAndHash,
  };
};

export default parseRequestPath;
