/* © 2020 Robert Grimm */

import Builtin from '@grr/oddjob/builtin';
import {
  asciify,
  escapeRegex,
  slugify,
  toKeyPathKeys,
  toKeyPathPath,
  WILDCARD,
} from '@grr/oddjob/string';
import {
  candyColorStyles,
  COLOR,
  countColors,
  default as candy,
} from '@grr/oddjob/candy';
import { count, duration } from '@grr/oddjob/format';
import harness from './harness.js';
import {
  isError,
  relocate,
  TracelessError,
  traceErrorPosition,
} from '@grr/oddjob/error';
import { isBoxed, isMap, isSet, isURL } from '@grr/oddjob/types';
import pickle from '@grr/oddjob/pickle';
import { runInNewContext } from 'vm';
import { types } from 'util';

const { isArray } = Array;
const { isNativeError } = types;
const { MAX_SAFE_INTEGER } = Number;
const { BASIC, FULL, INDEXED, NONE } = COLOR;

harness.test('@grr/oddjob', t => {
  // ===========================================================================
  t.test('builtin', t => {
    t.is(Builtin.Array, Array);
    t.is(Builtin.BigInt, BigInt);
    t.is(Builtin.Boolean, Boolean);
    t.is(Builtin.Date, Date);
    t.is(Builtin.Error, Error);
    t.is(Builtin.Function, Function);
    t.is(Builtin.JSON, JSON);
    t.is(Builtin.Map, Map);
    t.is(Builtin.Number, Number);
    t.is(Builtin.Object, Object);
    t.is(Builtin.Promise, Promise);
    t.is(Builtin.Proxy, Proxy);
    t.is(Builtin.Reflect, Reflect);
    t.is(Builtin.RegExp, RegExp);
    t.is(Builtin.Set, Set);
    t.is(Builtin.String, String);
    t.is(Builtin.Symbol, Symbol);
    t.end();
  });

  // ===========================================================================
  t.test('candy', t => {
    // ---------------------------------------------------------- countColors()
    t.is(countColors({ env: { NODE_DISABLE_COLORS: '', stream: {} } }), NONE);
    t.is(countColors({ env: { NO_COLOR: '', stream: {} } }), NONE);
    t.is(countColors({ env: {}, stream: { isTTY: false } }), NONE);
    t.is(countColors({ env: { TERM: 'dumb' }, stream: { isTTY: true } }), NONE);
    t.is(countColors({ env: { CI: '' }, stream: { isTTY: true } }), NONE);
    t.is(
      countColors({ env: { CI: '', TRAVIS: '' }, stream: { isTTY: true } }),
      BASIC
    );
    t.is(
      countColors({
        env: { TERM_PROGRAM: 'iTerm.app' },
        stream: { isTTY: true },
      }),
      INDEXED
    );
    t.is(
      countColors({
        env: { TERM_PROGRAM: 'Apple_Terminal' },
        stream: { isTTY: true },
      }),
      INDEXED
    );
    t.is(
      countColors({ env: { TERM: 'xterm-256' }, stream: { isTTY: true } }),
      INDEXED
    );
    t.is(
      countColors({
        env: { TERM_PROGRAM: 'MacTerm' },
        stream: { isTTY: true },
      }),
      FULL
    );
    t.is(
      countColors({ env: { TERM: 'vt100' }, stream: { isTTY: true } }),
      BASIC
    );
    t.is(
      countColors({ env: { TERM: 'monochromatic' }, stream: { isTTY: true } }),
      NONE
    );

    // ----------------------------------------------------- candyColorStyles()
    t.throws(() => candyColorStyles(665));

    // ---------------------------------------------------------------- candy()
    let sweet = candy({ env: { TERM: 'dumb' }, stream: { isTTY: true } });
    t.is(sweet.colors, NONE);
    t.is(sweet.boldOrange(''), '');

    sweet = candy({ env: { TERM: 'xterm' }, stream: { isTTY: true } });
    t.is(sweet.colors, BASIC);
    t.is(sweet.boldOrange(''), '\x1b[33;1m\x1b[39;22m');

    sweet = candy({ env: { TERM: 'xterm-256' }, stream: { isTTY: true } });
    t.is(sweet.colors, INDEXED);
    t.is(sweet.boldOrange(''), '\x1b[38;5;208;1m\x1b[39;22m');

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

    // ------------------------------------------------------- TracelessError()
    x = TracelessError();
    t.ok(x instanceof Error);
    t.ok(isNativeError(x));
    t.ok(isError(x));

    x = TracelessError('boo', TypeError);
    t.ok(x instanceof Error);
    t.ok(isNativeError(x));
    t.ok(isError(x));

    // --------------------------------------------------- traceErrorPosition()
    x = new Error('boo');
    const trace = traceErrorPosition(x);
    t.ok(isArray(trace));
    t.ok(trace.length > 5);
    t.ok(trace.every(line => typeof line === 'string'));
    t.ok(!trace.some(line => /^ +at /u.test(line)));
    t.ok(trace[0].startsWith('Test.<anonymous> (file://'));

    // ------------------------------------------------------------- relocate()
    t.is(
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

    t.end();
  });

  // ===========================================================================
  t.test('format', t => {
    // ---------------------------------------------------------------- count()
    t.is(count(0, 'second'), '0 seconds');
    t.is(count(1, 'second'), '1 second');
    t.is(count(665, 'second'), '665 seconds');

    // ------------------------------------------------------------- duration()
    t.is(duration(3), '3 ms');
    t.is(duration(1003), '1.003 s');
    t.is(duration(61003), '1:01.003 min');

    // Check rounding to whole milliseconds.
    t.is(duration(3.69), '4 ms');
    t.is(duration(1003.69), '1.004 s');
    t.is(duration(61003.21), '1:01.003 min');

    // Check big integers, which start in nanoseconds.
    t.is(duration(3_690_000n), '4 ms');
    t.is(duration(1_003_690_000n), '1.004 s');
    t.is(duration(61_003_210_000n), '1:01.003 min');

    t.end();
  });

  // ===========================================================================
  t.test('string', t => {
    // -------------------------------------------------------------- asciify()
    t.is(
      asciify('àáâ ãäå æçè éêë ìíî ïñò óôõ öœø ùúû üýÿ ðłß Ǆǅǆ'),
      'aaa aaeaa aece eee iii ino ooo oeoeoe uuu ueyy dlss DZDzdz'
    );
    t.is(
      asciify('ÀÁÂ ÃÄÅ ÆÇÈ ÉÊË ÌÍÎ ÏÑÒ ÓÔÕ ÖŒØ ÙÚÛ ÜÝŸ ÐŁẞ'),
      'AAA AAeAa AeCE EEE III INO OOO OeOeOe UUU UeYY DLSS'
    );
    t.is(asciify('㎧ ㏗ ⓠ ſ Ⅷ 🅏 ẚ ŉ'), `m/s pH q s VIII WC a' 'n`);
    t.is(asciify('-﹣－‐‑﹘–—'), '--------');

    // ---------------------------------------------------------- escapeRegex()
    t.is(escapeRegex('[a-z]{26}(00)*?'), '\\[a\\-z\\]\\{26\\}\\(00\\)\\*\\?');

    // -------------------------------------------------------------- slugify()
    t.is(slugify('Çäłÿ at - 7 ㎯?'), 'caely-at-7-rads2');

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

    t.is(toKeyPathPath([]), '$');
    t.is(toKeyPathPath(['key', 665, '@id']), '$.key[665]["@id"]');

    t.end();
  });

  // ===========================================================================
  t.test('pickle', t => {
    t.is(pickle(true), `true`);
    t.is(pickle(new Object(true)), `true`);
    t.is(pickle(42), `42`);
    t.is(pickle(new Object(42)), `42`);
    t.is(pickle(Infinity), `null`);
    t.is(pickle('ooh la la'), `"ooh la la"`);
    t.is(pickle(new Object('ooh la la')), `"ooh la la"`);
    t.is(pickle(665n), `665`);
    t.is(pickle(new Object(665n)), `665`);
    t.is(
      pickle(BigInt(MAX_SAFE_INTEGER) + 2n),
      `{"@type":"bigint","value":"9007199254740993"}`
    );
    t.is(
      pickle(new Object(BigInt(MAX_SAFE_INTEGER) + 2n)),
      `{"@type":"bigint","value":"9007199254740993"}`
    );
    t.is(pickle(null), `null`);
    t.is(pickle(), undefined);
    t.is(pickle([undefined]), `[null]`);
    t.is(pickle(Symbol.iterator), undefined);
    t.is(pickle([Symbol.iterator]), `[null]`);
    t.is(pickle(/.*/u), `"/.*/u"`);

    t.is(
      pickle(new Date(`2020-06-19T00:00:00Z`)),
      `"2020-06-19T00:00:00.000Z"`
    );

    t.is(
      pickle(new URL(`https://apparebit.com/about`)),
      `"https://apparebit.com/about"`
    );

    t.is(
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
    t.is(pickle(v, { decycled: true }), `{"w":{"v":{"@ref":"$[\\"w\\"]"}}}`);

    t.is(pickle([1, 2, 3]), `[1,2,3]`);
    t.is(pickle(new Set([1, 2, 3])), `[1,2,3]`);

    t.is(
      pickle(TracelessError('boo')),
      `{"@type":"error","name":"TracelessError","message":"boo","stack":[]}`
    );

    const fn = number => number === 42;
    t.is(pickle(fn), `{"@type":"function","value":"number => number === 42"}`);

    t.is(
      pickle(
        new Map([
          ['key1', 2],
          [{}, 1],
        ])
      ),
      `[["key1",2],[{},1]]`
    );

    t.is(
      pickle(
        new Map([
          ['key1', 2],
          ['key2', 1],
        ])
      ),
      `[["key1",2],["key2",1]]`
    );

    t.is(
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

    t.end();
  });

  t.end();
});
