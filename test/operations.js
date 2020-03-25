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
    t.is(toTime(3), '3ms');
    t.is(toTime(1003), '1.003s');
    t.is(toTime(61003), '1:01.003m');

    // --------------------------------------------- STYLES:
    t.is(STYLES.bold('bold'), '\x1b[1mbold\x1b[22m');
    t.is(STYLES.faint('faint'), '\x1b[90mfaint\x1b[39m');
    t.is(STYLES.green('green'), '\x1b[1;32mgreen\x1b[39;22m');
    t.is(STYLES.magenta('magenta'), '\x1b[1;35mmagenta\x1b[39;22m');
    t.is(STYLES.orange('orange'), '\x1b[1;38;5;208morange\x1b[39;22m');
    t.is(STYLES.red('red'), '\x1b[1;31mred\x1b[39;22m');

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

    logger.debug(`Testing logger`);
    record = logged.shift();
    t.match(
      record,
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z DEBUG {3}Testing logger$/u
    );

    logger.signOff({ files: 42, duration: 665 });
    record = logged.shift();
    t.match(
      record,
      /^[TZ\d.:-]{24} SUCCESS site:forge processed 42 files in 665ms$/u
    );

    t.end();
  });

  t.test('Metrics', t => {
    let clockwerk = 0;
    const metrics = new Metrics({ clock: () => clockwerk });

    // --------------------------------------------- Counting one count:
    let counter = metrics.counter('one count');
    counter.add(3);
    counter.add(7);
    counter.add(9);
    counter.add(1);

    t.is(counter[toStringTag], 'Counter');
    t.throws(() => getPrototypeOf(getPrototypeOf(counter))[toStringTag]);
    t.is(counter.name, 'one count');
    t.notOk(counter.bigint);
    t.is(counter.size, 1);
    t.is(counter.get(), 20);
    t.same(counter.summarize(), {
      count: 1,
      mean: 20,
      min: 20,
      max: 20,
    });

    // --------------------------------------------- Counting four counts:
    counter = metrics.counter('four counts');
    counter.add(3, 'a');
    counter.add(7, 'b');
    counter.add(9, 'c');
    counter.add(1, 'd');

    t.is(counter[toStringTag], 'Counter');
    t.is(counter.name, 'four counts');
    t.notOk(counter.bigint);
    t.is(counter.size, 4);
    t.throws(() => counter.get());
    t.same(counter.summarize(), {
      count: 4,
      mean: 5,
      min: 1,
      max: 9,
    });

    // --------------------------------------------- Timing two times:
    let timer = metrics.timer('watch');
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
    t.notOk(timer.bigint);
    t.is(timer.size, 2);
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
