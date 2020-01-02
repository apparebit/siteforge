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

  t.equal(incr.name, 'incr');
  t.equal(onceMore.name, 'once(incr)');
  t.equal(incr.length, 0);
  t.equal(onceMore.length, 0);

  t.equal(counter, 0);
  t.equal(incr(), 1);
  t.equal(incr(), 2);
  t.equal(counter, 2);
  t.equal(onceMore(), 3);
  t.equal(onceMore(), undefined);
  t.equal(counter, 3);
  t.equal(incr(), 4);
  t.equal(counter, 4);

  // eslint-disable-next-line no-unused-vars
  const truth = fakeArgument => true;
  const falsehood = not(truth);

  t.equal(truth.name, 'truth');
  t.equal(falsehood.name, 'not(truth)');

  t.equal(truth.length, 1);
  t.equal(falsehood.length, 1);

  t.end();
});

// =============================================================================
// run
// =============================================================================

tap.test('tooling/run', async t => {
  const { stdout, stderr } = await run('printf', ['Hello, world!'], {
    stdio: 'buffer',
  });
  t.equal(stdout, 'Hello, world!');
  t.equal(stderr, '');

  t.resolves(() => run('sh', ['-c', 'exit']));
  t.rejects(
    () => run('sh', ['-c', 'exit 42']),
    /^Child process failed with exit code "42" \(sh -c "exit 42"\)/u
  );

  try {
    await run('this-command-most-certainly-does-not-exist', []);
    t.fail(`running non-existent command should fail`);
  } catch (x) {
    t.equal(x.code, 'ENOENT');
  }

  t.end();
});

// =============================================================================
// text
// =============================================================================

tap.test('tooling/text', t => {
  t.equal(escapeRegex('[1.1.0]'), '\\[1\\.1\\.0\\]');

  t.equal(extractRightsNotice(`   //  (C) Robert Grimm`), `(C) Robert Grimm`);
  t.equal(
    extractRightsNotice(`   /*  (C) Robert Grimm  \n  */  `),
    `(C) Robert Grimm`
  );
  t.equal(
    extractRightsNotice(`   /*  © Robert Grimm  \n  */  `),
    `© Robert Grimm`
  );
  t.equal(
    extractRightsNotice(`   /*  copyright Robert Grimm  \n  */  `),
    `copyright Robert Grimm`
  );

  t.equal(withRightsNotice('code', undefined), 'code');
  t.equal(withRightsNotice('code', 'notice'), '/* notice */ code');
  t.end();
});
