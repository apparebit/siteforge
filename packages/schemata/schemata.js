/* © 2020 Robert Grimm */

import { strict as assert } from 'assert';
import Builtin from './builtin.js';
import Context from './context.js';
import { isSet } from '@grr/oddjob/types';

const { entries: entriesOf, keys: keysOf, values: valuesOf } = Builtin.Object;
const { isArray } = Builtin.Array;
const { isSafeInteger } = Builtin.Number;

// -----------------------------------------------------------------------------

export const Check = (description, schema) =>
  Context.ify((value, context) => {
    const ok = schema(value, context);
    if (!ok) context.defect(description);
    return ok;
  });

export const Number = Check(
  `should be a floating point number`,
  v => typeof v === 'number'
);
export const Integer = Check(`should be an integer`, v => isSafeInteger(v));
export const BigInt = Check(
  `should be a big integer`,
  v => typeof v === 'bigint'
);
export const String = Check(`should be a string`, v => typeof v === 'string');

// -----------------------------------------------------------------------------

export const Enum = (...constants) => {
  if (constants.length === 1 && isSet(constants[0])) {
    const set = constants[0];
    for (const constant of set.values()) {
      Context.assertEnumConstant(constant);
    }
    return value => set.has(value);
  } else {
    for (const constant of constants) {
      Context.assertEnumConstant(constant);
    }
    return value => constants.includes(value);
  }
};

// -----------------------------------------------------------------------------

export const Any = schemata => {
  Context.assertFunctionArray(schemata);

  return Context.ify((value, context) =>
    context.withCheckpoint((value, context) => {
      for (const schema of schemata) {
        if (schema(value, context)) {
          context.clearDefectsSinceCheckpoint();
          return true;
        }
      }
      return false;
    })
  );
};

export const All = schemata => {
  Context.assertFunctionArray(schemata);

  return Context.ify((value, context) => {
    for (const schema of schemata) {
      if (!schema(value, context)) {
        return false;
      }
    }
    return true;
  });
};

// -----------------------------------------------------------------------------

export const Nullish = v => v == null;
export const Option = schema => Any(Nullish, schema);

export const From = (path, schema) => {
  Context.assertKeyPath(path);
  Context.assertFunction(schema);

  return Context.ify((_, context) => context.withKeyPath(path, schema));
};

// -----------------------------------------------------------------------------

export const Array = (
  schema,
  { distinct = true, nonempty = true, toEquatable = v => v } = {}
) => {
  Context.assertFunction(schema);
  Context.assertFunction(toEquatable);

  return Context.ify((value, context) => {
    if (!isArray(value)) {
      context.defect(`should be an array`);
      return false;
    } else if (nonempty && value.length === 0) {
      context.defect(`should be a non-empty array`);
      return false;
    }

    let wrapper = schema;
    if (distinct) {
      const seen = new Builtin.Set();
      wrapper = (value, context) => {
        if (!schema(value, context)) return false;

        const equatable = toEquatable(value, seen, context);
        if (seen.has(equatable)) {
          context.defect(`appears repeatedly in same array`);
          return false;
        } else {
          seen.add(equatable);
          return true;
        }
      };
    }

    return context.withProperties(
      Context.toIterable(function* schemata() {
        for (let index = 0; index < value.length; index++) {
          yield [index, wrapper];
        }
      }),
      { init: () => [] }
    );
  });
};

// -----------------------------------------------------------------------------

export const WithAtLeastOne = { lax: true, min: 1 };

export const Properties = (
  schemata,
  { filter = () => true, lax = true, min = 0 } = {}
) => {
  const isUniformMap = typeof schemata === 'function';
  if (!isUniformMap) {
    Context.assertObjectLike(schemata);
    for (const key of keysOf(schemata)) {
      const value = schemata[key];
      const type = typeof value;

      // Either a schema function...
      if (type === 'function') continue;

      // ...or an object with a key and a schema function.
      assert(value != null && type === 'object');
      Context.assertString(value.from);
      Context.assertFunction(value.schema);
    }
  }

  return Context.ify((value, context) => {
    if (!Context.isObjectLike(value)) {
      context.defect(`is not object-like and hence does not have properties`);
      return false;
    }

    let matches = 0;
    const countingSchema = schema => (value, context) => {
      const ok = schema(value, context);
      if (ok) matches++;
      return ok;
    };

    const ok = context.withProperties(
      Context.toIterable(function* keysAndCheckers() {
        for (const key of keysOf(isUniformMap ? value : schemata)) {
          if (!filter(key) || (lax && value[key] == null)) {
            continue;
          }

          let from, schema;
          if (isUniformMap) {
            schema = schemata;
          } else {
            schema = schemata[key];
            if (typeof schema !== 'function') {
              from = schema.from;
              schema = schema.schema;
            }
          }

          if (min > 0) {
            schema = countingSchema(schema);
          }

          if (from) {
            yield [from, key, schema];
          } else {
            yield [key, schema];
          }
        }
      })
    );

    if (matches < min) {
      context.defect(`does not have ${min} or more matching properties`);
      return false;
    } else {
      return ok;
    }
  });
};

// -----------------------------------------------------------------------------

export const IntoSet = schema => {
  Context.assertFunction(schema);

  return Context.ify((value, context) => {
    const ok = schema(value, context);
    if (!ok) return false;

    const { result } = context;
    if (result && typeof result.values === 'function') {
      context.result = new Builtin.Set(result.values());
    } else {
      context.result = new Builtin.Set(valuesOf(Object(result)));
    }
    return true;
  });
};

export const IntoMap = schema => {
  Context.assertFunction(schema);

  return Context.ify((value, context) => {
    const ok = schema(value, context);
    if (!ok) return false;

    const { result } = context;
    if (result && typeof result.entries === 'function') {
      context.result = new Builtin.Map(result.entries());
    } else {
      context.result = new Builtin.Map(entriesOf(Object(result)));
    }
    return true;
  });
};
