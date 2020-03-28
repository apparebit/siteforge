/* © 2020 Robert Grimm */

import { types } from 'util';

const BuiltinError = Error;
const { isNativeError } = types;

/** Determine whether the value is an error object. */
export function isError(value) {
  return isNativeError(value) || value instanceof Error;
}

/** Create a new error with the given message and no stack trace. */
export function TracelessError(message, Error = BuiltinError) {
  const { stackTraceLimit } = BuiltinError;
  BuiltinError.stackTraceLimit = 0;
  try {
    return new Error(message);
  } finally {
    BuiltinError.stackTraceLimit = stackTraceLimit;
  }
}
