/* © 2020 Robert Grimm */

import { strict as assert } from 'assert';
import { performance } from 'perf_hooks';

const { toStringTag } = Symbol;

// =============================================================================

/**
 * An abstract metric. This class captures some number of measurements that
 * together provide the metric. Each such measurement has a key and a value. The
 * key is a string. Measurements with the same key are cumulative and not stored
 * individually. The value is either a number or bigint, depending on the
 * metric's configuration. `add()` captures a measurement, `get()` returns the
 * only measurement, and `summarize()` computes salient statistics.
 */
class Metric {
  #name;
  #bigint;
  #data;

  constructor(name, { bigint = false } = {}) {
    assert(new.target !== Metric);
    assert(typeof name === 'string');
    assert(this.constructor !== Metric);
    this.#name = name;
    this.#bigint = !!bigint;
    this.#data = new Map();
  }

  /** Get the name. */
  get name() {
    return this.#name;
  }

  /** Determine whether this metric uses big integers. */
  get bigint() {
    return this.#bigint;
  }

  /** Get the number of recorded measurements. */
  get size() {
    return this.#data.size;
  }

  /** Record a measurement. */
  add(value, key = '') {
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

  /** Get the only measurement and throw otherwise. */
  get() {
    const data = this.#data;
    if (data.size === 1) return [...data.values()][0];
    throw new Error(`metric ${this.#name} has ${this.size} values`);
  }

  /** Summarize this metric. */
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

/** A concrete counter. */
class Counter extends Metric {
  get [toStringTag]() {
    return 'Counter';
  }
}

/** A concrete timer. */
class Timer extends Metric {
  #clock;

  constructor(name, clock) {
    super(name, {}); // No bigint for now!
    this.#clock = clock;
  }

  get [toStringTag]() {
    return 'Timer';
  }

  /** Start the timer and return a function to stop it again. */
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
      this.add(ended - started, key);
      return this;
    };
  }
}

// =============================================================================

/** A collection of named metrics. */
export default class Metrics {
  #metrics = new Map();
  #clock;

  constructor({ clock = performance.now } = {}) {
    assert(typeof clock === 'function');
    this.#clock = clock;
  }

  /**
   * Return the counter with the given name. This method creates a new counter
   * if no metric with the name exists. It returns the existing metric if it is
   * a counter, throwing otherwise.
   */
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

  /**
   * Return the timer with the given name. This method creates a new timer if no
   * metric with the name exists. It returns the existing metric if it is a
   * timer, throwing otherwise.
   */
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

  /** Return the metric with the given name. */
  get(name) {
    return this.#metrics.get(name);
  }
}
