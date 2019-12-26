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
  fn.promise = new Promise((resolve, reject) => {
    fn.resolve = resolve;
    fn.reject = reject;
  });
  defineProperty(fn, 'name', {
    configurable,
    value: `T${index}`,
  });
  return fn;
};

tap.test('@grr/multitasker', async t => {
  function t1() {
    t.strictEqual(typeof this, 'object');
    t.strictEqual(this['@type'], 'context');
    return t1.promise;
  }

  task(1, t1);
  const t2 = task(2);
  const t3 = task(3);
  const t4 = task(4);
  const t5 = task(5);
  const t6 = task(6);

  const runner = new Multitasker({
    concurrency: 2,
    context: { '@type': 'context' },
  });

  t.throws(() => runner.enqueue(665), /Invalid invocation enqueue\(665\)/u);

  t.ok(runner.hasCapacity());
  t.notOk(runner.hasTaskReady());
  t.strictEqual(runner._status, Multitasker.Idle);
  t.strictEqual(runner._inflight, 0);
  t.strictEqual(runner._ready.length, 0);
  t.strictEqual(runner._asap.length, 0);
  t.strictEqual(runner._blocked.length, 0);

  const p1 = runner.enqueue(t1).then(v => t.strictEqual(v, 'T1'));

  t.ok(runner.hasCapacity());
  t.notOk(runner.hasTaskReady());
  t.strictEqual(runner._status, Multitasker.Running);
  t.strictEqual(runner._inflight, 1);
  t.strictEqual(runner._ready.length, 0);
  t.strictEqual(runner._asap.length, 0);
  t.strictEqual(runner._blocked.length, 0);

  const p2 = runner.enqueue(t2);

  t.notOk(runner.hasCapacity());
  t.notOk(runner.hasTaskReady());
  t.ok(runner.is(Multitasker.Running));
  t.strictEqual(runner._inflight, 2);
  t.strictEqual(runner._ready.length, 0);
  t.strictEqual(runner._asap.length, 0);
  t.strictEqual(runner._blocked.length, 0);

  const p3 = runner
    .enqueue(Multitasker.Asap, t3)
    .then(v => t.strictEqual(v, 'T3'));

  t.notOk(runner.hasCapacity());
  t.ok(runner.hasTaskReady());
  t.ok(runner.is(Multitasker.Running));
  t.strictEqual(runner._inflight, 2);
  t.strictEqual(runner._ready.length, 0);
  t.strictEqual(runner._asap.length, 1);
  t.strictEqual(runner._blocked.length, 0);

  const p4 = runner
    .enqueue(Multitasker.Block, t4)
    .then(v => t.strictEqual(v, 'T4'));

  t.notOk(runner.hasCapacity());
  t.ok(runner.hasTaskReady());
  t.ok(runner.is(Multitasker.Running));
  t.strictEqual(runner._inflight, 2);
  t.strictEqual(runner._ready.length, 0);
  t.strictEqual(runner._asap.length, 1);
  t.strictEqual(runner._blocked.length, 1);

  const p5 = runner
    .enqueue(Multitasker.Block, t5)
    .then(v => t.strictEqual(v, 'T5'));
  runner.enqueue(Multitasker.Block, t6).then(v => t.strictEqual(v, 'T6'));

  t.notOk(runner.hasCapacity());
  t.ok(runner.hasTaskReady());
  t.ok(runner.is(Multitasker.Running));
  t.strictEqual(runner._inflight, 2);
  t.strictEqual(runner._ready.length, 0);
  t.strictEqual(runner._asap.length, 1);
  t.strictEqual(runner._blocked.length, 3);

  t1.resolve(t1.name);
  await p1;

  t.notOk(runner.hasCapacity());
  t.notOk(runner.hasTaskReady());
  t.ok(runner.is(Multitasker.Running));
  t.strictEqual(runner._inflight, 2);
  t.strictEqual(runner._asap.length, 0);
  t.strictEqual(runner._ready.length, 0);
  t.strictEqual(runner._blocked.length, 3);

  t2.reject(new Error('boo'));
  try {
    await p2;
    t.fail();
  } catch (x) {
    t.strictEqual(x.message, 'boo');
  }

  t.ok(runner.hasCapacity());
  t.notOk(runner.hasTaskReady());
  t.ok(runner.is(Multitasker.Running));
  t.strictEqual(runner._inflight, 1);
  t.strictEqual(runner._asap.length, 0);
  t.strictEqual(runner._ready.length, 0);
  t.strictEqual(runner._blocked.length, 3);

  t.resolves(runner.onidle());
  const pidle = runner.onidle(() => {
    t.ok(runner.hasCapacity());
    t.notOk(runner.hasTaskReady());
    t.ok(runner.is(Multitasker.Idle));
    t.strictEqual(runner._inflight, 0);
    t.strictEqual(runner._asap.length, 0);
    t.strictEqual(runner._ready.length, 0);
    t.strictEqual(runner._blocked.length, 3);

    runner.unblock();

    t.notOk(runner.hasCapacity());
    t.ok(runner.hasTaskReady());
    t.ok(runner.is(Multitasker.Running));
    t.strictEqual(runner._inflight, 2);
    t.strictEqual(runner._asap.length, 0);
    t.strictEqual(runner._ready.length, 1);
    t.strictEqual(runner._blocked.length, 0);

    t.resolves(runner.onstop());
    const done = runner.stop();
    t.strictEqual(runner.stop(), done);

    t.notOk(runner.hasCapacity());
    t.notOk(runner.hasTaskReady());
    t.ok(runner.is(Multitasker.Stopping));
    t.strictEqual(runner._inflight, 2);
    t.strictEqual(runner._asap.length, 0);
    t.strictEqual(runner._ready.length, 0);
    t.strictEqual(runner._blocked.length, 0);

    t4.resolve(t4.name);
    t5.resolve(t5.name);
  });

  const pstop = runner.onstop(() => t.pass());

  t3.resolve(t3.name);
  await p3;

  // At this point, there are no tasks in the ready queue. The above
  // runner.onidle should very much trigger

  // Some time later, the queue should enter the Stopping state and eventually
  // reach the Done state. The art here is waiting on sufficiently many
  // promises, so that no test is executed after the t.end() below. That means
  // including outstandings tasks (with exception of the one that gets dropped
  // while stopping), outstanding eventhandlers (the onidle and onstop callbacks), and the
  // multitasking instance itself.

  t.resolves(runner.ondone(() => t.pass()));
  await Promise.all([p4, p5, pidle, pstop, runner.ondone()]);

  t.strictEqual(runner._inflight, 0);
  t.ok(runner.is(Multitasker.Done));

  // An idle multitasker, when stopped, transitions directly to the done state.
  // That transition skips the stop state but still triggers the stop promise.
  const r2 = new Multitasker();
  t.resolves(r2.onstop());
  t.resolves(r2.ondone());
  t.ok(r2.is(Multitasker.Idle));
  r2.stop();
  t.ok(r2.is(Multitasker.Done));

  t.end();
});
