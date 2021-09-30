/* © 2019-2020 Robert Grimm */

// Start measuring.
import Metrics from '@grr/metrics';
const metrics = new Metrics();
const stopMainTimer = metrics.timer('main').start();

// Instantiate test harness. Set process title, since it is used by logger.
process.title = 'test:forge';
import harness from './harness.js';

// Load rest of modules.
import { join } from 'path';
import Parser from 'tap-parser';
import { pipeline } from 'stream';
import { rm, toDirectory } from '@grr/fs';

// Set up reporting of individual test results.
const { rollcall } = harness;
const parser = new Parser({});
parser.on('result', result => rollcall.test(result));
const onComment = comment => rollcall.info(comment);
const onChild = child => {
  child.on('comment', onComment);
  child.on('child', onChild);
};
onChild(parser);

pipeline(harness, parser, error => {
  if (error) rollcall.error(error);
});

// Set up reporting of overall test results.
process.on('exit', () => {
  const { pass, fail } = harness.counts;
  rollcall.doneTesting({
    pass,
    fail,
    duration: stopMainTimer().get(),
  });
  if (fail === 0) process.exitCode = 0;
});

// Run per-package tests by loading corresponding module.
const ROOT = join(toDirectory(import.meta.url), '..');
const COVERAGE_DATA = join(ROOT, '.coverage');

(async function run() {
  await rm(COVERAGE_DATA, { recursive: true });
  await import('./async.js');
  await import('./builder.js');
  await import('./fs.js');
  await import('./glob.js');
  await import('./html.js');
  await import('./http.js');
  await import('./inventory.js');
  await import('./loader.js');
  await import('./metrics.js');
  await import('./oddjob.js');
  await import('./options.js');
  await import('./proact.js');
  await import('./rollcall.js');
  await import('./schemata.js');
  await import('./temple.js');
  await import('./walk.js');
  await import('./run.js');

  harness.test('metatest', t => {
    const { total } = harness.counts;
    if (total < 1100) {
      t.fail(`Only ran ${total} tests out of well over 1,100 tests!`, { stack: '' });
    }
    t.end();
  });
})();
