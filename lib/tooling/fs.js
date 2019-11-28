/**
 * @module tooling/fsplus
 * @copyright (C) 2019 Robert Grimm
 */

import { promises } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

export const {
  copyFile,
  lstat,
  mkdir,
  readdir,
  readFile,
  realpath,
  rmdir,
  writeFile,
} = promises;

const ANY_PART = '[^/]*?';
const ANY_SEGMENTS = '(|.+?/)'; // Either no segment or a non-empty segment!
const ANY_SUFFIX = '.*?';
const DOT = '\\.';
const SLASH = '/'.charCodeAt(0);

const regexFor = s => s.replace(/[.*]/gu, c => (c === '.' ? DOT : ANY_PART));

/** Convert the given glob patterns into the corresponding predicate. */
export function createGlobMatcher(...globs) {
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
            throw new Error(`glob "${glob}" contains invalid segment wildcard`);
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

/** Get the directory of the given file URL as a path. */
export function directory(url) {
  return dirname(fileURLToPath(url));
}

/**
 * Create a copy of the given URL. If the URL's path ends with a slash, the copy
 * is the same. If the URL's path does not end with a slash, the copy has the
 * same path appended with a slash.
 */
export function slashed(url) {
  const theURL = new URL(url);
  if (theURL.pathname.charCodeAt(theURL.pathname.length - 1) !== SLASH) {
    theURL.pathname += '/';
  }
  return theURL;
}

/**
 * Perform the given write to the given file. If the write fails with an
 * `ENOENT` error, this function recursively creates the directory containing
 * the file and then tries the write again. All other failures are immediately
 * reflected to the caller, without retrying.
 */
export async function retryAfterNoEnt(write, path) {
  try {
    return await write(path);
  } catch (x) {
    if (x.code !== 'ENOENT') throw x;
    await mkdir(dirname(path), { recursive: true });
    return write(path);
  }
}
