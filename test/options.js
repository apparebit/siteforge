/* © 2019-2020 Robert Grimm */

import {
  aliased,
  defaults,
  FilePath,
  optionsFromArguments,
  optionsFromObject,
  FileGlob,
} from '@grr/options';

import { EOL } from 'os';
import harness from './harness.js';
import { toDirectory } from '@grr/fs';

const { assign, keys: keysOf } = Object;
const __directory = toDirectory(import.meta.url);
const { has } = Reflect;

// Popular copy pasta refined with local seasoning
// (https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions)
const escapeRegex = literal => literal.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');

harness.test('tooling/options', t => {
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
    t.equal(options.help, 1);
    t.notOk(has(options, 'name'));
    t.equal(options.path, __directory);
    t.equal(options.quiet, 3);
    t.equal(options.round, 665);
    t.equal(options.verbose, 2);
    t.notOk(has(options, 'version'));
    t.equal(options.volume, -1);
    t.equal(options.wetRun, 2);
    t.equal(options['dry-run'], 1);
    t.equal(keysOf(options).length, 9);
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
          'Command line option "r" aka "round" misconfigured to take value',
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
      __proto__: null,
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
  t.equal(options.volume, 665);
  options.volume = 42;
  t.equal(options.volume, 42);

  const errors = [];
  const report = msg => {
    errors.push(msg);
  };
  t.equal(FileGlob(42, report), undefined);
  t.equal(FileGlob([42], report), undefined);
  t.equal(FileGlob('<**>', report), undefined);
  t.equal(typeof FileGlob('**/boo', report), 'function');
  t.strictSame(errors, [
    'is not a valid file glob',
    'is not an array of valid file globs',
    'contains an invalid segment glob expression',
  ]);

  t.end();
});
