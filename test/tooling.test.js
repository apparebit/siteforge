/* © 2019 Robert Grimm */

import { EOL, tmpdir } from 'os';
import { join, relative, basename } from 'path';
import run from '../source/tooling/run.js';
import tap from 'tap';
import Walk from '../source/tooling/walk.js';

import {
  copyFile,
  glob,
  readFile,
  rmdir,
  toCoolPath,
  toDirectory,
  withTrailingSlash,
} from '../source/tooling/fs.js';

import { not, once } from '../source/tooling/function.js';

import {
  aliased,
  defaults,
  FilePath,
  optionsFromArguments,
  optionsFromObject,
  FileGlob,
} from '../source/tooling/options.js';

import {
  escapeRegex,
  extractRightsNotice,
  withRightsNotice,
} from '../source/tooling/text.js';

import {
  injectIntoPath,
  isVersionedPath,
  sha256,
  writeVersionedFile,
} from '../source/tooling/versioning.js';

const APPAREBIT = 'https://apparebit.com';
const { assign, keys: keysOf } = Object;
const __directory = toDirectory(import.meta.url);
const { has } = Reflect;

// =============================================================================
// fs
// =============================================================================

tap.test('tooling/fs', async t => {
  // glob, glob, glob

  t.throws(() => glob('b**h**'));

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

  const applyToPaths = pattern => {
    const test = glob(pattern);
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

  // ---------------------------------------------------------------------------

  // toDirectory()
  t.notOk(__directory.startsWith('file:'));
  t.ok(__directory.endsWith('/test'));

  // withTrailingSlash()
  t.strictEqual(withTrailingSlash(APPAREBIT).href, APPAREBIT + '/');
  t.strictEqual(
    withTrailingSlash(APPAREBIT + '/slasher').href,
    APPAREBIT + '/slasher/'
  );
  t.strictEqual(
    withTrailingSlash(APPAREBIT + '/slasher/').href,
    APPAREBIT + '/slasher/'
  );

  // toCoolPath()
  t.strictEqual(
    toCoolPath('/features/ubu-trump/index.html'),
    '/features/ubu-trump'
  );
  t.strictEqual(
    toCoolPath('/features/ubu-trump/index.html', { trailingSlash: true }),
    '/features/ubu-trump/'
  );
  t.strictEqual(
    toCoolPath('/features/ubu-trump/about.html'),
    '/features/ubu-trump/about'
  );
  t.strictEqual(
    toCoolPath('/features/ubu-trump/about.html', { trailingSlash: true }),
    '/features/ubu-trump/about'
  );
  t.strictEqual(
    toCoolPath('/features/ubu-trump/the-dark-tower.jpg'),
    '/features/ubu-trump/the-dark-tower.jpg'
  );
  t.strictEqual(toCoolPath('/features/ubu-trump/'), '/features/ubu-trump');
  t.strictEqual(
    toCoolPath('/features/ubu-trump/', { trailingSlash: true }),
    '/features/ubu-trump/'
  );

  // ---------------------------------------------------------------------------

  // copyFile()
  try {
    const from = join(__directory, 'index.js');
    const to = join(__directory, 'down/the/rabbit/hole/index.js');
    await copyFile(from, to);
    const index1 = await readFile(to, 'utf8');
    const index2 = await readFile(from, 'utf8');
    t.strictEqual(index1, index2);
  } finally {
    await rmdir(join(__directory, 'down'), { recursive: true });
  }

  t.end();
});

// =============================================================================
// function
// =============================================================================

tap.test('tooling/function', t => {
  let counter = 0;
  const incr = () => ++counter;
  const onceMore = once(incr);

  t.strictEqual(incr.name, 'incr');
  t.strictEqual(onceMore.name, 'once(incr)');
  t.strictEqual(incr.length, 0);
  t.strictEqual(onceMore.length, 0);

  t.strictEqual(counter, 0);
  t.strictEqual(incr(), 1);
  t.strictEqual(incr(), 2);
  t.strictEqual(counter, 2);
  t.strictEqual(onceMore(), 3);
  t.strictEqual(onceMore(), undefined);
  t.strictEqual(counter, 3);
  t.strictEqual(incr(), 4);
  t.strictEqual(counter, 4);

  // eslint-disable-next-line no-unused-vars
  const truth = fakeArgument => true;
  const falsehood = not(truth);

  t.strictEqual(truth.name, 'truth');
  t.strictEqual(falsehood.name, 'not(truth)');

  t.strictEqual(truth.length, 1);
  t.strictEqual(falsehood.length, 1);

  t.end();
});

// =============================================================================
// options
// =============================================================================

tap.test('tooling/options', t => {
  const configuration = defaults();
  aliased(
    assign(configuration, {
      'dry-run': Boolean,
      name: String,
      path: FilePath,
      round: Number,
      wetRun: Boolean,
    })
  );

  const check = options => {
    t.strictSame(options._, ['whatever', 'everwhat']);
    t.strictEqual(options.help, 1);
    t.notOk(has(options, 'name'));
    t.strictEqual(options.path, __directory);
    t.strictEqual(options.quiet, 3);
    t.strictEqual(options.round, 665);
    t.strictEqual(options.verbose, 2);
    t.notOk(has(options, 'version'));
    t.strictEqual(options.volume, -1);
    t.strictEqual(options.wetRun, 2);
    t.strictEqual(options['dry-run'], 1);
    t.strictEqual(keysOf(options).length, 9);
  };

  // prettier-ignore
  let options = optionsFromArguments(
    [
      '-vv',
      '-qqq',
      'whatever',
      '--wetRun',
      '--wet-run',
      '--round', '665',
      '--dry-run',
      '--path', 'test',
      'everwhat',
      '--help',
    ],
    configuration
  );
  check(options);

  options = optionsFromObject(
    {
      q: 3,
      round: 665,
      h: 1,
      'dry-run': true,
      'wet-run': 1,
      wetRun: true,
      verbose: 2,
      path: 'test',
      _: ['whatever', 'everwhat'],
    },
    configuration
  );
  check(options);

  configuration.r = 'round';
  configuration._ = (arg, report) => {
    if (arg !== 'whatever') report(`should be "whatever"`);
    return arg;
  };

  t.throws(
    () =>
      optionsFromArguments(
        ['-x', '-r', '--path', '-x', 'whatever', 'everwhat', '--round'],
        configuration
      ),
    new RegExp(
      escapeRegex(
        [
          'Several options are invalid:',
          'Unknown command line option "x"',
          'Command line option "r"/"round" misconfigured to take value',
          'Command line option "path" has another option "-x" as value',
          'Command line argument "everwhat" should be "whatever"',
          'Command line option "round" is missing required value',
        ].join(EOL)
      ),
      'u'
    )
  );

  t.throws(
    () =>
      optionsFromArguments(
        ['--round', '3', '--', '--not-a-flag'],
        configuration
      ),
    new RegExp(
      escapeRegex('Command line argument "--not-a-flag" should be "whatever"'),
      'u'
    )
  );

  delete configuration._;
  t.strictSame(
    optionsFromArguments(['--round', '3', '--', '--not-a-flag'], configuration),
    {
      _: ['--not-a-flag'],
      round: 3,
      volume: 0,
    }
  );

  t.throws(
    () =>
      optionsFromObject(
        {
          _: 13,
          answer: 42,
          verbose: 'quiet',
        },
        configuration
      ),
    new RegExp(
      escapeRegex(
        [
          'Several options are invalid:',
          'Option "_" does not have array value',
          'Unknown option "answer"',
          'Boolean option "verbose" has neither boolean nor numeric value',
        ].join(EOL)
      ),
      'u'
    )
  );

  options.quiet = 0;
  options.verbose = 665;
  t.strictEqual(options.volume, 665);
  options.volume = 42;
  t.strictEqual(options.volume, 42);

  const errors = [];
  const report = msg => {
    errors.push(msg);
  };
  t.strictEqual(FileGlob(42, report), undefined);
  t.strictEqual(FileGlob([42], report), undefined);
  t.strictEqual(FileGlob('<**>', report), undefined);
  t.strictEqual(typeof FileGlob('**/boo', report), 'function');
  t.strictSame(errors, [
    'is not a valid file glob',
    'is not an array of valid file globs',
    'contains an invalid segment glob expression',
  ]);

  t.end();
});

// =============================================================================
// run
// =============================================================================

tap.test('tooling/run', async t => {
  const { stdout, stderr } = await run('printf', ['Hello, world!'], {
    stdio: 'buffer',
  });
  t.strictEqual(stdout, 'Hello, world!');
  t.strictEqual(stderr, '');

  t.resolves(() => run('sh', ['-c', 'exit']));
  t.rejects(
    () => run('sh', ['-c', 'exit 42']),
    /^Child process failed with exit code "42" \(sh -c "exit 42"\)/u
  );

  try {
    await run('this-command-most-certainly-does-not-exist', []);
    t.fail(`running non-existent command should fail`);
  } catch (x) {
    t.strictEqual(x.code, 'ENOENT');
  }

  t.end();
});

// =============================================================================
// text
// =============================================================================

tap.test('tooling/text', t => {
  t.strictEqual(escapeRegex('[1.1.0]'), '\\[1\\.1\\.0\\]');

  t.strictEqual(
    extractRightsNotice(`   //  (C) Robert Grimm`),
    `(C) Robert Grimm`
  );
  t.strictEqual(
    extractRightsNotice(`   /*  (C) Robert Grimm  \n  */  `),
    `(C) Robert Grimm`
  );
  t.strictEqual(
    extractRightsNotice(`   /*  © Robert Grimm  \n  */  `),
    `© Robert Grimm`
  );
  t.strictEqual(
    extractRightsNotice(`   /*  copyright Robert Grimm  \n  */  `),
    `copyright Robert Grimm`
  );

  t.strictEqual(withRightsNotice('code', undefined), 'code');
  t.strictEqual(withRightsNotice('code', 'notice'), '/* notice */ code');
  t.end();
});

// =============================================================================
// versioning
// =============================================================================

tap.test('tooling/versioning', async t => {
  const tmp = tmpdir();
  const path = join(tmp, 'hello.txt');
  const vp = join(tmp, 'hello.v~d9014c46.txt');
  const data = 'Hello, world!\n';

  // Hash.
  t.strictEqual(
    sha256(data, false),
    'd9014c4624844aa5bac314773d6b689ad467fa4e1d1a50a1b8a99d5a95f72ff5'
  );

  // Path injection.
  t.strictEqual(
    injectIntoPath(path, '789abcdef'),
    join(tmp, 'hello.v~789abcde.txt')
  );

  // Testing for versioned paths.
  t.notOk(isVersionedPath(path));
  t.ok(isVersionedPath(vp));

  // Versioned file.
  let actual = await writeVersionedFile(path, data);
  t.strictEqual(actual, vp);
  t.strictEqual(await readFile(vp, 'utf8'), data);

  t.end();
});

// =============================================================================
// walk
// =============================================================================

const LIBRARY_PATH = join(__directory, '../source');
const LIBRARY_FILES = new Set([
  'config.js',
  'package.json',
  'siteforge.js',
  'usage.txt',
  'markup/render.js',
  'markup/vdom.js',
  'reloader/config.js',
  'reloader/hook.js',
  'reloader/package.json',
  'task/build-htaccess.js',
  'task/build-markup.js',
  'task/build-script.js',
  'task/build-style.js',
  'task/build.js',
  'task/deploy.js',
  'task/runner.js',
  'task/validate-markup.js',
  'tooling/error.js',
  'tooling/fs.js',
  'tooling/function.js',
  'tooling/logger.js',
  'tooling/options.js',
  'tooling/run.js',
  'tooling/text.js',
  'tooling/versioning.js',
  'tooling/walk.js',
]);

tap.test('tooling/walk', async t => {
  let count = 0;

  const isExcluded = path => {
    const base = basename(path);
    return base === '.DS_Store' || base === 'node_modules';
  };
  const walk = new Walk(LIBRARY_PATH, { isExcluded });
  for await (const entry of walk.go()) {
    t.strictEqual(entry.type, 'file');
    const path = relative(LIBRARY_PATH, entry.path);
    t.ok(LIBRARY_FILES.has(path), `should be a site:forge module`);
    t.strictEqual(entry.vpath, '/' + path);
    count++;
  }

  t.strictEqual(count, LIBRARY_FILES.size);
  t.strictEqual(walk.metrics.directory, 5);
  t.strictEqual(walk.metrics.entry, 33);
  t.strictEqual(walk.metrics.file, 26);
  t.strictEqual(walk.metrics.status, 33);
  t.strictEqual(walk.metrics.symlink, 0);

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
  for await (const { type, path } of Walk.walk(root, { isExcluded: null })) {
    t.strictEqual(type, 'file');

    let actual = relative(root, path);
    if (actual.endsWith('2')) actual = actual.slice(0, -1);
    t.strictEqual(actual, expected);

    if (count <= 1) {
      expected = 'dir/' + expected;
    }
    count++;
  }

  t.rejects(async () => {
    for await (const _ of Walk.walk(42)) {
      // Nothing to do.
    }
  }, /Root for file system walk "42" is not a path/u);

  t.end();
});
