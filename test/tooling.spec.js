/**
 * @module test/tooling
 * @copyright (C) 2019 Robert Grimm
 */

import {
  directory,
  readFile,
  slashed,
  createGlobMatcher,
} from '../lib/tooling/fs.js';
import { escapeRegex, withRightsNotice } from '../lib/tooling/text.js';
import { join, relative } from 'path';
import getopt from '../lib/tooling/getopt.js';
import {
  injectIntoPath,
  sha256,
  writeVersionedFile,
} from '../lib/tooling/versioning.js';
import { nearestManifest } from '../lib/tooling/manifest.js';
import run from '../lib/tooling/run.js';
import tap from 'tap';
import { tmpdir } from 'os';
import walk from '../lib/tooling/walk.js';

const APPAREBIT = 'https://apparebit.com';
const { assign, keys: keysOf } = Object;
const DIRECTORY = directory(import.meta.url);
const { max } = Math;

// -----------------------------------------------------------------------------

tap.test('tooling/fs', t => {
  t.throws(() => createGlobMatcher('b**h**'));

  const PATHS = {
    text: 'file.txt',
    textDir1: 'dir1/file.txt',
    textDir2: 'dir1/dir2/file.txt',
    textDir3: 'dir1/dir2/dir3/file.txt',
    pdf: 'file.pdf',
    pdfDir: 'dir1/file.pdf',
    confusedFile: 'dir1/file.txt/real-file.txt',
    confusedDir: 'dir1/dir2',
    dir1: 'dir1/',
    dir2: 'dir1/dir2/',
    oops: 'dir1/dir2/filé.txt',
  };

  const applyToPaths = glob => {
    const test = createGlobMatcher(glob);
    return keysOf(PATHS).reduce((result, key) => {
      result[key] = test(PATHS[key]);
      return result;
    }, {});
  };

  const NOTHING_MATCHES = {
    text: false,
    textDir1: false,
    textDir2: false,
    textDir3: false,
    pdf: false,
    pdfDir: false,
    confusedFile: false,
    confusedDir: false,
    dir1: false,
    dir2: false,
    oops: false,
  };

  t.strictSame(applyToPaths(''), NOTHING_MATCHES);
  t.strictSame(applyToPaths('|'), NOTHING_MATCHES);

  t.strictSame(applyToPaths('**'), {
    text: true,
    textDir1: true,
    textDir2: true,
    textDir3: true,
    pdf: true,
    pdfDir: true,
    confusedFile: true,
    confusedDir: true,
    dir1: true,
    dir2: true,
    oops: true,
  });

  const FILE_DOT_TEXT_GLOB = {
    text: true,
    textDir1: true,
    textDir2: true,
    textDir3: true,
    pdf: false,
    pdfDir: false,
    confusedFile: false,
    confusedDir: false,
    dir1: false,
    dir2: false,
    oops: false,
  };

  t.strictSame(applyToPaths('file.txt'), FILE_DOT_TEXT_GLOB);
  t.strictSame(applyToPaths('**/file.txt'), FILE_DOT_TEXT_GLOB);
  t.strictSame(applyToPaths('**/**/file.txt'), FILE_DOT_TEXT_GLOB);

  t.strictSame(applyToPaths('dir1/'), {
    text: false,
    textDir1: false,
    textDir2: false,
    textDir3: false,
    pdf: false,
    pdfDir: false,
    confusedFile: false,
    confusedDir: false,
    dir1: true,
    dir2: false,
    oops: false,
  });

  t.strictSame(applyToPaths('dir1/dir2'), {
    text: false,
    textDir1: false,
    textDir2: false,
    textDir3: false,
    pdf: false,
    pdfDir: false,
    confusedFile: false,
    confusedDir: true,
    dir1: false,
    dir2: true,
    oops: false,
  });

  t.strictSame(applyToPaths('dir1/dir2/'), {
    text: false,
    textDir1: false,
    textDir2: false,
    textDir3: false,
    pdf: false,
    pdfDir: false,
    confusedFile: false,
    confusedDir: false,
    dir1: false,
    dir2: true,
    oops: false,
  });

  t.strictSame(applyToPaths('dir1/dir2/**'), {
    text: false,
    textDir1: false,
    textDir2: true,
    textDir3: true,
    pdf: false,
    pdfDir: false,
    confusedFile: false,
    confusedDir: false,
    dir1: false,
    dir2: true,
    oops: true,
  });

  t.strictSame(applyToPaths('*file*'), {
    text: true,
    textDir1: true,
    textDir2: true,
    textDir3: true,
    pdf: true,
    pdfDir: true,
    confusedFile: true,
    confusedDir: false,
    dir1: false,
    dir2: false,
    oops: false,
  });

  t.notOk(DIRECTORY.startsWith('file:'));
  t.ok(DIRECTORY.endsWith('/test'));

  t.strictEqual(slashed(APPAREBIT).href, APPAREBIT + '/');
  t.strictEqual(slashed(APPAREBIT + '/slasher').href, APPAREBIT + '/slasher/');
  t.strictEqual(slashed(APPAREBIT + '/slasher/').href, APPAREBIT + '/slasher/');
  t.end();
});

