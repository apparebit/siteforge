/* © 2019 Robert Grimm */

import { EOL, tmpdir } from 'os';
import { join, relative } from 'path';
import run from '../lib/tooling/run.js';
import Sq from '../lib/tooling/sequitur.js';
import tap from 'tap';
import Walk from '../lib/tooling/walk.js';

import {
  copyFile,
  glob,
  readFile,
  rmdir,
  toDirectory,
  withTrailingSlash,
} from '../lib/tooling/fs.js';

import {
  aliased,
  defaults,
  FilePath,
  optionsFromArguments,
  optionsFromObject,
  FileGlob,
} from '../lib/tooling/options.js';

import {
  escapeRegex,
  extractRightsNotice,
  withRightsNotice,
} from '../lib/tooling/text.js';

import {
  injectIntoPath,
  isVersionedPath,
  sha256,
  writeVersionedFile,
} from '../lib/tooling/versioning.js';

const APPAREBIT = 'https://apparebit.com';
const { assign, getPrototypeOf, keys: keysOf } = Object;
const configurable = true;
const __directory = toDirectory(import.meta.url);
const enumerable = true;
const { has } = Reflect;
const { iterator: ITERATOR } = Symbol;
const Iterator = getPrototypeOf(getPrototypeOf([][ITERATOR]()));
const writable = true;

// =============================================================================
// fs
// =============================================================================

tap.test('tooling/fs', async t => {
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

  t.notOk(__directory.startsWith('file:'));
  t.ok(__directory.endsWith('/test'));

  t.strictEqual(withTrailingSlash(APPAREBIT).href, APPAREBIT + '/');
  t.strictEqual(
    withTrailingSlash(APPAREBIT + '/slasher').href,
    APPAREBIT + '/slasher/'
  );
  t.strictEqual(
    withTrailingSlash(APPAREBIT + '/slasher/').href,
    APPAREBIT + '/slasher/'
  );

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
// sequitur
// =============================================================================

tap.test('tooling/sequitur', t => {
  const sq = Sq.of(0, 1, 2, 3, 4, 5, 6, 7, 8, 9);
  const ar = [];

  // The sequence below is processed lazily. Since zip() finishes as soon as the
  // first iterator finishes, the resulting array ends with the flattened pair
  // of 4 and '📻'. However, to determine that the second iterator is done
  // requires invoking next() on all iterators. Hence the tap() is invoked a
  // sixth time.

  t.strictSame(
    sq
      .filter(n => n % 2 === 0)
      .map(n => n + 1)
      .flatMap(n => [n - 1, n])
      .tap(n => ar.push(n))
      .zip(['📷', '📟', '💾', '📽', '📻'])
      .flatMap(p => p)
      .concat(['🏚'], ['🕷'])
      .collect(),
    [0, '📷', 1, '📟', 2, '💾', 3, '📽', 4, '📻', '🏚', '🕷']
  );
  t.strictSame(ar, [0, 1, 2, 3, 4, 5]);

  // ---------------------------------------------------------------------------
  // Sq(), Sq.of(), Sq.from()

  t.strictSame(Sq().collect(), []);
  t.strictSame(Sq.from().collect(), []);
  t.strictSame(Sq.of().collect(), []);

  const counter = () => ({
    __proto__: Iterator,
    count: 3,
    next() {
      return { value: this.count, done: --this.count < 0 };
    },
  });

  t.strictSame(Sq(counter()).collect(), [3, 2, 1]);
  t.strictSame(Sq.from(counter()).collect(), [3, 2, 1]);
  t.strictSame(Sq.of(...counter()).collect(), [3, 2, 1]);

  t.strictSame(Sq('abc').collect(), ['a', 'b', 'c']);
  t.strictSame(Sq.from('abc').collect(), ['a', 'b', 'c']);
  t.strictSame(Sq.of(...'abc').collect(), ['a', 'b', 'c']);

  const unlucky = function*() {
    yield 665;
    yield 13;
  };

  t.strictSame(Sq(unlucky).collect(), [665, 13]);
  t.strictSame(Sq.from(unlucky).collect(), [665, 13]);
  t.strictSame(Sq.of(...unlucky()).collect(), [665, 13]);

  t.strictSame(
    Sq([665]).reduce((acc, it) => (acc.push(it), acc), []),
    [665]
  );

  t.throws(() => Sq(function() {}), 'bi a/sync function');
  t.throws(() => Sq(async function*() {}), 'no async generator');
  t.throws(() => Sq((async function*() {})()), 'no async iterable');

  // ---------------------------------------------------------------------------
  // keys(), values(), entries(), descriptors()

  t.strictSame(Sq.keys([1, 2]).collect(), [0, 1]);
  t.strictSame(Sq.keys({ '0': 1, '1': 2 }).collect(), ['0', '1']);
  t.strictSame(Sq.values([665, 42]).collect(), [665, 42]);
  t.strictSame(Sq.entries([665, 42]).collect(), [
    [0, 665],
    [1, 42],
  ]);
  t.strictSame(Sq.entries({ a: 665, b: 42 }).collect(), [
    ['a', 665],
    ['b', 42],
  ]);
  t.strictSame(
    Sq.entries(
      new Map([
        ['a', 665],
        ['b', 42],
      ])
    ).collect(),
    [
      ['a', 665],
      ['b', 42],
    ]
  );
  t.strictSame(Sq.entries(new Set(['a', 'b'])).collect(), [
    ['a', 'a'],
    ['b', 'b'],
  ]);
  t.strictSame(Sq.descriptors({ a: 665, b: 42 }).collectEntries(), {
    a: { configurable, enumerable, writable, value: 665 },
    b: { configurable, enumerable, writable, value: 42 },
  });
  t.strictSame(Sq.descriptors({ a: 665, b: 42 }).collectDescriptors(), {
    a: 665,
    b: 42,
  });

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

const LIBRARY_PATH = join(__directory, '../lib');
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
  'tooling/error.js',
  'tooling/fs.js',
  'tooling/logger.js',
  'tooling/options.js',
  'tooling/run.js',
  'tooling/sequitur.js',
  'tooling/text.js',
  'tooling/versioning.js',
  'tooling/walk.js',
]);

tap.test('tooling/walk', async t => {
  let count = 0;

  const walk = new Walk(LIBRARY_PATH);
  for await (const entry of walk.go()) {
    t.strictEqual(entry.type, 'file');
    const path = relative(LIBRARY_PATH, entry.path);
    t.ok(
      LIBRARY_FILES.has(path),
      `walk() encounters only site:forge's own modules in "lib"`
    );
    t.strictEqual(entry.vpath, '/' + path);
    count++;
  }

  t.strictEqual(count, LIBRARY_FILES.size);
  t.strictEqual(walk.metrics.directory, 4);
  t.strictEqual(walk.metrics.entry, 26);
  t.strictEqual(walk.metrics.file, 21);
  t.strictEqual(walk.metrics.status, 26);
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
