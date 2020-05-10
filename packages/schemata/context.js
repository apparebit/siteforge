/* © 2020 Robert Grimm */

import { strict as assert } from 'assert';
import { EOL } from 'os';
import { toKeyPathPath } from '@grr/oddjob/string';

const { isArray } = Array;
const { iterator } = Symbol;
const { keys: keysOf } = Object;

// =============================================================================

const pool = [];

export default class Context {
  static assertString(value) {
    assert(typeof value === 'string');
    return value;
  }

  static assertFunction(value) {
    assert(typeof value === 'function');
    return value;
  }

  static assertFunctionArray(value) {
    assert(isArray(value));
    for (const element of value) {
      Context.assertFunction(element);
    }
    return value;
  }

  static assertFunctionObject(value) {
    assert(value != null);
    const type = typeof value;
    assert(type === 'object' || type === 'function');
    for (const key of keysOf(value)) {
      Context.assertFunction(value[key]);
    }
    return value;
  }

  static assertIterable(value) {
    assert(value && typeof value[iterator] === 'function');
    return value;
  }

  // ===========================================================================

  #path = [];
  #value;
  #savedValue;
  #defects = [];
  #savedDefects = 0;

  static ify(checker) {
    Context.assertFunction(checker);

    return (value, context) => {
      if (context) {
        return context.invoke(checker);
      }

      if (pool.length === 0) {
        pool.push(new Context());
      }

      context = pool.pop();
      context.#value = value;
      context.#savedValue = value;

      try {
        const ok = context.invoke(checker);
        if (!context.hasDefect()) {
          if (ok) return context.value;
          context.addDefect(
            `"${value}" has been rejected by checker "${
              checker.name || checker
            }"`
          );
        }
        throw context.toError();
      } finally {
        context.#path.length = 0;
        context.#value = undefined;
        context.#savedValue = undefined;
        context.#defects.length = 0;
        context.#savedDefects = 0;

        pool.push(context);
      }
    };
  }

  get path() {
    return toKeyPathPath(this.#path);
  }

  get key() {
    return this.#path[this.#path.length - 1];
  }

  get value() {
    return this.#value;
  }

  invoke(mapper) {
    return mapper(this.#value, this);
  }

  map(mapper) {
    return (this.#value = mapper(this.#value, this));
  }

  // ---------------------------------------------------------------------------

  hasDefect() {
    return this.#defects.length > 0;
  }

  addDefect(description) {
    Context.assertString(description);

    const { path } = this;
    const entity = path === '$' ? 'Value being validated' : `Property ${path}`;
    this.#defects.push(`${entity} ${description}`);
  }

  toError() {
    const { length } = this.#defects;
    if (length === 1) {
      return new Error(
        `Data validation identified one defect:${EOL}` + this.#defects[0]
      );
    } else if (length > 1) {
      return new Error(
        `Data validation identified ${length} defects:${EOL}` +
          this.#defects.join(EOL)
      );
    } else {
      return undefined;
    }
  }

  // ===========================================================================

  withProperties(keysAndCheckers) {
    // Operating over all properties instead of only one property amortizes the
    // overhead of saving and restoring the context's fields. Using an iterable
    // over key, checker pairs ensures reusability for plain objects and arrays.
    Context.assertIterable(keysAndCheckers);

    const pathLength = this.#path.length;
    const parent = this.#value;
    const savedValue = this.#savedValue;
    const savedDefects = this.#savedDefects;

    const type = typeof parent;
    if (parent == null || (type !== 'object' && type !== 'function')) {
      this.addDefect(`is a primitive value and has no properties`);
      return false;
    }

    this.#path.push(null);

    try {
      let result = true;
      for (const [key, checker] of keysAndCheckers) {
        this.#path[this.#path.length - 1] = key;
        const value = (this.#value = parent[key]);
        this.#savedValue = value;
        this.#savedDefects = this.#defects.length;

        const ok = this.invoke(checker);
        if (ok && value !== this.#value) {
          parent[key] = this.#value;
        }
        result = result && ok;
      }
      return result;
    } finally {
      this.#path.length = pathLength;
      this.#value = parent;
      this.#savedValue = savedValue;
      this.#savedDefects = savedDefects;
    }
  }

  // ---------------------------------------------------------------------------

  withCheckpoint(checker) {
    Context.assertFunction(checker);

    const savedValue = this.#savedValue;
    const savedDefects = this.#savedDefects;
    try {
      this.#savedValue = this.#value;
      this.#savedDefects = this.#defects.length;
      return this.invoke(checker);
    } finally {
      this.#savedValue = savedValue;
      this.#savedDefects = savedDefects;
    }
  }

  resetValue() {
    this.#value = this.#savedValue;
  }

  resetDefects() {
    this.#defects.length = this.#savedDefects;
  }
}
