/* © 2019 Robert Grimm */

import { AsyncResource } from 'async_hooks';
import { strict } from 'assert';

const ASAP = 1;
const BLOCK = -1;
const IDLE = Symbol('idle');
const RUNNING = Symbol('running');
const STOPPING = Symbol('stopping');
const DONE = Symbol('done');

const { has } = Reflect;
const { entries } = Object;

class Task extends AsyncResource {
  constructor(runtime, fn, args) {
    super('@grr/async/Task');
    this.runtime = runtime;
    this.fn = fn;
    this.args = args;
    Multitasker.newPromiseCapability(this);
  }

  async run() {
    this.runtime._inflight++;

    try {
      this.resolve(
        await this.runInAsyncScope(this.fn, this.runtime._context, ...this.args)
      );
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

  static newPromiseCapability(record = {}) {
    record.promise = new Promise((resolve, reject) => {
      record.resolve = resolve;
      record.reject = reject;
    });
    return record;
  }

  // ---------------------------------------------------------------------------
  constructor({ capacity = 8, context = {} } = {}) {
    this._capacity = capacity;
    this._context = context;
    if (!has(this._context, 'multitasker')) {
      this._context.multitasker = this;
    }

    this._state = IDLE;
    this._inflight = 0;
    this._asap = []; // Tasks that take absolute precedence.
    this._ready = []; // Tasks that are ready.
    this._blocked = []; // Tasks that are delayed until later.

    this._idle = Multitasker.newPromiseCapability();
    this._stopping = Multitasker.newPromiseCapability();
    this._done = Multitasker.newPromiseCapability();
  }

  handleWalk(handleFile) {
    return {
      handleNext: (handler, path, virtualPath) =>
        this.enqueue(ASAP, handler, path, virtualPath),
      handleFile: (path, virtualPath) =>
        this.enqueue(handleFile, path, virtualPath),
    };
  }

  status() {
    return {
      state: this._state.description,
      inflight: this._inflight,
      capacity: this._capacity,
      asap: this._asap.length,
      ready: this._ready.length,
      blocked: this._blocked.length,
    };
  }

  toString() {
    const fragments = ['Multitasker { '];
    for (const [key, value] of entries(this.status())) {
      if (fragments.length > 1) fragments.push(', ');
      fragments.push(key, `: `, value);
    }
    fragments.push(' }');
    return fragments.join('');
  }

  is(...states) {
    for (const state of states) {
      if (this._state === state) return true;
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
      this._state = DONE;
      this._stopping.resolve();
      this._done.resolve();
    } else {
      this._state = STOPPING;
      this._stopping.resolve();
    }

    return this._done.promise;
  }

  onstopping(fn) {
    return fn ? this._stopping.promise.then(fn) : this._stopping.promise;
  }

  ondone(fn) {
    return fn ? this._done.promise.then(fn) : this._done.promise;
  }

  // ---------------------------------------------------------------------------

  hasTaskReady() {
    return Boolean(this._asap.length || this._ready.length);
  }

  hasCapacity() {
    return this._inflight < this._capacity;
  }

  _schedule() {
    // If idle, we do have capacity. Do we also have tasks ready?
    if (this.is(IDLE) && this.hasTaskReady()) this._state = RUNNING;

    // Start as many ready tasks as possible.
    while (this.is(RUNNING) && this.hasCapacity() && this.hasTaskReady()) {
      const task = this._asap.length ? this._asap.shift() : this._ready.shift();
      task.run();
    }

    if (this._inflight === 0) {
      if (this.is(RUNNING)) {
        // Transition to idle state effectively consumes promise.
        // Therefore, we immediately replace with new promise.
        this._state = IDLE;
        this._idle.resolve();
        this._idle = Multitasker.newPromiseCapability();
      } else if (this.is(STOPPING)) {
        this._state = DONE;
        this._done.resolve();
      }
    }
  }
}
