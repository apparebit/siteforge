/* © 2019-2020 Robert Grimm */

import { Logger, Metrics } from '@grr/operations';
import { objectify, STYLES, toCount, toTime } from '@grr/operations/format';
import harness from './harness.js';

const { getPrototypeOf } = Object;
const { toStringTag } = Symbol;
const { has } = Reflect;
const { parse: parseJSON } = JSON;

harness.test('@grr/operations', t => {
  t.test('format', t => {
    // --------------------------------------------- objectify():
    let o = objectify(new Error('boo'));
    t.is(o.message, 'boo');
    t.is(o.name, 'Error');
    t.is(typeof o.stack, 'string');

    const oh = { a: 'plain', object: '!' };
    o = objectify(oh);
    t.is(o, oh);

    o = objectify([42]);
    t.same(o, [42]);

    // --------------------------------------------- toCount():
    t.is(toCount(0, 'second'), '0 seconds');
    t.is(toCount(1, 'second'), '1 second');
    t.is(toCount(665, 'second'), '665 seconds');

    // --------------------------------------------- toTime():
    t.is(toTime(3), '3 ms');
    t.is(toTime(1003), '1.003 s');
    t.is(toTime(61003), '1:01.003 min');

    // Check rounding to whole milliseconds.
    t.is(toTime(3.69), '4 ms');
    t.is(toTime(1003.69), '1.004 s');
    t.is(toTime(61003.21), '1:01.003 min');

    // Check big integers, which start in nanoseconds.
    t.is(toTime(3_690_000n), '4 ms');
    t.is(toTime(1_003_690_000n), '1.004 s');
    t.is(toTime(61_003_210_000n), '1:01.003 min');

    // --------------------------------------------- STYLES:
    // cspell:disable
    t.is(STYLES.bold('bold'), '\x1b[1mbold\x1b[22m');
    t.is(STYLES.faint('faint'), '\x1b[90mfaint\x1b[39m');
    t.is(STYLES.green('green'), '\x1b[1;32mgreen\x1b[39;22m');
    t.is(STYLES.magenta('magenta'), '\x1b[1;35mmagenta\x1b[39;22m');
    t.is(STYLES.orange('orange'), '\x1b[1;38;5;208morange\x1b[39;22m');
    t.is(STYLES.red('red'), '\x1b[1;31mred\x1b[39;22m');
    // cspell:enable

    t.end();
  });

  t.test('Logger', t => {
    const logged = [];
    const println = line => logged.push(line);

    // --------------------------------------------- Logging JSON:
    let logger = new Logger({ println, json: true });

    logger.notice(`The message`, ['More details']);
    let record = parseJSON(logged.shift());
    t.ok(has(record, 'timestamp'));
    t.notOk(has(record, 'label'));
    t.is(record.level, 'notice');
    t.is(record.message, 'The message');
    t.same(record.detail, ['More details']);

    logger.warning(`Keep your distance!`);
    record = parseJSON(logged.shift());
    t.ok(has(record, 'timestamp'));
    t.notOk(has(record, 'label'));
    t.is(record.level, 'warning');
    t.is(record.message, 'Keep your distance!');
    t.notOk(has(record, 'detail'));

    logger.signOff({ files: 42, duration: 665 });
    record = parseJSON(logged.shift());
    t.ok(has(record, 'timestamp'));
    t.notOk(has(record, 'label'));
    t.is(record.level, 'warning');
    t.is(record.message, 'site:forge is done');
    t.same(record.detail, {
      files: 42,
      duration: 665,
      errors: 0,
      warnings: 1,
    });

    // --------------------------------------------- Logging stylish text:
    logger = new Logger({ println, stylish: false, volume: 2 });
    const ts = `^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z`;

    logger.debug(`Testing logger`);
    record = logged.shift();
    t.match(record, new RegExp(`${ts} \\[DEBUG\\] Testing logger$`, `u`));

    logger.signOff({ files: 42, duration: 665 });
    record = logged.shift();
    t.match(
      record,
      new RegExp(
        `${ts} \\[SUCCESS\\] site:forge processed 42 files in 665 ms$`,
        `u`
      )
    );

    t.end();
  });

  t.test('Metrics', t => {
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

  t.end();
});
