/* © 2019-2020 Robert Grimm */

import run from '@grr/run';
import harness from './harness.js';

harness.test('@grr/run', async t => {
  const { stdout, stderr } = await run('printf', ['Hello, world!'], {
    stdio: 'buffer',
  });
  t.equal(stdout, 'Hello, world!');
  t.equal(stderr, '');

  try {
    await run('sh', ['-c', 'exit']);
    t.pass('should not throw');
  } catch (x) {
    t.fail(x.message);
  }

  try {
    await run('sh', ['-c', 'exit 42']);
    t.fail('should throw');
  } catch (x) {
    t.match(
      x.message,
      /^Child process terminated with exit code "42" \(sh -c "exit 42"\)/u
    );
  }

  try {
    const ondone = run('sh', ['-c', 'sleep 5']);
    ondone.child.kill();
    await ondone;
  } catch (x) {
    t.match(
      x.message,
      /^Child process terminated with signal "SIGTERM" \(sh -c "sleep 5"\)/u
    );
  }

  t.rejects(run('program-that-does-not-possibly-exist-665'));

  t.end();
});
