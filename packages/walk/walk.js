/* © 2019-2020 Robert Grimm */

import { basename, join, posix, resolve } from 'path';
import { promises } from 'fs';
import { strict } from 'assert';

const { apply } = Reflect;
const DIRECTORY = 'directory';
const DOT = '.'.charCodeAt(0);
const FILE = 'file';
const { nextTick } = process;
const { join: posixJoin } = posix;
const SYMLINK = 'symlink';

export default function walk(
  root,
  {
    ignoreNoEnt = false,
    isExcluded = path => basename(path).charCodeAt(0) === DOT,
    onFile = undefined,
    run = (fn, that, ...args) => apply(fn, that, args),
    lstat = promises.lstat,
    readdir = promises.readdir,
    realpath = promises.realpath,
  } = {}
) {
  strict.equal(typeof root, 'string');
  strict.equal(typeof isExcluded, 'function');
  if (onFile !== undefined) strict.equal(typeof onFile, 'function');
  strict.equal(typeof run, 'function');

  // ---------------------------------------------------------------------------

  // PROMISE of TERMINATION: The developer experience for distinct `end` and
  // `exit` events is far less compelling than a promise for termination. It
  // covers both successful and unsuccessful runs and integrates with
  // async/await.

  let resolveWalk, rejectWalk;
  const done = new Promise((yay, nay) => {
    resolveWalk = yay;
    rejectWalk = nay;
  });

  // DETECT TERMINATION: If the number of file system entries that have been
  // read but have not yet been fully processed reaches zero, the walk is
  // complete. This test is very lightweight and easy to implement. It holds as
  // long as the entries of a directory are added to the count __before__
  // removing the parent from the count.

  let activeEntries = 0;
  const readInEntries = entries => (activeEntries += entries.length);
  const doneWithEntry = () => {
    activeEntries--;
    if (activeEntries === 0) resolveWalk();
  };

  // FORCED TERMINATION: Whether you call it abort(), cancel(), or stop(), the
  // semantics are those of best effort tear down.

  let aborted = false;
  const abort = x => {
    aborted = true;
    rejectWalk(x);
  };

  // AVOID REPETITION: Use non-virtual file system path to detect namespace
  // cycles.

  const visited = new Set();
  const hasVisited = path => visited.has(path);
  const willVisit = path => visited.add(path);

  // BASIC STATISTICS: The counts of asynchronous I/O operations and event
  // notifications are a reasonable starting point. Latency might also be
  // interesting.

  const metrics = {
    readdir: 0,
    entries: 0,
    lstat: 0,
    realpath: 0,
    file: 0,
  };

  // ---------------------------------------------------------------------------

  // nano-EVENT-EMITTER:
  //  * Check for valid event names unlike Node.js.
  //    That implies that event names are static and cannot be extended.
  //  * Return undo() from registration unlike Node.js.
  //  * Deliver events synchronously just like Node.js.

  const registry = new Map();
  registry.set(SYMLINK, []);
  registry.set(DIRECTORY, []);
  registry.set(FILE, onFile ? [onFile] : []);

  const on = (event, handler) => {
    strict.ok(registry.has(event));
    strict.equal(typeof handler, 'function');

    const handlers = registry.get(event);
    handlers.push(handler);

    let undone = false;
    return () => {
      if (!undone) {
        undone = true;
        const index = handlers.indexOf(handler);
        strict.ok(index >= 0);
        handlers.splice(index, 1);
      }
    };
  };

  const emit = (event, ...args) => {
    strict.ok(registry.has(event));
    const handlers = registry.get(event).slice();
    for (const handler of handlers) {
      handler(event, ...args);
    }
  };

  // ---------------------------------------------------------------------------

  // PROCESS ENTRY by following a symbolic link until there is none and then
  // handling directories and files separately. Directories are handled
  // recursively by reading in the entries and then processing them one by one.

  const doProcessEntry = async (path, virtualPath) => {
    let status;

    while (true) {
      willVisit(path);
      metrics.lstat++;
      status = await lstat(path);
      if (aborted) return;
      if (!status.isSymbolicLink()) break;

      emit(SYMLINK, path, virtualPath, status);
      metrics.realpath++;
      path = await realpath(path);
      if (aborted || isExcluded(path) || hasVisited(path)) return;
    }

    if (status.isDirectory()) {
      emit(DIRECTORY, path, virtualPath, status);
      // We must await here to satisfy the activeEntries invariant.
      await processDirectory(path, virtualPath);
    } else if (status.isFile()) {
      metrics.file++;
      emit(FILE, path, virtualPath, status);
    }
  };

  const processEntry = async (path, virtualPath) => {
    try {
      // We must await here to satisfy the activeEntries invariant.
      await doProcessEntry(path, virtualPath);
    } catch (x) {
      if (ignoreNoEnt && x.code === 'ENOENT') return;
      abort(x);
    } finally {
      doneWithEntry();
    }
  };

  const readEntries = async path => {
    try {
      metrics.readdir++;
      const entries = await readdir(path);
      metrics.entries += entries.length;
      return entries.sort();
    } catch (x) {
      if (ignoreNoEnt && x.code === 'ENOENT') return [];
      abort(x);
      return [];
    }
  };

  const processDirectory = async (directory, virtualDirectory) => {
    const entries = await readEntries(directory);
    readInEntries(entries);

    for (const entry of entries) {
      const path = join(directory, entry);
      if (!isExcluded(path) && !hasVisited(path)) {
        const virtualPath = posixJoin(virtualDirectory, entry);
        await run(processEntry, null, path, virtualPath);
      } else {
        doneWithEntry();
      }
      if (aborted) break;
    }
  };

  // ---------------------------------------------------------------------------

  // Delay lift off, so that caller can attach event handlers. Also, manually
  // emit directory event for root, albeit without the status common to others.
  nextTick(() => {
    root = resolve(root);
    emit(DIRECTORY, root, '/');
    processDirectory(root, '/');
  });
  return { on, abort, done, metrics };
}
