/* © 2019-2020 Robert Grimm */

import { basename, join, posix } from 'path';
import { promises } from 'fs';
import { strict as assert } from 'assert';

const { apply } = Reflect;
const { assign, create } = Object;
const DIRECTORY = 'directory';
const DOT = '.'.charCodeAt(0);
const FILE = 'file';
const { join: posixJoin } = posix;
const SYMLINK = 'symlink';

const entity = status =>
  status.isDirectory()
    ? 'directory'
    : status.isFile()
    ? 'file'
    : status.isSymbolicLink()
    ? 'symlink'
    : 'unknown';

const makeTrace = println => (operation, ...args) => {
  const fragments = ['# @grr/walk: ', operation, '('];
  const format = value => {
    if (value != null && typeof value.isDirectory === 'function') {
      fragments.push(`{${entity(value)}}`);
    } else {
      fragments.push(String(value));
    }
  };

  let result;
  if (operation === 'lstat') {
    result = args.pop();
  }

  for (const [index, arg] of args.entries()) {
    format(arg);
    if (index < args.length - 1) {
      fragments.push(', ');
    }
  }
  fragments.push(')');

  if (result) {
    fragments.push(' -> ');
    format(result);
  }

  println(fragments.join(''));
};

export default function walk(
  root,
  {
    // Debugging
    debug = false,
    println = console.error,

    // Robustness, Trivial Excludes
    ignoreNoEnt = false,
    isExcluded = path => basename(path).charCodeAt(0) === DOT,

    // Task Scheduling
    run = (fn, that, ...args) => apply(fn, that, args),

    // Application-Level Callbacks
    onDirectory = undefined,
    onFile = undefined,
    onSymlink = undefined,

    // File System Primitives
    lstat = promises.lstat,
    readdir = promises.readdir,
    realpath = promises.realpath,
  } = {}
) {
  assert.equal(typeof root, 'string');
  assert.equal(typeof isExcluded, 'function');
  if (onDirectory !== undefined) assert.equal(typeof onDirectory, 'function');
  if (onFile !== undefined) assert.equal(typeof onFile, 'function');
  if (onSymlink !== undefined) assert.equal(typeof onSymlink, 'function');
  assert.equal(typeof run, 'function');

  // ---------------------------------------------------------------------------

  // BASIC STATISTICS: The counts of asynchronous I/O operations and event
  // notifications are a reasonable starting point. Latency might also be
  // interesting.
  const metrics = assign(create(null), {
    readdir: 0,
    entries: 0,
    lstat: 0,
    realpath: 0,
    file: 0,
  });

  // TRACE key operations of walk when debugging is enabled.
  const trace = debug ? makeTrace(println) : () => {};

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
  let activeEntries = 1; // Account for initial processEntry().
  const aboutToProcess = entries => (activeEntries += entries.length);
  const doneWithEntry = () => {
    activeEntries--;
    if (activeEntries === 0) resolveWalk(metrics);
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

  // ---------------------------------------------------------------------------
  // nano-EVENT-EMITTER:
  //  * Check for valid event names unlike Node.js.
  //    That implies that event names are static and cannot be extended.
  //  * Return undo() from registration unlike Node.js.
  //  * Deliver events synchronously just like Node.js.
  const registry = new Map();
  registry.set(DIRECTORY, onDirectory ? [onDirectory] : []);
  registry.set(FILE, onFile ? [onFile] : []);
  registry.set(SYMLINK, onSymlink ? [onSymlink] : []);

  const on = (event, handler) => {
    assert.ok(registry.has(event));
    assert.equal(typeof handler, 'function');

    const handlers = registry.get(event);
    handlers.push(handler);

    let undone = false;
    return () => {
      if (!undone) {
        undone = true;
        handlers.splice(handlers.indexOf(handler), 1);
      }
    };
  };

  const emit = (event, ...args) => {
    if (debug) trace('emit', event, ...args);
    assert(registry.has(event));
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
      status = await lstat(path, { bigint: true });
      if (debug) trace('lstat', path, virtualPath, status);
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
    aboutToProcess(entries);

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
  // START WALK after determining root's real path. Since that operation is
  // asynchronous, the caller of this function can register event handlers upon
  // return. Pass real path to processEntry(), since it handles arbitrary file
  // system entities.
  realpath(root).then(root => processEntry(root, '/'));
  return { on, abort, done, metrics };
}
