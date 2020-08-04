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
  #state = IDLE;
  #ready = [];
  #inflight = 0;
  #capacity;
  #completed = 0;
  #context;
  #idle = settleable();
  #stop = settleable();
  #didStop = settleable();

  constructor({ capacity = 8, context = {} } = {}) {
    this.#state = IDLE;
    this.#ready = [];
    this.#inflight = 0;
    this.#capacity = capacity;
    this.#completed = 0;
    this.#context = context;
    if (!has(this.#context, 'executor')) this.#context.executor = this;
    this.#idle = settleable();
    this.#stop = settleable();
    this.#didStop = settleable();
  }

  get length() {
    return this.#inflight + this.#ready.length;
  }

  isIdle() {
    return this.#state === IDLE;
  }

  isRunning() {
    return this.#state === RUNNING;
  }

  isStopping() {
    return this.#state === STOPPING;
  }

  hasStopped() {
    return this.#state === STOPPED;
  }

  hasCapacity() {
    return this.#inflight < this.#capacity;
  }

  hasTaskReady() {
    return this.#ready.length;
  }

  onIdle() {
    return this.#idle.promise;
  }

  onStop() {
    return this.#stop.promise;
  }

  onDidStop() {
    return this.#didStop.promise;
  }

  submit(fn, that, ...args) {
    return { done: this.run(fn, that, ...args) };
  }

  run(fn, that, ...args) {
    strict.ok(
      typeof fn === 'function',
      'First argument to run() must be function'
    );
    if (this.isIdle()) this.#state = RUNNING;
    strict.ok(this.isRunning());

    const task = new Task(fn, that == null ? this.#context : that, ...args);
    if (this.hasCapacity()) {
      this._run(task);
    } else {
      this.#ready.push(task);
      this._schedule();
    }
    return task.get();
  }

  async _run(task) {
    strict.ok(this.isRunning());
    this.#inflight++;
    try {
      await task.run();
    } catch {
      // Ignore
    } finally {
      this.#completed++;
      this.#inflight--;
      this._schedule();
    }
  }

  _schedule() {
    while (this.isRunning() && this.hasTaskReady() && this.hasCapacity()) {
      this._run(this.#ready.shift());
    }
    if (this.#inflight === 0) {
      if (this.isRunning()) {
        this.#state = IDLE;
        this.#idle.resolve();
        this.#idle = settleable();
      } else if (this.isStopping()) {
        this.#state = STOPPED;
        this.#didStop.resolve();
      }
    }
  }

  stop() {
    if (this.isIdle()) {
      this.#state = STOPPED;
      this.#stop.resolve();
      this.#didStop.resolve();
    } else if (this.isRunning()) {
      this.#state = STOPPING;
      this.#stop.resolve();
    }
    this.#ready.length = 0;
    return this.#didStop.promise;
  }

  status() {
    return {
      state: this.#state.description,
      ready: this.#ready.length,
      inflight: this.#inflight,
      capacity: this.#capacity,
      completed: this.#completed,
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
