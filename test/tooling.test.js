/* © 2019 Robert Grimm */

import run from '../source/tooling/run.js';
import tap from 'tap';
import { not, once } from '../source/tooling/function.js';

import {
  escapeRegex,
  extractRightsNotice,
  withRightsNotice,
} from '../source/tooling/text.js';

// =============================================================================
// function
// =============================================================================

tap.test('tooling/function', t => {
  let counter = 0;
  const incr = () => ++counter;
  const onceMore = once(incr);

  t.strictEqual(incr.name, 'incr');
  t.strictEqual(onceMore.name, 'once(incr)');
  t.strictEqual(incr.length, 0);
  t.strictEqual(onceMore.length, 0);

  t.strictEqual(counter, 0);
  t.strictEqual(incr(), 1);
  t.strictEqual(incr(), 2);
  t.strictEqual(counter, 2);
  t.strictEqual(onceMore(), 3);
  t.strictEqual(onceMore(), undefined);
  t.strictEqual(counter, 3);
  t.strictEqual(incr(), 4);
  t.strictEqual(counter, 4);

  // eslint-disable-next-line no-unused-vars
  const truth = fakeArgument => true;
  const falsehood = not(truth);

  t.strictEqual(truth.name, 'truth');
  t.strictEqual(falsehood.name, 'not(truth)');

  t.strictEqual(truth.length, 1);
  t.strictEqual(falsehood.length, 1);

  t.end();
});

// =============================================================================
// run
// =============================================================================

tap.test('tooling/run', async t => {
  const { stdout, stderr } = await run('printf', ['Hello, world!'], {
    stdio: 'buffer',
  });
  t.strictEqual(stdout, 'Hello, world!');
  t.strictEqual(stderr, '');

  t.resolves(() => run('sh', ['-c', 'exit']));
  t.rejects(
    () => run('sh', ['-c', 'exit 42']),
    /^Child process failed with exit code "42" \(sh -c "exit 42"\)/u
  );

  try {
    await run('this-command-most-certainly-does-not-exist', []);
    t.fail(`running non-existent command should fail`);
  } catch (x) {
    t.strictEqual(x.code, 'ENOENT');
  }

  t.end();
});

// =============================================================================
// text
// =============================================================================

tap.test('tooling/text', t => {
  t.strictEqual(escapeRegex('[1.1.0]'), '\\[1\\.1\\.0\\]');

  t.strictEqual(
    extractRightsNotice(`   //  (C) Robert Grimm`),
    `(C) Robert Grimm`
  );
  t.strictEqual(
    extractRightsNotice(`   /*  (C) Robert Grimm  \n  */  `),
    `(C) Robert Grimm`
  );
  t.strictEqual(
    extractRightsNotice(`   /*  © Robert Grimm  \n  */  `),
    `© Robert Grimm`
  );
  t.strictEqual(
    extractRightsNotice(`   /*  copyright Robert Grimm  \n  */  `),
    `copyright Robert Grimm`
  );

  t.strictEqual(withRightsNotice('code', undefined), 'code');
  t.strictEqual(withRightsNotice('code', 'notice'), '/* notice */ code');
  t.end();
});
