/* © 2019 Robert Grimm */

const { apply } = Reflect;
const {
  asyncIterator: ASYNC_ITERATOR,
  iterator: ITERATOR,
  toStringTag: TO_STRING_TAG,
} = Symbol;
const {
  create,
  defineProperties,
  defineProperty,
  entries: entriesOf,
  getOwnPropertyDescriptors,
  getPrototypeOf,
  keys: keysOf,
  values: valuesOf,
} = Object;
const { isArray } = Array;

// -----------------------------------------------------------------------------

//const AsyncFunction = getPrototypeOf(async function() {});
const AsyncGeneratorFunction = getPrototypeOf(async function*() {});
const GeneratorFunction = getPrototypeOf(function*() {});
const Iterator = getPrototypeOf(getPrototypeOf([][ITERATOR]()));

const EmptyIterator = () =>
  create(Iterator, {
    next: { value: () => ({ done: true }) },
  });

const isIterable = value => value && typeof value[ITERATOR] === 'function';
const isNonStringIterable = value =>
  value && typeof value[ITERATOR] === 'function' && typeof value !== 'string';
const toIteratorFactory = value => () => value[ITERATOR]();

const checkFunction = (op, fn) => {
  if (typeof fn !== 'function') {
    throw new Error(`callback "${fn}" for ${op}() is not a function`);
  }
};

const checkIterables = (op, iterables) => {
  for (const iterable of iterables) {
    if (!isIterable(iterable)) {
      throw new Error(`unable to ${op}() non-iterable "${iterable}"`);
    }
  }
};

const toSequence = (value, context) => {
  if (value == null) {
    return new Sequence(EmptyIterator, context);
  }

  const type = typeof value;
  if (type === 'string') {
    return new Sequence(toIteratorFactory([value]), context);
  } else if (typeof value[ITERATOR] === 'function') {
    return new Sequence(toIteratorFactory(value), context);
  } else if (typeof value[ASYNC_ITERATOR] === 'function') {
    throw new Error(`Sq does not yet support async iterables`);
  } else if (typeof value === 'function') {
    const proto = getPrototypeOf(value);
    if (proto === GeneratorFunction) {
      return new Sequence(value, context);
    } else if (proto === AsyncGeneratorFunction) {
      throw new Error(`Sq does not yet support async generator functions`);
    } else {
      throw new Error(`function "${value}" may be sync or async`);
    }
  } else {
    return new Sequence(toIteratorFactory([value]));
  }
};

const splitContextAndIterables = args => {
  if (args.length > 0 && !isNonStringIterable(args[0])) {
    const [context, ...iterables] = args;
    return { context, iterables };
  } else {
    return { iterables: args };
  }
};

// =============================================================================
// The Sq Facade
// =============================================================================

// Sequences of Iterables

function* concatenating(iterables) {
  for (const iterable of iterables) {
    yield* iterable;
  }
}

function* zipping(iterables) {
  const iterators = iterables.map(it => it[ITERATOR]());
  try {
    while (true) {
      const step = iterators.map(it => it.next());
      if (step.some(s => s.done)) return;
      const tuple = step.map(s => s.value);
      yield tuple;
    }
  } finally {
    iterators.forEach(it => {
      if (typeof it.return === 'function') it.return();
    });
  }
}

const STATIC_METHODS = {
  concat: {
    value: function concat(...args) {
      const { context, iterables } = splitContextAndIterables(args);
      checkIterables('concat', iterables);
      return new Sequence(() => concatenating(iterables), context);
    },
  },

  zip: {
    value: function zip(...args) {
      const { context, iterables } = splitContextAndIterables(args);
      checkIterables('zip', iterables);
      return new Sequence(() => zipping(iterables), context);
    },
  },

  // ---------------------------------------------------------------------------
  // Sequences of Object Properties

  keys: {
    value: function keys(object, context) {
      if (isArray(object) || object instanceof Map || object instanceof Set) {
        return new Sequence(() => object.keys(), context);
      } else {
        const keys = keysOf(object);
        return new Sequence(toIteratorFactory(keys), context);
      }
    },
  },

  values: {
    value: function values(object, context) {
      if (isArray(object) || object instanceof Map || object instanceof Set) {
        return new Sequence(() => object.values(), context);
      } else {
        const values = valuesOf(object);
        return new Sequence(toIteratorFactory(values), context);
      }
    },
  },

  entries: {
    value: function entries(object, context) {
      if (isArray(object) || object instanceof Map || object instanceof Set) {
        return new Sequence(() => object.entries(), context);
      } else {
        const entries = entriesOf(object);
        return new Sequence(toIteratorFactory(entries), context);
      }
    },
  },

  descriptors: {
    value: function descriptors(object, context) {
      const descriptors = entriesOf(getOwnPropertyDescriptors(object));
      return new Sequence(toIteratorFactory(descriptors), context);
    },
  },

  // ---------------------------------------------------------------------------
  // Testing Iterables and Creating Sequences

  isIterable: { value: isIterable },
  isNonStringIterable: { value: isNonStringIterable },

  from: {
    value: function from(value, context) {
      return toSequence(value, context);
    },
  },

  fromString: {
    value: function fromString(value, context) {
      if (typeof value === 'string') {
        return new Sequence(toIteratorFactory(value), context);
      } else {
        return toSequence(value, context);
      }
    },
  },

  of: {
    value: function of(...args) {
      return new Sequence(() => args[ITERATOR]());
    },
  },
};

