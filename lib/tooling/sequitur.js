/* © 2019 Robert Grimm */

const configurable = true;
const {
  create,
  entries: entriesOf,
  getOwnPropertyDescriptors,
  getPrototypeOf,
  keys: keysOf,
  values: valuesOf,
} = Object;
const { isArray } = Array;
const { iterator, toStringTag } = Symbol;
const IteratorPrototype = getPrototypeOf(getPrototypeOf([][iterator]()));

const createEmptyIterator = () =>
  create(IteratorPrototype, {
    next: { configurable, value: () => ({ done: true }) },
    [toStringTag]: { configurable, value: 'EmptyIterator' },
  });

const toIteratorFactory = value => {
  if (value == null) {
    return createEmptyIterator;
  } else if (typeof value.next === 'function') {
    return () => value;
  } else if (typeof value[iterator] === 'function') {
    return () => value[iterator]();
  } else if (typeof value === 'function') {
    return value;
  } else {
    return () => [value][iterator]();
  }
};

/** Lazy and resusable sequences. */
export default class Sq {
  // ---------------------------------------------------------------------------
  // Turning Properties into Sequences

  static keys(object) {
    const keys = keysOf(object);
    return new Sq(() => keys[iterator]());
  }

  static values(object) {
    const values = valuesOf(object);
    return new Sq(() => values[iterator]());
  }

  static entries(object) {
    if (isArray(object) || object instanceof Map || object instanceof Set) {
      return new Sq(() => object.entries());
    } else {
      const entries = entriesOf(object);
      return new Sq(() => entries[iterator]());
    }
  }

  static ownPropertyDescriptors(object) {
    const descriptors = entriesOf(getOwnPropertyDescriptors(object));
    return new Sq(() => descriptors[iterator]());
  }

  // ---------------------------------------------------------------------------
  // Core: Creating and Iterating Sequences

  static of(...values) {
    return new Sq(() => values[iterator]());
  }

  static from(value) {
    return new Sq(toIteratorFactory(value));
  }

  /* private */ constructor(factory) {
    this.factory = factory;
  }

  [iterator]() {
    return this.factory();
  }

  // ---------------------------------------------------------------------------
  // Lazy, Intermediate Operations

  filter(fn) {
    const source = this;
    return new Sq(function* filtering() {
      for (const element of source) {
        if (fn(element)) yield element;
      }
    });
  }

  map(fn) {
    const source = this;
    return new Sq(function* mapping() {
      for (const element of source) {
        yield fn(element);
      }
    });
  }

  flatMap(fn) {
    const source = this;
    return new Sq(function* flatMapping() {
      for (const element of source) {
        yield* fn(element);
      }
    });
  }

  flatten() {
    const source = this;
    return new Sq(function* flattening(iterable = source) {
      for (const element of iterable) {
        if (
          element &&
          typeof element !== 'string' &&
          typeof element[iterator] === 'function'
        ) {
          yield* flattening(element);
        } else {
          yield element;
        }
      }
    });
  }

  tap(fn) {
    const source = this;
    return new Sq(function* tapping() {
      for (const element of source) {
        fn(element);
        yield element;
      }
    });
  }

  zip(...iterables) {
    iterables.unshift(this);
    return new Sq(function* zipping() {
      const iterators = iterables.map(it => it[iterator]());
      try {
        while (true) {
          const results = iterators.map(it => it.next());
          if (results.some(({ done }) => done)) break;
          yield results.map(({ value }) => value);
        }
      } finally {
        iterators.forEach(it => {
          if (typeof it.return === 'function') it.return();
        });
      }
    });
  }

  // ---------------------------------------------------------------------------
  // Eager, Terminal Operations

  reduce(fn, initial) {
    let accumulator = initial;
    for (const element of this) {
      accumulator = fn(accumulator, element);
    }
    return accumulator;
  }

  toArray(array = []) {
    for (const element of this) {
      array.push(element);
    }
    return array;
  }

  collectEntries(into = {}) {
    for (const [key, value] of this) {
      into[key] = value;
    }
    return into;
  }
}
