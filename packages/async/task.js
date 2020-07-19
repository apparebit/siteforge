/* © 2019-2020 Robert Grimm */

import { AsyncResource } from 'async_hooks';
import { settleable } from './promise.js';
import { inspect } from 'util';
import { strict } from 'assert';

const LABEL_TASK = '@grr/async/Task';
const LABEL_EXECUTOR = LABEL_TASK + '.Executor';

const configurable = true;
const { defineProperty } = Object;
const { has } = Reflect;
const IDLE = Symbol('idle');
const RUNNING = Symbol('running');
const STOPPED = Symbol('stopped');
const STOPPING = Symbol('stopping');
const { toStringTag } = Symbol;

const format = value => {
  const type = typeof value;
  if (type === 'string') {
    return `'${value}'`;
  } else if (type === 'symbol') {
    return `@@${value.description}`;
  } else {
    return String(value);
  }
};

// -----------------------------------------------------------------------------

class Task extends AsyncResource {
  constructor(fn, that, ...args) {
    super(LABEL_TASK);
    this._fn = fn;
    this._that = that;
    this._args = args;
    this._didRun = false;

    const s = settleable();
    this._promise = s.promise;
    this._resolve = s.resolve;
    this._reject = s.reject;
  }

  get() {
    return this._promise;
  }

  run() {
    if (this._didRun) {
      throw new Error(`Task ${this.toString()} has already run`);
    }
    this._didRun = true;

    try {
      this._resolve(this.runInAsyncScope(this._fn, this._that, ...this._args));
    } catch (x) {
      this._reject(x);
    }
    return this._promise;
  }

  toString() {
    let s = this._that != null ? format(this._that) + '.' : '';
    return (
      s + `${this._fn.name || 'function'}(${this._args.map(format).join(', ')})`
    );
  }

  get [toStringTag]() {
    return LABEL_TASK;
  }
}

// -----------------------------------------------------------------------------

class Executor {
  constructor({ capacity = 8, context = {} } = {}) {
    this._state = IDLE;
    this._ready = [];
    this._inflight = 0;
    this._capacity = capacity;
    this._completed = 0;
    this._context = context;
    if (!has(this._context, 'executor')) this._context.executor = this;
    this._idle = settleable();
    this._stop = settleable();
    this._didStop = settleable();
  }

  get length() {
    return this._inflight + this._ready.length;
  }

  isIdle() {
    return this._state === IDLE;
  }

  isRunning() {
    return this._state === RUNNING;
  }

  isStopping() {
    return this._state === STOPPING;
  }

  hasStopped() {
    return this._state === STOPPED;
  }

  hasCapacity() {
    return this._inflight < this._capacity;
  }

  hasTaskReady() {
    return this._ready.length;
  }

  onIdle() {
    return this._idle.promise;
  }

  onStop() {
    return this._stop.promise;
  }

  onDidStop() {
    return this._didStop.promise;
  }

  submit(fn, that, ...args) {
    return { done: this.run(fn, that, ...args) };
  }

  run(fn, that, ...args) {
    strict.ok(
      typeof fn === 'function',
      'First argument to run() must be function'
    );
    if (this.isIdle()) this._state = RUNNING;
    strict.ok(this.isRunning());

    const task = new Task(fn, that == null ? this._context : that, ...args);
    if (this.hasCapacity()) {
      this._run(task);
    } else {
      this._ready.push(task);
      this._schedule();
    }
    return task.get();
  }

  async _run(task) {
    strict.ok(this.isRunning());
    this._inflight++;
    try {
      await task.run();
    } catch {
      // Ignore
    } finally {
      this._completed++;
      this._inflight--;
      this._schedule();
    }
  }

  _schedule() {
    while (this.isRunning() && this.hasTaskReady() && this.hasCapacity()) {
      this._run(this._ready.shift());
    }
    if (this._inflight === 0) {
      if (this.isRunning()) {
        this._state = IDLE;
        this._idle.resolve();
        this._idle = settleable();
      } else if (this.isStopping()) {
        this._state = STOPPED;
        this._didStop.resolve();
      }
    }
  }

  stop() {
    if (this.isIdle()) {
      this._state = STOPPED;
      this._stop.resolve();
      this._didStop.resolve();
    } else if (this.isRunning()) {
      this._state = STOPPING;
      this._stop.resolve();
    }
    this._ready.length = 0;
    return this._didStop.promise;
  }

  status() {
    return {
      state: this._state.description,
      ready: this._ready.length,
      inflight: this._inflight,
      capacity: this._capacity,
      completed: this._completed,
    };
  }

  toString() {
    return `${LABEL_EXECUTOR} ${inspect(this.status())}`;
  }

  get [toStringTag]() {
    return LABEL_EXECUTOR;
  }
}

defineProperty(Task, 'Executor', {
  configurable,
  value: Executor,
});

export default Task;
