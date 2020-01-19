/* © 2019-2020 Robert Grimm */

import harness from './harness.js';
import Sq from '@grr/sequitur';

const { apply, has } = Reflect;
const configurable = true;
const { create, defineProperty, getPrototypeOf, prototype } = Object;
const { fromCharCode } = String;
const { iterator: ITERATOR } = Symbol;
const BATON = Symbol('baton');
const { toString } = prototype;

function* gen() {
  yield 42;
  yield 665;
}

// eslint-disable-next-line require-await
async function* asyncGen() {
  // Faking it...
  yield 6;
  yield 6;
  yield 6;
}

harness.test('@grr/sequitur', t => {
  t.test('Helping with Iteration', async t => {
    // Two prototypes
    const IteratorPrototype = getPrototypeOf(getPrototypeOf([][ITERATOR]()));
    t.equal(Sq.IteratorPrototype, IteratorPrototype);

    const AsyncIteratorPrototype = getPrototypeOf(
      getPrototypeOf(async function*() {}.prototype)
    );
    t.equal(Sq.AsyncIteratorPrototype, AsyncIteratorPrototype);

    // Four predicates
    t.notOk(Sq.isIterable(Sq.from(asyncGen)));
    t.ok(Sq.isIterable('123'));
    t.ok(Sq.isIterable([1, 2, 3]));
    t.notOk(Sq.isIterable(13));
    t.notOk(Sq.isIterable(function*() {}));

    t.notOk(Sq.isNonStringIterable(Sq.from(asyncGen)));
    t.notOk(Sq.isNonStringIterable('123'));
    t.ok(Sq.isNonStringIterable([1, 2, 3]));
    t.notOk(Sq.isNonStringIterable(13));
    t.notOk(Sq.isNonStringIterable(function*() {}));

    t.ok(Sq.isAsyncIterable(Sq.from(asyncGen)));
    t.notOk(Sq.isAsyncIterable('123'));
    t.notOk(Sq.isAsyncIterable([1, 2, 3]));
    t.notOk(Sq.isAsyncIterable(13));
    t.notOk(Sq.isAsyncIterable(function*() {}));

    t.ok(Sq.isAsyncFunction(asyncGen));
    t.notOk(Sq.isAsyncFunction('123'));
    t.notOk(Sq.isAsyncFunction([1, 2, 3]));
    t.notOk(Sq.isAsyncFunction(13));
    t.notOk(Sq.isAsyncFunction(function*() {}));
    t.ok(Sq.isAsyncFunction(function youBetYourAsync() {}));

    const poser = () => {};
    poser.async = 'totally';
    t.ok(Sq.isAsyncFunction(poser));

    // One Conversion (Used Twice)
    let iterable = Sq.toAsyncIterable([1, 2, 3]);
    t.notOk(Sq.isIterable(iterable));
    t.ok(Sq.isAsyncIterable(iterable));
    t.notOk(Sq.isAsyncFunction(iterable));

    let sum = 0;
    for await (const element of iterable) {
      sum += element;
    }
    t.equal(sum, 6);

    iterable = Sq.of(1, 2, 3, 4, 5).toAsync();
    sum = 0;
    for await (const element of iterable) {
      sum += element;
    }
    t.equal(sum, 15);

    // Make sure that return() is passed through.
    const log = [];
    iterable = Sq.toAsyncIterable({
      [ITERATOR]() {
        return create(Sq.IteratorPrototype, {
          next: {
            configurable,
            value(...args) {
              log.push({ type: 'next', args });
              return { value: 665 };
            },
          },
          return: {
            configurable,
            value(...args) {
              log.push({ type: 'return', args });
              return { value: 42, done: true };
            },
          },
        });
      },
    });

    for await (const _ of iterable) {
      break;
    }

    t.strictSame(log, [
      { type: 'next', args: [] },
      { type: 'return', args: [] },
    ]);
    t.end();
  });

  t.test('Creating Sequences', async t => {
    t.strictSame(Sq.from().collect(), []);
    t.strictSame(Sq.from([1, 2, 3]).collect(), [1, 2, 3]);
    t.strictSame(Sq.from(gen).collect(), [42, 665]);
    t.strictSame(await Sq.from(Sq.from(asyncGen)).join(), '666');
    t.strictSame(await Sq.from(asyncGen).join(), '666');
    t.strictSame([...Sq.from('boo')], ['boo']);
    t.strictSame([...Sq.from(665)], [665]);
    t.throws(
      () => Sq.from(() => {}),
      /Unable to tell whether function \(\) => \{\} is synchronous or asynchronous/u
    );

    t.strictSame(Sq.fromString().collect(), []);
    t.strictSame(Sq.fromString([1, 2, 3]).collect(), [1, 2, 3]);
    t.strictSame(Sq.fromString(gen).collect(), [42, 665]);
    t.strictSame(await Sq.fromString(Sq.from(asyncGen)).join(), '666');
    t.strictSame(await Sq.fromString(asyncGen).join(), '666');
    t.strictSame(Sq.fromString('boo').collect(), ['b', 'o', 'o']);

    t.strictSame(Sq.of(1, 2, 3).collect(), [1, 2, 3]);
    t.strictSame(Sq.of().collect(), []);
    t.end();
  });

  // Many of the following tests require that we materialize a sequence so that
  // we can compare it against the expected values. Instead of just using, say,
  // collect() to create an array, such tests cover the spectrum of available
  // terminal operations and thereby test them, too.

  t.test('Counting', async t => {
    t.throws(
      () => Sq.count('0'),
      /Start "0" and step 1 for static count\(\) must both be \(big\) integers, with step also being nonzero/u
    );

    t.throws(
      () => Sq.count(0, '1'),
      /Start 0 and step "1" for static count\(\) must both be \(big\) integers, with step also being nonzero/u
    );

    t.throws(
      () => Sq.count(0, 1n),
      /Start 0 and step 1n for static count\(\) must both be \(big\) integers, with step also being nonzero/u
    );

    t.throws(
      () => Sq.count(0n, 0n),
      /Start 0n and step 0n for static count\(\) must both be \(big\) integers, with step also being nonzero/u
    );

    t.throws(
      () => Sq.count().take(-1),
      /Count -1 for take\(\) is not a positive integer/u
    );

    t.strictSame(
      Sq.count(1)
        .take(3)
        .collect(),
      [1, 2, 3]
    );

    t.strictSame(
      Sq.count(1n, 1n)
        .take(3)
        .collect(),
      [1n, 2n, 3n]
    );

    const list = [];
    Sq.count(-1, -1)
      .take(3)
      .tap(el => list.push(el))
      .each();
    t.strictSame(list, [-1, -2, -3]);

    list.length = 0;
    await Sq.count(0, 5)
      .toAsync()
      .take(4)
      .tap(el => list.push(el))
      .each();
    t.strictSame(list, [0, 5, 10, 15]);

    const notSync = Sq.of(1, 2, 3).toAsync();
    t.equal(notSync.toAsync(), notSync);

    t.end();
  });

  t.test('Turning Properties into Sequences', t => {
    const object = { a: 1, b: 2 };
    defineProperty(object, 'c', {
      configurable,
      value: 3,
    });

    // Sq.keys()
    t.strictSame(Sq.keys(object).collect(), ['a', 'b']);
    t.strictSame(
      Sq.keys(['a', 'b', 'c']).collect(new Set()),
      new Set([0, 1, 2])
    );

    // Sq.values()
    const list = [];
    Sq.values(object).each(el => list.push(el));
    t.strictSame(list, [1, 2]);

    t.equal(
      Sq.values(
        new Map([
          ['a', 1],
          ['b', 2],
        ])
      ).join(),
      '12'
    );

    // Sq.entries()
    t.strictSame(Sq.entries(object).collectEntries(), { a: 1, b: 2 });
    t.strictSame(
      Sq.entries(['boo', 'boo']).collectEntries(new Map()),
      new Map([
        [0, 'boo'],
        [1, 'boo'],
      ])
    );

    // Sq.descriptors()
    t.strictSame(Sq.descriptors(object).collectDescriptors(), object);
    t.strictSame(Sq.descriptors(object).collectDescriptors({ a: 665 }), object);
    t.end();
  });

  t.test('Combining Sequences', async t => {
    // concat()
    // --------

    t.strictSame(
      Sq.concat([1], [2], [3]).reduce((lst, el) => (lst.push(el), lst), []),
      [1, 2, 3]
    );

    t.strictSame(
      await Sq.concat([1], Sq.toAsyncIterable([2]), [3]).reduce(
        (lst, el) => (lst.push(el), lst),
        []
      ),
      [1, 2, 3]
    );

    t.strictSame(
      Sq.of(1, 2, 3)
        .concat([4], [5, 6])
        .collect(),
      [1, 2, 3, 4, 5, 6]
    );

    t.strictSame(
      await Sq.of(1, 2, 3)
        .concat(Sq.of(4, 5, 6).toAsync())
        .collect(),
      [1, 2, 3, 4, 5, 6]
    );

    t.strictSame(
      await Sq.from(Sq.toAsyncIterable([1, 2, 3]))
        .concat([4, 5], Sq.toAsyncIterable([6]))
        .reduce((lst, el) => (lst.push(el), lst), []),
      [1, 2, 3, 4, 5, 6]
    );

    // zip()
    // -----

    const list = [];
    await Sq.zip([1, 2], ['a', 'b'])
      .toAsync()
      .each(el => list.push(el));

    t.strictSame(list, [
      [1, 'a'],
      [2, 'b'],
    ]);

    t.strictSame(
      await Sq.zip(['a', 'b'], Sq.of(1, 2).toAsync()).collectEntries(),
      { a: 1, b: 2 }
    );

    // eslint-disable-next-line require-atomic-updates
    list.length = 0;
    await Sq.of(1, 2)
      .zip(['a', 'b'])
      // eslint-disable-next-line require-await
      .each(async function(el) {
        list.push(el);
      });

    t.strictSame(list, [
      [1, 'a'],
      [2, 'b'],
    ]);

    t.strictSame(
      await Sq.of(1, 2)
        .zip(Sq.of('a', 'b').toAsync())
        .collect(new Set()),
      new Set([
        [1, 'a'],
        [2, 'b'],
      ])
    );

    t.strictSame(
      await Sq.of(1, 2)
        .toAsync()
        .zip(Sq.of('I', 'II', 'III').zip(['a', 'b', 'c']))
        .collectEntries(new Map()),
      new Map([
        [1, ['I', 'a']],
        [2, ['II', 'b']],
      ])
    );

    // run()
    // -----

    t.strictSame(
      await Sq.of(1, 2, 3)
        .with(BATON)
        .run(function*(input, context) {
          t.equal(context, BATON);

          for (const element of input) {
            yield 2 * element;
          }
        })
        // eslint-disable-next-line require-await
        .reduce(async (acc, el) => acc + el, 0),
      12
    );

    t.strictSame(
      await Sq.of(1, 2, 3)
        .with(BATON)
        .toAsync()
        .run(async function*(input, context) {
          t.equal(context, BATON);

          for await (const element of input) {
            yield [
              fromCharCode('`'.charCodeAt(0) + element),
              {
                configurable,
                value: 3 * element,
              },
            ];
          }
        })
        .collectDescriptors(),
      { a: 3, b: 6, c: 9 }
    );

    t.end();
  });

  t.test('Maintaining Basic Machinery', t => {
    // Sq serves as an abstract base. Make sure all its stub methods throw.
    const sq = new Sq(() => [][ITERATOR](), 'context');
    for (const method of [
      'take',
      'filter',
      'map',
      'tap',
      'flatMap',
      'flatten',
      'concat',
      'zip',
      'run',
      'each',
      'reduce',
      'collect',
      'collectEntries',
      'collectDescriptors',
      'join',
    ]) {
      t.throws(
        () => sq[method](() => {}),
        new RegExp(
          `${method}\\(\\) not implemented on abstract base class for sequences`,
          'u'
        )
      );
    }

    // Symbol.toStringTag, Symbol.iterator

    const syncSeq = Sq.of(1, 2, 3);
    const asyncSeq = Sq.toAsyncIterable(syncSeq);
    const alsoAsyncSeq = syncSeq.toAsync();

    t.equal(apply(toString, sq, []), '[object Sq]');
    t.equal(apply(toString, syncSeq, []), '[object Sequence]');
    t.equal(apply(toString, asyncSeq, []), '[object async Sequence]');
    t.equal(apply(toString, alsoAsyncSeq, []), '[object async Sequence]');

    t.ok(typeof syncSeq[ITERATOR] === 'function');
    t.notOk(typeof asyncSeq[ITERATOR] === 'function');
    t.notOk(typeof alsoAsyncSeq[ITERATOR] === 'function');

    // The `async` property

    t.notOk(has(syncSeq, 'async'));
    t.ok(has(asyncSeq, 'async'));
    t.ok(has(alsoAsyncSeq, 'async'));
    t.notOk(syncSeq.async);
    t.ok(asyncSeq.async);
    t.ok(alsoAsyncSeq.async);

    // Validation of callbacks and iterables.

    t.throws(
      () => Sq.of().map(665),
      /Callback 665 for map\(\) is not a function/u
    );
    t.throws(
      () => Sq.concat(665),
      /Unable to static concat\(\) non-iterable 665/u
    );

    t.end();
  });

  t.test('Providing Context', t => {
    function double(el) {
      t.equal(this, BATON);
      return el * el;
    }

    function isOnePlus(el) {
      t.equal(this, BATON);
      return el > 1;
    }

    const s1 = Sq.from([1, 2, 3], BATON);
    const s2 = s1.map(double).filter(isOnePlus);
    t.equal(s1.context, BATON);
    t.equal(s2.context, BATON);

    const s3 = Sq.of(1, 2, 3);
    // Since with() updates the context
    t.equal(s3.context, undefined);

    const s4 = s3.with(BATON);
    const s5 = s4.map(double).filter(isOnePlus);
    t.equal(s4.context, BATON);
    t.equal(s5.context, BATON);

    t.strictSame(s2.collect(), s5.collect());

    t.end();
  });

  // It is worth noting that at this point of test execution all of sequitur's
  // code has been tested with exception of some lazy, intermediate operators.

  t.test('Intermediate, Inspecting Operators', async t => {
    const list = [];
    t.strictSame(
      Sq.of(1, 2, 3)
        .filter(el => el > 1)
        .map(el => 2 * el + 4)
        .tap(el => list.push(el))
        .flatMap(el => [[el], [el + 1]])
        .flatten()
        .collect(),
      [8, 9, 10, 11]
    );

    t.strictSame(list, [8, 10]);

    t.strictSame(
      Sq.of(665)
        .flatMap(() => {})
        .collect(),
      []
    );

    t.strictSame(
      Sq.of(665)
        .flatMap(el => el)
        .collect(),
      [665]
    );

    // Once more with async!

    list.length = 0;
    t.strictSame(
      await Sq.of(1, 2, 3)
        .toAsync()
        .filter(el => el > 1)
        .map(el => 2 * el + 4)
        .tap(el => list.push(el))
        .flatMap(el => [[el], [el + 1]])
        .flatten()
        .collect(),
      [8, 9, 10, 11]
    );

    t.strictSame(list, [8, 10]);

    t.strictSame(
      await Sq.of(665)
        .toAsync()
        .flatMap(() => {})
        .collect(),
      []
    );

    t.strictSame(
      await Sq.of(665)
        .toAsync()
        .flatMap(el => el)
        .collect(),
      [665]
    );

    // When synchronous sequences turn asynchronous due to the callback
    t.strictSame(
      await Sq.of(665)
        // eslint-disable-next-line require-await
        .filter(async el => el < 666)
        .collect(),
      [665]
    );

    t.strictSame(
      await Sq.of(665)
        // eslint-disable-next-line require-await
        .map(async el => el + 1)
        .collect(),
      [666]
    );

    // eslint-disable-next-line require-atomic-updates
    list.length = 0;
    await Sq.of(665)
      // eslint-disable-next-line require-await
      .tap(async el => list.push(el))
      .each(() => {});
    t.strictSame(list, [665]);

    t.strictSame(
      await Sq.of(665)
        // eslint-disable-next-line require-await
        .flatMap(async el => el)
        .collect(),
      [665]
    );

    t.end();
  });

  t.end();
});
