/* © 2019-2020 Robert Grimm */

import { basename, join } from 'path';
import { didPoll, default as Executor, newPromiseCapability } from '@grr/async';
import harness from './harness.js';
import { tmpdir } from 'os';
import { mkdir, rmdir, symlink, toDirectory, writeFile } from '@grr/fs';
import walk from '@grr/walk';

const DOT = '.'.charCodeAt(0);
const root = join(toDirectory(import.meta.url), '../packages');
const asyncdir = join(root, 'async');
const walkdir = join(root, 'walk');

harness.test('@grr/walk', async t => {
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
    '/builder/LICENSE',
    '/builder/README.md',
    '/builder/builder.js',
    '/builder/context.js',
    '/builder/package.json',
    '/builder/transform.js',
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
    '/html/schema.js',
    '/inventory/LICENSE',
    '/inventory/README.md',
    '/inventory/inventory.js',
    '/inventory/kind.js',
    '/inventory/package.json',
    '/loader/LICENSE',
    '/loader/README.md',
    '/loader/call.js',
    '/loader/dummy.js',
    '/loader/invoke.js',
    '/loader/launch.js',
    '/loader/loader.js',
    '/loader/package.json',
    '/metrics/LICENSE',
    '/metrics/README.md',
    '/metrics/metrics.js',
    '/metrics/package.json',
    '/oddjob/LICENSE',
    '/oddjob/README.md',
    '/oddjob/builtin.js',
    '/oddjob/candy.js',
    '/oddjob/error.js',
    '/oddjob/format.js',
    '/oddjob/package.json',
    '/oddjob/pickle.js',
    '/oddjob/string.js',
    '/oddjob/types.js',
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
    '/rollcall/LICENSE',
    '/rollcall/README.md',
    '/rollcall/package.json',
    '/rollcall/rollcall.js',
    '/run/LICENSE',
    '/run/README.md',
    '/run/package.json',
    '/run/run.js',
    '/schemata/LICENSE',
    '/schemata/README.md',
    '/schemata/context.js',
    '/schemata/package.json',
    '/schemata/schemata.js',
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
    __proto__: null,
    readdir: 3,
    entries: 24,
    lstat: 11,
    realpath: 0,
    file: 8,
  });

  // ---------------------------------------------------------------------------
  // A longer walk with concurrent tasks.

  actualFiles.length = 0;
  const executor = new Executor();

  ({ done, metrics } = walk(root, {
    isExcluded: path => path.includes('node_modules'),
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
    __proto__: null,
    readdir: 17,
    entries: 100,
    lstat: 100,
    realpath: 0,
    file: 83,
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
    t.fail('should not throw');
  } catch (x) {
    t.pass('should throw');
  }
  t.equal(actualFiles.length, 0);

  // ---------------------------------------------------------------------------
  // Let's Link a Little

  const tmp = join(tmpdir(), 'walk.js');
  const dir = join(tmp, 'dir');
  const dirdir = join(dir, 'dir');

  try {
    await rmdir(tmp, { recursive: true });
    await mkdir(dirdir);
    await writeFile(join(tmp, 'file'), 'file', 'utf8');
    await writeFile(join(dir, 'file'), 'nested file', 'utf8');
    await writeFile(join(dirdir, 'file'), 'deeply nested file', 'utf8');
    await symlink(tmp, join(dirdir, 'backToTheTop'));
    await symlink(join(tmp, 'file'), join(dirdir, 'backToTheFirstFile'));

    actualFiles.length = 0;
    ({ done } = walk(tmp, {
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

    const lines = [];
    ({ done } = walk(tmp, {
      debug: true,
      println: line => lines.push(line),
    }));
    await done;

    const pat1 = (p, vp, t) => {
      if (!t) [vp, t] = [p, vp];
      return new RegExp(
        `^# @grr/walk: lstat\\([\\w/]+?/walk.js${p}, ${vp}\\) -> \\{${t}\\}$`,
        'u'
      );
    };

    t.match(lines[0], pat1('', '/', 'directory'));
    t.match(lines[2], pat1('/dir', 'directory'));
    t.match(lines[4], pat1('/dir/dir', 'directory'));
    t.match(lines[6], pat1('/dir/dir/backToTheFirstFile', 'symlink'));
    t.match(lines[8], pat1('/file', '/dir/dir/backToTheFirstFile', 'file'));
    t.match(lines[10], pat1('/dir/dir/backToTheTop', 'symlink'));
    t.match(lines[12], pat1('/dir/dir/file', 'file'));
    t.match(lines[14], pat1('/dir/file', 'file'));

    const pat2 = (p, vp, t) => {
      if (!t) [vp, t] = [p, vp];
      return new RegExp(
        `^# @grr/walk: emit\\(${t}, [\\w/]+?/walk.js${p}, ${vp}, \\{${t}\\}\\)$`,
        'u'
      );
    };

    t.match(lines[1], pat2('', '/', 'directory'));
    t.match(lines[3], pat2('/dir', 'directory'));
    t.match(lines[5], pat2('/dir/dir', 'directory'));
    t.match(lines[7], pat2('/dir/dir/backToTheFirstFile', 'symlink'));
    t.match(lines[9], pat2('/file', '/dir/dir/backToTheFirstFile', 'file'));
    t.match(lines[11], pat2('/dir/dir/backToTheTop', 'symlink'));
    t.match(lines[13], pat2('/dir/dir/file', 'file'));
    t.match(lines[15], pat2('/dir/file', 'file'));
  } finally {
    await rmdir(tmp, { recursive: true });
  }

  // ---------------------------------------------------------------------------
  // Low-Level Error Handling

  const makePuppet = () => {
    return function puppet(...args) {
      puppet.in = args;
      puppet.out = newPromiseCapability();
      return puppet.out.promise;
    };
  };

  const mockReaddir = makePuppet();
  const mockLstat = makePuppet();
  const mockRealpath = makePuppet();

  mockReaddir();
  mockLstat();
  mockRealpath();

  const fauxDirStatus = {
    isDirectory() {
      return true;
    },
    isFile() {
      return false;
    },
    isSymbolicLink() {
      return false;
    },
  };

  const traceData = [];
  const trace = (...args) => traceData.push(args);

  // ---------------------------------------- Low-Level Walk #1

  ({ on, done } = walk(root, {
    ignoreNoEnt: true,
    lstat: mockLstat,
    readdir: mockReaddir,
    realpath: mockRealpath,
  }));

  on('directory', trace);
  on('file', trace);
  on('symlink', trace);

  done.then(
    () => t.fail('should not resolve'),
    x => t.equal(x.message, 'hell')
  );

  await didPoll();
  mockRealpath.out.resolve('/root');
  await didPoll();
  mockLstat.out.resolve(fauxDirStatus);
  await didPoll();
  mockReaddir.out.resolve(['a', 'b', 'c']);

  await didPoll();
  let x = new Error('heaven');
  x.code = 'ENOENT';
  let last = mockLstat.out;
  mockLstat.out.reject(x);

  await didPoll();
  x = new Error('hell');
  x.code = 'EHELL';
  t.notEqual(mockLstat.out, last);
  mockLstat.out.reject(x);

  await didPoll();

  // ---------------------------------------- Low-Level Walk #2

  ({ done } = walk(root, {
    ignoreNoEnt: true,
    lstat: mockLstat,
    readdir: mockReaddir,
    realpath: mockRealpath,
  }));

  on('directory', trace);
  on('file', trace);
  on('symlink', trace);

  await didPoll();
  mockRealpath.out.resolve('/root');
  await didPoll();
  mockLstat.out.resolve(fauxDirStatus);

  await didPoll();
  x = new Error('oops');
  x.code = 'ENOENT';
  last = mockReaddir.out;
  mockReaddir.out.reject(x);

  await done;

  // ---------------------------------------- Low-Level Walk #3

  ({ done } = walk(root, {
    ingoreNoEnt: true,
    lstat: mockLstat,
    readdir: mockReaddir,
    realpath: mockRealpath,
  }));

  on('directory', trace);
  on('file', trace);
  on('symlink', trace);

  await didPoll();
  mockRealpath.out.resolve('/root');
  await didPoll();
  mockLstat.out.resolve(fauxDirStatus);

  await didPoll();
  x = new Error('boom');
  x.code = 'EBOOM';
  t.notEqual(mockReaddir.out, last);
  mockReaddir.out.reject(x);

  try {
    await done;
    t.fail('should throw');
  } catch (x) {
    t.equal(x.message, 'boom');
  }

  t.end();
});
