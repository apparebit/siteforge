/* © 2019-2020 Robert Grimm */

import { rmdir, toDirectory } from '@grr/fs';
import harness from './harness.js';
import { join } from 'path';
import Metrics from '@grr/metrics';
import Parser from 'tap-parser';
import { pipeline as doPipeline } from 'stream';
import { promisify } from 'util';
import Rollcall from '@grr/rollcall';

const ROOT = join(toDirectory(import.meta.url), '..');
const COVERAGE_DATA = join(ROOT, '.coverage');

// Tap is a readable stream and tap-parser is a writable stream. That means
// reasonable error reporting is only a few event handlers and a `pipeline`
// away.

const metrics = new Metrics();
const endTest = metrics.timer('main').start();

const parser = new Parser({});
const rollcall = new Rollcall({});
parser.on('result', r => rollcall.report(r));

const done = () => {
  const { pass, fail } = harness.counts;
  rollcall.signOff({
    pass,
    fail,
    duration: endTest().get(),
  });
};

process.on('exit', done);

const pipeline = promisify(doPipeline);
pipeline(harness, parser);

(async function run() {
  await rmdir(COVERAGE_DATA, { recursive: true });
  await import('./async.js');
  await import('./builder.js');
  await import('./fs.js');
  await import('./glob.js');
  await import('./html.js');
  await import('./inventory.js');
  await import('./loader.js');
  await import('./metrics.js');
  await import('./oddjob.js');
  await import('./options.js');
  await import('./proact.js');
  await import('./rollcall.js');
  await import('./sequitur.js');
  await import('./walk.js');
  await import('./run.js');
})();
