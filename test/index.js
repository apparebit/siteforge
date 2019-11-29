/* © 2019 Robert Grimm */

import { rmdir, toDirectory } from '../lib/tooling/fs.js';
import { join } from 'path';

const ROOT = join(directory(import.meta.url), '..');
const COVERAGE_DATA = join(ROOT, '.coverage');
//const COVERATE_REPORT = join(ROOT, 'coverage');

(async function run() {
  await rmdir(COVERAGE_DATA, { recursive: true });
  await import('./reloader.spec.js');
  await import('./tooling.spec.js');
})();
