/* © 2019 Robert Grimm */

import { strict as assert } from 'assert';
import { once } from './function.js';

const { apply } = Reflect;

const STANDSTILL = 1; // Not running any tasks.
const RUNNING = 2; // Accepting new tasks, continuing to run existing tasks.
const QUIESCING = 3; // Not accepting new tasks, running existing ones.
const FAILED = 4; // Fatal task failure.

// -----------------------------------------------------------------------------
// Argument Validations

const checkRegister = (runner, id, handler) => {
  assert.equal(runner.status, STANDSTILL);
  assert.equal(typeof id, 'string');
  assert.ok(id.length > 4);
  assert.equal(typeof handler, 'function');
  if (runner.handlers[id]) {
    assert.ok(
      runner.handlers[id].indexOf(handler) < 0,
      'cannot register same handler more than once for same ID "${id}'
    );
  }
};

const checkUnregister = runner => {
  assert.equal(runner.status, STANDSTILL);
};

const checkRun = (runner, tasks) => {
  assert.notEqual(runner.status, QUIESCING);
  assert.notEqual(runner.status, FAILED);
  assert.ok(tasks.length > 0);
  for (const task of tasks) {
    assert.equal(
      typeof task.id,
      'string',
      `task ID ${task.id} must be a string`
    );
    assert.ok(
      runner.handlers[task.id].length,
      `task ID ${task.id} must match handler`
    );
  }
};

const checkRunWaiting = runner => {
  assert.notEqual(runner.status, QUIESCING);
  assert.notEqual(runner.status, FAILED);
};

const checkScheduleTasks = runner => {
  assert.notEqual(runner.status, STANDSTILL);
  assert.notEqual(runner.status, FAILED);
};

const checkHalt = runner => {
  assert.equal(runner.status, RUNNING);
};

// -----------------------------------------------------------------------------
// Task Runner Creation and Handler Registration

export default class TaskRunner {
  constructor({
    concurrency = 8,
    handlers = {},
    prioritize = _ => false,
    context,
  } = {}) {
    this.concurrency = concurrency;
    this.prioritize = prioritize;

    this.status = STANDSTILL;
    this.context = context;
    this.task = { label: undefined, vpath: undefined };

    this.urgent = [];
    this.pending = [];
    this.waiting = [];

    this.handlers = handlers;
    this.inflight = 0;
  }

  /** Register the given handler for the given ID. */
  register(id, handler) {
    checkRegister(this, id, handler);

    // Register handler.
    const handlers = this.handlers;
    if (handlers[id]) {
      handlers[id].push(handler);
    } else {
      handlers[id] = [handler];
    }

    // Unregister handler.
    return once(() => {
      checkUnregister(this);

      const handlers = this.handlers;
      if (handlers[id] && handlers[id].length) {
        const index = handlers[id].indexOf(handler);
        if (index >= 0) {
          handlers.splice(index, 1);
          return true;
        }
      }
      return false;
    });
  }

  // ---------------------------------------------------------------------------
  // Running Tasks

  /**
   * Run the given tasks when capacity becomes available. This function enqueues
   * the tasks for later execution, runs the schedulers to fill any open
   * capacity, and return a promise for all tasks to settle.
   */
  run(...tasks) {
    checkRun(this, tasks);
    this.status = RUNNING;

    const completions = [];
    for (let { ...task } of tasks) {
      // Create promise for completion of task.
      task.complete = new Promise((yay, nay) => {
        task.resolveComplete = yay;
        task.rejectComplete = nay;
      });
      completions.push(task.complete);

      // Enqueue task according to coarse priority.
      const priority = this.prioritize(task);
      if (priority > 0) {
        this.urgent.push(task);
      } else if (priority === 0) {
        this.pending.push(task);
      } else {
        this.waiting.push(task);
      }
    }

    // There are more tasks to execute now. Try to do just that.
    this.scheduleTasks();
    return Promise.allSettled(completions);
  }

  /** Run any waiting tasks. */
  runWaiting() {
    checkRunWaiting(this);
    const completions = this.waiting.map(t => t.complete);
    this.pending.push(...this.waiting);
    this.waiting.length = 0;

    this.scheduleTasks();
    return Promise.allSettled(completions);
  }

  /** Stop running. */
  halt() {
    checkHalt(this);
    this.status = QUIESCING;
    this.standStill = new Promise((yay, nay) => {
      this.resolveStandStill = yay;
      this.rejectStandStill = nay;
    });
  }

  // ---------------------------------------------------------------------------

  /*private*/ scheduleTasks() {
    checkScheduleTasks(this);

    while (
      this.status === RUNNING &&
      (this.urgent.length || this.pending.length) &&
      this.inflight < this.concurrency
    ) {
      const next = this.urgent.length
        ? this.urgent.shift()
        : this.pending.shift();
      this.performTask(next);
    }

    if (this.status === QUIESCING && this.inflight === 0) {
      if (this.resolveStandStill) {
        this.resolveStandstill();
        delete this.resolveStandStill;
        delete this.rejectStandStill;
        // this.standStill is overwritten after another on/off cycle.
      }
    }
  }

  /*private*/ async performTask(task) {
    const handlers = this.handlers[task.id];
    this.inflight++;

    try {
      if (!handlers || handlers.length === 0) {
        throw new Error(`no handler for task with ID "${task.id}"`);
      } else if (handlers.length === 1) {
        task.resolveComplete(await apply(handlers[0], this.context, [task]));
      } else {
        const results = [];
        for (const handler of handlers) {
          results.push(await apply(handler, this.context, [task]));
        }
        task.resolveComplete(results);
      }
    } catch (x) {
      task.rejectComplete(x);
    } finally {
      this.inflight--;
      if (this.status !== STANDSTILL && this.status !== FAILED) {
        this.scheduleTasks();
      }
    }
  }
}
