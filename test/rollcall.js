/* © 2020 Robert Grimm */

import { basename } from 'path';
import { EOL } from 'os';
import harness from './harness.js';
import Rollcall from '@grr/rollcall';
import { ErrorMessage } from '@grr/oddjob/error';

const { has } = Reflect;
const { parse: parseJSON } = JSON;

class Logger extends Rollcall {
  static STAMP = '';
  timestamp() {
    return Logger.STAMP;
  }
}

harness.test('@grr/rollcall', t => {
  const logged = [];
  const stream = {
    write(line) {
      if (line.endsWith('\r\n')) {
        line = line.slice(0, -2);
      } else if (line.endsWith('\n')) {
        line = line.slice(0, -1);
      }
      logged.push(line);
    },
  };

  // ------------------------------------------------------------ Logging JSON
  let logger = new Logger({ stream, json: true, label: 'SITE:FORGE' });
  t.ok(logger.json);
  t.is(logger.volume, 0);
  t.is(logger.withJSON(true), logger);

  logger.note(`The message`, ['More details']);
  let record = parseJSON(logged.shift());
  t.ok(has(record, 'timestamp'));
  t.is(record.label, 'SITE:FORGE');
  t.is(record.level, 'note');
  t.is(record.message, 'The message');
  t.same(record.data, ['More details']);

  logger = new Logger({ stream, json: true });
  logger.warn(`Keep your distance!`);
  record = parseJSON(logged.shift());
  t.ok(has(record, 'timestamp'));
  t.is(record.label, basename(process.title));
  t.is(record.level, 'warn');
  t.is(record.message, 'Keep your distance!');
  t.notOk(has(record, 'data'));

  logger.done({ files: 42, duration: 665 });
  record = parseJSON(logged.shift());
  t.ok(has(record, 'timestamp'));
  t.is(record.label, basename(process.title));
  t.is(record.level, 'warn');
  t.is(record.message, 'Done');
  t.same(record.data, {
    files: 42,
    duration: 665,
    errors: 0,
    warnings: 1,
  });

  // ------------------------------------------------------------ Logging Text
  logger = new Logger({ stream, volume: 3, label: 'site:forge' });

  t.notOk(logger.json);
  const anotherLogger = logger.withJSON(true);
  t.ok(logger !== anotherLogger);
  t.ok(anotherLogger.json);

  t.is(logger.volume, 3);
  t.throws(() => logger.withVolume('volume'));
  t.is(logger.withVolume(665).volume, 665);

  t.is(logger.label, 'site:forge');
  t.is(logger.withLabel('ostentation').label, 'ostentation');

  logger.debug(`testing message by itself`);
  t.is(logged.shift(), `site:forge [DEBUG] testing message by itself`);

  logger.aok('testing numeric detail', 665);
  t.is(logged.shift(), 'site:forge [AOK]   testing numeric detail');
  t.is(logged.shift(), '    665');

  logger.trace('testing object property detail', { key: 'value' });
  t.is(logged.shift(), 'site:forge [TRACE] testing object property detail');
  t.is(logged.shift(), `    { key: 'value' }`);

  logger.note('testing array element detail', [665]);
  t.is(logged.shift(), 'site:forge [NOTE]  testing array element detail');
  t.is(logged.shift(), '    [ 665 ]');

  logger.note();
  t.is(logged.shift(), 'site:forge [NOTE]  ---');

  logger.note(new ErrorMessage('boom'));
  t.is(logged.shift(), 'site:forge [NOTE]  Error: boom');

  logger.error(new ErrorMessage('boom'));
  t.is(logged.shift(), 'site:forge [ERROR] boom');

  logger.note(665);
  t.is(logged.shift(), 'site:forge [NOTE]  Logged data:');
  t.is(logged.shift(), '    665');

  let err = new Error('boo!');
  err.stack = '';
  logger.error('testing error detail', err);
  t.is(logged.shift(), 'site:forge [ERROR] testing error detail: boo!');

  err.stack = 'boo!\n    at Type.method (file:0:0)';
  logger.error('testing error detail', err);
  t.is(logged.shift(), 'site:forge [ERROR] testing error detail: boo!');
  t.is(logged.shift(), '    at Type.method (file:0:0)');

  // done() sets the exitCode, so save value and restore later.
  const { exitCode } = process;

  // done() with errors only.
  logger.done({ files: 42, duration: 665 });
  const didIt = `Processed 42 files in 665ms`;
  t.is(logged.shift(), `site:forge [ERROR] ${didIt} with 3 errors`);
  t.is(process.exitCode, 70);

  // done() with both errors and warnings.
  ['a', 'b', 'c'].forEach(letter => {
    logger.warn(letter);
    logged.shift();
  });

  logger.done({ files: 42, duration: 665 });
  t.is(
    logged.shift(),
    `site:forge [ERROR] ${didIt} with 4 errors and 3 warnings`
  );

  // done() with no errors and no warnings.
  logger = new Logger({ stream, volume: 2, label: 'site:forge' });
  logger.done({ files: 42, duration: 665 });
  t.is(
    logged.shift(),
    `site:forge [AOK]   ${didIt} with no errors and no warnings`
  );

  // done() with warnings only.
  ['a', 'b', 'c'].forEach(letter => {
    logger.warn(letter);
    logged.shift();
  });

  logger.done({ files: 42, duration: 665 });
  t.is(logged.shift(), `site:forge [WARN]  ${didIt} with 3 warnings`);

  logger.done({ files: 42, duration: 665 });
  t.is(logged.shift(), `site:forge [WARN]  ${didIt} with 4 warnings`);

  logger.doneTesting({ pass: 33, fail: 9, duration: 665 });
  t.is(
    logged.shift(),
    `site:forge [ERROR] Done! 9 out of 42 tests failed in 665ms`
  );

  logger.doneTesting({ pass: 42, duration: 665 });
  t.is(logged.shift(), `site:forge [AOK]   Done! All 42 tests passed in 665ms`);

  Logger.STAMP = undefined;
  logger.withJSON(true).doneTesting({ pass: 42, fail: 0, duration: 665 });
  t.is(
    logged.shift(),
    `{"label":"site:forge","level":"aok","message":"Done",` +
      `"data":{"pass":42,"fail":0,"duration":665}}`
  );

  logger.done({ duration: 665 });
  t.is(
    logged.shift(),
    `site:forge [ERROR] Ran for 665ms with 1 error and 5 warnings`
  );

  logger.print(EOL);
  t.is(logged.shift(), '');

  t.is(logger.embolden('That is <b>bold</b>!'), 'That is bold!');

  process.exitCode = exitCode;
  t.end();
});
