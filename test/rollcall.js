/* © 2020 Robert Grimm */

import harness from './harness.js';
import Rollcall from '@grr/rollcall';
import { candyColorStyles, COLOR } from '@grr/oddjob/candy';

const { has } = Reflect;
const { parse: parseJSON } = JSON;

harness.test('@grr/rollcall', t => {
  const logged = [];
  const println = line => logged.push(line);

  // ------------------------------------------------------------ Logging JSON
  let logger = new Rollcall({ println, json: true });

  logger.notice(`The message`, ['More details']);
  let record = parseJSON(logged.shift());
  t.ok(has(record, 'timestamp'));
  t.notOk(has(record, 'label'));
  t.is(record.level, 'notice');
  t.is(record.message, 'The message');
  t.same(record.data, ['More details']);

  logger.warning(`Keep your distance!`);
  record = parseJSON(logged.shift());
  t.ok(has(record, 'timestamp'));
  t.notOk(has(record, 'label'));
  t.is(record.level, 'warning');
  t.is(record.message, 'Keep your distance!');
  t.notOk(has(record, 'data'));

  logger.signOff({ files: 42, duration: 665 });
  record = parseJSON(logged.shift());
  t.ok(has(record, 'timestamp'));
  t.notOk(has(record, 'label'));
  t.is(record.level, 'warning');
  t.is(record.message, 'Done!');
  t.same(record.data, {
    files: 42,
    duration: 665,
    errors: 0,
    warnings: 1,
  });

  // ------------------------------------------------------------ Logging Text
  logger = new Rollcall({
    candy: candyColorStyles(COLOR.NONE),
    println,
    service: 'site:forge',
    volume: 2,
  });

  logger.debug(`Testing logger`);
  record = logged.shift();
  t.is(record, `[DEBUG] <site:forge> Testing logger`);

  logger.signOff({ files: 42, duration: 665 });
  record = logged.shift();
  t.is(record, `[SUCCESS] site:forge processed 42 files in 665 ms!`);

  t.end();
});
