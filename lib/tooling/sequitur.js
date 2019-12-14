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

// =============================================================================
// Helper Functions
// =============================================================================

const AsyncFunction = getPrototypeOf(async function() {});
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
const isAsyncIterable =
  value => value && typeof value[ASYNC_ITERATOR] === 'function';
const toIteratorFactory = value => () => value[ITERATOR]();
const toAsyncIteratorFactory = value => () => value[ASYNC_ITERATOR]();

const isAsync = value => {
  if (typeof value === 'function') {
    // Recognize async functions either by prototype, name, or marker property.
    const proto = getPrototypeOf(value);
    return (
      proto === AsyncFunction ||
      proto === AsyncGeneratorFunction ||
      /async/iu.test(value.name) ||
      value.async
    );
  } else {
    return value && typeof value[ASYNC_ITERATOR] === 'function';
  }
};

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
    return new AsyncSequence(toAsyncIteratorFactory(value), context);
  } else if (typeof value === 'function') {
    const proto = getPrototypeOf(value);
    if (proto === GeneratorFunction) {
      return new Sequence(value, context);
    } else if (proto === AsyncGeneratorFunction) {
      return new AsyncSequence(value, context);
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
// Sq: External Surface with Static Factory Methods
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
  isAsyncIterable: { value: isAsyncIterable },

  /**
   * Determine whether the value is an asynchronous function, asynchronous
   * generator function, asynchronous iterable, or named/marked as such.
   */
  isAsync: { value: isAsync },

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
// Implementation of Operators, Each in Sync and Async
// =============================================================================

function filterSync(fn, source, context) {
  return new Sequence(function* filter() {
    for (const element of source) {
      if (apply(fn, context, [element])) yield element;
    }
  }, context);
}

function filterAsync(fn, source, context) {
  return new AsyncSequence(async function* filter() {
    for await (const element of source) {
      if (await apply(fn, context, [element])) yield element;
    }
  }, context);
}

// -----------------------------------------------------------------------------

function mapSync(fn, source, context) {
  return new Sequence(function* map() {
    for (const element of source) {
      yield apply(fn, context, [element]);
    }
  }, context);
}

function mapAsync(fn, source, context) {
  return new AsyncSequence(async function* map() {
    for await (const element of source) {
      yield await apply(fn, context, [element]);
    }
  }, context);
}

// -----------------------------------------------------------------------------

function tapSync(fn, source, context) {
  return new Sequence(function* map() {
    for (const element of source) {
      apply(fn, context, [element]);
      yield element;
    }
  }, context);
}

function tapAsync(fn, source, context) {
  return new AsyncSequence(async function* map() {
    for await (const element of source) {
      await apply(fn, context, [element]);
      yield element;
    }
  }, context);
}

// -----------------------------------------------------------------------------

function flatMapSync(fn, source, context) {
  return new Sequence(function* flatMap() {
    for (const element of source) {
      const mapped = apply(fn, context, [element]);

      if (mapped == null) {
        continue;
      } else if (isArray(mapped) && mapped.length === 1) {
        yield mapped[0];
      } else {
        // All uncommon cases in one concise statement.
        yield* mapped;
      }
    }
  }, context);
}

function flatMapAsync(fn, source, context) {
  return new AsyncSequence(async function* flatMap() {
    for await (const element of source) {
      const mapped = await apply(fn, context, [element]);

      if (mapped == null) {
        continue;
      } else if (isArray(mapped) && mapped.length === 1) {
        yield mapped[0];
      } else {
        // All uncommon cases in one concise statement.
        yield* mapped;
      }
    }
  }, context);
}

// -----------------------------------------------------------------------------

function flattenSync(source, context) {
  return new Sequence(function* flatten(iterable = source) {
    for (const element of iterable) {
      if (isNonStringIterable(element)) {
        yield* flatten(element);
      } else {
        yield element;
      }
    }
  }, context);
}

function flattenAsync(source, context) {
  return new AsyncSequence(async function* flatten(iterable = source) {
    for await (const element of iterable) {
      if (isNonStringIterable(element) || isAsyncIterable(element)) {
        yield* flatten(element);
      } else {
        yield element;
      }
    }
  }, context);
}

// -----------------------------------------------------------------------------

function eachSync(fn, source) {
  for (const element of source) {
    fn(element);
  }
}

async function eachAsync(fn, source) {
  for await (const element of source) {
    await fn(element);
  }
}

// -----------------------------------------------------------------------------

function reduceSync(fn, initial, source, context) {
  let accumulator = initial;
  for (const element of source) {
    accumulator = apply(fn, context, [accumulator, element]);
  }
  return accumulator;
}

async function reduceAsync(fn, initial, source, context) {
  let accumulator = initial;
  for await (const element of source) {
    accumulator = await apply(fn, context, [accumulator, element]);
  }
  return accumulator;
}

// -----------------------------------------------------------------------------

function collectSync(source, into) {
  for (const element of source) {
    into.push(element);
  }
  return into;
}

async function collectAsync(source, into) {
  for await (const element of source) {
    into.push(element);
  }
  return into;
}

// -----------------------------------------------------------------------------

function collectEntriesSync(source, into) {
  if (into instanceof Map) {
    for (const [key, value] of source) {
      into.set(key, value);
    }
  } else {
    for (const [key, value] of source) {
      into[key] = value;
    }
  }
  return into;
}

async function collectEntriesAsync(source, into) {
  if (into instanceof Map) {
    for await (const [key, value] of source) {
      into.set(key, value);
    }
  } else {
    for await (const [key, value] of source) {
      into[key] = value;
    }
  }
  return into;
}

// -----------------------------------------------------------------------------

function collectDescriptorsSync(source, into) {
  for (const [key, descriptor] of source) {
    defineProperty(into, key, descriptor);
  }
  return into;
}

async function collectDescriptorsAsync(source, into) {
  for await (const [key, descriptor] of source) {
    defineProperty(into, key, descriptor);
  }
  return into;
}

// =============================================================================
// The Actual Sequence Class
// =============================================================================

class Sequence extends Sq {
  [ITERATOR]() {
    return this.transform();
  }

  get [TO_STRING_TAG]() {
    return 'Sequence';
  }

  // ---------------------------------------------------------------------------
  // Processing Individual Sequence Elements

  filter(fn) {
    checkFunction('filter', fn);
    return isAsync(fn)
      ? filterAsync(fn, this, this.context)
      : filterSync(fn, this, this.context);
  }

  map(fn) {
    checkFunction('map', fn);
    return isAsync(fn)
      ? mapAsync(fn, this, this.context)
      : mapSync(fn, this, this.context);
  }

  tap(fn) {
    checkFunction('tap', fn);
    return isAsync(fn)
      ? tapAsync(fn, this, this.context)
      : tapSync(fn, this, this.context);
  }

  flatMap(fn) {
    checkFunction('flatMap', fn);
    return isAsync(fn)
      ? flatMapAsync(fn, this, this.context)
      : flatMapSync(fn, this, this.context);
  }

  flatten() {
    return flattenSync(this, this.context);
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
    return isAsync(fn)
      ? eachAsync(fn, this, this.context)
      : eachSync(fn, this, this.context);
  }

  reduce(fn, initial) {
    checkFunction('reduce', fn);
    return isAsync(fn)
      ? reduceAsync(fn, initial, this, this.context)
      : reduceSync(fn, initial, this, this.context);
  }

  collect(into = []) {
    return collectSync(this, into);
  }

  collectEntries(into = {}) {
    return collectEntriesSync(this, into);
  }

  collectDescriptors(into = {}) {
    return collectDescriptorsSync(this, into);
  }

  join(separator = '') {
    return this.collect().join(separator);
  }
}

// =============================================================================
// The Actual AsyncSequence Class
// =============================================================================

class AsyncSequence extends Sq {
  [ASYNC_ITERATOR]() {
    return this.transform();
  }

  get [TO_STRING_TAG]() {
    return 'async Sequence';
  }

  // ---------------------------------------------------------------------------
  // Processing Individual Sequence Elements

  filter(fn) {
    checkFunction('async filter', fn);
    return filterAsync(fn, this, this.context);
  }

  map(fn) {
    checkFunction('async map', fn);
    return mapAsync(fn, this, this.context);
  }

  tap(fn) {
    checkFunction('async tap', fn);
    return tapAsync(fn, this, this.context);
  }

  flatMap(fn) {
    checkFunction('async flatMap', fn);
    return flatMapAsync(fn, this, this.context);
  }

  flatten() {
    return flattenAsync(this, this.context);
  }

  run(generator) {
    checkFunction('async run', generator);
    return new AsyncSequence(() => generator(this, this.context));
  }

  // ---------------------------------------------------------------------------
  // Eagerly Pulling Asynchronous Sequence Elements

  each(fn) {
    checkFunction('each', fn);
    return eachAsync(fn, this, this.context);
  }

  reduce(fn, initial) {
    checkFunction('reduce', fn);
    return reduceAsync(fn, initial, this, this.context);
  }

  collect(into = []) {
    return collectAsync(this, into);
  }

  collectEntries(into = {}) {
    return collectEntriesAsync(this, into);
  }

  collectDescriptors(into = {}) {
    return collectDescriptorsAsync(this, into);
  }

  async join(separator = '') {
    return (await this.collect()).join(separator);
  }
}
