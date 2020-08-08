/* © 2020 Robert Grimm */

const { assign } = Object;

const NO = () => {
  throw new Error(`Unable to modify object through read-only view`);
};

const READ_ONLY_VIEW = {
  defineProperty: NO,
  deleteProperty: NO,
  preventExtensions: NO,
  set: NO,
  setPrototypeOf: NO,
};

const ENUM_VIEW = assign({}, READ_ONLY_VIEW, {
  get(target, key) {
    if (key in target) {
      return target[key];
    }
    throw new Error(`Trying to read non-existent property "${key}"`);
  },
});

export const readOnlyView = value => new Proxy(value, READ_ONLY_VIEW);
export const enumView = value => new Proxy(value, ENUM_VIEW);
