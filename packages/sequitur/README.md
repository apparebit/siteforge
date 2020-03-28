# @grr/sequitur

DO NOT USE THIS VERSION! THIS PACKAGE WAS BROKEN BY ITS OVERAMBITIOUS DESIGN.
THE NEXT VERSION WILL BE MOSTLY SYNCHRONOUS:

 1. __It solves the wrong problem__. Pipelines over asynchronous iterables are
    nice to have, but there is a more fundamental challenge: Pipelines over
    promise-returning functions. If they spawn tasks at all, they probably
    should adhere to a fork-join or structured concurrency model. They
    definitely should implement cooperative cancellation because they may just
    do the heavy lifting. The pipelines in
    [__@grr/builder__](../builder) certainly do. In short, runtime
    support for such pipelines belongs into a future rewrite of
    [__@grr/async__](../async).

 2. __It may not solve the wrong problem__. Checking for specific prototypes
    doesn't work so well in an effectively distributed environment such as
    desktop browsers. The tests for iterables and iterators may already work
    across domains. One can also write tests for Map and Set that will [work
    across
    domains](https://stackoverflow.com/questions/29924932/how-to-reliably-check-an-object-is-an-ecmascript-6-map-set/29926193#29926193).
    But one probably can't do the same for async functions and generators and
    that always was an inelegant because incomplete approach.

 3. __It really may not solve the wrong problem__. Relying on basic tests
    implemented as static methods may be the latest and greatest in JavaScript
    object orientation. But those tests are not authoritative after
    initialization, since the class object providing the methods also provides a
    level of indirection that may be easily modified by the naive (why not?),
    the smart (ooh, I can fix that), and the evil (ooh, I can overtake that)
    alike. Clearly, that's _not_ the stuff robust APIs are made from.

---

~~This package provides lazy sequences over both synchronous and asynchronous
iterables and generator functions. They are reusable as well, as long as their
original sources are reusable, which is the case for most iterables and all
generator functions. __sequitur__ tries to preserve synchronous sequences as
much as possible. However, when an operation receives an asynchronous callback,
this package automatically transitions to an asynchronous sequence. Many static
methods that create sequences in the first place also automatically select
between synchronous and asynchronous sequences based on argument. The overall
effect of this method overloading for synchronous and asynchronous iterables,
generator functions, and callbacks is a highly uniform and usable interface
despite the implementation having two of every operator, one synchronous and one
asynchronous.~~

## ~~Telling Synchronous from Asynchronous~~ – Don't Do This

However, there are limitations to that automatic overload resolution, since the
implementation needs to reason about functions and methods without executing
them. After all, sequences are lazy and only materialize elements as needed. The
following entities can be distinguished automatically:

  * Iterables either have a method named `Symbol.iterator` or
    `Symbol.asyncIterator` and thus are clearly distinguishable.
  * Similarly, generator functions either have the `%GeneratorFunction%` or the
    `%AsyncGeneratorFunction%` intrinsic object as prototype and thus are
    distinguishable as well. Yet, plain functions that return the result of
    invoking a synchronous or asynchronous generator function are
    indistinguishable from each other until they are invoked.
  * Functions with the `%AsyncFunction%` intrinsic object as prototype are
    clearly asynchronous. Yet, plain functions may or may not be synchronous,
    since they can always return a promise.

__@grr/sequitur__ builds on this analysis as following:

  * Methods that expect some variable number of elements accept iterables. In
    addition, `Sq.from()` also accepts generator functions and thus turns them
    into iterables. Since plain functions do not support telling synchronous
    from asynchronous, they are rejected as invalid values.
  * Methods that expect some callback for processing one element at a time
    accept arbitrary functions. A function is considered async when its
    prototype is the `%AsyncFunction%` or `%AsyncGeneratorFunction%` intrinsic
    object, when its name contains the word `async` ignoring case, or when it
    has an `async` property with a truthy value.

Treating all functions with `Function` as their prototype as synchronous seems
ill-advised given the pervasive use of promises. Treating all functions as
potentially asynchronous seems ill-advised given that it pretty much eliminates
synchronous execution. The above heuristic balances between the two extremes by
treating plain functions as synchronous by default and asynchronous when
explicitly marked otherwise, which is more generally useful anyways.


## API

This package is ESM only and has no dependencies. It has a single default
export, the sequence class `Sq`. Internally, the implementation uses two
subclasses, one for synchronous operations on synchronous sequences and one for
all other cases. The implementation follows the above convention. `Sequence` is
a synchronous iterable, whose name does not contain `async` and which does not
have an `async` property. `AsyncSequence` is an asynchronous iterable, whose
name obviously contains `async` and which also has an `async` property valued
`true`.

Several of `Sq`'s static methods creating sequences take a second, optional
argument called `context`. The context is automatically passed from operator to
operator and provides the receiver when invoking callbacks. Since there is no
clean way of adding a trailing and optional context to `Sq.of()`, `Sq.concat()`,
and `Sq.zip()`, the context can also be set by invoking `with()` right after
creating a sequence with one these three static methods. Consistent with that
intended use but unusually for this package, `with()` updates the current
sequence in place.

The code examples embedded below can also be found in module
[examples.js](examples.js). They assume the following imports:

```javascript
import { strict } from 'assert';
import Sq from '@grr/sequitur';
```


### Iteration Helpers

##### Sq.IteratorPrototype

The elusive prototype of all built-in synchronous iterators made readily
nameable.

##### Sq.AsyncIteratorPrototype

The even more elusive prototype of all built-in asynchronous iterators
made readily nameable.

##### Sq.isIterable(value)

Determine whether the value is an iterable.

##### Sq.isNonStringIterable(value)

Determine whether the value is an iterable but not a string.

##### Sq.isAsyncIterable(value)

Determine whether the value is an async iterable.

##### Sq.isAsyncFunction(value)

Determine whether the value is an async function. This method returns `true` for
functions with `%AsyncFunction%` or `%AsyncGeneratorFunction%` as their
prototype, with `async` case-insensitive in their name, or with a truthy `async`
property.

##### Sq.toAsyncIterable(iterable)

Convert the given synchronous iterable into an asynchronous iterable. This
method does not return just a minimal iterator interface implementation but
instead returns a fully-featured asynchronous sequence with all its operators.
Nonetheless, you very likely _do not need this method_, since JavaScript
automatically converts synchronous iterables into asynchronous ones when it can,
e.g., in the case of `for-of` loops. If, however, you are writing comprehensive
tests of asynchronous anything or you are implementing complex iterators without
the abstractions provided by generators, then this function may come mighty
handy.


### Creating Sequences

##### Sq.from(value, context?)

Create a new sequence over the elements of the given iterable or generator
function. Otherwise, if the value is `null` or `undefined`, create an empty
sequence. If the value is not a function, create a singleton sequence. If the
value is a function but not a generator function, signal an error. This method
treats strings a non-iterable. For instance:

```javascript
strict.deepEqual([...Sq.from()], []);
strict.deepEqual([...Sq.from([1, 2, 3])], [1, 2, 3]);

strict.deepEqual(
  [...Sq.from(function*() {
    yield 42;
    yield 665;
  })],
  [42, 665]
);

(async function() {
  strict.deepEqual(
    await Sq.from(async function*() {
      yield 'async';
      yield '/';
      yield 'await';
    }).join(),
    'async/await'
  );
})();
```

##### Sq.fromString(value, context?)

Create a new sequence just like `Sq.from()`, but treat strings as iterables.

##### Sq.of(...elements)

Create a new synchronous sequence over the elements.


### Synchronous Sequences over Integers

##### Sq.count(start = 0, step = 1, context?)

Create a new synchronous sequence over integers that starts with and increments
by the given numbers. The parameters must either both be integral JavaScript
numbers or big integers.


### Synchronous Sequences over Properties

##### Sq.keys(object, context?)

Create a new synchronous sequence over the object's keys. This method invokes
the corresponding instance method if the object is an array, map, or set.

##### Sq.values(object, context?)

Create a new synchronous sequence over the object's values. This method invokes
the corresponding instance method if the object is an array, map, or set.

##### Sq.entries(object, context?)

Create a new synchronous sequence over the object's key, value pairs. This
method invokes the corresponding instance method if the object is an array, map,
or set.

##### Sq.descriptors(object, context?)

Create a new synchronous sequence over the object's own property descriptors.


### Combining Sequences

##### Sq.concat(...iterables)

Create a new sequence that concatenates the elements of the given iterables in
order.

##### Sq.zip(...iterables)

Create a new sequence that zips the elements of the given iterables in order and
ends with the shortest iterable.


### Changing Context

##### Sq.prototype.with(context)

Update the context of this sequence with the given value and return `this` for
chaining operators.


### Slouching Towards Asynchrony

##### Sq.prototype.toAsync()

Return a new asynchronous version of this sequence if it is synchronous. Just
return `this` if the sequence is asynchronous already.


### Lazy Operators

Each of the following lazy operators creates a new sequence implementing the
requested operation with this sequence as input. In other words, iterating over
the new sequence yields the elements of this sequence modified by the requested
operation. The new sequence not only uses this sequence as input but also uses
the same context. For example:

```javascript
const s1 = Sq.of(1, 2, 3).with('context');
const s2 = s1.map(n => n * n);
const s3 = s2.tap(function() { strict.equal(this, 'context'); });

strict.deepEqual([...s1], [1, 2, 3]);
strict.deepEqual([...s2], [1, 4, 9]);
strict.deepEqual([...s3], [1, 4, 9]);

strict.equal(s1.context, 'context');
strict.equal(s2.context, 'context');
strict.equal(s3.context, 'context');
```

##### Sq.prototype.take(count)

Limit the sequence to at most the given number of elements.

##### Sq.prototype.filter(fn)

Filter out any elements that do not match the given predicate.

##### Sq.prototype.map(fn)

Transform each element into another with the given transform.

##### Sq.prototype.tap(fn)

Process each element for some side-effect while leaving the sequence as is.

##### Sq.prototype.flatMap(fn)

Transform each element into an iterable, whose elements take its place.
Returning `undefined` or `null` is the same as returning an empty iterable and
returning a value that is not an iterable is the same as returning an iterable
over a single value. If the sequence is synchronous, the returned iterable must
also be synchronous. If the sequence is asynchronous, the returned iterable may
be synchronous or asynchronous.

##### Sq.prototype.flatten()

Flatten any nested iterables, no matter how deeply nested. If the sequence is
synchronous, only synchronous iterables are flattened. If the sequence is
asynchronous, both synchronous and asynchronous iterables are flattened. In
either case, *strings are treated a non-iterable*.

##### Sq.prototype.concat(...iterables)

Concatenate the elements in this sequence with those in the given iterables in
order.

##### Sq.prototype.zip(...iterables)

Zip the elements in this sequence with those in the given iterables in order.
The new sequence is as long as the shortest of its inputs.

##### Sq.prototype.run(generatorFunction)

Create a new sequence with the elements of the generator created by the given
generator function. The two arguments passed to each invocation are this
sequence and its context.


### Eager, Terminal Operators

Each of the following eager and terminal operators immediately starts consuming
this sequence in the described way.

##### Sq.prototype.each(fn = noop)

Invoke the given callback on each element. The `noop` default callback serves to
make `each()` the designed method when consuming a sequence for side-effect.

##### Sq.prototype.reduce(fn, initial)

Reduce the sequence with the given callback and initial accumulator value. The
order of arguments to the callback is consistent with the built-in array
operator of the same name. For example:

```javascript
strict.deepEqual(
  Sq.of(1, 2, 3).reduce((accumulator, element) => {
    accumulator.push(element);
    return accumulator;
  }, []),
  [1, 2, 3]
);

// or, more concisely:

strict.deepEqual(
  Sq.of(1, 2, 3)
    .reduce((acc, el) => (acc.push(el), acc), []),
  [1, 2, 3]
);
```

##### Sq.prototype.collect(into = [])

Collect the elements in an array or a set.

##### Sq.prototype.collectEntries(into = {})

Collect the key, value pairs as configurable, enumerable, and writable
properties of an object or as entries of a map.

##### Sq.prototype.collectDescriptors(into = {})

Collect the property descriptors as properties of an object.

##### Sq.prototype.join(separator = '')

Join the string representations of each element with the given separator. Note
that the default separator is the empty string and not the comma as for
`Array.prototype.join()`:

```javascript
strict.equal([1,2,3].join(), '1,2,3');
strict.equal(Sq.of(1, 2, 3).join(), '123');
```

---

__@grr/sequitur__ is © 2019 Robert Grimm and licensed under [MIT](LICENSE)
terms.

