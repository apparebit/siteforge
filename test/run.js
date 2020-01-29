/* © 2019-2020 Robert Grimm */

import run from '@grr/run';
import harness from './harness.js';

harness.test('tooling/run', async t => {
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
      /^Child process failed with exit code "42" \(sh -c "exit 42"\)/u
    );
  }

  try {
    await run('this-command-most-certainly-does-not-exist', []);
    t.fail(`running non-existent command should fail`);
  } catch (x) {
    t.equal(x.code, 'ENOENT');
  }

  t.end();
});
