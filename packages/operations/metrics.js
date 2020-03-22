/* © 2020 Robert Grimm */

import { performance } from 'perf_hooks';

const COUNT = 'count';
const { round } = Math;
const TIME = 'time';

const checkLabels = labels => {
  if (!labels.length) {
    throw new Error(`at least one string label must be specified`);
  } else if (labels.filter(l => !l || typeof l !== 'string').length) {
    throw new Error(`labels must be non-empty strings`);
  }
};

// -----------------------------------------------------------------------------

export default class Metrics {
  #clock;
  #measurements = [];

  constructor({ clock = performance.now } = {}) {
    this.#clock = clock;
  }

  /** Erase all measurements collected so far. */
  clear() {
    this.#measurements.length = 0;
  }

  /** Record the given increment for the labelled count. Labels are ordered. */
  count(increment, ...labels) {
    checkLabels(labels);
    this.#measurements.push({ type: COUNT, labels, value: increment });
  }

  /**
   * Start measuring the labelled time duration. It is completed by invoking
   * the returned function. Labels are ordered.
   */
  time(...labels) {
    checkLabels(labels);
    const start = this.#clock();

    let done = false;
    return () => {
      if (done) throw new Error(`timer "${labels.join(', ')}" is done already`);
      done = true;

      this.#measurements.push({
        type: TIME,
        labels,
        value: round(this.#clock() - start),
      });
    };
  }

  // ---------------------------------------------------------------------------

  /**
   * Filter all measurements taken so far by the given type and ordered labels.
   * All arguments must be strings and match upon string equality—unless the
   * given type or label is `*`, which matches any string.
   */
  *byTypeAndLabels(type, ...labels) {
    const hasType = type !== '*' ? t => t === type : () => true;
    const indices = labels
      .map((e, i) => [i, e])
      .filter(e => e[1] !== '*')
      .map(e => e[0]);
    const hasLabels = actual => {
      if (actual.length < labels.length) return false;
      for (const index of indices) {
        if (actual[index] !== labels[index]) return false;
      }
      return true;
    };

    for (const metric of this.#measurements) {
      const { type, labels } = metric;
      if (hasType(type) && hasLabels(labels)) {
        yield metric;
      }
    }
  }

  oneAndOnly(type, ...labels) {
    const measurements = [...this.byTypeAndLabels(type, ...labels)];
    const { length } = measurements;
    if (length !== 1) {
      throw new Error(`there are ${length} matching measurements`);
    }
    return measurements[0];
  }

  /**
   * Summarize the data for the given type and labels. This function returns an
   * object with the count, sum, mean, min, and max.
   */
  summarize(type, ...labels) {
    let count = 0;
    let sum = 0;
    let mean = 0;
    let min = Infinity;
    let max = -Infinity;

    for (const metric of this.byTypeAndLabels(type, ...labels)) {
      let { value } = metric;

      count += 1;
      sum += value;
      mean = mean + (value - mean) / count;
      if (value < min) min = value;
      if (value > max) max = value;
    }

    return { count, sum, mean, min, max };
  }
}
