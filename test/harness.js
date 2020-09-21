/* © 2020 Robert Grimm */

import Rollcall from '@grr/rollcall';
import tap from 'tap';

// Polyfill `strictSame()` to be the same as `same()`.
if (!tap.Test.prototype.strictSame) {
  tap.Test.prototype.strictSame = tap.Test.prototype.same;
}

// Instantiate global logger with easily configurable volume.
let volume = 0;
for (const arg of process.argv.slice(2)) {
  if (arg === '--') {
    break;
  } else if (arg === '--debug') {
    volume = 2;
  } else if (arg === '--trace') {
    volume = 3;
  }
}
const rollcall = new Rollcall({ volume });

// Decorate test harness.
Object.defineProperty(tap, 'rollcall', {
  configurable: true,
  value: rollcall,
});

export default tap;
