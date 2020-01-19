/* © 2020 Robert Grimm */

import tap from 'tap';

if (!tap.Test.prototype.strictSame) {
  tap.Test.prototype.strictSame = tap.Test.prototype.same;
}

export default tap;
