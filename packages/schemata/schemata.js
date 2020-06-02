/* © 2020 Robert Grimm */

import { strict as assert } from 'assert';
import Builtin from '@grr/oddjob/builtin';
import Context from './context.js';
import { inspect } from 'util';
import { isSet } from '@grr/oddjob/types';

const {
  assign,
  entries: entriesOf,
  freeze,
  keys: keysOf,
  values: valuesOf,
} = Builtin.Object;
const { isArray } = Builtin.Array;
const { isSafeInteger } = Builtin.Number;

// -----------------------------------------------------------------------------

const inspectOptions = { depth: 3, colors: true };

/**
 * Create a trace function for debugging. The resulting function logs the
 * incoming value, the success or failure of the schema, and the resulting value
 * with the given log function. Also see `Trace()`, which logs to `stdout`.
 */
export const MakeTrace = log => {
  Context.assertFunction(log);
  let indent = '';

  return schema => {
    Context.assertFunction(schema);

    return (value, context) => {
      const path = context?.path ? ` ${context.path}` : ``;
      let object = inspect(value, inspectOptions).replace(
        /\n/gu,
        `\n${indent}`
      );
      log(`${indent}enter${path}: ${object}`);
      indent += '  ';

      let status, result;
      try {
        const ok = schema(value, context);
        status = ok ? 'pass' : 'fail';
        result = context.result;
        return ok;
      } catch (x) {
        status = 'throw';
        result = x;
        throw x;
      } finally {
        indent = indent.slice(2);
        object = inspect(result, inspectOptions).replace(/\n/gu, `\n${indent}`);
        log(`${indent}exit ${path} ${status}: ${object}`);
      }
    };
  };
};

// FIXME: Integrate Trace with @grr/rollcall

/**
 * Log incoming value, success or failure of schema, and resulting value.
 * This function is the result of `MakeTrace(console.log)`.
 */
export const Trace = MakeTrace(console.log);

// -----------------------------------------------------------------------------

/** Report given description on schema failure. Nested defects are erased. */
export const Report = (description, schema) =>
  Context.ify((value, context) =>
    context.withCheckpoint((value, context) => {
      const ok = schema(value, context);
      if (!ok) {
        context.clearDefectsSinceCheckpoint();
        context.defect(description);
      }
      return ok;
    })
  );

export const Number = Report(
  `should be a floating point number`,
  v => typeof v === 'number'
);
export const Integer = Report(`should be an integer`, v => isSafeInteger(v));
export const BigInt = Report(
  `should be a big integer`,
  v => typeof v === 'bigint'
);
export const String = Report(`should be a string`, v => typeof v === 'string');

// -----------------------------------------------------------------------------

export const Nullish = v => v == null;

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

export const Any = (...schemata) => {
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

export const All = (...schemata) => {
  Context.assertFunctionArray(schemata);

  return Context.ify((value, context) => {
    const result = {};

    for (const schema of schemata) {
      context.result = value;
      if (schema(value, context)) {
        assign(result, context.result);
      } else {
        return false;
      }
    }

    context.result = result;
    return true;
  });
};

// -----------------------------------------------------------------------------

/** Make a schema function optional. Also see `Properties` and `IfNonNull`. */
export const Option = schema => Any(Nullish, schema);

/** Apply schema function to value retrieved by resolving keys. */
export const From = (keys, schema) => {
  if (!isArray(keys)) keys = [keys];
  Context.assertKeyArray(keys);
  Context.assertFunction(schema);

  return Context.ify((_, context) => context.withKeyArray(keys, schema));
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
      return context.defect(`should be an array`);
    } else if (nonempty && value.length === 0) {
      return context.defect(`should be a non-empty array`);
    }

    let wrapper = schema;
    if (distinct) {
      const seen = new Builtin.Set();
      wrapper = (value, context) => {
        if (!schema(value, context)) return false;

        const equatable = toEquatable(value, seen, context);
        if (seen.has(equatable)) {
          return context.defect(`appears repeatedly in same array`);
        } else {
          seen.add(equatable);
          return true;
        }
      };
    }

    context.withProperties(
      Context.toIterable(function* schemata() {
        for (let index = 0; index < value.length; index++) {
          yield [index, wrapper];
        }
      }),
      { init: () => [] }
    );

    // An array counts as matched even if some elements contain errors. This is
    // safe because Context.ify() also checks the context's defects.
    return true;
  });
};

// -----------------------------------------------------------------------------

export const Dictionary = (schema, { filter = () => true } = {}) => {
  Context.assertFunction(schema);
  Context.assertFunction(filter);

  return Context.ify((value, context) => {
    if (!Context.isObjectLike(value)) {
      return context.defect(`is not a dictionary object`);
    }

    context.withProperties(
      Context.toIterable(function* schemata() {
        for (const key of keysOf(value)) {
          if (!filter(key)) continue;
          yield [key, schema];
        }
      })
    );

    // A dictionary counts as matched even if some elements contain errors. This
    // is safe because Context.ify() also checks the context's defects.
    return true;
  });
};

export const IfNonNull = freeze({ lax: true });
export const WithAtLeastOne = freeze({ lax: true, min: 1 });

export const Properties = (schemata, { lax = false, min = 0 } = {}) => {
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

  return Context.ify((value, context) => {
    let matches = 0;
    const countingSchema = schema => (value, context) => {
      const ok = schema(value, context);
      if (ok) matches++;
      return ok;
    };

    const ok = context.withProperties(
      Context.toIterable(function* effectiveSchemata() {
        for (const key of keysOf(schemata)) {
          let from = key;
          let schema = schemata[key];
          if (typeof schema !== 'function') {
            from = schema.from;
            schema = schema.schema;
          }

          if (lax && value[from] == null) continue;
          if (min > 0) schema = countingSchema(schema);
          yield [from, key, schema];
        }
      })
    );

    if (ok && matches < min) {
      return context.defect(`does not have ${min} or more matching properties`);
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
    const { result } = context;
    if (!ok) {
      context.result = new Builtin.Set();
    } else if (result && typeof result.values === 'function') {
      context.result = new Builtin.Set(result.values());
    } else {
      context.result = new Builtin.Set(valuesOf(Object(result)));
    }
    return ok;
  });
};

export const IntoMap = schema => {
  Context.assertFunction(schema);

  return Context.ify((value, context) => {
    const ok = schema(value, context);
    const { result } = context;
    if (!ok) {
      context.result = new Builtin.Map();
    } else if (result && typeof result.entries === 'function') {
      context.result = new Builtin.Map(result.entries());
    } else {
      context.result = new Builtin.Map(entriesOf(Object(result)));
    }
    return ok;
  });
};

export const IntoRecord = (...schemata) => {
  for (const schema of schemata) {
    const type = typeof schema;
    if (type !== 'function') {
      assert(type === 'object');
      for (const key of keysOf(schema)) {
        Context.assertFunction(schema[key]);
      }
    }
  }

  return Context.ify((value, context) => {
    const result = {};
    let flag = true;

    for (const schema of schemata) {
      if (typeof schema === 'function') {
        context.result = value;
        const ok = schema(value, context);
        if (ok) assign(result, context.result);
        flag = flag && ok;
      } else {
        const record = {};
        let isRecordValid = true;

        for (const key of keysOf(schema)) {
          context.result = value;
          const ok = schema[key](value, context);
          if (ok) record[key] = context.result;
          isRecordValid = isRecordValid && ok;
        }

        if (isRecordValid) assign(result, record);
        flag = flag && isRecordValid;
      }
    }

    context.result = result;
    return flag;
  });
};
