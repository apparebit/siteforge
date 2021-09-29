/* © 2021 Robert Grimm */

/** The singleton indicating that a debounced function cannot currently run. */
export const RETRY = Symbol('try-again');

/**
 * Debounce invocations to the given thunk by the given delay in milliseconds.
 * The thunk may return `RETRY` to indicate that it cannot currently run and
 * that `debounce` should keep trying.
 */
export const debounce = (thunk, delay = 1000) => {
  let timer, lastInvocation;

  const later = () => {
    let quietPeriod = Date.now() - lastInvocation;
    if (quietPeriod < delay) {
      timer = setTimeout(later, delay - quietPeriod);
      return;
    }

    timer = null;
    const result = thunk();
    if (result === RETRY) {
      lastInvocation = Date.now();
      timer = setTimeout(later, delay);
    }
  };

  return () => {
    lastInvocation = Date.now();
    if (!timer) {
      timer = setTimeout(later, delay);
    }
  };
};
