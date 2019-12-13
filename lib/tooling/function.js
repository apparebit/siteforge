/* © 2019 Robert Grimm */

const { apply, get } = Reflect;

/**
 * Create a new function that behaves exactly as the given one, with exception
 * of ignoring any invocation after the first one.
 */
export const once = fn => {
  let applied = false;
  return new Proxy(fn, {
    apply(target, that, args) {
      if (applied) {
        return undefined;
      } else {
        applied = true;
        return apply(target, that, args);
      }
    },
    get(target, property, receiver) {
      const result = get(target, property, receiver);
      return property === 'name' ? `once(${result})` : result;
    },
  });
};

/**
 * Create a new function that behaves exactly as the given one, with exception
 * of negating the result.
 */
export const not = fn => {
  return new Proxy(fn, {
    apply(target, that, args) {
      return !apply(target, that, args);
    },
    get(target, property, receiver) {
      const result = get(target, property, receiver);
      return property === 'name' ? `not(${result})` : result;
    },
  });
};
