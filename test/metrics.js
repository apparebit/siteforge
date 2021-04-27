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
  t.equal(counter.size, 0);
  t.same(counter.summarize(), { count: 0 });
  t.equal(metrics.counter('one count'), counter);
  t.throws(() => metrics.counter('one count', { isBigInt: true }));

  // --------------------------------------------- Counter: 1 measurement
  counter.add(3);
  counter.add(7);
  counter.add(9);
  counter.add(1);

  t.equal(counter[toStringTag], 'Counter');
  t.throws(() => new getPrototypeOf(getPrototypeOf(counter)).constructor());
  t.equal(counter.name, 'one count');
  t.notOk(counter.isBigInt);
  t.equal(counter.size, 1);
  t.equal(counter.get(), 20);
  t.equal(counter.get(''), 20);
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

  t.equal(counter[toStringTag], 'Counter');
  t.equal(counter.name, 'four counts');
  t.notOk(counter.isBigInt);
  t.equal(counter.size, 4);
  t.equal(counter.get(), undefined);
  t.equal(counter.get('a'), 3);
  t.equal(counter.get('b'), 7);
  t.equal(counter.get('c'), 9);
  t.equal(counter.get('d'), 1);
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

  t.equal(counter[toStringTag], 'Counter');
  t.equal(counter.name, 'big integer');
  t.ok(counter.isBigInt);
  t.equal(counter.size, 4);
  t.ok(counter.has('a'));
  t.ok(!counter.has('x'));
  t.equal(counter.get(), undefined);
  t.equal(counter.get('a'), 3n);
  t.equal(counter.get('b'), 7n);
  t.equal(counter.get('c'), 9n);
  t.equal(counter.get('d'), 1n);
  t.same(counter.summarize(), {
    count: 4,
    mean: 5n,
    min: 1n,
    max: 9n,
  });

  // --------------------------------------------- Timing two times:
  let timer = metrics.timer('watch', { clock });
  t.equal(metrics.timer('watch'), timer);
  t.equal(metrics.timer('watch', { clock }), timer);

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

  t.equal(timer[toStringTag], 'Timer');
  t.equal(timer.name, 'watch');
  t.notOk(timer.isBigInt);
  t.equal(timer.size, 2);
  t.equal(timer.get('a'), 500);
  t.equal(timer.get('b'), 1500);
  t.same(timer.summarize(), {
    count: 2,
    mean: 1000,
    min: 500,
    max: 1500,
  });

  t.equal(metrics.get('watch'), timer);
  t.equal(metrics.get('wtf'), undefined);
  t.equal(metrics.get('big integer'), counter);
  t.equal(metrics.delete('big integer'), true);
  t.equal(metrics.get('big integer'), undefined);

  t.end();
});
