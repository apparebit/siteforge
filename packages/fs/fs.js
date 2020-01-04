/* © 2019-2020 Robert Grimm */

import { basename, dirname, extname, posix } from 'path';
import { createHash } from 'crypto';
import { promises } from 'fs';
import { fileURLToPath } from 'url';

export const {
  lstat,
  mkdir,
  readdir,
  readFile,
  realpath,
  rmdir,
  writeFile,
} = promises;

const { copyFile: doCopyFile } = promises;
const { join: posixJoin, parse: parsePosixPath } = posix;

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

/**
 * Make the given path look "cool". Taking a cue from [cool
 * URLs](https://www.w3.org/Provider/Style/URI), this function removes
 * `index.htm` and `index.html` from paths for HTML documents and the extensions
 * `.htm` and `.html` from the paths for all other HTML documents. It also
 * removes the trailing slash from all paths, as they make paths more complex
 * without adding expressivity. Unfortunately, in the absence of an index file
 * and trailing slash, browsers resolve relative URLs off the parent directory
 * and not the page itself. Hence, they should be rewritten to absolute URLs.
 * The practice of using `.htm` appears largely confined to Windows users. It
 * would be a grave mistake to ignore it in a function that removes the
 * extension.
 */
export function toCoolPath(path) {
  // Node.js' path.posix.parse() eliminates any trailing slash without trace.
  const { dir, base, name, ext } = parsePosixPath(path);
  if (ext === '.html' || ext === '.htm') {
    if (name === 'index') {
      return dir;
    } else {
      return posixJoin(dir, name);
    }
  }

  return posixJoin(dir, base);
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
    await mkdir(dirname(path), { recursive: true });
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

// -----------------------------------------------------------------------------

/** Version the path for the given data and encoding. */
export function versionPath(path, data, encoding) {
  return injectIntoPath(
    path,
    createHash('sha256')
      .update(data, encoding)
      .digest('hex')
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
  return retryAfterNoEntity(async path => {
    await writeFile(path, data, options);
    return path;
  }, versionedPath);
}
