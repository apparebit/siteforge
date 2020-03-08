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
const noop = () => {};

// =============================================================================
// Helper Functions
// =============================================================================

// Prototypes
const AsyncFunctionPrototype = getPrototypeOf(async function() {});
const GeneratorFunctionPrototype = getPrototypeOf(function*() {});
const AsyncGeneratorFunctionPrototype = getPrototypeOf(async function*() {});
const IteratorPrototype = getPrototypeOf(getPrototypeOf([][ITERATOR]()));
const AsyncIteratorPrototype = getPrototypeOf(
  getPrototypeOf(async function*() {}.prototype)
);

// Validations
const render = value => {
  const type = typeof value;

  if (type === 'string') {
    return `"${value}"`;
  } else if (type === 'bigint') {
    return `${value}n`;
  } else {
    return String(value);
  }
};

const checkStartStep = (op, start, step) => {
  if (!Number.isInteger(start) || !Number.isInteger(step) || step === 0) {
    if (typeof start !== 'bigint' || typeof step !== 'bigint' || step === 0n) {
      throw new Error(
        `Start ${render(start)} and step ${render(
          step
        )} for ${op}() must both be (big) ` +
          `integers, with step also being nonzero`
      );
    }
  }
};

const checkPositiveInteger = (op, num) => {
  if (!Number.isInteger(num) || num <= 0) {
    throw new Error(
      `Count ${render(num)} for ${op}() is not a positive integer`
    );
  }
};

const checkFunction = (op, fn) => {
  if (typeof fn !== 'function') {
    throw new Error(`Callback ${render(fn)} for ${op}() is not a function`);
  }
};

const checkIterables = (op, iterables) => {
  let notSync = false;
  for (const iterable of iterables) {
    if (Sq.isAsyncIterable(iterable)) {
      notSync = true;
    } else if (!Sq.isIterable(iterable)) {
      throw new Error(`Unable to ${op}() non-iterable ${render(iterable)}`);
    }
  }
  return notSync;
};

// An Unexpected Conversion (Note the "Iterator")

function toAsyncIterator(iterable) {
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
        return Promise.resolve(
          typeof iterator.return === 'function'
            ? iterator.return(...args)
            : { done: true }
        );
      },
    },
  });
}

// =============================================================================
// The Operators in Sync and Async
// =============================================================================

function takeSync(count, source, context) {
  return new Sequence(function* taker() {
    let taken = 0;
    for (const element of source) {
      yield element;
      if (++taken === count) break;
    }
  }, context);
}

function takeAsync(count, source, context) {
  return new AsyncSequence(async function* taker() {
    let taken = 0;
    for await (const element of source) {
      yield element;
      if (++taken === count) break;
    }
  }, context);
}

// -----------------------------------------------------------------------------

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
      } else if (typeof mapped[ITERATOR] !== 'function') {
        yield mapped;
      } else {
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
      } else if (
        typeof mapped[ITERATOR] !== 'function' &&
        typeof mapped[ASYNC_ITERATOR] !== 'function'
      ) {
        yield mapped;
      } else {
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
  const iterators = iterables.map(it =>
    it[ASYNC_ITERATOR] === undefined
      ? toAsyncIterator(it)
      : it[ASYNC_ITERATOR]()
  );

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
  if (into instanceof Set) {
    for (const element of source) {
      into.add(element);
    }
  } else {
    for (const element of source) {
      into.push(element);
    }
  }
  return into;
}

