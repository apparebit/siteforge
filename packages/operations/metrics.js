/* © 2020 Robert Grimm */

import { strict as assert } from 'assert';
import { performance } from 'perf_hooks';

const { toStringTag } = Symbol;

class Metric {
  #name;
  #bigint;
  #data;

  constructor(name, { bigint = false } = {}) {
    assert(typeof name === 'string');
    assert(this.constructor !== Metric);
    this.#name = name;
    this.#bigint = !!bigint;
    this.#data = new Map();
  }

  get [toStringTag]() {
    return assert.fail(`class Metric is abstract`);
  }

  get name() {
    return this.#name;
  }

  get bigint() {
    return this.#bigint;
  }

  get size() {
    return this.#data.size;
  }

  record(value, key = '') {
    const type = typeof value;
    assert(this.#bigint ? type === 'bigint' : type === 'number');
    assert(typeof key === 'string');

    const data = this.#data;
    if (data.has(key)) {
      data.set(key, data.get(key) + value);
    } else {
      data.set(key, value);
    }
  }

  get() {
    const data = this.#data;
    if (data.size === 1) return [...data.values()][0];
    throw new Error(`metric ${this.#name} has ${this.size} values`);
  }

  summarize() {
    let count = 0;
    let mean = 0;
    let min = Infinity;
    let max = -Infinity;

    for (const value of this.#data.values()) {
      count += 1;
      mean += (value - mean) / count;
      if (value < min) min = value;
      if (value > max) max = value;
    }

    return { count, mean, min, max };
  }
}

// -----------------------------------------------------------------------------

class Counter extends Metric {
  get [toStringTag]() {
    return 'Counter';
  }

  add(value, key = '') {
    this.record(value, key);
  }
}

class Timer extends Metric {
  #clock;

  constructor(name, clock) {
    super(name, {}); // No bigint for now!
    this.#clock = clock;
  }

  get [toStringTag]() {
    return 'Timer';
  }

  start(key = '') {
    // Check key and start measuring.
    assert(typeof key === 'string');
    const started = this.#clock();

    // Each start should have an end. Not several.
    let done = false;
    return () => {
      assert(!done);
      done = true;

      // Protect against shifty clocks.
      const ended = this.#clock();
      assert(ended > started, `clock must increase between readings`);
      this.record(ended - started, key);
      return this;
    };
  }
}

// -----------------------------------------------------------------------------

export default class Metrics {
  #metrics = new Map();
  #clock;

  constructor({ clock = performance.now } = {}) {
    assert(typeof clock === 'function');
    this.#clock = clock;
  }

  counter(name) {
    assert(typeof name === 'string' && name !== '');
    let counter = this.#metrics.get(name);
    if (!counter) {
      counter = new Counter(name);
      this.#metrics.set(name, counter);
    } else {
      assert(counter[toStringTag] === 'Counter');
    }
    return counter;
  }

  timer(name) {
    assert(typeof name === 'string' && name !== '');
    let timer = this.#metrics.get(name);
    if (!timer) {
      timer = new Timer(name, this.#clock);
      this.#metrics.set(name, timer);
    } else {
      assert(timer[toStringTag] === 'Timer');
    }
    return timer;
  }

  get(name) {
    return this.#metrics.get(name);
  }
}
