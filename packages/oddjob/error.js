/* © 2020 Robert Grimm */

import { types } from 'util';

const BuiltinError = Error;
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
