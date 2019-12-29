/* © 2019 Robert Grimm */

import { basename, dirname, extname, join, posix, resolve } from 'path';
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
 * URLs](https://www.w3.org/Provider/Style/URI), this function handles the
 * mechanics of making paths look cool:  It removes `index.htm` and `index.html`
 * from paths for HTML documents with that name and the extensions `.htm` and
 * `.html` from the paths for all other HTML documents. Furthermore, it removes
 * the trailing slash from all paths. Trailing slashes only make paths more
 * complex without adding expressivity to the web. Unfortunately, in the absence
 * of index file and trailing slash, browsers resolve relative URLs off the
 * parent directory and not the page itself. Though that is simple enough to
 * overcome with tooling that rewrites relative to absolute URLs. Thankfully,
 * the practice of using `.htm` as a file extension for HTML documents seems to
 * be largely confined to Windows users. That is not surprising, given that
 * three letters were a historical MS-DOS limit. But it also is more reason for
 * removing `.htm` from cool paths.
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

// -----------------------------------------------------------------------------

/**
 * Walk the file system tree rooted at the given directory. The walk may include
 * resources more than once if the file system supports hard links. The walk may
 * also include resources outside the tree if the file system supports symbolic
 * links. This function does protect against getting stuck in a cycle, e.g.,
 * when a symbolic link points to one of its ancestral directories, by tracking
 * the [real path](http://man7.org/linux/man-pages/man3/realpath.3.html) of the
 * file system entities visited so far.
 *
 * When invoked with just a directory argument, this function does very little,
 * i.e., performs no I/O. For an actual walk to happen, it requires meaningful
 * `handleNext` and `handleFile` callbacks that schedule the corresponding
 * asynchronous operations. With @grr/multitasker's `handleWalk()` method that
 * becomes as easy as:
 *
 * ```js
 * walk(root, { isExcluded, ...multitasker.handleWalk(handleFile) });
 * ```
 *
 * Nonetheless, the default implementation for both handlers is a noop, since
 * doing otherwise would have created a hard dependency on that package. The
 * `handleNext` callback schedules the next unit of work and is invoked as:
 *
 * ```js
 * handleNext(handler, path, virtualPath);
 * ```
 *
 * The work is performed by executing `handler(path, virtualPath)`. The
 * `handleFile` callback actually processes a file and is invoked as:
 *
 * ```js
 * handleFile(path, virtualPath);
 * ```
 *
 * Both callbacks are expected to return a promise that only resolves when the
 * work has actually been performed. The `handler` passed to `handleNext` does
 * observe this contract.
 *
 * As the handlers illustrate, this function identifies each file system entity
 * by _two_ paths. The first is the real path, which is also used to protect
 * against cycles in the walk. The second is the virtual path, which takes
 * symbolic links at name value. For example, when `a/b/link` is a symbolic link
 * to directory `c/d`, the first, real path is `c/d` and the second, virtual
 * path is `/a/b/link`. If file `c/d/file` is visited next, then the first, real
 * path is `c/d/file` and the second, virtual path is `/a/b/link/file`. To
 * ensure predictable results, this function processes directory entries sorted
 * by their UTF-16 code points. Otherwise, a directory with a file `file` and a
 * symbolic link `link` to that same file would either yield `file` or `link`
 * depending on which order `readdir` happens to return entries.
 */
export async function walk(
  root,
  {
    isExcluded = isDotFile,
    ignoreNoEnt = false,
    handleNext = () => {},
    handleFile = () => {},
  } = {}
) {
  if (typeof root !== 'string') {
    throw new Error(`Root for file system walk "${root}" is not a path`);
  }

  const metrics = {
    directory: 0,
    entry: 0,
    file: 0,
    status: 0,
    symlink: 0,
  };

  const visited = new Set();
  const isRevisit = path => {
    const hasVisited = visited.has(path);
    if (!hasVisited) visited.add(path);
    return hasVisited;
  };

  const readEntries = async path => {
    try {
      metrics.directory++;
      const entries = await readdir(path);
      metrics.entry += entries.length;
      return entries.sort();
    } catch (x) {
      if (ignoreNoEnt && x.code === 'ENOENT') return [];
      throw x;
    }
  };

  const processEntry = async (path, virtualPath) => {
    console.log('process entry', virtualPath);
    let status;

    while (true) {
      metrics.status++;
      status = await lstat(path);
      if (!status.isSymbolicLink()) break;

      console.log('follow symlink', path);
      metrics.symlink++;
      path = await realpath(path);
      if (isExcluded(path) || isRevisit(path)) return null;
    }

    if (status.isDirectory()) {
      console.log('directory', virtualPath);
      return processDirectory(path, virtualPath);
    } else if (status.isFile()) {
      console.log('file', virtualPath);
      metrics.file++;
      return handleFile(path, virtualPath);
    } else {
      return null;
    }
  };

  const processDirectory = async (directory, virtualDirectory) => {
    const entries = await readEntries(directory);
    console.log('process entries', entries);
    const promises = [];
    for (const entry of entries) {
      const path = join(directory, entry);
      if (!isExcluded(path) && !isRevisit(path)) {
        const virtualPath = join(virtualDirectory, entry);
        promises.push(
          Promise.resolve(handleNext(processEntry, path, virtualPath))
        );
      }
    }
    return Promise.all(promises);
  };

  await processDirectory(resolve(root), '/');
  return metrics;
}