export default function Sq(transform, context) {
  if (new.target) {
    // When invoked as constructor, just transfer arguments to instance.
    defineProperties(this, {
      transform: { value: transform },
      context: { value: context },
    });
  } else {
    // When invoked as function, accommodate all kinds of values.
    return toSequence(transform, context);
  }
}

defineProperties(Sq, STATIC_METHODS);

// =============================================================================
// Synchronous Sequence
// =============================================================================

class Sequence extends Sq {
  [ITERATOR]() {
    return this.transform();
  }

  get [TO_STRING_TAG]() {
    return 'Sq';
  }

  // ---------------------------------------------------------------------------
  // Processing Individual Sequence Elements

  filter(fn) {
    checkFunction('filter', fn);

    const source = this;
    const context = this.context;

    return new Sequence(function* filter() {
      for (const element of source) {
        if (apply(fn, context, [element])) yield element;
      }
    }, context);
  }

  map(fn) {
    checkFunction('map', fn);

    const source = this;
    const context = this.context;

    return new Sequence(function* map() {
      for (const element of source) {
        yield apply(fn, context, [element]);
      }
    }, context);
  }

  tap(fn) {
    checkFunction('tap', fn);

    const source = this;
    const context = this.context;

    return new Sequence(function* tap() {
      for (const element of source) {
        apply(fn, context, [element]);
        yield element;
      }
    }, context);
  }

  flatMap(fn) {
    checkFunction('flatMap', fn);

    const source = this;
    const context = this.context;

    return new Sequence(function* flatMap() {
      for (const element of source) {
        const mapped = apply(fn, context, [element]);

        // FIXME: Consider special-casing small array values.
        if (mapped != null) yield* mapped;
      }
    }, context);
  }

  flatten() {
    const source = this;
    return new Sequence(function* flatten(iterable = source) {
      for (const element of iterable) {
        if (isNonStringIterable(element)) {
          yield* flatten(element);
        } else {
          yield element;
        }
      }
    }, source.context);
  }

  // ---------------------------------------------------------------------------
  // Combining Sequences and Other Iterables

  concat(...iterables) {
    checkIterables('concat', iterables);
    iterables.unshift(this);
    return new Sequence(() => concatenating(iterables), this.context);
  }

  zip(...iterables) {
    checkIterables('zip', iterables);
    iterables.unshift(this);
    return new Sequence(() => zipping(iterables), this.context);
  }

  run(generator) {
    checkFunction('run', generator);
    return new Sequence(() => generator(this, this.context));
  }

  // ---------------------------------------------------------------------------
  // Eagerly Pulling Sequence Elements

  each(fn) {
    checkFunction('each', fn);

    for (const element of this) {
      fn(element);
    }
  }

  reduce(fn, initial) {
    checkFunction('reduce', fn);

    let accumulator = initial;
    for (const element of this) {
      accumulator = apply(fn, this.context, [accumulator, element]);
    }
    return accumulator;
  }

  collect(into = []) {
    for (const element of this) {
      into.push(element);
    }
    return into;
  }

  collectEntries(into = {}) {
    if (into instanceof Map) {
      for (const [key, value] of this) {
        into.set(key, value);
      }
    } else {
      for (const [key, value] of this) {
        into[key] = value;
      }
    }
    return into;
  }

  collectDescriptors(into = {}) {
    for (const [key, descriptor] of this) {
      defineProperty(into, key, descriptor);
    }
    return into;
  }

  join(separator = '') {
    return this.collect().join(separator);
  }
}
