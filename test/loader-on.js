/* © 2020 Robert Grimm */

import harness from './harness.js';
import invoke from '@grr/loader/invoke';

harness.test('@grr/loader (enabled)', async t => {
  let status = await import('@grr/loader/status');
  t.is(status.default, '@grr/loader');

  t.same(await invoke('ping', 665), { pong: 665 });
  t.same(await invoke('ping', { ping: 42 }), { pong: { ping: 42 } });

  // try {
  //   invoke('fail', 'boohoo!');
  // } catch (x) {
  //   t.comment(x.stack);
  // }

  t.end();
});
