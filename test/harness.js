/* © 2020 Robert Grimm */

import Rollcall from '@grr/rollcall';
import tap from 'tap';

if (!tap.Test.prototype.strictSame) {
  tap.Test.prototype.strictSame = tap.Test.prototype.same;
}

Object.defineProperty(tap, 'rollcall', {
  configurable: true,
  value: new Rollcall({ volume: 0 }),
});

export default tap;
