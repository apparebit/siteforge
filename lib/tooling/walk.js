/* © 2019 Robert Grimm */

import { basename, join, posix, resolve } from 'path';
import { lstat, readdir, realpath } from './fs.js';

const DOT = '.'.charCodeAt(0);
const isDotFile = p => basename(p).charCodeAt(0) === DOT;
const { join: posixJoin } = posix;
const swallowError = x => {
  if (x.code === 'ENOENT') {
    return true;
  } else {
    throw x;
  }
};

/**
 * A file system walk. The walk itself is almost entirely implemented by
 * `Walk`'s only method `go()`. The only reason that asynchronous generator is
 * not a standalone function is to provide straightforward access to summary
 * `metrics` upon completion of a walk:
 *
 *   * `directory`: The number of directories read via `readdir`;
 *   * `entry`: The number of directory entries returned by `readdir`;
 *   * `status`: The number of status accesses via `lstat`;
 *   * `symlink`: The number of symbolic links resolved via `realpath`;
 *   * `file`: The number of files yielded from the generator.
 *
 * The number of directories read combined with the number of files yielded may
 * be smaller than the number of entries returned, since some entities may be
 * skipped.
 *
 * ## Interface Design
 *
 * Having a class with a few fields and a single method seems a bit odd. But
 * when using just an asynchronous generator function, the only options for
 * accessing a walk's metrics are to either return or throw that data upon
 * closing the generator. The former precludes access from JavaScript's built-in
 * `for-of` loop and the latter abuses exceptions as a data channel. Against
 * that backdrop, creating a class as state container seems cleaner and simpler.
 *
 * ## Walk Semantics and Termination
 *
 * Ensuring that a file system walk returns only unique resources and eventually
 * terminates seems simple enough. After all, directories and files form a nice,
 * clean hierarchical name space. However, with hard links, that hierarchy
 * becomes a DAG, with some resources now reachable through more than one path.
 * Furthermore, with soft links, that hierarchy gains possible back edges,
 * otherwise known as cycles. That raises the question of how to uniquely
 * identify file system entities in order to avoid duplicates and cycles.
 *
 * Since i-node numbers and other, similar low-level file system data are
 * neither meaningful across volumes nor meaningful across operating systems,
 * this module implements the following name-based strategy:
 *
 *   * A file with multiple hard links is treated as multiple resources that
 *     happen to have the same content. That is acceptable as long as the
 *     application need not modify files in place.
 *   * Symbolic links are transparently followed. To avoid revisiting resources,
 *     a walk uses absolute and real paths as unique identifiers. To still
 *     present a coherent name space, the walk also maintains a virtual path.
 *
 * ### The Virtual Path
 *
 * The virtual path `vpath` starts at `/` instead of the given root directory
 * and only changes by exactly one segment as the walk processes directories and
 * their entries. In contrast, the actual path may change arbitrarily as the
 * walk processes a symbolic link. For example, consider a directory with a
 * single entry:
 *
 *     $ pwd
 *     /siteforge/lib/tooling
 *     $ readlink somewhere
 *     somewhere -> /apparebit.com/content/about
 *
 * If a walk started with directory `/siteforge` and is now processing the
 * symbolic link inside the `lib` subdirectory, it updates the current `path` to
 * the absolute and real path `/apparebit.com/content/about` but the virtual
 * path `vpath` to `/lib/somewhere`.
 *
 * ### Traversal Order
 *
 * The above rules for traversing the file system are not sufficient for
 * ensuring predictable traversal results. The problem is that `readdir` does
 * not guarantee a deterministic order for returning a given directory's
 * entries. However, in the presence of symbolic links, that order may very well
 * determine the `vpath` entries yielded by a walk. For instance, walking a
 * directory with a file `file` and a symbolic link `link` to that same file may
 * yield either `file` or `link` as the only entry in the absence of order
 * guarantees. For that reason, the implementation sorts a directory's entries
 * based on UTF-16 code units.
 */
export default class Walk {
  /**
   * Walk the file system from the given `root` directory. This static method
   * bundles creation of the `Walk` instance and the call to `go()` into one
   * method for client code that that does not need to access walk metrics.
   */
  static walk(root, options) {
    return new Walk(root, options).go();
  }

  /** Create a new file system walk. */
  constructor(root, { isExcluded = isDotFile } = {}) {
    if (typeof root !== 'string') {
      throw new Error(`Root for file system walk "${root}" is not a path`);
    }
    this.root = root;
    this.isExcluded =
      typeof isExcluded === 'function' ? isExcluded : () => false;
  }

  /** Start the file system walk. This method may be invoked more than once. */
  async *go() {
    this.metrics = {
      directory: 0,
      entry: 0,
      file: 0,
      status: 0,
      symlink: 0,
    };

    const visitedPaths = new Set();
    const doNotRevisit = path => {
      const visited = visitedPaths.has(path);
      if (!visited) visitedPaths.add(path);
      return visited;
    };

    const readStatus = async path => {
      this.metrics.status++;
      const status = await lstat(path);
      if (status.isDirectory()) path += '/';
      const skip = doNotRevisit(path) || this.isExcluded(path);
      return { path, status, skip };
    };

    const pending = [{ path: resolve(this.root), vpath: '/', asset: false }];
    while (pending.length > 0) {
      let { path: directory, vpath: vparent, asset } = pending.shift();
      let entries;

      try {
        this.metrics.directory++;
        entries = await readdir(directory);
        this.metrics.entry += entries.length;
      } catch (x) {
        if (swallowError(x)) continue;
      }

      if (entries.includes('.assets')) asset = true;
      nextEntry: for (let entry of entries.sort()) {
        const vpath = posixJoin(vparent, entry);
        let path, status, skip;

        try {
          path = join(directory, entry);
          ({ path, status, skip } = await readStatus(path));
          if (skip) continue;
        } catch (x) {
          if (swallowError(x)) continue;
        }

        while (status.isSymbolicLink()) {
          this.metrics.symlink++;
          try {
            path = await realpath(path);
            ({ path, status, skip } = await readStatus(path));
            if (skip) continue nextEntry;
          } catch (x) {
            if (swallowError(x)) continue nextEntry;
          }
        }

        if (status.isDirectory()) {
          // Directory metric updated upon readdir.
          pending.push({ path, vpath, asset });
        } else if (status.isFile()) {
          this.metrics.file++;
          yield { type: 'file', path, vpath, asset };
        }
      }
    }
  }
}
