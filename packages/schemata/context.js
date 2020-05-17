/* © 2020 Robert Grimm */

import { strict as assert } from 'assert';
import { EOL } from 'os';
import { toKeyPathPath } from '@grr/oddjob/string';

const EnumConstantType = new Set(['bigint', 'boolean', 'number', 'string']);
const { isArray } = Array;
const { isSafeInteger } = Number;
const { iterator } = Symbol;
const pool = [];

export default class Context {
  static assertString(value) {
    assert(typeof value === 'string');
    return value;
  }

  static assertKey(value) {
    assert(typeof value === 'string' || (isSafeInteger(value) && value > 0));
    return value;
  }

  static assertKeyPath(value) {
    assert(isArray(value));
    for (const element of value) {
      Context.assertKey(element);
    }
    return value;
  }

  static assertEnumConstant(value) {
    assert(EnumConstantType.has(typeof value));
    return value;
  }

  static assertFunction(value) {
    assert(typeof value === 'function');
    return value;
  }

  static assertFunctionArray(value) {
    assert(isArray(value));
    for (const element of value) {
      assert(typeof element === 'function');
    }
    return value;
  }

  static isObjectLike(value) {
    if (value == null) return false;
    const type = typeof value;
    return type === 'object' || type === 'function';
  }

  static assertObjectLike(value) {
    assert(Context.isObjectLike(value));
    return value;
  }

  static toIterable(generatorFn) {
    return {
      [iterator]() {
        return generatorFn();
      },
    };
  }

  static assertIterable(value) {
    assert(value && typeof value[iterator] === 'function');
    return value;
  }

  // ===========================================================================

  #path = []; // The key path to the current value, empty for root.
  #value; // The current value.
  #result; // The current result from a nested schema invocation.
  #defects = []; // The defects found so far.
  #defectCount = 0; // The last checkpoint for defects.

  /** Get the complete key path. */
  get path() {
    return toKeyPathPath(this.#path);
  }

  /** Get the current key. */
  get key() {
    const path = this.#path;
    return path[path.length - 1];
  }

  /** Get the current value. */
  get value() {
    return this.#value;
  }

  /** Get the current result. */
  get result() {
    return this.#result;
  }

  /** Set the current result. */
  set result(value) {
    this.#result = value;
  }

  /**
   * Invoke the given schema on the current value and context but, instead of
   * returning a boolean indicating validation success or failure, return the
   * context's result.
   */
  resulting(schema) {
    schema(this.#value, this);
    return this.#result;
  }

  // ---------------------------------------------------------------------------

  /** Determine whether any defects have been found so far. */
  hasDefects() {
    return Boolean(this.#defects.length);
  }

  /**
   * Record a defect. The description should be a sentence fragment that omits
   * the subject yet also asserts that some aspect of that subject is lacking.
   * For example, "should be an integer" or "is not an integer" are reasonable
   * ways of expressing that the value is not an integer but should be.
   */
  defect(description) {
    this.#defects.push(
      (this.#path.length === 0 ? `Value ` : `Property ${this.path} `) +
        description
    );
  }

  /** Convert the defects into a single error object that can be thrown. */
  toError() {
    const defects = this.#defects;
    const { length } = defects;
    switch (length) {
      case 0:
        return undefined;
      case 1:
        return new Error(`Validation found one defect:${EOL}` + defects[0]);
      default:
        return new Error(
          `Validation found ${length} defects:${EOL}` + defects.join(EOL)
        );
    }
  }

  // ---------------------------------------------------------------------------

  /**
   * Execute the given function within a checkpoint. This function saves the
   * current key path length, value, as well as defect count before invoking the
   * function and restores those values afterwards again. The current result is
   * not saved by design.
   */
  withCheckpoint(fn) {
    Context.assertFunction(fn);

    const pathLength = this.#path.length;
    const value = this.#value;
    const defectCount = this.#defectCount;
    this.#defectCount = this.#defects.length;
    try {
      return fn(value, this);
    } finally {
      this.#path.length = pathLength;
      this.#value = value;
      this.#defectCount = defectCount;
    }
  }

  /**
   * Determine if defects were found since the last dynamically enclosing
   * checkpoint. If there is no such checkpoint, determine if defects were
   * found at all.
   */
  hasDefectsSinceCheckpoint() {
    return this.#defects.length > this.#defectCount;
  }

  /**
   * Clear any defects since the last dynamically enclosing checkpoint. If there
   * is no such checkpoint, clear all defects.
   */
  clearDefectsSinceCheckpoint() {
    if (this.#defects.length > this.#defectCount) {
      this.#defects.length = this.#defectCount;
    }
  }

  // ---------------------------------------------------------------------------

  /**
   * Check a single, possibly deeply nested property. The given validation
   * callback is executed within a checkpoint.
   */
  withKeyPath(keyPath, schema, { requireContainer = true } = {}) {
    Context.assertKeyPath(keyPath);
    Context.assertFunction(schema);

    return this.withCheckpoint((value, context) => {
      const path = context.#path;

      for (const key of keyPath) {
        if (!Context.isObjectLike(value)) {
          if (requireContainer) {
            this.defect(`is primitive and does not have properties`);
            return false;
          } else {
            return true;
          }
        }

        path.push(key);
        value = value[key];
      }

      context.#value = value;
      return schema(value, context);
    });
  }

  /**
   * Check all the properties of current value. This method collects the results
   * of checking properties into the object returned by the `init` function;
   * that object becomes the current result just before this method returns. The
   * given iterable may yield `[key, schema]` 2-tuples or `[readFromKey,
   * writeToKey, schema]` 3-tuples. The two element version applies the schema
   * function to the named property's value and stores the result in a property
   * with the same name. The three element version differs by reading from a
   * different property than writing to. All schema functions are executed
   * within the same checkpoint.
   */
  withProperties(
    schemata,
    {
      requireContainer = true,
      init = () => ({}),
      collectErrorResults = false,
    } = {}
  ) {
    Context.assertIterable(schemata);
    Context.assertFunction(init);

    return this.withCheckpoint((value, context) => {
      if (!Context.isObjectLike(value)) {
        if (requireContainer) {
          this.defect(`is primitive and does not have properties`);
          return false;
        } else {
          return true;
        }
      }

      const path = context.#path;
      path.push(null); // The empty slot for property keys.
      const last = path.length - 1;

      const result = init();
      let flag = true;
      for (let [readFrom, writeTo, schema] of schemata) {
        if (schema === undefined) {
          schema = writeTo;
          writeTo = readFrom;
        }

        path[last] = readFrom;
        const ok = schema(
          (context.#result = context.#value = value[readFrom]),
          context
        );
        if (ok || collectErrorResults) {
          result[writeTo] = context.#result;
        }
        flag = flag && ok;
      }

      context.#result = result;
      return flag;
    });
  }

  // ---------------------------------------------------------------------------

  /** Wrap the given function to be invoked with a context. */
  static ify(fn) {
    return (value, context) => {
      if (context) {
        assert(value === context.#value);
        return fn(value, context);
      }

      if (pool.length === 0) {
        pool.push(new Context());
      }

      context = pool.pop();
      context.#result = context.#value = value;

      try {
        const ok = fn(value, context);
        if (!context.hasDefects()) {
          if (ok) {
            // The validation truly succeeded.
            return context.#result;
          }
          context.defect(`was rejected by "${fn.name}"`);
        }
        // The validation failed.
        throw context.toError();
      } finally {
        context.#path.length = 0;
        context.#result = context.#value = undefined;
        context.#defects.length = 0;
        context.#defectCount = 0;
        pool.push(context);
      }
    };
  }
}
