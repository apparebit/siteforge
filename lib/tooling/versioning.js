/* © 2019 Robert Grimm */

import { createHash } from 'crypto';
import { extname } from 'path';
import { retryAfterNoEntity, writeFile } from './fs.js';

const LENGTH = 8;
const TAG = new RegExp(`\\.v-[0-9a-f]{${LENGTH}}\\.[a-f0-9]+$`, 'iu');

export function sha256(data, encoding) {
  return createHash('sha256')
    .update(data, encoding)
    .digest('hex');
}

export function injectIntoPath(path, tag, length = LENGTH) {
  tag = tag.slice(0, length);
  const extension = extname(path);
  const base = path.slice(0, -extension.length);

  return `${base}.v-${tag}${extension}`;
}

export function isVersionedPath(path) {
  return TAG.test(path);
}

export function versionPath(path, data, encoding) {
  return injectIntoPath(path, sha256(data, encoding));
}

export function writeVersionedFile(path, data, options = {}) {
  // Normalize options while also validating some.
  const type = typeof options;
  if (type === 'string') {
    options = { encoding: options };
  } else if (type !== 'object') {
    throw new TypeError(`Options argument must be a string or object`);
  } else {
    // Consistent with Node, coerce null into a newly created object.
    options = Object(options);
  }
  const doVersionPath = options.versionPath || versionPath;

  // Actually determine hash, splice into path, and write file.
  const versionedPath = doVersionPath(path, data, options.encoding);
  return retryAfterNoEntity(async path => {
    await writeFile(path, data, options);
    return path;
  }, versionedPath);
}
