/* © 2019 Robert Grimm */

import { strict } from 'assert';

const ASAP = 1;
const BLOCK = -1;
const IDLE = 1;
const RUNNING = 2;
const STOPPING = 3;
const DONE = 4;

const { apply, has } = Reflect;

class Task {
  constructor(runtime, fn, args) {
    this.runtime = runtime;
    this.fn = fn;
    this.args = args;
    this.promise = new Promise((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
  }

  async run() {
    this.runtime._inflight++;

    try {
      this.resolve(await apply(this.fn, this.runtime._context, this.args));
    } catch (x) {
      this.reject(x);
    } finally {
      this.runtime._inflight--;
      this.runtime._schedule();
    }
  }
}

export default class Multitasker {
  static get Asap() {
    return ASAP;
  }
  static get Block() {
    return BLOCK;
  }
  static get Idle() {
    return IDLE;
  }
  static get Running() {
    return RUNNING;
  }
  static get Stopping() {
    return STOPPING;
  }
  static get Done() {
    return DONE;
  }

  // ---------------------------------------------------------------------------

  constructor({ concurrency = 8, context = {} } = {}) {
    this._concurrency = concurrency;
    this._context = context;
    if (!has(this._context, 'multitasker')) {
      this._context.multitasker = this;
    }

    this._status = IDLE;
    this._inflight = 0;
    this._asap = []; // Tasks that take absolute precedence.
    this._ready = []; // Tasks that are ready.
    this._blocked = []; // Tasks that are delayed until later.

    this._idle = {};
    this._idle.promise = new Promise(resolve => (this._idle.resolve = resolve));
    this._stop = {};
    this._stop.promise = new Promise(resolve => (this._stop.resolve = resolve));
    this._done = {};
    this._done.promise = new Promise(resolve => (this._done.resolve = resolve));
  }

  handleWalk(handleFile) {
    return {
      handleNext: (handler, path, virtualPath) =>
        this.enqueue(ASAP, handler, path, virtualPath),
      handleFile: (path, virtualPath) =>
        this.enqueue(handleFile, path, virtualPath),
    };
  }

  is(...validStatusValues) {
    for (const status of validStatusValues) {
      if (this._status === status) return true;
    }
    return false;
  }

  enqueue(...args) {
    strict.ok(this.is(IDLE, RUNNING));

    let fn;
    let priority = 0;
    if (typeof args[0] === 'function') {
      fn = args.shift();
    } else if (typeof args[1] === 'function') {
      priority = args.shift();
      fn = args.shift();
    } else {
      throw new Error(`Invalid invocation enqueue(${args})`);
    }

    const task = new Task(this, fn, args);
    if (priority < 0) {
      this._blocked.push(task);
    } else if (priority > 0) {
      this._asap.push(task);
    } else {
      this._ready.push(task);
    }
    if (priority >= 0) {
      this._schedule();
    }
    return task.promise;
  }

  // ---------------------------------------------------------------------------

  onidle(fn) {
    return fn ? this._idle.promise.then(fn) : this._idle.promise;
  }

  unblock() {
    strict.ok(this.is(IDLE, RUNNING));

    this._ready.push(...this._blocked);
    this._blocked.length = 0;
    this._schedule();
  }

  // ---------------------------------------------------------------------------

  stop() {
    if (this.is(STOPPING, DONE)) return this._done.promise;

    this._asap.length = 0;
    this._ready.length = 0;
    this._blocked.length = 0;

    if (this.is(IDLE)) {
      this._status = DONE;
      this._stop.resolve();
      this._done.resolve();
    } else {
      this._status = STOPPING;
      this._stop.resolve();
    }

    return this._done.promise;
  }

  onstop(fn) {
    return fn ? this._stop.promise.then(fn) : this._stop.promise;
  }

  ondone(fn) {
    return fn ? this._done.promise.then(fn) : this._done.promise;
  }

  // ---------------------------------------------------------------------------

  hasTaskReady() {
    return Boolean(this._asap.length || this._ready.length);
  }

  hasCapacity() {
    return this._inflight < this._concurrency;
  }

  _schedule() {
    // If idle, we do have capacity. Do we also have tasks ready?
    if (this.is(IDLE) && this.hasTaskReady()) this._status = RUNNING;

    // Start as many ready tasks as possible.
    while (this.is(RUNNING) && this.hasCapacity() && this.hasTaskReady()) {
      const task = this._asap.length ? this._asap.shift() : this._ready.shift();
      task.run();
    }

    if (this._inflight === 0) {
      if (this.is(RUNNING)) {
        // Transition to idle state effectively consumes promise.
        // Therefore, we immediately replace with new promise.
        this._status = IDLE;
        this._idle.resolve();
        this._idle = {};
        this._idle.promise = new Promise(
          resolve => (this._idle.resolve = resolve)
        );
      } else if (this.is(STOPPING)) {
        this._status = DONE;
        this._done.resolve();
      }
    }
  }
}
