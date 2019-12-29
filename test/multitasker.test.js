/* © 2019 Robert Grimm */

import Multitasker from '@grr/multitasker';
import tap from 'tap';

const configurable = true;
const { defineProperty } = Object;

const task = (
  index,
  fn = function t() {
    return t.promise;
  }
) => {
  defineProperty(fn, 'name', {
    configurable,
    value: `T${index}`,
  });
  return Multitasker.newPromiseCapability(fn);
};

function nextTick(fn) {
  return new Promise(resolve => {
    setImmediate(() => {
      fn();
      resolve();
    });
  });
}

tap.test('@grr/multitasker', async t => {
  function t1() {
    t.strictEqual(typeof this, 'object');
    t.strictEqual(this['@type'], 'context');
    return t1.promise;
  }

  // The following battery of tests exhaustively covers the methods and states
  // of a multitasker. It relies on functions that appear asynchronous but
  // perform no actual work, i.e., complete when a promise is explicitly
  // settled. But that also means there is no outstanding request and, if not
  // carefully scheduled, Node.js' event loop may just exit.

  task(1, t1);
  const t2 = task(2);
  const t3 = task(3);
  const t4 = task(4);
  const t5 = task(5);
  const t6 = task(6);

  const runner = new Multitasker({
    capacity: 2,
    context: { '@type': 'context' },
  });

  t.throws(() => runner.enqueue(665), /Invalid invocation enqueue\(665\)/u);

  t.ok(runner.hasCapacity());
  t.notOk(runner.hasTaskReady());
  t.ok(runner.is(Multitasker.Idle));
  t.strictEqual(runner._inflight, 0);
  t.strictEqual(runner._ready.length, 0);
  t.strictEqual(runner._asap.length, 0);
  t.strictEqual(runner._blocked.length, 0);

  const p1 = runner.enqueue(t1).then(v => t.strictEqual(v, 'T1'));

  await nextTick(() => {
    t.ok(runner.hasCapacity());
    t.notOk(runner.hasTaskReady());
    t.ok(runner.is(Multitasker.Running));
    t.strictEqual(runner._inflight, 1);
    t.strictEqual(runner._ready.length, 0);
    t.strictEqual(runner._asap.length, 0);
    t.strictEqual(runner._blocked.length, 0);
  });

  const p2 = runner.enqueue(t2);

  await nextTick(() => {
    t.notOk(runner.hasCapacity());
    t.notOk(runner.hasTaskReady());
    t.ok(runner.is(Multitasker.Running));
    t.strictEqual(runner._inflight, 2);
    t.strictEqual(runner._ready.length, 0);
    t.strictEqual(runner._asap.length, 0);
    t.strictEqual(runner._blocked.length, 0);
    t.strictEqual(
      runner.toString(),
      'Multitasker { ' +
        'state: running, inflight: 2, capacity: 2, ' +
        'asap: 0, ready: 0, blocked: 0' +
        ' }'
    );
  });

  const p3 = runner
    .enqueue(Multitasker.Asap, t3)
    .then(v => t.strictEqual(v, 'T3'));

  await nextTick(() => {
    t.notOk(runner.hasCapacity());
    t.ok(runner.hasTaskReady());
    t.ok(runner.is(Multitasker.Running));
    t.strictEqual(runner._inflight, 2);
    t.strictEqual(runner._ready.length, 0);
    t.strictEqual(runner._asap.length, 1);
    t.strictEqual(runner._blocked.length, 0);
    t.strictSame(runner.status(), {
      state: 'running',
      inflight: 2,
      capacity: 2,
      asap: 1,
      ready: 0,
      blocked: 0,
    });
  });

  const p4 = runner
    .enqueue(Multitasker.Block, t4)
    .then(v => t.strictEqual(v, 'T4'));

  await nextTick(() => {
    t.notOk(runner.hasCapacity());
    t.ok(runner.hasTaskReady());
    t.ok(runner.is(Multitasker.Running));
    t.strictEqual(runner._inflight, 2);
    t.strictEqual(runner._ready.length, 0);
    t.strictEqual(runner._asap.length, 1);
    t.strictEqual(runner._blocked.length, 1);
  });

  const p5 = runner
    .enqueue(Multitasker.Block, t5)
    .then(v => t.strictEqual(v, 'T5'));
  runner.enqueue(Multitasker.Block, t6).then(v => t.strictEqual(v, 'T6'));

  await nextTick(() => {
    t.notOk(runner.hasCapacity());
    t.ok(runner.hasTaskReady());
    t.ok(runner.is(Multitasker.Running));
    t.strictEqual(runner._inflight, 2);
    t.strictEqual(runner._ready.length, 0);
    t.strictEqual(runner._asap.length, 1);
    t.strictEqual(runner._blocked.length, 3);
  });

  t1.resolve(t1.name);
  await p1;

  await nextTick(() => {
    t.notOk(runner.hasCapacity());
    t.notOk(runner.hasTaskReady());
    t.ok(runner.is(Multitasker.Running));
    t.strictEqual(runner._inflight, 2);
    t.strictEqual(runner._asap.length, 0);
    t.strictEqual(runner._ready.length, 0);
    t.strictEqual(runner._blocked.length, 3);
  });

  t2.reject(new Error('boo'));
  try {
    await p2;
    t.fail();
  } catch (x) {
    t.strictEqual(x.message, 'boo');
  }

  await nextTick(() => {
    t.ok(runner.hasCapacity());
    t.notOk(runner.hasTaskReady());
    t.ok(runner.is(Multitasker.Running));
    t.strictEqual(runner._inflight, 1);
    t.strictEqual(runner._asap.length, 0);
    t.strictEqual(runner._ready.length, 0);
    t.strictEqual(runner._blocked.length, 3);
  });

  t.resolves(runner.onidle());
  t.resolves(runner.onidle(() => t.pass()));
  t3.resolve(t3.name);
  await p3;

  await nextTick(() => {
    t.ok(runner.hasCapacity());
    t.notOk(runner.hasTaskReady());
    t.ok(runner.is(Multitasker.Idle));
    t.strictEqual(runner._inflight, 0);
    t.strictEqual(runner._asap.length, 0);
    t.strictEqual(runner._ready.length, 0);
    t.strictEqual(runner._blocked.length, 3);
  });

  runner.unblock();

  await nextTick(() => {
    t.notOk(runner.hasCapacity());
    t.ok(runner.hasTaskReady());
    t.ok(runner.is(Multitasker.Running));
    t.strictEqual(runner._inflight, 2);
    t.strictEqual(runner._asap.length, 0);
    t.strictEqual(runner._ready.length, 1);
    t.strictEqual(runner._blocked.length, 0);
  });

  t.resolves(runner.onstopping());
  t.resolves(runner.onstopping(() => t.pass()));
  const done = runner.stop();
  t.strictEqual(runner.stop(), done);

  await nextTick(() => {
    t.notOk(runner.hasCapacity());
    t.notOk(runner.hasTaskReady());
    t.ok(runner.is(Multitasker.Stopping));
    t.strictEqual(runner._inflight, 2);
    t.strictEqual(runner._asap.length, 0);
    t.strictEqual(runner._ready.length, 0);
    t.strictEqual(runner._blocked.length, 0);
  });

  t4.resolve(t4.name);
  t5.resolve(t5.name);
  await p4;
  await p5;

  t.resolves(runner.ondone());
  t.resolves(runner.ondone(() => t.pass()));
  await runner.ondone();

  t.strictEqual(runner._inflight, 0);
  t.ok(runner.is(Multitasker.Done));

  // When stopped, an idle multitasker directly transitions to the done state.
  // Make sure that it fulfills both onstop() and ondone().
  const r2 = new Multitasker();
  t.resolves(r2.onstopping());
  t.resolves(r2.ondone());
  t.ok(r2.is(Multitasker.Idle));
  r2.stop();
  t.ok(r2.is(Multitasker.Done));

  t.end();
});
