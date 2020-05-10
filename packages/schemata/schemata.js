/* © 2020 Robert Grimm */

import Builtin from './builtin.js';
import Context from './context.js';

const { freeze, keys: keysOf } = Builtin.Object;
const { isArray } = Builtin.Array;
const { isSafeInteger } = Builtin.Number;

// --------------------------------------------------------- Validation Context

export { Context };

// ---------------------------------------------------------- Simple Predicates

export const Nullish = value => value == null;

export const OneOf = (...values) => {
  if (values.length === 1 && isArray(values[0])) {
    values = values[0];
  }
  return value => values.includes(value);
};

export const ObjectLike = value => {
  if (value == null) return false;
  const type = typeof value;
  return type === 'object' || type === 'function';
};

// According to the standard, Map.prototype.has and Set.prototype.has must check
// for an internal slot with the map or set data, respectively. Hence we can
// detect map and set instances within this realm.
const MapPrototypeHas = Builtin.Map.prototype.has;
export const Map = value => {
  try {
    MapPrototypeHas.call(value);
    return true;
  } catch {
    return false;
  }
};

const SetPrototypeHas = Builtin.Set.prototype.has;
export const Set = value => {
  try {
    SetPrototypeHas.call(value);
    return true;
  } catch {
    return false;
  }
};

// -------------------------------------------------------- Defect Descriptions

export const Check = (description, predicate) => {
  Context.assertString(description);
  Context.assertFunction(predicate);

  return Context.ify((_, context) => {
    if (context.invoke(predicate)) return true;
    context.addDefect(description);
    return false;
  });
};

export const Recheck = (description, predicate) => {
  Context.assertString(description);
  Context.assertFunction(predicate);

  return Context.ify((_, context) =>
    context.withCheckpoint((_, context) => {
      if (context.invoke(predicate)) return true;
      context.resetDefects();
      context.addDefect(description);
      return false;
    })
  );
};

// ---------------------------------------------------------------- Combinators

export const All = (...checkers) => {
  Context.assertFunctionArray(checkers);

  return Context.ify((_, context) =>
    context.withCheckpoint((_, context) => {
      for (const checker of checkers) {
        if (!context.invoke(checker)) {
          context.resetValue();
          return false;
        }
      }
      return true;
    })
  );
};

export const Any = (...checkers) => {
  Context.assertFunctionArray(checkers);

  return Context.ify((_, context) =>
    context.withCheckpoint((_, context) => {
      for (const checker of checkers) {
        if (context.invoke(checker)) {
          context.resetDefects();
          return true;
        } else {
          context.resetValue();
        }
      }
      return false;
    })
  );
};

export const Each = (...checkers) => {
  Context.assertFunctionArray(checkers);

  return Context.ify((_, context) => {
    let result = true;
    for (const checker of checkers) {
      const ok = context.invoke(checker);
      result = result && ok;
    }
    return result;
  });
};

export const Option = checker => Any(Nullish, checker);

// --------------------------------------------------------- Objects and Arrays

export const Distinct = freeze({ distinct: true });

/**
 * Check that a value is an array whose elements validate with the given
 * checker. If the `distinct` option is `true`, a standard JavaScript set is
 * used to detect duplicate elements. The `toEquatable` option provides a hook
 * for using an alternative representation during duplicate detection. The
 * hook has `(any, Set<any>, Context) => any` as its signature.
 */
export const Array = (
  checker,
  { distinct = false, toEquatable = v => v } = {}
) =>
  Context.ify((_, context) => {
    Context.assertFunction(checker);
    Context.assertFunction(toEquatable);

    if (!context.invoke(isArray)) {
      context.addDefect('should be an array');
      return false;
    }

    let wrapper = checker;
    if (distinct) {
      const values = new Builtin.Set();
      wrapper = (_, context) => {
        // Check for validity before checking for distinctness.
        if (!context.invoke(checker)) return false;

        const { value } = context;
        const equatable = toEquatable(value, values, context);

        if (values.has(equatable)) {
          context.addDefect('is repeated value');
          return false;
        } else {
          values.add(equatable);
          return context.invoke(checker);
        }
      };
    }

    return context.withProperties(function* keysAndCheckers() {
      const { length } = context.value;
      for (let index = 0; index < length; index++) {
        yield [index, wrapper];
      }
    });
  });

export const AtLeastOne = freeze({ lax: true, min: 1 });

export const Properties = (checkers, { lax = false, min = 0 } = {}) => {
  const isCheckerFunction = typeof checkers === 'function';
  if (!isCheckerFunction) Context.assertFunctionArray(checkers);

  return Context.ify((_, context) => {
    const { value } = context;
    if (!ObjectLike(value)) {
      context.addDefect('should be an object or function');
      return false;
    }

    return context.withProperties(function* keysAndCheckers() {
      // Account for number of defect-free matches.
      let matches = 0;

      // Iterate over value's keys for function, over checkers' keys for object.
      for (let key of keysOf(isCheckerFunction ? value : checkers)) {
        const checker = isCheckerFunction ? checkers : checkers[key];
        let effectiveChecker;

        if (lax && value[key] == null) {
          // In lax mode, we skip nullish properties. That means they validate,
          // though they do not count as matches.
          continue;
        } else if (min > 0) {
          // The min option specifies minimum number of properties that need to
          // validate. It helps with making lax mode practically useful.
          effectiveChecker = (_, context) => {
            const result = context.invoke(checker);
            if (result) matches++;
            return result;
          };
        } else {
          // Otherwise, we can just use the checker as is.
          effectiveChecker = checker;
        }

        yield [key, effectiveChecker];

        if (matches < min) {
          context.addDefect(
            `does not have at least ${min} matching properties.`
          );
        }
      }
    });
  });
};

// ---------------------------------------------------------------- Validations

export const Number = Check(
  'should a floating point number',
  v => typeof v === 'number'
);
export const Integer = Check('should be an integer', v => isSafeInteger(v));
export const BigInt = Check(
  'should be a big integer',
  v => typeof v === 'bigint'
);
export const String = Check('should be a string', v => typeof v === 'string');
