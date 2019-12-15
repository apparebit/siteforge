/* © 2019 Robert Grimm */

const { apply } = Reflect;
const {
  asyncIterator: ASYNC_ITERATOR,
  iterator: ITERATOR,
  toStringTag: TO_STRING_TAG,
} = Symbol;
const configurable = true;
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

// Prototypes (+1 Factory)
const AsyncFunctionPrototype = getPrototypeOf(async function() {});
const GeneratorFunctionPrototype = getPrototypeOf(function*() {});
const AsyncGeneratorFunctionPrototype = getPrototypeOf(async function*() {});
const IteratorPrototype = getPrototypeOf(getPrototypeOf([][ITERATOR]()));
const AsyncIteratorPrototype = getPrototypeOf(
  getPrototypeOf(async function*() {}.prototype)
);

// Validations
const checkFunction = (op, fn) => {
  if (typeof fn !== 'function') {
    throw new Error(`callback "${fn}" for ${op}() is not a function`);
  }
};

const checkIterables = (op, iterables) => {
  let notSync = false;
  for (const iterable of iterables) {
    if (Sq.isAsyncIterable(iterable)) {
      notSync = true;
    } else if (!Sq.isIterable(iterable)) {
      throw new Error(`unable to ${op}() non-iterable "${iterable}"`);
    }
  }
  return notSync;
};

const splitContextAndIterables = args => {
  if (
    args.length > 0 &&
    !Sq.isNonStringIterable(args[0]) &&
    !Sq.isAsyncIterable(args[0])
  ) {
    const [context, ...iterables] = args;
    return { context, iterables };
  } else {
    return { iterables: args };
  }
};

// =============================================================================
// The Operators in Sync and Async
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
      if (Sq.isNonStringIterable(element)) {
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
      if (Sq.isNonStringIterable(element) || Sq.isAsyncIterable(element)) {
        yield* flatten(element);
      } else {
        yield element;
      }
    }
  }, context);
}

// -----------------------------------------------------------------------------

function* concatSync(iterables) {
  for (const iterable of iterables) {
    yield* iterable;
  }
}

// eslint-disable-next-line require-await
async function* concatAsync(iterables) {
  for (const iterable of iterables) {
    yield* iterable;
  }
}

// -----------------------------------------------------------------------------

