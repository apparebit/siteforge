/* © 2020 Robert Grimm */

import { strict as assert } from 'assert';
import { performance } from 'perf_hooks';

const { now: nowMillis } = performance;
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
  #isBigInt;
  #data;

  /**
   * Create a new metric with the given name and options. The metric uses
   * floating point numbers by default.
   */
  constructor(name, { isBigInt = false } = {}) {
    assert(new.target !== Metric);
    assert(typeof name === 'string');
    assert(this.constructor !== Metric);
    this.#name = name;
    this.#isBigInt = Boolean(isBigInt);
    this.#data = new Map();
  }

  /** Get the name. */
  get name() {
    return this.#name;
  }

  /** Determine whether this metric uses big integers. */
  get isBigInt() {
    return this.#isBigInt;
  }

  /** Get the number of recorded measurements. */
  get size() {
    return this.#data.size;
  }

  /** Record a measurement. */
  add(value, key = '') {
    assert(typeof key === 'string');
    const type = typeof value;
    if (this.#isBigInt) {
      assert(type === 'bigint' && value >= 0n);
    } else {
      assert(type === 'number');
    }

    const data = this.#data;
    if (data.has(key)) {
      data.set(key, data.get(key) + value);
    } else {
      data.set(key, value);
    }
  }

  /** Determine whether this metric has a measurement with the given key. */
  has(key = '') {
    return this.#data.has(key);
  }

  /** Retrieve the measurement for the given key. */
  get(key = '') {
    return this.#data.get(key);
  }

  /**
   * Summarize this metric. This method returns an object with the `count`,
   * `mean`, `min`, and `max` of recorded measurements. If none have been
   * recorded, only the `count` is defined.
   */
  summarize() {
    const iter = this.#data.values();

    // Unroll the loop just once to correctly initialize the min and max even
    // for big integers, which have no known minimum and maximum value.
    let { value, done } = iter.next();
    if (done) return { count: 0 };

    let count = 1;
    let mean = value;
    let min = value;
    let max = value;

    while (true) {
      ({ value, done } = iter.next());
      if (done) break;

      // To minimize error, compute an iterative mean for floating point values
      // and the sum divided by the count for big integers.
      count += 1;
      mean += this.#isBigInt ? value : (value - mean) / count;
      if (value < min) min = value;
      if (value > max) max = value;
    }

    if (this.#isBigInt) mean = mean / BigInt(count);
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

  constructor(name, { clock = nowMillis } = {}) {
    super(name, { isBigInt: typeof clock() === 'bigint' });
    this.#clock = clock;
  }

  get [toStringTag]() {
    return 'Timer';
  }

  get clock() {
    return this.#clock;
  }

  /**
   * Start the timer and return a function that stops it again, recording the
   * duration as a measurement.
   */
  start(key = '') {
    // Check key and start measuring.
    assert(typeof key === 'string');
    const started = this.#clock();

    // Each start has one end but, a timer not being a sausage, no more.
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

/**
 * A collection of named metrics.
 */
export default class Metrics {
  static nowMillis() {
    return nowMillis();
  }

  #metrics = new Map();

  /**
   * Return the counter with the given name. This method creates a new counter
   * if no metric with the name exists. It returns the existing metric if it is
   * a counter, throwing otherwise. When creating a new counter, the options are
   * passed to the constructor. Otherwise, they must either be `undefined` or
   * the same as those used for creating the counter.
   */
  counter(name, options) {
    assert(typeof name === 'string' && name !== '');
    let counter = this.#metrics.get(name);
    if (!counter) {
      counter = new Counter(name, options);
      this.#metrics.set(name, counter);
    } else {
      assert(counter[toStringTag] === 'Counter');
      if (options !== undefined) {
        assert(options != null && counter.isBigInt === options.isBigInt);
      }
    }
    return counter;
  }

  /**
   * Return the timer with the given name. This method creates a new timer if no
   * metric with the name exists. It returns the existing metric if it is a
   * timer, throwing otherwise. When creating a new timer, the options are
   * passed to the constructor. Otherwise, they must be `undefined` or the same
   * as those used for creating the timer.
   */
  timer(name, options) {
    assert(typeof name === 'string' && name !== '');
    let timer = this.#metrics.get(name);
    if (!timer) {
      timer = new Timer(name, options);
      this.#metrics.set(name, timer);
    } else {
      assert(timer[toStringTag] === 'Timer');
      if (options !== undefined) {
        assert(options != null && timer.clock === options.clock);
      }
    }
    return timer;
  }

  /** Return the metric with the given name. */
  get(name) {
    return this.#metrics.get(name);
  }
}
