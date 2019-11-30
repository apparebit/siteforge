/* © 2019 Robert Grimm */

import { createHash } from 'crypto';
import { extname } from 'path';
import { retryAfterNoEntity, writeFile } from './fs.js';

export function sha256(data, encoding) {
  return createHash('sha256')
    .update(data, encoding)
    .digest('hex');
}

export function injectIntoPath(path, tag, length = 8) {
  tag = tag.slice(0, length);
  const extension = extname(path);
  const base = path.slice(0, -extension.length);

  return `${base}.v-${tag}${extension}`;
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
