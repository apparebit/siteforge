/* © 2019–2020 Robert Grimm */

/** Create a new promise that resolves after the given delay in milliseconds. */
export const delay = (ms = 0) =>
  new Promise(resolve => setTimeout(resolve, ms, 'delay'));

/**
 * Create a new promise that resolves after the event loop is done polling and
 * has executed any I/O handlers.
 */
export const didPoll = () =>
  new Promise(resolve => setImmediate(resolve, 'didPoll'));

/**
 * Synchronously raise the given error. This necessitates a minimal
 * _asynchronous_ delay to escape from the current promise context.
 */
export const raise = error =>
  process.nextTick(() => {
    throw error;
  });

/**
 * Create a new promise capability by enriching the container with a `promise`
 * and the `resolve` and `reject` methods to settle the promise.
 */
export const settleable = (container = {}) => {
  container.promise = new Promise((resolve, reject) => {
    container.resolve = resolve;
    container.reject = reject;
  });
  return container;
};
