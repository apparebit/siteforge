/* © 2020-2021 Robert Grimm */

import Builtin from '@grr/oddjob/builtin';
import {
  asciify,
  escapeRegex,
  slugify,
  toKeyPathKeys,
  toKeyPathPath,
  WILDCARD,
} from '@grr/oddjob/string';
import { COLOR_DEPTH, countColors, default as candy } from '@grr/oddjob/candy';
import { count, duration } from '@grr/oddjob/format';
import { debounce } from '@grr/oddjob/function';
import harness from './harness.js';
import {
  AbortError,
  ErrorMessage,
  isError,
  relocate,
  traceErrorPosition,
  traceErrorMessage,
} from '@grr/oddjob/error';
import { isBoxed, isMap, isSet, isStringArray, isURL } from '@grr/oddjob/types';
import pickle from '@grr/oddjob/pickle';
import { enumView, readOnlyView } from '@grr/oddjob/object';
import { runInNewContext } from 'vm';
import { WriteStream } from 'tty';
import { types } from 'util';

const { BASIC, FULL, INDEXED, MONO } = COLOR_DEPTH;
const { isArray } = Array;
const { isNativeError } = types;
const { MAX_SAFE_INTEGER } = Number;
const { stringify } = JSON;
const escape = s => stringify(s).slice(1, -1);

