/* © 2020 Robert Grimm */

import Builtin from './builtin.js';
import { types } from 'util';

const BuiltinError = Builtin.Error;
const configurable = true;
const { defineProperty } = Object;
const { isNativeError } = types;

/** Determine whether the value is an error object. */
export function isError(value) {
  return isNativeError(value) || value instanceof BuiltinError;
}

class TracelessErrorType extends BuiltinError {
  get name() {
    return 'TracelessError';
  }
}

defineProperty(TracelessErrorType, 'name', {
  configurable,
  value: 'TracelessError',
});

/** Create a new error with the given message and no stack trace. */
export function TracelessError(message) {
  const { stackTraceLimit } = BuiltinError;
  BuiltinError.stackTraceLimit = 0;
  try {
    return new TracelessErrorType(message);
  } finally {
    BuiltinError.stackTraceLimit = stackTraceLimit;
  }
}

/** Extract the given error's position trace as an array. */
export function traceErrorPosition(error) {
  const messageLineCount = (error.message.match(/\r?\n/gu) || []).length + 1;
  return error.stack
    .split(/\r?\n/gu)
    .slice(messageLineCount)
    .map(line => {
      line = line.trimStart();
      if (line.startsWith('at ')) line = line.slice(3);
      return line;
    });
}

/** Relocate the trace's lines and columns by the given deltas. */
export function relocate(trace, 𝛿Line, 𝛿Column = 0) {
  return trace.replace(
    /:(\d+):(\d+)\)/gu,
    (_, l, c) => `:${Number(l) + 𝛿Line}:${Number(c) + 𝛿Column})`
  );
}
