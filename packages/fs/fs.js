/* © 2019-2020 Robert Grimm */

import { basename, dirname, extname } from 'path';
import { createHash } from 'crypto';
import { once } from 'events';
import { promises } from 'fs';
import { fileURLToPath } from 'url';

// eslint-disable-next-line no-duplicate-imports
export { createWriteStream } from 'fs';

export const {
  lstat,
  readdir,
  readFile,
  realpath,
  rm,
  symlink,
  unlink,
} = promises;

const {
  copyFile: doCopyFile,
  mkdir: doMkdir,
  writeFile: doWriteFile,
} = promises;

const DOT = '.'.charCodeAt(0);
const SLASH = '/'.charCodeAt(0);

// -----------------------------------------------------------------------------

/**
 * Determine whether the given file is a dotfile, i.e., has a name starting with
 * a dot character.
 */
export function isDotFile(path) {
  return basename(path).charCodeAt(0) === DOT;
}

/**
 * Create a slashed copy of the given URL. If the URL's path ends with a slash,
 * the copy is the same. If the URL's path does not end with a slash, the copy
 * has the same path appended with a slash.
 */
export function withTrailingSlash(url) {
  const theURL = new URL(url);
  if (theURL.pathname.charCodeAt(theURL.pathname.length - 1) !== SLASH) {
    theURL.pathname += '/';
  }
  return theURL;
}

/** Get the directory of the given file URL as a path. */
export function toDirectory(url) {
  return dirname(fileURLToPath(url));
}

const LENGTH = 8;
const TAG = new RegExp(`\\.v~[0-9a-f]{${LENGTH}}\\.[a-z0-9]+$`, 'iu');

/**
 * Inject the given tag into the given path. This function splices the given
 * length of characters from the given tag into the file name of the given
 * path, just before the extension.
 */
export function injectIntoPath(path, tag, length = LENGTH) {
  tag = tag.slice(0, length);
  const extension = extname(path);
  const base = path.slice(0, -extension.length);

  return `${base}.v~${tag}${extension}`;
}

/** Determine whether the path is versioned. */
export function isVersionedPath(path) {
  return TAG.test(path);
}

// -----------------------------------------------------------------------------

/**
 * Perform the given write to the given file. If the write fails with an
 * `ENOENT` error, this function recursively creates the directory containing
 * the file and then tries the write again. All other failures are immediately
 * reflected to the caller, without retrying.
 */
export async function retryAfterNoEntity(write, path) {
  try {
    return await write(path);
  } catch (x) {
    if (x.code !== 'ENOENT') throw x;
    await mkdir(dirname(path));
    return write(path);
  }
}

/**
 * Copy the given file. This function wraps the built-in version with
 * `retryAfterNoEntity`.
 */
export function copyFile(from, to) {
  return retryAfterNoEntity(path => doCopyFile(from, path), to);
}

/**
 * Recursively make the given directory. This function simply calls Node.js
 * built-in version with the `recursive` option set to `true`.
 */
export function mkdir(path) {
  return doMkdir(path, { recursive: true });
}

// -----------------------------------------------------------------------------

/**
 * Write the given data to a file at the given path. Unlike the built-in
 * `writeFile()`, this version tolerates `ENOENT` errors by transparently
 * creating necessary directories. It returns a promise for the written path,
 * which is just the same signature as that for `writeVersionedFile()` below
 * where the path is _not_ known upon invocation.
 */
export function writeFile(path, data, options) {
  return retryAfterNoEntity(async path => {
    await doWriteFile(path, data, options);
    return path;
  }, path);
}

/** Version the path for the given data and encoding. */
export function versionPath(path, data, encoding) {
  return injectIntoPath(
    path,
    createHash('sha256').update(data, encoding).digest('hex')
  );
}

/** Write the given data to the given path, after versioning the path. */
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
  return writeFile(versionedPath, data, options);
}

// -----------------------------------------------------------------------------

/**
 * Create a promise for a writable's pending writes having correctly drained.
 */
export function drain(writable) {
  // Copied from https://nodejs.org/docs/latest/api/stream.html
  // #stream_piping_to_writable_streams_from_async_iterators. Clearly,
  //     await once(writable, 'drain')
  // does not come close to handling error conditions. However, like anything
  // streams in Node.js, the correct solution is far too involved.
  if (writable.destroyed) {
    return Promise.reject(
      new Error(`writable "${writable}" closed prematurely`)
    );
  }
  return Promise.race([
    once(writable, 'drain'),
    once(writable, 'close').then(() =>
      Promise.reject(new Error(`writable "${writable}" closed prematurely`))
    ),
  ]);
}

/** Pump the elements of an asynchronous iterable into a writable stream. */
export async function pump(iterable, writable) {
  for await (const element of iterable) {
    if (!writable.write(element)) {
      await drain(writable);
    }
  }
  return writable;
}
