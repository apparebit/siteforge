/* © 2020 Robert Grimm */

import Rollcall from '@grr/rollcall';
import tap from 'tap';

if (!tap.Test.prototype.strictSame) {
  tap.Test.prototype.strictSame = tap.Test.prototype.same;
}

// Make the same global logger available to all tests. Also make the volume for
// said logger easily configurable via command line flag.
let volume = 0;
for (const arg of process.argv) {
  if (arg === '--') {
    break;
  } else if (arg === '--debug') {
    volume = 2;
  } else if (arg === '--trace') {
    volume = 3;
  }
}

Object.defineProperty(tap, 'rollcall', {
  configurable: true,
  value: new Rollcall({ volume }),
});

export default tap;
