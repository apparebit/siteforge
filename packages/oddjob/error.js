/* © 2020 Robert Grimm */

import Builtin from './builtin.js';
import { EOL } from 'os';
import { types } from 'util';

const BuiltinError = Builtin.Error;
const configurable = true;
const { defineProperty, getOwnPropertyNames } = Object;
const { isNativeError } = types;
const writable = true;

/** Determine whether the value is an error object. */
export function isError(value) {
  return isNativeError(value) || value instanceof BuiltinError;
}

const basicErrorProps = new Set(['code', 'message', 'name', 'stack']);

/**
 * Determine whether the value is an error object with only basic properties.
 * All practical JavaScript implementations add a `stack` to the standard's
 * `message` and `name` properties. Node.js further adds the `code` but also
 * surfaces it through the `name`. Hence, this function treats an error with
 * only these four properties as unadorned.
 */
export function isUnadornedError(value) {
  if (!isError(value)) return false;

  for (const name of getOwnPropertyNames(value)) {
    if (!basicErrorProps.has(name)) return false;
  }
  return true;
}

/** An error that wraps a message but has empty stack. */
export class ErrorMessage extends BuiltinError {
  constructor(message) {
    const { stackTraceLimit } = BuiltinError;
    BuiltinError.stackTraceLimit = 0;
    super(message);
    BuiltinError.stackTraceLimit = stackTraceLimit;

    // Sadly, Node.js' shim for V8's stackTraceLimit prefixes any error stack
    // with the name of the error and a colon. That looks rather awkward when
    // both message and stack trace are empty.
    defineProperty(this, 'stack', {
      configurable,
      writable,
      value: this.toString(),
    });
  }

  get name() {
    return 'ErrorMessage';
  }

  toString() {
    return this.message ? `Error: ${this.message}` : `Error`;
  }
}

const messageLineCount = error =>
  (error.message.match(/\r?\n/gu) || []).length + 1;

/** Extract the given error's formatted message from the stack trace. */
export function traceErrorMessage(error) {
  return error.stack
    .split(/\r?\n/gu)
    .slice(0, messageLineCount(error))
    .join(EOL);
}

/** Extract the given error's position trace as an array. */
export function traceErrorPosition(error) {
  return error.stack
    .split(/\r?\n/gu)
    .slice(messageLineCount(error))
    .map(line => {
      line = line.trim();
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

import { setTimeout } from 'timers/promises';

/** Liberate `AbortError` from Node's core. */
export const AbortError = await (async function () {
  // eslint-disable-next-line no-undef
  const controller = new AbortController();
  const { signal } = controller;

  try {
    const timeout = setTimeout(60000, null, { signal });
    controller.abort();
    await timeout;
  } catch (x) {
    return x.constructor;
  }

  throw new Error(`abort signal didn't result in error`);
})();
