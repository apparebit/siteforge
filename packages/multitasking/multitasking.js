/* © 2019 Robert Grimm */

import { strict } from 'assert';

const Idle = 1;
const Running = 2;
const Stopping = 3;
const Done = 4;

const { apply, has } = Reflect;

export default class Multitasking {
  static get Asap() {
    return 1;
  }
  static get Later() {
    return -1;
  }
  static get Idle() {
    return Idle;
  }
  static get Running() {
    return Running;
  }
  static get Stopping() {
    return Stopping;
  }
  static get Done() {
    return Done;
  }

  // ---------------------------------------------------------------------------

  constructor({ concurrency = 8, context = {} } = {}) {
    this._concurrency = concurrency;
    this._context = context;
    if (!has(this._context, 'runner')) this._context.runner = this;

    this._status = Idle;
    this._inflight = 0;
    this._asap = []; // Tasks that take absolute precedence.
    this._ready = []; // Tasks that are ready.
    this._blocked = []; // Tasks that are delayed until later.

    this._stop = {};
    this._stop.promise = new Promise(resolve => (this._stop.resolve = resolve));
    this._done = {};
    this._done.promise = new Promise(resolve => (this._done.resolve = resolve));
  }

  is(...validStatusValues) {
    for (const status of validStatusValues) {
      if (this._status === status) return true;
    }
    return false;
  }

  enqueue(...args) {
    strict.ok(this.is(Idle, Running));

    let fn;
    let queue = this._ready;
    if (typeof args[0] === 'function') {
      fn = args.shift();
    } else if (typeof args[1] === 'function') {
      const priority = args.shift();
      fn = args.shift();

      if (priority > 0) {
        queue = this._asap;
      } else if (priority < 0) {
        queue = this._blocked;
      }
    } else {
      throw new Error(`Invalid invocation enqueue(${args})`);
    }

    const task = { fn, args };
    task.promise = new Promise((resolve, reject) => {
      task.resolve = resolve;
      task.reject = reject;
    });
    queue.push(task);

    this._schedule();
    return task.promise;
  }

  // ---------------------------------------------------------------------------

  onidle(fn) {
    return fn ? this._idle.promise.then(fn) : this._idle.promise;
  }

  unblock() {
    strict.ok(this.is(Idle, Running));

    this._ready.push(...this._blocked);
    this._blocked.length = 0;
    this._schedule();
  }

  // ---------------------------------------------------------------------------

  stop() {
    if (this.is(Stopping, Done)) return false;
    this._status = Stopping;
    this._asap.length = 0;
    this._ready.length = 0;
    this._blocked.length = 0;
    this._stop.resolve();
    this._schedule();
    return true;
  }

  onstop(fn) {
    return fn ? this._stop.promise.then(fn) : this._stop.promise;
  }

  ondone(fn) {
    return fn ? this._done.promise.then(fn) : this._done.promise;
  }

  // ---------------------------------------------------------------------------

  hasReadyTask() {
    return Boolean(this._asap.length || this._ready.length);
  }

  hasCapacity() {
    return this._inflight < this._concurrency;
  }

  _schedule() {
    if (this.is(Idle) && this.hasReadyTask()) {
      this._status = Running;
      this._idle = {};
      this._idle.promise = new Promise(
        resolve => (this._idle.resolve = resolve)
      );
    }

    while (this.is(Running) && this.hasCapacity() && this.hasReadyTask()) {
      const task = this._asap.length ? this._asap.shift() : this._ready.shift();
      this._inflight++;

      Promise.resolve()
        .then(() => {
          return apply(task.fn, this._context, task.args);
        })
        .finally(() => {
          this._inflight--;
          this._schedule();
        })
        .then(task.resolve, task.reject);
    }

    if (this._inflight === 0) {
      if (this.is(Running)) {
        this._status = Idle;
        this._idle.resolve();
      } else if (this.is(Stopping)) {
        this._status = Done;
        this._done.resolve();
      }
    }
  }
}
