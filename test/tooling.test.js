/* © 2019 Robert Grimm */

import { EOL, tmpdir } from 'os';
import { join, relative } from 'path';
import run from '../source/tooling/run.js';
import Sq from '../source/tooling/sequitur.js';
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
const { apply, has } = Reflect;
const { assign, getPrototypeOf, keys: keysOf } = Object;
const configurable = true;
const __directory = toDirectory(import.meta.url);
const enumerable = true;
const { iterator: ITERATOR } = Symbol;
const Iterator = getPrototypeOf(getPrototypeOf([][ITERATOR]()));
const { toString } = Object.prototype;
const writable = true;

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
// sequitur
// =============================================================================

tap.test('tooling/sequitur', async t => {
  // Sq.isIterable(), Sq.isNonStringIterable()

  t.ok(Sq.isIterable('abc'));
  t.ok(Sq.isIterable([]));

  t.notOk(Sq.isNonStringIterable('abc'));
  t.ok(Sq.isNonStringIterable([]));

  const AsyncIterable = {
    [Symbol.asyncIterator]() {
      return {
        next() {
          return Promise.resolve({ done: true });
        },
      };
    },
  };

  function poser() {}
  poser.async = true;

  t.ok(Sq.isAsyncIterable(AsyncIterable));
  t.notOk(Sq.isAsyncIterable([]));

  t.ok(Sq.isAsyncFunction(async () => {}));
  t.ok(Sq.isAsyncFunction(async function() {}));
  t.ok(Sq.isAsyncFunction(function doThisAsync() {}));
  t.ok(Sq.isAsyncFunction(poser));

  t.notOk(Sq.isAsyncFunction(() => {}));
  t.notOk(Sq.isAsyncFunction(function() {}));
  t.notOk(Sq.isAsyncFunction(function*() {}));
  t.notOk(Sq.isAsyncFunction(async function*() {}));
  t.notOk(Sq.isAsyncFunction());
  t.notOk(Sq.isAsyncFunction(null));
  t.notOk(Sq.isAsyncFunction(665));
  t.notOk(Sq.isAsyncFunction([]));
  t.notOk(Sq.isAsyncFunction(AsyncIterable));

  // ---------------------------------------------------------------------------
  // A complex pipeline and some method- or stage-specific tests.

  let sq = Sq.of(0, 1, 2, 3, 4, 5, 6, 7, 8, 9);
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

  t.strictSame(
    Sq.of(1, 2, 3)
      .flatMap(() => undefined)
      .collect(),
    []
  );

  t.strictSame(
    Sq.of([[[[[13]]]]])
      .flatten()
      .collect(),
    [13]
  );
  t.strictSame(
    Sq.of([[[[['pea']]]]])
      .flatten()
      .collect(),
    ['pea']
  );

  t.strictEqual(apply(toString, Sq.of(), []), '[object Sequence]');
  t.strictEqual(Sq.of(665, '=', 'mark', -1n).join(), '665=mark-1');
  t.throws(() => Sq.of().map(665));

  // ---------------------------------------------------------------------------
  // Sq.of(), Sq.from()

  t.throws(() => Sq().collect());
  t.strictSame(Sq.from().collect(), []);
  t.strictSame(Sq.of().collect(), []);

  const counter = () => ({
    __proto__: Iterator,
    count: 3,
    next() {
      return { value: this.count, done: --this.count < 0 };
    },
  });

  t.strictSame(Sq.from(counter()).collect(), [3, 2, 1]);
  t.strictSame(Sq.of(...counter()).collect(), [3, 2, 1]);

  t.strictSame(Sq.from('abc').collect(), ['abc']);
  t.strictSame(Sq.fromString('abc').collect(), ['a', 'b', 'c']);
  t.strictSame(Sq.of(...'abc').collect(), ['a', 'b', 'c']);

  t.strictSame(Sq.from(42).collect(), [42]);
  t.strictSame(Sq.fromString(42).collect(), [42]);
  t.strictSame(Sq.of(42).collect(), [42]);

  const unlucky = function*() {
    yield 665;
    yield 13;
  };

  t.strictSame(Sq.from(unlucky).collect(), [665, 13]);
  t.strictSame(Sq.of(...unlucky()).collect(), [665, 13]);

  t.strictSame(
    Sq.from([665]).reduce((acc, it) => (acc.push(it), acc), []),
    [665]
  );

  // ---------------------------------------------------------------------------
  // Sq.concat() and Sq.zip()

  const context = {
    toString() {
      return 'context';
    },
  };

  t.throws(() => Sq.concat(1, 2, 3));
  t.throws(() => Sq.zip(1, 2, 3));
  t.strictSame(Sq.concat([1], [2], [3]).collect(), [1, 2, 3]);

  sq = Sq.concat(context, [1], [2], [3]);
  t.strictEqual(sq.context, context);
  sq = sq.map(v => v);
  t.strictEqual(sq.context, context);
  t.strictSame(sq.collect(), [1, 2, 3]);

  t.strictSame(Sq.zip([1], [2], [3]).collect(), [[1, 2, 3]]);
  sq = Sq.zip(context, [1], [2], [3]);
  t.strictEqual(sq.context, context);
  sq = sq.map(v => v);
  t.strictEqual(sq.context, context);
  t.strictSame(sq.collect(), [[1, 2, 3]]);

  // Let's do the async!

  t.strictSame(
    await Sq.concat(
      Sq.toAsyncIterable([1]),
      Sq.toAsyncIterable([2]),
      Sq.toAsyncIterable([3])
    ).collect(),
    [1, 2, 3]
  );

  t.strictSame(
    await Sq.of(1)
      .concat(Sq.toAsyncIterable([2]))
      .collect(),
    [1, 2]
  );

  t.strictSame(
    await Sq.zip(
      Sq.toAsyncIterable([1, 2]),
      Sq.toAsyncIterable(['a', 'b'])
    ).collect(),
    [
      [1, 'a'],
      [2, 'b'],
    ]
  );

  t.strictSame(
    await Sq.of(1, 2)
      .zip(Sq.toAsyncIterable(['a', 'b']))
      .collect(),
    [
      [1, 'a'],
      [2, 'b'],
    ]
  );

  t.strictSame(
    await Sq.from(Sq.toAsyncIterable([1, 2]))
      .concat([3])
      .collect(),
    [1, 2, 3]
  );

  t.strictSame(
    await Sq.from(Sq.toAsyncIterable([1, 2]))
      .zip(['a', 'b'])
      .collect(),
    [
      [1, 'a'],
      [2, 'b'],
    ]
  );

  // ---------------------------------------------------------------------------
  // keys(), values(), entries(), descriptors()

  t.strictSame(Sq.keys([1, 2]).collect(), [0, 1]);
  t.strictSame(Sq.keys({ '0': 1, '1': 2 }).collect(), ['0', '1']);
  t.strictSame(Sq.values([665, 42]).collect(), [665, 42]);
  t.strictSame(Sq.values(new Set([13])).collect(), [13]);
  t.strictSame(
    Sq.values(
      new Map([
        [42, 'answer'],
        [665, 'mark-1'],
      ])
    ).collect(),
    ['answer', 'mark-1']
  );
  t.strictSame(Sq.values({ a: 42, m: 665 }).collect(), [42, 665]);
  t.strictSame(Sq.entries([665, 42]).collect(), [
    [0, 665],
    [1, 42],
  ]);
  t.strictSame(Sq.entries({ a: 665, b: 42 }).collect(), [
    ['a', 665],
    ['b', 42],
  ]);
  t.strictSame(Sq.entries({ a: 665, b: 42 }).collectEntries(), {
    a: 665,
    b: 42,
  });
  const m = Sq.entries({ a: 665, b: 42 }).collectEntries(new Map());
  t.strictSame(
    [...m.entries()],
    [
      ['a', 665],
      ['b', 42],
    ]
  );
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

  let counted = 0;
  Sq.values([13, 42, 665, 0]).each(_ => counted++);
  t.strictEqual(counted, 4);

  // ---------------------------------------------------------------------------
  // Extensibility: run()

  t.strictSame(
    Sq.of(1, 2, 3)
      .run(function*(source) {
        for (const el of source) yield el * el;
      })
      .collect(),
    [1, 4, 9]
  );

  // ---------------------------------------------------------------------------
  // Asynchronous Sequences

  const double = n => n * n;
  async function* asyncish() {
    let n = await double(7);
    n = n + 1;
    yield n;
    n = await (n + 1);
    n = n + 1;
    yield n;
    n = n + 1;
    yield* [n, n + 1, n + 2];
  }

  const aseq0 = Sq.from(asyncish);
  t.strictEqual(apply(toString, aseq0, []), '[object async Sequence]');

  const atap = [];
  const aseq = await aseq0
    .map(double)
    .tap(el => atap.push(el))
    .filter(el => el % 2 === 0)
    .flatMap(el => [el, el])
    .collect();

  t.strictSame(aseq, [2500, 2500, 2704, 2704, 2916, 2916]);
  t.strictSame(atap, [2500, 2704, 2809, 2916, 3025]);

  t.strictSame(
    await Sq.from(asyncish)
      .flatMap(el => [el])
      .collect(),
    [50, 52, 53, 54, 55]
  );
  t.strictSame(
    await Sq.from(asyncish)
      .flatMap(() => undefined)
      .collect(),
    []
  );

  t.strictEqual(await aseq0.reduce((acc, el) => acc + el, 0), 264);
  t.strictSame(await Sq.from(AsyncIterable).collect(), []);

  t.strictSame(
    await Sq.entries({ a: 1, b: 2, c: 3 })
      // eslint-disable-next-line require-await
      .filter(async ([k, _]) => k !== 'c')
      .collectEntries(),
    { a: 1, b: 2 }
  );

  t.strictSame(
    await Sq.entries({ a: 1, b: 2 })
      // eslint-disable-next-line require-await
      .map(async ([k, v]) => [k, v + 3])
      .collectEntries(new Map()),
    new Map([
      ['a', 4],
      ['b', 5],
    ])
  );

  const aside = [];
  await Sq.of(1, 2, 3)
    // eslint-disable-next-line require-await
    .flatMap(async n => [n * n])
    .tap(el => aside.push(el))
    .each(el => aside.push(el));
  t.strictSame(aside, [1, 1, 4, 4, 9, 9]);

  aside.length = 0;
  t.strictSame(
    await Sq.descriptors({ a: 1 })
      // eslint-disable-next-line require-await
      .tap(async () => {})
      .collectDescriptors(),
    { a: 1 }
  );

  // eslint-disable-next-line require-await
  async function* nester() {
    yield [[[[[[[[[[[[42]]]]], 665]]]]]]];
  }

  t.strictEqual(
    await Sq.from(nester)
      .flatten()
      .join(' * '),
    '42 * 665'
  );
  t.strictSame(
    await Sq.from(nester)
      .flatten()
      .run(async function*(source) {
        for await (const element of source) {
          yield element - 42;
        }
      })
      .collect(),
    [0, 623]
  );

  // eslint-disable-next-line require-await
  Sq.of(665, 665, 665).each(async el => t.strictEqual(el, 665));

  t.strictEqual(
    // eslint-disable-next-line require-await
    await Sq.of(42, 42).reduce(async (acc, el) => acc + el, ''),
    '4242'
  );

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
  'markup/model.json',
  'markup/model.js',
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
    t.ok(LIBRARY_FILES.has(path), `should be a site:forge module`);
    t.strictEqual(entry.vpath, '/' + path);
    count++;
  }

  t.strictEqual(count, LIBRARY_FILES.size);
  t.strictEqual(walk.metrics.directory, 5);
  t.strictEqual(walk.metrics.entry, 33);
  t.strictEqual(walk.metrics.file, 27);
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