// -----------------------------------------------------------------------------

tap.test('tooling/getopt', t => {
  const configuration = getopt.defaults();
  assign(configuration, {
    'dry-run': Boolean,
    wetRun: Boolean,
    path: String,
    round: Number,
  });

  // prettier-ignore
  const options = getopt(
    [
      '-vv',
      '-qqq',
      'whatever',
      '--wetRun',
      '--wet-run',
      '--round', '665',
      '--dry-run',
      '--path', '<path>',
      'everwhat',
      '--help',
    ],
    configuration
  );

  t.strictSame(options._, ['whatever', 'everwhat']);
  t.strictEqual(options.help, 1);
  t.strictEqual(options.path, '<path>');
  t.strictEqual(options.quiet, 3);
  t.strictEqual(options.round, 665);
  t.strictEqual(options.verbose, 2);
  t.strictEqual(options.version, 0);
  t.strictEqual(options.volume, -1);
  t.strictEqual(options.wetRun, 2);
  t.strictEqual(options['dry-run'], 1);
  t.strictEqual(keysOf(options).length, 10);

  configuration.r = 'round';
  configuration._ = (arg, reportError) => {
    if (arg !== 'whatever') reportError(`"whatever" not "${arg}"`);
    return arg;
  };

  t.throws(
    () =>
      getopt(
        ['-x', '-r', '--path', '-x', 'whatever', 'everwhat', '--round'],
        configuration
      ),
    new RegExp(
      escapeRegex(
        [
          'option "x" derived from argument "-x" is unknown',
          'option "round" derived from argument "-r" must be flag',
          'option "path" derived from argument "--path" has flag "-x" as value',
          '"whatever" not "everwhat"',
          'option "round" derived from argument "--round" is last argument but requires value',
        ].join('; ')
      ),
      'u'
    )
  );

  t.strictSame(getopt(['--round', '3', '--', '--not-a-flag'], configuration), {
    _: ['--not-a-flag'],
    'dry-run': 0,
    help: 0,
    quiet: 0,
    round: 3,
    verbose: 0,
    version: 0,
    volume: 0,
    wetRun: 0,
  });

  t.end();
});

// -----------------------------------------------------------------------------