harness.test('@grr/oddjob', t => {
  // ===========================================================================
  t.test('builtin', t => {
    t.equal(Builtin.Array, Array);
    t.equal(Builtin.BigInt, BigInt);
    t.equal(Builtin.Boolean, Boolean);
    t.equal(Builtin.Date, Date);
    t.equal(Builtin.Error, Error);
    t.equal(Builtin.Function, Function);
    t.equal(Builtin.JSON, JSON);
    t.equal(Builtin.Map, Map);
    t.equal(Builtin.Number, Number);
    t.equal(Builtin.Object, Object);
    t.equal(Builtin.Promise, Promise);
    t.equal(Builtin.Proxy, Proxy);
    t.equal(Builtin.Reflect, Reflect);
    t.equal(Builtin.RegExp, RegExp);
    t.equal(Builtin.Set, Set);
    t.equal(Builtin.String, String);
    t.equal(Builtin.Symbol, Symbol);
    t.end();
  });

  // ===========================================================================
  t.test('candy', t => {
    // ----------------------------------------------------------- countColors()
    const APPLE = 'Apple_Terminal';
    // We only fake as much of the stream as we need.
    const stream = { getColorDepth: WriteStream.prototype.getColorDepth };

    t.equal(countColors({ env: { NODE_DISABLE_COLORS: '', stream } }), MONO);
    t.equal(countColors({ env: { NO_COLOR: '', stream } }), MONO);
    t.equal(countColors({ env: {}, stream }), MONO);
    t.equal(countColors({ env: { TERM: 'dumb' }, stream }), MONO);
    t.equal(countColors({ env: { CI: 'true' }, stream }), MONO);
    t.equal(countColors({ env: { CI: 'true', TRAVIS: '' }, stream }), INDEXED);
    t.equal(
      countColors({ env: { TERM_PROGRAM: 'iTerm.app' }, stream }),
      INDEXED
    );
    t.equal(countColors({ env: { TERM_PROGRAM: APPLE }, stream }), INDEXED);
    t.equal(countColors({ env: { TERM_PROGRAM: 'MacTerm' }, stream }), FULL);
    t.equal(countColors({ env: { TERM: 'xterm-256' }, stream }), INDEXED);
    t.equal(countColors({ env: { TERM_PROGRAM: 'MacTerm' }, stream }), FULL);
    t.equal(countColors({ env: { TERM: 'vt100' }, stream }), BASIC);
    t.equal(countColors({ env: { TERM: 'monochromatic' }, stream }), MONO);

    // ----------------------------------------------------------------- candy()
    let sweet = candy({ env: { TERM: 'dumb' }, stream });
    t.equal(sweet.colorDepth, MONO);
    let styled = escape(sweet.boldOrange(' ({[*]}) '));
    t.equal(styled, ' ({[*]}) ');

    sweet = candy({ env: { TERM: 'xterm' }, stream });
    t.equal(sweet.colorDepth, BASIC);
    styled = escape(sweet.boldOrange(' ({[*]}) '));
    t.equal(styled, '\\u001b[33;1m ({[*]}) \\u001b[39;22m');

    sweet = candy({ env: { TERM: 'xterm-256' }, stream });
    t.equal(sweet.colorDepth, INDEXED);
    styled = escape(sweet.boldOrange(' ({[*]}) '));
    t.equal(styled, '\\u001b[38;5;208;1m ({[*]}) \\u001b[39;22m');

    sweet = candy({ env: { TERM_PROGRAM: 'MacTerm' }, stream });
    t.equal(sweet.colorDepth, FULL);
    styled = escape(sweet.boldOrange(' ({[*]}) '));
    t.equal(styled, '\\u001b[38;5;208;1m ({[*]}) \\u001b[39;22m');

    t.end();
  });

  // ===========================================================================
  t.test('error', t => {
    // -------------------------------------------------------------- isError()
    function X() {}
    X.prototype = new Error();

    let x = new X();
    t.ok(x instanceof Error);
    t.notOk(isNativeError(x));
    t.ok(isError(x));

    x = new Error();
    t.ok(x instanceof Error);
    t.ok(isNativeError(x));
    t.ok(isError(x));

    x = new TypeError('boo');
    t.ok(x instanceof Error);
    t.ok(isNativeError(x));
    t.ok(isError(x));

    // --------------------------------------------------------- ErrorMessage()
    x = new ErrorMessage();
    t.ok(x instanceof Error);
    t.ok(isNativeError(x));
    t.ok(isError(x));
    t.equal(x.name, 'ErrorMessage');
    t.equal(x.message, '');
    t.equal(x.stack, 'Error');
    t.equal(x.toString(), 'Error');

    x = new ErrorMessage('boo');
    t.ok(x instanceof Error);
    t.ok(isNativeError(x));
    t.ok(isError(x));
    t.equal(x.name, 'ErrorMessage');
    t.equal(x.message, 'boo');
    t.equal(x.stack, 'Error: boo');
    t.equal(x.toString(), 'Error: boo');

    // ------------------------------ traceErrorMessage(), traceErrorPosition()
    x = new Error('boo');
    t.equal(traceErrorMessage(x), 'Error: boo');
    const trace = traceErrorPosition(x);
    t.ok(isArray(trace));
    t.ok(trace.length > 5);
    t.ok(trace.every(line => typeof line === 'string'));
    t.ok(!trace.some(line => /^ +at /u.test(line)));
    t.ok(trace[0].startsWith('Test.<anonymous> (file://'));

    // ------------------------------------------------------------- relocate()
    t.equal(
      relocate(
        `Uncaught Error: boo
    at c (repl:1:22)
    at b (repl:1:23)
    at a (repl:1:23)
`,
        665,
        19
      ),
      `Uncaught Error: boo
    at c (repl:666:41)
    at b (repl:666:42)
    at a (repl:666:42)
`
    );

    // -------------------------------------------------------------- AbortError
    t.equal(typeof AbortError, 'function');
    t.equal(AbortError.name, 'AbortError');

    const error = new AbortError();
    t.ok(error instanceof Error);
    t.ok(error instanceof AbortError);

    t.end();
  });

  // ===========================================================================
  t.test('format', t => {
    // ---------------------------------------------------------------- count()
    t.equal(count(0, 'second'), '0 seconds');
    t.equal(count(1, 'second'), '1 second');
    t.equal(count(665, 'second'), '665 seconds');

    // ------------------------------------------------------------- duration()
    t.equal(duration(3), '3ms');
    t.equal(duration(1003), '1.003s');
    t.equal(duration(61003), '1:01.003 min');

    // Check rounding to whole milliseconds.
    t.equal(duration(3.69), '4ms');
    t.equal(duration(1003.69), '1.004s');
    t.equal(duration(61003.21), '1:01.003 min');

    // Check big integers, which start in nanoseconds.
    t.equal(duration(3_690_000n), '4ms');
    t.equal(duration(1_003_690_000n), '1.004s');
    t.equal(duration(61_003_210_000n), '1:01.003 min');

    t.end();
  });

  // ===========================================================================
  t.test('object', t => {
    const object = {
      answer: 665,
    };
    t.equal(object.answer, 665);

    object.answer = 42;
    t.equal(object.answer, 42);

    const reader = readOnlyView(object);
    t.equal(reader.answer, 42);
    t.throws(() => (reader.answer = 13));
    t.equal(reader.mark, undefined);

    const enumeration = enumView(object);
    t.equal(enumeration.answer, 42);
    t.throws(() => (enumeration.answer = 13));
    t.throws(() => enumeration.mark);

    t.end();
  });

  // ===========================================================================
  t.test('pickle', t => {
    t.equal(pickle(true), `true`);
    t.equal(pickle(new Object(true)), `true`);
    t.equal(pickle(42), `42`);
    t.equal(pickle(new Object(42)), `42`);
    t.equal(pickle(Infinity), `null`);
    t.equal(pickle('ooh la la'), `"ooh la la"`);
    t.equal(pickle(new Object('ooh la la')), `"ooh la la"`);
    t.equal(pickle(665n), `665`);
    t.equal(pickle(new Object(665n)), `665`);
    t.equal(
      pickle(BigInt(MAX_SAFE_INTEGER) + 2n),
      `{"@type":"bigint","value":"9007199254740993"}`
    );
    t.equal(
      pickle(new Object(BigInt(MAX_SAFE_INTEGER) + 2n)),
      `{"@type":"bigint","value":"9007199254740993"}`
    );
    t.equal(pickle(null), `null`);
    t.equal(pickle(), undefined);
    t.equal(pickle([undefined]), `[null]`);
    t.equal(pickle(Symbol.iterator), undefined);
    t.equal(pickle([Symbol.iterator]), `[null]`);
    t.equal(pickle(/.*/u), `"/.*/u"`);

    t.equal(
      pickle(new Date(`2020-06-19T00:00:00Z`)),
      `"2020-06-19T00:00:00.000Z"`
    );

    t.equal(
      pickle(new URL(`https://apparebit.com/about`)),
      `"https://apparebit.com/about"`
    );

    t.equal(
      pickle({
        toJSON() {
          return 13;
        },
      }),
      `13`
    );

    let v = { w: {} };
    v.w.v = v.w;
    t.throws(() => pickle(v));
    t.equal(pickle(v, { decycled: true }), `{"w":{"v":{"@ref":"$[\\"w\\"]"}}}`);

    t.equal(pickle([1, 2, 3]), `[1,2,3]`);
    t.equal(pickle(new Set([1, 2, 3])), `[1,2,3]`);

    t.equal(
      pickle(new ErrorMessage('boo')),
      `{"@type":"error","name":"ErrorMessage","message":"boo","stack":[]}`
    );

    const fn = number => number === 42;
    t.equal(
      pickle(fn),
      `{"@type":"function","value":"number => number === 42"}`
    );

    t.equal(
      pickle(
        new Map([
          ['key1', 2],
          [{}, 1],
        ])
      ),
      `[["key1",2],[{},1]]`
    );

    t.equal(
      pickle(
        new Map([
          ['key1', 2],
          ['key2', 1],
        ])
      ),
      `[["key1",2],["key2",1]]`
    );

    t.equal(
      pickle(
        {
          z: 1,
          a: 2,
          f: 3,
        },
        { sorted: true }
      ),
      `{"a":2,"f":3,"z":1}`
    );

    t.end();
  });

  // ===========================================================================
  t.test('function', t => {
    t.test('debounce', t => {
      let counter = 0;
      const incr0 = () => {
        counter++;
      };
      const incr = debounce(incr0, 100);

      incr();
      incr();
      incr();
      incr();
      incr();

      setTimeout(() => {
        t.equal(counter, 1);
        t.end();
      }, 200);
    });

    t.end();
  });

  // ===========================================================================
  t.test('string', t => {
    // -------------------------------------------------------------- asciify()
    t.equal(
      asciify('àáâ ãäå æçè éêë ìíî ïñò óôõ öœø ùúû üýÿ ðłß Ǆǅǆ'),
      'aaa aaeaa aece eee iii ino ooo oeoeoe uuu ueyy dlss DZDzdz'
    );
    t.equal(
      asciify('ÀÁÂ ÃÄÅ ÆÇÈ ÉÊË ÌÍÎ ÏÑÒ ÓÔÕ ÖŒØ ÙÚÛ ÜÝŸ ÐŁẞ'),
      'AAA AAeAa AeCE EEE III INO OOO OeOeOe UUU UeYY DLSS'
    );
    t.equal(asciify('㎧ ㏗ ⓠ ſ Ⅷ 🅏 ẚ ŉ'), `m/s pH q s VIII WC a' 'n`);
    t.equal(asciify('-﹣－‐‑﹘–—'), '--------');

    // ---------------------------------------------------------- escapeRegex()
    t.equal(
      escapeRegex('[a-z]{26}(00)*?'),
      '\\[a\\-z\\]\\{26\\}\\(00\\)\\*\\?'
    );

    // -------------------------------------------------------------- slugify()
    t.equal(slugify('Çäłÿ at - 7 ㎯?'), 'caely-at-7-rads2');

    // -------------------------------------------------------- toKeyPathKeys()

    t.same(toKeyPathKeys('$'), []);
    t.same(
      toKeyPathKeys(`$.k1['k2']["k3"][*][1][2][3].*.k1[1].k2[2].k3[3].*`),
      [
        'k1',
        'k2',
        'k3',
        WILDCARD,
        1,
        2,
        3,
        WILDCARD,
        'k1',
        1,
        'k2',
        2,
        'k3',
        3,
        WILDCARD,
      ]
    );
    t.throws(
      () => toKeyPathKeys(`key`),
      /key path "key" does not start with "\$"/u
    );
    t.throws(
      () => toKeyPathKeys(`.key`),
      /key path ".key" does not start with "\$"/u
    );
    t.throws(
      () => toKeyPathKeys(`$..key`),
      /key path "\$..key" contains invalid expression/u
    );

    t.equal(toKeyPathPath([]), '$');
    t.equal(toKeyPathPath(['key', 665, '@id']), '$.key[665]["@id"]');

    t.end();
  });

  // ===========================================================================
  t.test('types', t => {
    // ---------------------------------------------------------------- isSet()
    t.ok(isSet(new Set()));
    t.ok(isSet(runInNewContext('new Set()')));
    t.ok(!isSet(new Map()));
    t.ok(!isSet(runInNewContext('new Map()')));

    // ---------------------------------------------------------------- isMap()
    t.ok(!isMap(new Set()));
    t.ok(!isMap(runInNewContext('new Set()')));
    t.ok(isMap(new Map()));
    t.ok(isMap(runInNewContext('new Map()')));

    // ---------------------------------------------------------------- isURL()
    t.ok(isURL(new URL('https://apparebit.com/')));
    t.notOk(isURL('https://apparebit.com/'));

    // -------------------------------------------------------------- isBoxed()
    t.ok(isBoxed(new Object(665n)));
    t.ok(isBoxed(new Object(true)));
    t.ok(isBoxed(new Object(42)));
    t.ok(isBoxed(new Object('boo')));
    t.notOk(isBoxed());
    t.notOk(isBoxed(null));
    t.notOk(isBoxed(665n));
    t.notOk(isBoxed(true));
    t.notOk(isBoxed(42));
    t.notOk(isBoxed('boo'));

    // -------------------------------------------------------------- isBoxed()
    t.notOk(isStringArray());
    t.notOk(isStringArray(null));
    t.notOk(isStringArray(665));
    t.notOk(isStringArray([665]));
    t.ok(isStringArray([]));
    t.ok(isStringArray(['boo']));

    t.end();
  });

  t.end();
});
