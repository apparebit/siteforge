/* © 2020 Robert Grimm */

import Metrics from '@grr/metrics';
import harness from './harness.js';

const { getPrototypeOf } = Object;
const { toStringTag } = Symbol;

harness.test('@grr/metrics', t => {
  let clockwerk = 0;
  const clock = () => clockwerk;
  const metrics = new Metrics();

  // --------------------------------------------- Counter: 0 measurements
  let counter = metrics.counter('one count');
  t.is(counter.size, 0);
  t.same(counter.summarize(), { count: 0 });
  t.is(metrics.counter('one count'), counter);
  t.throws(() => metrics.counter('one count', { isBigInt: true }));

  // --------------------------------------------- Counter: 1 measurement
  counter.add(3);
  counter.add(7);
  counter.add(9);
  counter.add(1);

  t.is(counter[toStringTag], 'Counter');
  t.throws(() => new getPrototypeOf(getPrototypeOf(counter)).constructor());
  t.is(counter.name, 'one count');
  t.notOk(counter.isBigInt);
  t.is(counter.size, 1);
  t.is(counter.get(), 20);
  t.is(counter.get(''), 20);
  t.same(counter.summarize(), {
    count: 1,
    mean: 20,
    min: 20,
    max: 20,
  });

  // --------------------------------------------- Counter: 4 measurements
  counter = metrics.counter('four counts');
  counter.add(3, 'a');
  counter.add(7, 'b');
  counter.add(9, 'c');
  counter.add(1, 'd');
  t.throws(() => counter.add(665n));

  t.is(counter[toStringTag], 'Counter');
  t.is(counter.name, 'four counts');
  t.notOk(counter.isBigInt);
  t.is(counter.size, 4);
  t.is(counter.get(), undefined);
  t.is(counter.get('a'), 3);
  t.is(counter.get('b'), 7);
  t.is(counter.get('c'), 9);
  t.is(counter.get('d'), 1);
  t.same(counter.summarize(), {
    count: 4,
    mean: 5,
    min: 1,
    max: 9,
  });

  // --------------------------------------------- Counter: big integers
  counter = metrics.counter('big integer', { isBigInt: true });
  counter.add(3n, 'a');
  counter.add(7n, 'b');
  counter.add(9n, 'c');
  counter.add(1n, 'd');

  t.is(counter[toStringTag], 'Counter');
  t.is(counter.name, 'big integer');
  t.ok(counter.isBigInt);
  t.is(counter.size, 4);
  t.is(counter.get(), undefined);
  t.is(counter.get('a'), 3n);
  t.is(counter.get('b'), 7n);
  t.is(counter.get('c'), 9n);
  t.is(counter.get('d'), 1n);
  t.same(counter.summarize(), {
    count: 4,
    mean: 5n,
    min: 1n,
    max: 9n,
  });

  // --------------------------------------------- Timing two times:
  let timer = metrics.timer('watch', { clock });
  t.is(metrics.timer('watch'), timer);
  t.is(metrics.timer('watch', { clock }), timer);

  let end = timer.start('a');
  clockwerk = 500;
  end();
  t.throws(() => end());

  end = timer.start('b');
  clockwerk = 2000;
  end();

  end = timer.start('c');
  clockwerk = 1999;
  t.throws(() => end());

  t.is(timer[toStringTag], 'Timer');
  t.is(timer.name, 'watch');
  t.notOk(timer.isBigInt);
  t.is(timer.size, 2);
  t.is(timer.get('a'), 500);
  t.is(timer.get('b'), 1500);
  t.same(timer.summarize(), {
    count: 2,
    mean: 1000,
    min: 500,
    max: 1500,
  });

  t.end();
});
