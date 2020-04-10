/* © 2019-2020 Robert Grimm */

import { rmdir, toDirectory } from '@grr/fs';
import harness from './harness.js';
import { join } from 'path';
import Metrics from '@grr/metrics';
import Rollcall from '@grr/rollcall';

const ROOT = join(toDirectory(import.meta.url), '..');
const COVERAGE_DATA = join(ROOT, '.coverage');

(async function run() {
  const metrics = new Metrics();
  const endMain = metrics.timer('main').start();

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

  const done = () => {
    const { pass, fail } = harness.counts;
    new Rollcall({ banner: true }).signOff({
      pass,
      fail,
      duration: endMain().get(),
    });
  };

  if (harness.onFinish) {
    harness.onFinish(done);
  } else {
    harness.on('end', done);
  }
})();