tap.test('tooling/manifest', async t => {
  const path = join(DIRECTORY, '..', 'package.json');

  let start = Date.now();
  const entry1 = await nearestManifest(DIRECTORY);
  const duration1 = max(Date.now() - start, 1); // Avoid 0 duration.
  t.strictEqual(entry1.path, path);
  t.strictEqual(entry1.data.name, '@grr/siteforge');

  start = Date.now();
  const entry2 = await nearestManifest(DIRECTORY);
  const duration2 = max(Date.now() - start, 1); // Avoid 0 duration.
  t.strictEqual(entry2.path, path);
  t.strictEqual(entry2.data.name, '@grr/siteforge');

  t.comment(
    `nearestManifest(): cache miss = ${String(duration1).padStart(3)}ms`
  );
  t.comment(
    `nearestManifest(): cache hit  = ${String(duration2).padStart(3)}ms`
  );
  t.ok(duration1 >= duration2); // One would hope that to hold...

  t.end();
});

// -----------------------------------------------------------------------------

tap.test('tooling/run', async t => {
  const { stdout, stderr } = await run('printf', ['Hello, world!'], {
    stdio: 'buffer',
  });
  t.strictEqual(stdout, 'Hello, world!');
  t.strictEqual(stderr, '');

  t.rejects(
    () => run('sh', ['-c', 'exit 42']),
    /^child process failed with exit code "42" \(sh -c "exit 42"\)/u
  );

  t.end();
});

// -----------------------------------------------------------------------------

tap.test('tooling/text', t => {
  t.strictEqual(escapeRegex('[1.1.0]'), '\\[1\\.1\\.0\\]');
  t.strictEqual(withRightsNotice('code', undefined), 'code');
  t.strictEqual(withRightsNotice('code', 'notice'), '/* notice */ code');
  t.end();
});

// -----------------------------------------------------------------------------

tap.test('tooling/versioning', async t => {
  const tmp = tmpdir();
  const path = join(tmp, 'hello.txt');
  const vp = join(tmp, 'hello.2QFMRi.txt');
  const data = 'Hello, world!\n';

  // Hash.
  t.strictEqual(
    sha256(data, false),
    '2QFMRiSESqW6wxR3PWtomtRn+k4dGlChuKmdWpX3L/U='
  );

  // Path injection.
  t.strictEqual(
    injectIntoPath(path, 'ha/s+h-lalala'),
    join(tmp, 'hello.ha_s-h.txt')
  );

  // Versioned file.
  let actual = await writeVersionedFile(path, data);
  t.strictEqual(actual, vp);
  t.strictEqual(await readFile(vp, 'utf8'), data);

  t.end();
});

// -----------------------------------------------------------------------------

const LIBRARY_PATH = join(DIRECTORY, '../lib');
const LIBRARY_FILES = new Set([
  'config.js',
  'usage.txt',
  'reloader/config.js',
  'reloader/hook.js',
  'reloader/package.json',
  'task/build-htaccess.js',
  'task/build-markup.js',
  'task/build-script.js',
  'task/build-style.js',
  'task/build.js',
  'task/deploy.js',
  'task/validate-markup.js',
  'tooling/fs.js',
  'tooling/getopt.js',
  'tooling/logger.js',
  'tooling/manifest.js',
  'tooling/run.js',
  'tooling/text.js',
  'tooling/versioning.js',
  'tooling/walk.js',
]);

tap.test('tooling/walk', async t => {
  let count = 0;

  for await (const entry of walk(LIBRARY_PATH)) {
    t.strictEqual(entry.type, 'file');
    const path = relative(LIBRARY_PATH, entry.path);
    t.ok(
      LIBRARY_FILES.has(path),
      `walk() encounters only site:forge's own modules in "lib"`
    );
    count++;
  }

  t.strictEqual(count, LIBRARY_FILES.size);

  const root = t.testdir({
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

  count = 0;
  let expected = 'file';
  for await (const { type, path } of walk(root)) {
    t.strictEqual(type, 'file');

    let actual = relative(root, path);
    if (actual.endsWith('2')) actual = actual.slice(0, -1);
    t.strictEqual(actual, expected);

    if (count <= 1) {
      expected = 'dir/' + expected;
    }
    count++;
  }

  t.end();
});
