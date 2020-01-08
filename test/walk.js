/* © 2019-2020 Robert Grimm */

import { didPoll, default as Executor, newPromiseCapability } from '@grr/async';
import { basename, join } from 'path';
import walk from '@grr/walk';
import tap from 'tap';
import { toDirectory } from '@grr/fs';

const DOT = '.'.charCodeAt(0);
const root = join(toDirectory(import.meta.url), '../packages');
const asyncdir = join(root, 'async');
const walkdir = join(root, 'walk');

tap.test('@grr/walk', async t => {
  t.throws(() => walk(42), /Expected values to be strictly equal/u);
  t.throws(
    () => walk('.', { isExcluded: 665 }),
    /Expected values to be strictly equal/u
  );
  t.throws(
    () => walk('.', { onFile: 'nail' }),
    /Expected values to be strictly equal/u
  );
  t.throws(
    () => walk('.', { run: {} }),
    /Expected values to be strictly equal/u
  );

  // ---------------------------------------------------------------------------

  const isExcluded = path => {
    if (
      path === asyncdir ||
      path.startsWith(asyncdir + '/') ||
      path === walkdir ||
      path.startsWith(walkdir + '/')
    ) {
      const file = basename(path);
      if (file.charCodeAt(0) !== DOT) return false;
    }
    return true;
  };

  const expectedDirectoriesShortWalk = ['/', '/async', '/walk'];

  const expectedFilesShortWalk = [
    '/async/LICENSE',
    '/async/README.md',
    '/async/async.js',
    '/async/package.json',
    '/walk/LICENSE',
    '/walk/README.md',
    '/walk/package.json',
    '/walk/walk.js',
  ];

  const expectedFiles = [
    ...expectedFilesShortWalk.slice(0, 4),
    '/fs/LICENSE',
    '/fs/README.md',
    '/fs/fs.js',
    '/fs/package.json',
    '/glob/LICENSE',
    '/glob/README.md',
    '/glob/glob.js',
    '/glob/package.json',
    '/html/LICENSE',
    '/html/README.md',
    '/html/model.js',
    '/html/model.json',
    '/html/package.json',
    '/options/LICENSE',
    '/options/README.md',
    '/options/options.js',
    '/options/package.json',
    '/proact/LICENSE',
    '/proact/README.md',
    '/proact/index.js',
    '/proact/package.json',
    '/proact/render.js',
    '/proact/vdom.js',
    '/reloader/LICENSE',
    '/reloader/README.md',
    '/reloader/config.js',
    '/reloader/hook.js',
    '/reloader/package.json',
    '/sequitur/LICENSE',
    '/sequitur/README.md',
    '/sequitur/examples.js',
    '/sequitur/package.json',
    '/sequitur/sequitur.js',
    ...expectedFilesShortWalk.slice(4),
  ];

  // ---------------------------------------------------------------------------
  // A short walk() with the default executor run().

  const actualFiles = [];
  let { on, abort, done, metrics } = walk(root, {
    isExcluded,
    onFile(_, __, vpath) {
      actualFiles.push(vpath);
    },
  });

  await done;

  t.strictSame(actualFiles.sort(), expectedFilesShortWalk);
  t.strictSame(metrics, {
    readdir: 3,
    entries: 17,
    lstat: 10,
    realpath: 0,
    file: 8,
  });

  // ---------------------------------------------------------------------------
  // A longer walk with concurrent tasks.

  actualFiles.length = 0;
  const executor = new Executor();

  ({ done, metrics } = walk(root, {
    onFile(_, __, vpath) {
      actualFiles.push(vpath);
    },
    run(...args) {
      return { done: executor.run(...args) };
    },
  }));

  await done;

  t.strictSame(actualFiles.sort(), expectedFiles);
  t.strictSame(metrics, {
    readdir: 10,
    entries: 50,
    lstat: 50,
    realpath: 0,
    file: 41,
  });

  // ---------------------------------------------------------------------------
  // A Short Walk Over Directories

  actualFiles.length = 0;
  ({ on, done } = walk(root, { isExcluded }));

  const undo = on('file', (_, __, vpath) => actualFiles.push(vpath));
  on('directory', (_, __, vpath) => actualFiles.push(vpath));
  undo();

  await done;
  t.strictSame(actualFiles.sort(), expectedDirectoriesShortWalk);

  // ---------------------------------------------------------------------------
  // Another Short Walk That Wasn't

  actualFiles.length = 0;
  ({ on, abort, done } = walk(root, {
    onFile(_, __, vpath) {
      actualFiles.push(vpath);
    },
  }));

  abort(new Error('HALT'));

  try {
    await done;
    t.fail('should throw');
  } catch (x) {
    t.pass('should throw');
  }
  t.equal(actualFiles.length, 0);

  // ---------------------------------------------------------------------------
  // Let's Link a Little

  const fixed = t.testdir({
    file: 'file',
    dir: {
      file: 'nested file',
      dir: {
        file: 'deeply nested file',
        backToTheTop: t.fixture('symlink', '../..'),
        backToTheFirstFile: t.fixture('symlink', '../../file'),
      },
    },
  });

  actualFiles.length = 0;
  ({ done } = walk(fixed, {
    onFile(_, __, vpath) {
      actualFiles.push(vpath);
    },
  }));

  await done;
  t.strictSame(actualFiles.sort(), [
    '/dir/dir/backToTheFirstFile',
    '/dir/dir/file',
    '/dir/file',
  ]);

  // ---------------------------------------------------------------------------
  // Low-Level Error Handling

  const makePuppet = () => {
    return function puppet(...args) {
      puppet.in = args;
      puppet.out = newPromiseCapability();
      return puppet.out.promise;
    };
  };

  const mockdir = makePuppet();
  const mockstat = makePuppet();
  mockdir();
  mockstat();
  const traceData = [];
  const trace = (...args) => traceData.push(args);

  // ---------------------------------------- Low-Level Walk #1

  ({ on, done } = walk(root, {
    ignoreNoEnt: true,
    readdir: mockdir,
    lstat: mockstat,
  }));

  on('directory', trace);
  on('file', trace);
  on('symlink', trace);

  done.then(
    () => t.fail(),
    x => t.equal(x.message, 'hell')
  );

  await didPoll();
  mockdir.out.resolve(['a', 'b', 'c']);

  await didPoll();
  let x = new Error('heaven');
  x.code = 'ENOENT';
  let last = mockstat.out;
  mockstat.out.reject(x);

  await didPoll();
  x = new Error('hell');
  x.code = 'EHELL';
  t.notEqual(mockstat.out, last);
  mockstat.out.reject(x);

  await didPoll();

  // ---------------------------------------- Low-Level Walk #2

  ({ done } = walk(root, {
    ignoreNoEnt: true,
    readdir: mockdir,
  }));

  on('directory', trace);
  on('file', trace);
  on('symlink', trace);

  await didPoll();
  x = new Error('oops');
  x.code = 'ENOENT';
  last = mockdir.out;
  mockdir.out.reject(x);

  // ---------------------------------------- Low-Level Walk #3

  ({ done } = walk(root, {
    ingoreNoEnt: true,
    readdir: mockdir,
  }));

  on('directory', trace);
  on('file', trace);
  on('symlink', trace);

  await didPoll();
  x = new Error('boom');
  x.code = 'EBOOM';
  t.notEqual(mockdir.out, last);
  mockdir.out.reject(x);

  try {
    await done;
    t.fail();
  } catch (x) {
    t.equal(x.message, 'boom');
  }

  t.end();
});
