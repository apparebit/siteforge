/* © 2019 Robert Grimm */

import { dirname, posix } from 'path';
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
const { join, parse: parsePath } = posix;

const ANY_PART = '[^/]*?';
const ANY_SEGMENTS = '(|.+?/)'; // Either no segment or a non-empty segment!
const ANY_SUFFIX = '.*?';
const DOT = '\\.';
const SLASH = '/'.charCodeAt(0);

// -----------------------------------------------------------------------------

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

// Cool URIs don't change (https://www.w3.org/Provider/Style/URI). But cool URIs
// also are crafted with care, i.e., without ".html" and without those
// extraneous trailing slashes.
export function toCoolPath(path, { trailingSlash = false } = {}) {
  const { dir, name, ext } = parsePath(path);
  if (ext === '.html') {
    if (name === 'index') {
      return trailingSlash ? dir + '/' : dir;
    } else {
      return join(dir, name);
    }
  }

  if (!trailingSlash) {
    return path.charCodeAt(path.length - 1) === SLASH
      ? path.slice(0, -1)
      : path;
  } else {
    return path;
  }
}

// -----------------------------------------------------------------------------

const regexFor = s => s.replace(/[.*]/gu, c => (c === '.' ? DOT : ANY_PART));

/** Convert the given glob patterns into the corresponding predicate. */
export function glob(...globs) {
  const pattern = globs
    .flatMap(g => g.split('|'))
    .flatMap(glob => {
      if (!glob) return [];

      const segments = glob.split(/(?<!\\)[/]/u);
      const regexFragments = [];

      // Every single segment other than the segment wildcard is treated as if
      // it was prefixed with '**'.
      if (segments.length === 1 && segments[0] !== '**') {
        regexFragments.push(ANY_SEGMENTS);
      }

      for (const [index, segment] of segments.entries()) {
        const hasNext = index < segments.length - 1;

        if (segment.includes('**')) {
          if (segment.length !== 2) {
            throw new SyntaxError(
              `Glob "${glob}" contains invalid segment wildcard`
            );
          } else if (segments[index + 1] === '**') {
            continue; // One segment wildcard suffices!
          } else if (hasNext) {
            regexFragments.push(ANY_SEGMENTS);
          } else {
            regexFragments.push(ANY_SUFFIX);
          }
        } else {
          regexFragments.push(regexFor(segment));
          if (hasNext) {
            regexFragments.push('/');
          } else if (segment) {
            // A pattern without trailing slash matches files and directories.
            // A pattern with trailing slash matches only directories.
            // Currently, there is no way to match only files.
            regexFragments.push('/?');
          }
        }
      }

      return [regexFragments.join('')];
    })
    .join('|');

  if (!pattern) return () => false;
  const regex = new RegExp(`^(${pattern})$`, 'u');
  return path => regex.test(path);
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