function* zipSync(iterables) {
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

async function* zipAsync(iterables) {
  const iterators = iterables.map(it => {
    if (it[ASYNC_ITERATOR] === undefined) {
      it = Sq.toAsyncIterable(it);
    }
    return it[ASYNC_ITERATOR]();
  });

  try {
    while (true) {
      const step = await Promise.all(iterators.map(it => it.next()));
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
// Sq
// =============================================================================

export default class Sq {
  static isIterable(value) {
    return value && typeof value[ITERATOR] === 'function';
  }

  static isNonStringIterable(value) {
    return (
      value &&
      typeof value[ITERATOR] === 'function' &&
      typeof value !== 'string'
    );
  }

  static isAsyncIterable(value) {
    return value && typeof value[ASYNC_ITERATOR] === 'function';
  }

  /**
   * Determine whether the given value is an asynchronous function, i.e.,
   * returns a promise instead of a value. Since not all asynchronous functions
   * are written with `async`/`await`, this method also recognizes functions
   * with the word `async` in the name as well as functions whose `async`
   * property is truthy.
   */
  static isAsyncFunction(value) {
    if (!value || typeof value !== 'function') return false;
    const proto = getPrototypeOf(value);
    return (
      proto === AsyncFunctionPrototype ||
      /async/iu.test(value.name) ||
      value.async
    );
  }

  // ---------------------------------------------------------------------------

  static toAsyncIterable(iterable) {
    return {
      [ASYNC_ITERATOR]() {
        const iterator = iterable[ITERATOR]();
        return create(AsyncIteratorPrototype, {
          next: {
            configurable,
            value(...args) {
              return Promise.resolve(iterator.next(...args));
            },
          },
          return: {
            configurable,
            value(...args) {
              if (typeof iterator.return === 'function') {
                iterator.return(...args);
              }
            },
          },
        });
      },
    };
  }

  // ---------------------------------------------------------------------------

  static from(value, context) {
    if (value == null) {
      return new Sequence(
        () =>
          create(IteratorPrototype, {
            next: {
              configurable,
              value() {
                return { done: true };
              },
            },
          }),
        context
      );
    }

    const type = typeof value;
    if (type === 'string') {
      return new Sequence(() => [value][ITERATOR](), context);
    } else if (type === 'function') {
      const proto = getPrototypeOf(value);
      if (proto === GeneratorFunctionPrototype) {
        return new Sequence(value, context);
      } else if (proto === AsyncGeneratorFunctionPrototype) {
        return new AsyncSequence(value, context);
      }
    } else if (typeof value[ITERATOR] === 'function') {
      return new Sequence(() => value[ITERATOR](), context);
    } else if (typeof value[ASYNC_ITERATOR] === 'function') {
      return new AsyncSequence(() => value[ASYNC_ITERATOR](), context);
    }

    return new Sequence(() => [value][ITERATOR]());
  }

  static fromString(value, context) {
    if (typeof value === 'string') {
      return new Sequence(() => value[ITERATOR](), context);
    } else {
      return Sq.from(value);
    }
  }

  static of(...args) {
    return new Sequence(() => args[ITERATOR]());
  }

  // ---------------------------------------------------------------------------

  static keys(object, context) {
    if (isArray(object) || object instanceof Map || object instanceof Set) {
      return new Sequence(() => object.keys(), context);
    } else {
      const keys = keysOf(object);
      return new Sequence(() => keys[ITERATOR](), context);
    }
  }

  static values(object, context) {
    if (isArray(object) || object instanceof Map || object instanceof Set) {
      return new Sequence(() => object.values(), context);
    } else {
      const values = valuesOf(object);
      return new Sequence(() => values[ITERATOR](), context);
    }
  }

  static entries(object, context) {
    if (isArray(object) || object instanceof Map || object instanceof Set) {
      return new Sequence(() => object.entries(), context);
    } else {
      const entries = entriesOf(object);
      return new Sequence(() => entries[ITERATOR](), context);
    }
  }

  static descriptors(object, context) {
    const descriptors = entriesOf(getOwnPropertyDescriptors(object));
    return new Sequence(() => descriptors[ITERATOR](), context);
  }

  // ---------------------------------------------------------------------------

  static concat(...args) {
    const { context, iterables } = splitContextAndIterables(args);
    return checkIterables('static concat', iterables)
      ? new AsyncSequence(() => concatAsync(iterables), context)
      : new Sequence(() => concatSync(iterables), context);
  }

  static zip(...args) {
    const { context, iterables } = splitContextAndIterables(args);
    return checkIterables('static zip', iterables)
      ? new AsyncSequence(() => zipAsync(iterables), context)
      : new Sequence(() => zipSync(iterables), context);
  }

  constructor(factory, context) {
    defineProperties(this, {
      factory: { configurable, value: factory },
      context: { configurable, value: context },
    });
  }
}

// =============================================================================
// The Sequence Subclass
// =============================================================================

class Sequence extends Sq {
  [ITERATOR]() {
    return this.factory();
  }

  get [TO_STRING_TAG]() {
    return 'Sequence';
  }

  // ---------------------------------------------------------------------------
  // Processing Individual Sequence Elements

  filter(fn) {
    checkFunction('filter', fn);
    return Sq.isAsyncFunction(fn)
      ? filterAsync(fn, this, this.context)
      : filterSync(fn, this, this.context);
  }

  map(fn) {
    checkFunction('map', fn);
    return Sq.isAsyncFunction(fn)
      ? mapAsync(fn, this, this.context)
      : mapSync(fn, this, this.context);
  }

  tap(fn) {
    checkFunction('tap', fn);
    return Sq.isAsyncFunction(fn)
      ? tapAsync(fn, this, this.context)
      : tapSync(fn, this, this.context);
  }

  flatMap(fn) {
    checkFunction('flatMap', fn);
    return Sq.isAsyncFunction(fn)
      ? flatMapAsync(fn, this, this.context)
      : flatMapSync(fn, this, this.context);
  }

  flatten() {
    return flattenSync(this, this.context);
  }

  // ---------------------------------------------------------------------------
  // Combining Sequences and Other Iterables

  concat(...iterables) {
    iterables.unshift(this);
    return checkIterables('concat', iterables)
      ? new AsyncSequence(() => concatAsync(iterables), this.context)
      : new Sequence(() => concatSync(iterables), this.context);
  }

  zip(...iterables) {
    iterables.unshift(this);
    return checkIterables('zip', iterables)
      ? new AsyncSequence(() => zipAsync(iterables), this.context)
      : new Sequence(() => zipSync(iterables), this.context);
  }

  run(generator) {
    checkFunction('run', generator);
    return new Sequence(() => generator(this, this.context));
  }

  // ---------------------------------------------------------------------------
  // Eagerly Pulling Sequence Elements

  each(fn) {
    checkFunction('each', fn);
    return Sq.isAsyncFunction(fn)
      ? eachAsync(fn, this, this.context)
      : eachSync(fn, this, this.context);
  }

  reduce(fn, initial) {
    checkFunction('reduce', fn);
    return Sq.isAsyncFunction(fn)
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
// The AsyncSequence Subclass
// =============================================================================

class AsyncSequence extends Sq {
  [ASYNC_ITERATOR]() {
    return this.factory();
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

  // ---------------------------------------------------------------------------
  // Combining Sequences and Other Iterables

  concat(...iterables) {
    iterables.unshift(this);
    checkIterables('async concat', iterables);
    return new AsyncSequence(() => concatAsync(iterables), this.context);
  }

  zip(...iterables) {
    iterables.unshift(this);
    checkIterables('async zip', iterables);
    return new AsyncSequence(() => zipAsync(iterables), this.context);
  }

  run(generator) {
    checkFunction('async run', generator);
    return new AsyncSequence(() => generator(this, this.context));
  }

  // ---------------------------------------------------------------------------
  // Eagerly Pulling Asynchronous Sequence Elements

  each(fn) {
    checkFunction('async each', fn);
    return eachAsync(fn, this, this.context);
  }

  reduce(fn, initial) {
    checkFunction('async reduce', fn);
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
