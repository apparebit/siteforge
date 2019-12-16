/* © 2019 Robert Grimm */

import Sq from '@grr/sequitur';
import tap from 'tap';

const { apply } = Reflect;
const configurable = true;
const enumerable = true;
const { getPrototypeOf } = Object;
const { iterator: ITERATOR } = Symbol;
const IteratorPrototype = getPrototypeOf(getPrototypeOf([][ITERATOR]()));
const { toString } = Object.prototype;
const writable = true;

tap.test('@grr/sequitur', async t => {
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
    __proto__: IteratorPrototype,
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

  sq = Sq.concat([1], [2], [3]).with(context);
  t.strictEqual(sq.context, context);
  sq = sq.map(v => v);
  t.strictEqual(sq.context, context);
  t.strictSame(sq.collect(), [1, 2, 3]);

  t.strictSame(Sq.zip([1], [2], [3]).collect(), [[1, 2, 3]]);
  sq = Sq.zip([1], [2], [3]).with(context);
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
