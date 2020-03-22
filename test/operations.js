/* © 2019-2020 Robert Grimm */

import { Logger, Metrics } from '@grr/operations';
import { LEVEL_WIDTH, objectify, toHumanTime } from '@grr/operations/format';
import harness from './harness.js';

const { has } = Reflect;
const { parse: parseJSON } = JSON;

harness.test('@grr/operations', t => {
  t.test('format', t => {
    t.is(LEVEL_WIDTH, 8);
    t.is(toHumanTime(3), '3ms');
    t.is(toHumanTime(1003), '1.003s');
    t.is(toHumanTime(61003), '1:01.003m');

    let o = objectify(new Error('boo'));
    t.is(o.message, 'boo');
    t.is(o.name, 'Error');
    t.is(typeof o.stack, 'string');

    const oh = { a: 'plain', object: '!' };
    o = objectify(oh);
    t.is(o, oh);

    o = objectify([42]);
    t.same(o, [42]);

    t.end();
  });

  t.test('Logger', t => {
    const logged = [];
    const println = line => logged.push(line);
    const logger = new Logger({ println, json: true });
    logger.notice(`The message`, ['More details']);
    let record = parseJSON(logged[0]);

    t.ok(has(record, 'timestamp'));
    t.notOk(has(record, 'label'));
    t.same(record.message, 'The message');
    t.same(record.detail, ['More details']);

    t.end();
  });

  t.test('Metrics', t => {
    let clockwerk = 0;
    const metrics = new Metrics({ clock: () => clockwerk });

    metrics.count(3, 'ring');
    metrics.count(7, 'ring');
    metrics.count(9, 'ring');
    metrics.count(1, 'ring');

    t.same(metrics.summarize('count', 'ring'), {
      count: 4,
      sum: 20,
      mean: 5,
      min: 1,
      max: 9,
    });

    // The clock operates in nanosecond bigints.
    let done = metrics.time('a', 'flow');
    clockwerk = 500;
    done();

    done = metrics.time('b', 'flow');
    clockwerk = 2_000;
    done();

    // The statistics are in millisecond numbers.
    t.same(metrics.summarize('time', '*', 'flow'), {
      count: 2,
      sum: 2000,
      mean: 1000,
      min: 500,
      max: 1500,
    });

    t.end();
  });

  t.end();
});
