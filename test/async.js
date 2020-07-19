/* © 2019-2020 Robert Grimm */

import { delay, didPoll, raise, settleable } from '@grr/async/promise';
import Task from '@grr/async/task';
import harness from './harness.js';
import { readFile } from '@grr/fs';

const { apply } = Reflect;
const configurable = true;
const { defineProperty, prototype } = Object;
const { toString } = prototype;

const prepareTask = (
  index,
  fn = function task() {
    return task.promise;
  }
) => {
  defineProperty(fn, 'name', {
    configurable,
    value: `Task${index}`,
  });
  return settleable(fn);
};

function soon(fn = () => {}) {
  return new Promise(resolve => {
    setImmediate(() => {
      fn();
      resolve();
    });
  });
}

harness.test('@grr/async', async t => {
  // ---------------------------------------------------------------------------

  const output = [];

  // In JavaScript, the outcome of this race amongst four functions that each
  // delay visible side-effects via a different mechanism is entirely
  // predictable and deterministic.
  await Promise.all(
    [
      // A timer delay goes once around the event loop.
      async function delaying() {
        output.push(await delay(0));
      },
      // A promise callback is run as a microtask.
      function promising() {
        return Promise.resolve().then(() => output.push('promise'));
      },
      // The next event loop tick, brilliantly called setImmediate().
      async function polling() {
        output.push(await didPoll());
      },
      // The next microtask (yup), brilliantly called nextTick().
      function ticking() {
        process.nextTick(() => output.push('tick'));
      },
    ].map(fn => fn())
  );
  t.strictSame(output, ['promise', 'tick', 'didPoll', 'delay']);

  // ---------------------------------------------------------------------------

  t.test('raise()', t => {
    // It took a few iterations to get this test right: plan() announces that
    // there is one test, expectUncaughtException() announces an uncaught
    // exception and its message, and raise() does the throwing some time in
    // the future. I couldn't get it to work reliably without plan() and with
    // more complex awaiting of promises.
    t.plan(1);
    t.expectUncaughtException({ message: 'raise' });
    raise(new Error('raise'));
  });

  // ---------------------------------------------------------------------------

  t.test('Task', async t => {
    let tusk = new Task(readFile, null, './test/index.js', 'utf8');
    t.equal(apply(toString, tusk, []), '[object @grr/async/Task]');
    const content = await tusk.run();
    t.throws(
      () => tusk.run(),
      /Task readFile\('\.\/test\/index.js', 'utf8'\) has already run/u
    );
    t.equal(content, await readFile('./test/index.js', 'utf8'));

    tusk = new Task(() => {}, null, 665, Symbol('boo'), 'hello');
    t.equal(tusk.toString(), `function(665, @@boo, 'hello')`);
    t.equal(
      new Task({}.toString, {}, 665).toString(),
      `[object Object].toString(665)`
    );
    t.end();
  });

  // ---------------------------------------------------------------------------

  t.test('Executor', async t => {
    // The following tests use six simulated asynchronous functions that return
    // a promise each but require explicit manual settlement. In other words,
    // this function mostly contains code that does nothing noteworthy and so
    // Node.js is much tempted to exit the event loop and therefore process. The
    // reason it currently doesn't is careful engineering. So beware of that
    // pitfall when changing the code below.

    function task1() {
      t.equal(typeof this, 'object');
      t.equal(this['@type'], 'context');
      return task1.promise;
    }

    prepareTask(1, task1);
    const task2 = prepareTask(2);
    const task3 = prepareTask(3);
    const task4 = prepareTask(4);
    const task5 = prepareTask(5);
    const task6 = prepareTask(6);

    const runner = new Task.Executor({
      capacity: 2,
      context: { '@type': 'context' },
    });

    t.equal(apply(toString, runner, []), '[object @grr/async/Task.Executor]');

    t.throws(
      () => runner.run(665),
      /First argument to run\(\) must be function/u
    );

    t.ok(runner.hasCapacity());
    t.notOk(runner.hasTaskReady());
    t.ok(runner.isIdle());
    t.notOk(runner.isRunning());
    t.notOk(runner.isStopping());
    t.strictSame(runner.status(), {
      state: 'idle',
      ready: 0,
      inflight: 0,
      capacity: 2,
      completed: 0,
    });

    const p1 = runner.run(task1).then(v => t.equal(v, 'Task1'));

    await soon(() => {
      t.ok(runner.hasCapacity());
      t.notOk(runner.hasTaskReady());
      t.notOk(runner.isIdle());
      t.ok(runner.isRunning());
      t.notOk(runner.isStopping());
      t.strictSame(runner.status(), {
        state: 'running',
        ready: 0,
        inflight: 1,
        capacity: 2,
        completed: 0,
      });
    });

    const p2 = runner.run(task2).then(
      () => t.fail('should reject'),
      x => t.equal(x.message, 'boo')
    );

    await soon(() => {
      t.notOk(runner.hasCapacity());
      t.notOk(runner.hasTaskReady());
      t.notOk(runner.isIdle());
      t.ok(runner.isRunning());
      t.notOk(runner.isStopping());
      t.strictSame(runner.status(), {
        state: 'running',
        ready: 0,
        inflight: 2,
        capacity: 2,
        completed: 0,
      });
      t.equal(
        runner.toString(),
        `@grr/async/Task.Executor { ` +
          `state: 'running', ready: 0, inflight: 2, capacity: 2, completed: 0` +
          ` }`
      );
    });

    const run = runner.run.bind(runner);
    const p3 = run(task3).then(v => t.equal(v, 'Task3'));

    await soon(() => {
      t.notOk(runner.hasCapacity());
      t.ok(runner.hasTaskReady());
      t.notOk(runner.isIdle());
      t.ok(runner.isRunning());
      t.notOk(runner.isStopping());
      t.strictSame(runner.status(), {
        state: 'running',
        ready: 1,
        inflight: 2,
        capacity: 2,
        completed: 0,
      });
    });

    task1.resolve(task1.name);
    await p1;

    await soon(() => {
      t.notOk(runner.hasCapacity());
      t.notOk(runner.hasTaskReady());
      t.notOk(runner.isIdle());
      t.ok(runner.isRunning());
      t.notOk(runner.isStopping());
      t.strictSame(runner.status(), {
        state: 'running',
        ready: 0,
        inflight: 2,
        capacity: 2,
        completed: 1,
      });
    });

    task2.reject(new Error('boo'));
    await p2;

    await soon(() => {
      t.ok(runner.hasCapacity());
      t.notOk(runner.hasTaskReady());
      t.notOk(runner.isIdle());
      t.ok(runner.isRunning());
      t.notOk(runner.isStopping());
      t.strictSame(runner.status(), {
        state: 'running',
        ready: 0,
        inflight: 1,
        capacity: 2,
        completed: 2,
      });
    });

    runner.onIdle().then(
      () => t.pass('should resolve'),
      x => t.fail(x.message)
    );
    task3.resolve(task3.name);
    await p3;

    await soon(() => {
      t.ok(runner.hasCapacity());
      t.notOk(runner.hasTaskReady());
      t.ok(runner.isIdle());
      t.notOk(runner.isRunning());
      t.notOk(runner.isStopping());
      t.strictSame(runner.status(), {
        state: 'idle',
        ready: 0,
        inflight: 0,
        capacity: 2,
        completed: 3,
      });
    });

    const p4 = run(task4).then(v => t.equal(v, 'Task4'));

    await soon(() => {
      t.ok(runner.hasCapacity());
      t.notOk(runner.hasTaskReady());
      t.notOk(runner.isIdle());
      t.ok(runner.isRunning());
      t.notOk(runner.isStopping());
      t.strictSame(runner.status(), {
        state: 'running',
        ready: 0,
        inflight: 1,
        capacity: 2,
        completed: 3,
      });
    });

    const p5 = runner.run(task5).then(v => t.equal(v, 'Task5'));

    await soon(() => {
      t.notOk(runner.hasCapacity());
      t.notOk(runner.hasTaskReady());
      t.notOk(runner.isIdle());
      t.ok(runner.isRunning());
      t.notOk(runner.isStopping());
      t.strictSame(runner.status(), {
        state: 'running',
        ready: 0,
        inflight: 2,
        capacity: 2,
        completed: 3,
      });
    });

    const p6 = run(task6).then(v => t.equal(v, 'Task6'));

    await soon(() => {
      t.notOk(runner.hasCapacity());
      t.ok(runner.hasTaskReady());
      t.notOk(runner.isIdle());
      t.ok(runner.isRunning());
      t.notOk(runner.isStopping());
      t.strictSame(runner.status(), {
        state: 'running',
        ready: 1,
        inflight: 2,
        capacity: 2,
        completed: 3,
      });
    });

    task4.resolve(task4.name);
    await p4;

    await soon(() => {
      t.notOk(runner.hasCapacity());
      t.notOk(runner.hasTaskReady());
      t.notOk(runner.isIdle());
      t.ok(runner.isRunning());
      t.notOk(runner.isStopping());
      t.strictSame(runner.status(), {
        state: 'running',
        ready: 0,
        inflight: 2,
        capacity: 2,
        completed: 4,
      });
    });

    const didStop = runner.stop();
    t.equal(runner.onDidStop(), didStop);

    await soon(() => {
      t.notOk(runner.hasCapacity());
      t.notOk(runner.hasTaskReady());
      t.notOk(runner.isIdle());
      t.notOk(runner.isRunning());
      t.ok(runner.isStopping());
      t.strictSame(runner.status(), {
        state: 'stopping',
        ready: 0,
        inflight: 2,
        capacity: 2,
        completed: 4,
      });
    });

    task5.resolve(task5.name);
    await p5;

    await soon(() => {
      t.ok(runner.hasCapacity());
      t.notOk(runner.hasTaskReady());
      t.notOk(runner.isIdle());
      t.notOk(runner.isRunning());
      t.ok(runner.isStopping());
      t.strictSame(runner.status(), {
        state: 'stopping',
        ready: 0,
        inflight: 1,
        capacity: 2,
        completed: 5,
      });
    });

    didStop.then(
      () => t.pass('should resolve'),
      x => t.fail(x.message)
    );
    runner.onDidStop().then(
      () => t.pass('should resolve'),
      x => t.fail(x.message)
    );

    task6.resolve(task6.name);
    await p6;

    await soon(() => {
      t.ok(runner.hasCapacity());
      t.notOk(runner.hasTaskReady());
      t.notOk(runner.isIdle());
      t.notOk(runner.isRunning());
      t.notOk(runner.isStopping());
      t.strictSame(runner.status(), {
        state: 'stopped',
        ready: 0,
        inflight: 0,
        capacity: 2,
        completed: 6,
      });
    });

    // When stopped, an idle Executor transitions directly to the stopped state.
    // Nonetheless, both onStop() and onDidStop() resolve.
    const r2 = new Task.Executor();
    r2.onStop().then(
      () => t.pass('should resolve'),
      x => t.fail(x.message)
    );
    r2.onDidStop().then(
      () => t.pass('should resolve'),
      x => t.fail(x.message)
    );
    t.ok(r2.isIdle());
    await r2.stop();
    t.ok(r2.hasStopped());

    // An executor's run() method accepts the closure for sure but also
    // optionally the receiver and the arguments.
    const r3 = new Task.Executor();

    function append1(b, c) {
      return String(this) + String(b) + String(c);
    }
    function append2(a, b, c) {
      return String(a) + String(b) + String(c);
    }

    t.equal(await r3.submit(append1, 1, 2, 3).done, '123');

    // The second argument is the receiver, always. So the following run()
    /// results in an invocation with the latter two arguments for `a` and `b`
    // and the default `undefined` for `c`.
    t.equal(await r3.run(append2, 1, 2, 3), '23undefined');

    t.end();
  });

  t.end();
});
