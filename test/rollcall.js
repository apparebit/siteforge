/* © 2020 Robert Grimm */

import { candyColorStyles, COLOR } from '@grr/oddjob/candy';
import harness from './harness.js';
import Rollcall from '@grr/rollcall';

const { has } = Reflect;
const { parse: parseJSON } = JSON;

harness.test('@grr/rollcall', t => {
  const logged = [];
  const println = line => logged.push(line);

  // ------------------------------------------------------------ Logging JSON
  let logger = new Rollcall({ println, json: true, service: 'SITE:FORGE' });

  logger.notice(`The message`, ['More details']);
  let record = parseJSON(logged.shift());
  t.ok(has(record, 'timestamp'));
  t.notOk(has(record, 'label'));
  t.is(record.level, 'notice');
  t.is(record.message, 'The message');
  t.same(record.data, ['More details']);

  logger = new Rollcall({ println, json: true });
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

  logger.debug(`testing message by itself`);
  t.is(logged.shift(), `[site:forge] [DEBUG] testing message by itself`);

  logger.notice('testing numeric detail', 665);
  t.is(logged.shift(), '[site:forge] [NOTE]  testing numeric detail');

  logger.notice('testing object property detail', { key: 'value' });
  t.is(logged.shift(), '[site:forge] [NOTE]  testing object property detail');
  t.is(logged.shift(), 'key: value');

  logger.notice('testing array element detail', [665]);
  t.is(logged.shift(), '[site:forge] [NOTE]  testing array element detail');
  t.is(logged.shift(), '665');

  let err = new Error('boo!');
  err.stack = '';
  logger.error('testing error detail', err);
  t.is(logged.shift(), '[site:forge] [ERROR] testing error detail: boo!');

  err.stack = 'boo!\n    at Type.method (file:0:0)';
  logger.error('testing error detail', err);
  t.is(logged.shift(), '[site:forge] [ERROR] testing error detail');
  t.is(logged.shift(), 'boo!');
  t.is(logged.shift(), '    at Type.method (file:0:0)');

  // signOff() is about to set the exitCode, so save value and restore later.
  const { exitCode } = process;

  logger.signOff({ files: 42, duration: 665 });
  const didIt = `Processed 42 files in 665 ms`;
  t.is(logged.shift(), `[site:forge] [ERROR] ${didIt} with 2 errors!`);
  t.is(process.exitCode, 70);

  logger.warnings = 3;
  logger.signOff({ files: 42, duration: 665 });
  t.is(
    logged.shift(),
    `[site:forge] [ERROR] ${didIt} with 2 errors and 3 warnings!`
  );

  logger.errors = 0;
  logger.signOff({ files: 42, duration: 665 });
  t.is(logged.shift(), `[site:forge] [WARN]  ${didIt} with 3 warnings!`);

  logger.warnings = 0;
  logger.signOff({ files: 42, duration: 665 });
  t.is(
    logged.shift(),
    `[site:forge] [NOTE]  ${didIt} with no errors and no warnings!`
  );

  logger.signOff({ pass: 33, fail: 9, duration: 665 });
  t.is(
    logged.shift(),
    `[site:forge] [ERROR] 9 out of 42 tests failed in 665 ms!`
  );

  logger.signOff({ duration: 665 });
  t.is(
    logged.shift(),
    `[site:forge] [NOTE]  Ran for 665 ms with no errors and no warnings!`
  );

  t.is(logger.embolden('That is <b>bold</b>!'), 'That is bold!');

  process.exitCode = exitCode;
  t.end();
});
