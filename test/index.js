/* © 2019 Robert Grimm */

import { rmdir, toDirectory } from '@grr/fs';
import { join } from 'path';
import tap from 'tap';

const ROOT = join(toDirectory(import.meta.url), '..');
const COVERAGE_DATA = join(ROOT, '.coverage');

(async function run() {
  await rmdir(COVERAGE_DATA, { recursive: true });
  await import('./fs.test.js');
  await import('./glob.test.js');
  await import('./html.test.js');
  await import('./multitasker.test.js');
  await import('./options.test.js');
  await import('./proact.test.js');
  await import('./reloader.test.js');
  await import('./sequitur.test.js');
  await import('./tooling.test.js');

  tap.on('end', () => {
    let color, slogan;
    if (tap.passing()) {
      color = '102;1';
      slogan = `  Yay, all ${tap.counts.total} tests passed!  `;
    } else {
      color = '48;5;210;1';
      slogan = `  Nope, ${tap.counts.fail} out of ${tap.counts.total} tests failed!  `;
      process.exitCode = 70; // X_SOFTWARE
    }
    const spacer = Array(slogan.length)
      .fill(' ')
      .join('');
    for (const text of [spacer, slogan, spacer]) {
      console.log(`\x1b[${color}m${text}\x1b[0m`);
    }
    console.log();
  });
})();
