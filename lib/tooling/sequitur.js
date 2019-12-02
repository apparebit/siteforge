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

//const AsyncFunction = getPrototypeOf(async function() {});
const AsyncGeneratorFunction = getPrototypeOf(async function*() {});
const GeneratorFunction = getPrototypeOf(function*() {});
const Iterator = getPrototypeOf(getPrototypeOf([][ITERATOR]()));

const EmptyIterator = () =>
  create(Iterator, {
    next: { value: () => ({ done: true }) },
  });

const toSequence = (value, context) => {
  if (value == null) {
    return new Sequence(EmptyIterator, context);
  } else if (typeof value[ITERATOR] === 'function') {
    return new Sequence(() => value[ITERATOR](), context);
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
    throw new Error(
      `value "${value}" neither an iterable nor generator function`
    );
  }
};

const splitContextAndIterables = args => {
  if (
    args.length > 0 &&
    (args[0] == null || typeof args[0][ITERATOR] !== 'function')
  ) {
    const [context, ...iterables] = args;
    return { context, iterables };
  } else {
    return { iterables: args };
  }
};

const checkFunction = (op, fn) => {
  if (typeof fn !== 'function') {
    throw new Error(`callback "${fn}" for ${op}() is not a function`);
  }
};

const checkIterables = (op, iterables) => {
  for (const iterable of iterables) {
    if (!iterable || typeof iterable[ITERATOR] !== 'function') {
      throw new Error(`unable to ${op}() non-iterable "${iterable}"`);
    }
  }
};

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

// -----------------------------------------------------------------------------
// Synchronous Core

const STATIC_METHODS = {
  // ---------------------------------------------------------------------------
  // Sequences of Object Properties

  keys: {
    value: function keys(object, context) {
      if (isArray(object) || object instanceof Map || object instanceof Set) {
        return new Sequence(() => object.keys(), context);
      } else {
        const keys = keysOf(object);
        return new Sequence(() => keys[ITERATOR](), context);
      }
    },
  },

  values: {
    value: function values(object, context) {
      if (isArray(object) || object instanceof Map || object instanceof Set) {
        return new Sequence(() => object.values(), context);
      } else {
        const values = valuesOf(object);
        return new Sequence(() => values[ITERATOR](), context);
      }
    },
  },

  entries: {
    value: function entries(object, context) {
      if (isArray(object) || object instanceof Map || object instanceof Set) {
        return new Sequence(() => object.entries(), context);
      } else {
        const entries = entriesOf(object);
        return new Sequence(() => entries[ITERATOR](), context);
      }
    },
  },

  descriptors: {
    value: function descriptors(object, context) {
      const descriptors = entriesOf(getOwnPropertyDescriptors(object));
      return new Sequence(() => descriptors[ITERATOR](), context);
    },
  },

  // ---------------------------------------------------------------------------
  // Combining Iterables

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
  // Sync Core: Creation and Iteration

  from: {
    value: function from(value, context) {
      return Sq(value, context);
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
    defineProperties(this, {
      transform: { value: transform },
      context: { value: context },
    });
  } else {
    return toSequence(transform, context);
  }
}

defineProperties(Sq, STATIC_METHODS);

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
      for (const item of source) {
        if (apply(fn, context, [item])) yield item;
      }
    }, context);
  }

  map(fn) {
    checkFunction('map', fn);

    const source = this;
    const context = this.context;

    return new Sequence(function* map() {
      for (const item of source) {
        yield apply(fn, context, [item]);
      }
    }, context);
  }

  tap(fn) {
    checkFunction('tap', fn);

    const source = this;
    const context = this.context;

    return new Sequence(function* tap() {
      for (const item of source) {
        apply(fn, context, [item]);
        yield item;
      }
    }, context);
  }

  flatMap(fn) {
    checkFunction('flatMap', fn);

    const source = this;
    const context = this.context;

    return new Sequence(function* flatMap() {
      for (const item of source) {
        const mapped = apply(fn, context, [item]);

        // FIXME: Consider special-casing small array values.
        if (mapped != null) yield* mapped;
      }
    }, context);
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

  // ---------------------------------------------------------------------------
  // Eagerly Accumulating Sequence Elements

  reduce(fn, initial) {
    checkFunction('reduce', fn);

    let accumulator = initial;
    for (const item of this) {
      accumulator = apply(fn, this.context, [accumulator, item]);
    }
    return accumulator;
  }

  collect(into = []) {
    for (const item of this) {
      into.push(item);
    }
    return into;
  }

  collectEntries(into = {}) {
    for (const [key, value] of this) {
      into[key] = value;
    }
    return into;
  }

  collectDescriptors(into = {}) {
    for (const [key, descriptor] of this) {
      defineProperty(into, key, descriptor);
    }
    return into;
  }
}
