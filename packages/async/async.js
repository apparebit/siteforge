/* © 2019-2020 Robert Grimm */

import { AsyncResource } from 'async_hooks';
import { inspect } from 'util';
import { strict } from 'assert';

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

export function rethrow(error) {
  setImmediate(() => {
    throw error;
  });
}

export function newPromiseCapability(container = {}) {
  container.promise = new Promise((resolve, reject) => {
    container.resolve = resolve;
    container.reject = reject;
  });
  return container;
}

export function didPoll() {
  return new Promise(resolve => setImmediate(resolve, 'didPoll'));
}

export function delay(ms = 0) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// -----------------------------------------------------------------------------

export class Task extends AsyncResource {
  constructor(fn, that, ...args) {
    super('@grr/async/Task');
    this.reset(fn, that, ...args);
  }

  reset(fn, that, ...args) {
    this._fn = fn;
    this._that = that;
    this._args = args;
    this._didRun = false;

    const cap = newPromiseCapability();
    this._promise = cap.promise;
    this._resolve = cap.resolve;
    this._reject = cap.reject;
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
    return '@grr/async/Task';
  }
}

// -----------------------------------------------------------------------------

export default class Executor {
  constructor({ capacity = 8, context = {} } = {}) {
    this._state = IDLE;
    this._ready = [];
    this._inflight = 0;
    this._capacity = capacity;
    this._completed = 0;
    this._context = context;
    if (!has(this._context, 'executor')) this._context.executor = this;
    this._idle = newPromiseCapability();
    this._stop = newPromiseCapability();
    this._didStop = newPromiseCapability();
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
        this._idle = newPromiseCapability();
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
    return '@grr/async/Executor ' + inspect(this.status());
  }

  get [toStringTag]() {
    return '@grr/async/Executor';
  }
}
