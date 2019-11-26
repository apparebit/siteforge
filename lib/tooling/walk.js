/**
 * @module tooling/walk
 * @copyright (C) 2019 Robert Grimm
 */

import { basename, join, resolve } from 'path';
import { lstat, readdir, realpath } from './fs.js';

const DOT = '.'.charCodeAt(0);
const isDotFile = p => basename(p).charCodeAt(0) === DOT;

const swallowError = x => {
  if (x.code === 'ENOENT') {
    return true;
  } else {
    throw x;
  }
};

/** Walk part of the file system. */
export default async function* walk(root, isExcluded = isDotFile) {
  const metrics = {
    directories: 0,
    files: 0,
    symbolicLinks: 0,
  };

  const visitedPaths = new Set();
  const doNotRevisit = path => {
    const visited = visitedPaths.has(path);
    if (!visited) visitedPaths.add(path);
    return visited;
  };

  // For visited path detection to work, paths must be absolute and real.
  const pending = [resolve(root)];
  while (pending.length > 0) {
    const directory = pending.shift();
    let entries;

    try {
      entries = await readdir(directory);
    } catch (x) {
      if (swallowError(x)) continue;
    }

    nextEntry: for (let entry of entries) {
      let path, status;

      try {
        path = join(directory, entry);
        status = await lstat(path);
        if (status.isDirectory()) path += '/';
        if (doNotRevisit(path) || isExcluded(path)) continue;
      } catch(x) {
        if (swallowError(x)) continue;
      }

      while (status.isSymbolicLink()) {
        metrics.symbolicLinks++;
        try {
          path = await realpath(path);
          status = await lstat(path);
          if (status.isDirectory()) path += '/';
          if (doNotRevisit(path) || isExcluded(path)) continue nextEntry;
        } catch (x) {
          if (swallowError(x)) continue nextEntry;
        }
      }

      if (status.isDirectory()) {
        metrics.directories++;
        pending.push(path);
      } else if (status.isFile()) {
        metrics.files++;
        yield { type: 'file', root, path };
      }
    }
  }

  return metrics;
}