async function collectAsync(source, into) {
  if (into instanceof Set) {
    for await (const element of source) {
      into.add(element);
    }
  } else {
    for await (const element of source) {
      into.push(element);
    }
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
  static get IteratorPrototype() {
    return IteratorPrototype;
  }

  static get AsyncIteratorPrototype() {
    return AsyncIteratorPrototype;
  }

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

  static isAsyncFunction(value) {
    if (!value || typeof value !== 'function') return false;
    const proto = getPrototypeOf(value);
    return (
      proto === AsyncFunctionPrototype ||
      proto === AsyncGeneratorFunctionPrototype ||
      /async/iu.test(value.name) ||
      value.async
    );
  }

  // ---------------------------------------------------------------------------

  static toAsyncIterable(iterable, context) {
    // We could just return a minimal asynchronous iterable. That certainly
    // suffices for the original use case in zip(). But since much of the raison
    // d'être for this package is code implementing more expressive asynchronous
    // iterables, this method also returns a sequence.
    return new AsyncSequence(() => toAsyncIterator(iterable), context);
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
      } else {
        throw new Error(
          `Unable to tell whether function ${render(
            value
          )} is synchronous or asynchronous`
        );
      }
    } else if (typeof value[ITERATOR] === 'function') {
      return new Sequence(() => value[ITERATOR](), context);
    } else if (typeof value[ASYNC_ITERATOR] === 'function') {
      return new AsyncSequence(() => value[ASYNC_ITERATOR](), context);
    } else {
      return new Sequence(() => [value][ITERATOR]());
    }
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

  static count(start = 0, step = 1, context) {
    checkStartStep('static count', start, step);

    return new Sequence(function* counter() {
      let count = start;
      while (true) {
        yield count;
        count += step;
      }
    }, context);
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

  static concat(...iterables) {
    return checkIterables('static concat', iterables)
      ? new AsyncSequence(() => concatAsync(iterables))
      : new Sequence(() => concatSync(iterables));
  }

  static zip(...iterables) {
    return checkIterables('static zip', iterables)
      ? new AsyncSequence(() => zipAsync(iterables))
      : new Sequence(() => zipSync(iterables));
  }

  // ---------------------------------------------------------------------------

  constructor(factory, context) {
    defineProperties(this, {
      factory: { configurable, value: factory },
      context: { configurable, value: context },
    });
  }

  get [TO_STRING_TAG]() {
    return 'Sq';
  }

  with(context) {
    defineProperty(this, 'context', {
      configurable,
      value: context,
    });
    return this;
  }

  // Lazy, Intermediate Operators

  take() {
    throw new Error(
      `take() not implemented on abstract base class for sequences`
    );
  }
  filter() {
    throw new Error(
      `filter() not implemented on abstract base class for sequences`
    );
  }
  map() {
    throw new Error(
      `map() not implemented on abstract base class for sequences`
    );
  }
  tap() {
    throw new Error(
      `tap() not implemented on abstract base class for sequences`
    );
  }
  flatMap() {
    throw new Error(
      `flatMap() not implemented on abstract base class for sequences`
    );
  }
  flatten() {
    throw new Error(
      `flatten() not implemented on abstract base class for sequences`
    );
  }
  concat() {
    throw new Error(
      `concat() not implemented on abstract base class for sequences`
    );
  }
  zip() {
    throw new Error(
      `zip() not implemented on abstract base class for sequences`
    );
  }
  run() {
    throw new Error(
      `run() not implemented on abstract base class for sequences`
    );
  }

  // Eager, Terminal Operators

  each() {
    throw new Error(
      `each() not implemented on abstract base class for sequences`
    );
  }
  reduce() {
    throw new Error(
      `reduce() not implemented on abstract base class for sequences`
    );
  }
  collect() {
    throw new Error(
      `collect() not implemented on abstract base class for sequences`
    );
  }
  collectEntries() {
    throw new Error(
      `collectEntries() not implemented on abstract base class for sequences`
    );
  }
  collectDescriptors() {
    throw new Error(
      `collectDescriptors() not implemented on abstract base class for sequences`
    );
  }
  join() {
    throw new Error(
      `join() not implemented on abstract base class for sequences`
    );
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

  toAsync() {
    return new AsyncSequence(() => toAsyncIterator(this), this.context);
  }

  // ---------------------------------------------------------------------------
  // Counting Sequence Elements

  take(count) {
    checkPositiveInteger('take', count);
    return takeSync(count, this, this.context);
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

  each(fn = noop) {
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

  collectEntries(into = create(null)) {
    return collectEntriesSync(this, into);
  }

  collectDescriptors(into = create(null)) {
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

  get async() {
    return true;
  }

  toAsync() {
    return this;
  }

  // ---------------------------------------------------------------------------
  // Counting Sequence Elements

  take(count) {
    checkPositiveInteger('async take', count);
    return takeAsync(count, this, this.context);
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

  each(fn = noop) {
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

  collectEntries(into = create(null)) {
    return collectEntriesAsync(this, into);
  }

  collectDescriptors(into = create(null)) {
    return collectDescriptorsAsync(this, into);
  }

  async join(separator = '') {
    return (await this.collect()).join(separator);
  }
}
