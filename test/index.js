/* © 2019-2020 Robert Grimm */

import { rmdir, toDirectory } from '@grr/fs';
import harness from './harness.js';
import { join } from 'path';

const ROOT = join(toDirectory(import.meta.url), '..');
const COVERAGE_DATA = join(ROOT, '.coverage');

(async function run() {
  await rmdir(COVERAGE_DATA, { recursive: true });
  await import('./async.js');
  await import('./builder.js');
  await import('./fs.js');
  await import('./glob.js');
  await import('./html.js');
  await import('./inventory.js');
  await import('./metrics.js');
  await import('./oddjob.js');
  await import('./options.js');
  await import('./proact.js');
  await import('./reloader.js');
  await import('./rollcall.js');
  await import('./sequitur.js');
  await import('./walk.js');
  await import('./run.js');

  const done = () => {
    const { pass, fail } = harness.counts;
    let color, slogan;

    if (fail === 0) {
      color = '102;1';
      slogan = `  Yay, all ${pass} tests passed!  `;
    } else {
      color = '97;41;1';
      slogan = `  Nope, ${fail} out of ${pass + fail} tests failed!  `;
      process.exitCode = 70; // X_SOFTWARE
    }

    const spacer = ' '.repeat(slogan.length);
    for (const text of [spacer, slogan, spacer]) {
      console.log(`\x1b[${color}m${text}\x1b[0m`);
    }
    console.log();
  };

  if (harness.onFinish) {
    harness.onFinish(done);
  } else {
    harness.on('end', done);
  }
})();
