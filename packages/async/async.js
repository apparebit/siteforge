import { AsyncResource } from 'async_hooks';
import { inspect } from 'util';
import { strict } from 'assert';

const BUSY = Symbol('busy');
const { has } = Reflect;
const IDLE = Symbol('idle');
const STOPPED = Symbol('stopped');
const STOPPING = Symbol('stopping');
const { toStringTag } = Symbol;

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

// -----------------------------------------------------------------------------

export class Task extends AsyncResource {
  constructor(fn, receiver, ...args) {
    super('@grr/async/Task');
    this._fn = fn;
    this._receiver = receiver;
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
      this._resolve(
        this.runInAsyncScope(this._fn, this._receiver, ...this._args)
      );
    } catch (x) {
      this._reject(x);
    }
    return this._promise;
  }

  toString() {
    return `${this._fn.name || 'unknown'}(${this._args
      .map(a => {
        const type = typeof a;
        if (type === 'string') {
          return `'${a}'`;
        } else if (type === 'symbol') {
          return `@@${a.description}`;
        } else {
          return String(a);
        }
      })
      .join(', ')})`;
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
    this._stopped = newPromiseCapability();
  }

  isIdle() {
    return this._state === IDLE;
  }

  isBusy() {
    return this._state === BUSY;
  }

  isStopping() {
    return this._state === STOPPING;
  }

  isStopped() {
    return this._state === STOPPED;
  }

  hasCapacity() {
    return this._inflight < this._capacity;
  }

  hasTaskReady() {
    return this._ready.length;
  }

  run(fn, ...args) {
    strict.ok(
      typeof fn === 'function',
      'First argument to run() must be function'
    );
    if (this.isIdle()) this._state = BUSY;
    strict.ok(this.isBusy());

    const task = new Task(fn, this._context, ...args);
    if (this.hasCapacity()) {
      this._run(task);
    } else {
      this._ready.push(task);
      this._schedule();
    }
    return task.get();
  }

  async _run(task) {
    strict.ok(this.isBusy());
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
    if (this.isIdle() && this.hasTaskReady()) {
      this._state = BUSY;
    }
    while (this.isBusy() && this.hasTaskReady() && this.hasCapacity()) {
      this._run(this._ready.shift());
    }
    if (this._inflight === 0) {
      if (this.isBusy()) {
        this._state = IDLE;
        this._idle.resolve();
        this._idle = newPromiseCapability();
      } else if (this.isStopping()) {
        this._state = STOPPED;
        this._stopped.resolve();
      }
    }
  }

  stop() {
    if (this.isIdle()) {
      this._state = STOPPED;
      this._stopped.resolve();
    } else if (this.isBusy()) {
      this._state = STOPPING;
    }
    this._ready.length = 0;
    return this._stopped.promise;
  }

  onIdle() {
    return this._idle.promise;
  }

  onStopped() {
    return this._stopped.promise;
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
