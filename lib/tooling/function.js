/* © 2019 Robert Grimm */

const { apply } = Reflect;

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
  });
};
