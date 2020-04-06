# @grr/metrics

This package provides a simple yet flexible interface for measuring the runtime
behavior of Node.js tools and services. A `Metrics` registry instantiates and
stores named metrics. Each such `Metric` collects one or more named measurements
either as numbers or big integers and provides access to individual values as
well as summary statistics. The implementation has no dependencies and includes
`Counter` and `Timer` metrics.

## Metrics Registry

Start by importing the package and creating a new registry.

```js
import { strict as assert } from 'assert';
import Metrics from '@grr/metrics';

const metrics = new Metrics();
```
## Counters

Create a counter by looking it up in the registry. When looking up the same name
again, the registry returns the same counter again. Counters use `Number` by
default, but `BigInt` is just an option away.

```js
const numbers = metrics.counter('numbers');
assert.equal(metrics.counter('numbers'), numbers);
assert(!numbers.isBigInt);
assert.equal(numbers.name, 'numbers');

const bigNumbers = metrics.counter('big-numbers', { isBigInt: true });
assert(bigNumbers.isBigInt);
assert.equal(bigNumbers.name, 'big-numbers')
```

Add measurements by calling `add()` with distinct labels — unless you want
several calls to be combined into one cumulative measurement. The label is the
last argument to `add()` and `get()` because it is optional. Its default value
is the empty string `''`.

```js
numbers.add(1, 'm1');
assert.equal(numbers.get('m1'), 1);

numbers.add(2, 'm2');
assert.equal(numbers.get('m2'), 2);

numbers.add(2);
numbers.add(1);
assert.equal(numbers.get(), 3);
```

When done collecting measurements, inspect the summary statistics.

```js
console.log(numbers.summarize());
```

It prints:

```console
{ count: 3, mean: 2, min: 1, max: 3 }
```

## Timers

Create a timer just like a counter — by looking it up in the registry.

```js
const timer = metrics.timer('timer');
assert(!timer.isBigInt);
assert.equal(timer.name, 'timer');
```

It is an error to look up a counter with `timer()` or a timer with `counter()`.
It also is an error to look up either metric with options different from those
used before. Instead, use `get()` to look up existing metrics independent of
type.

```js
assert.throws(() => metrics.timer('numbers'));
assert.throws(() => metrics.counter('numbers', { isBigInt: true }));

// If present, options argument must be consistent with metric's options.
// It's better to just omit the options. It's best to use `get()` instead.
assert.equal(metrics.counter('numbers', { isBigInt: false }), numbers);
assert.equal(metrics.counter('big-numbers'), bigNumbers);
assert.equal(metrics.get('numbers'), numbers);
assert.equal(metrics.get('timer'), timer);
```

Add a measurement to a timer by calling `start()` and then calling start's
result. Just like for counters, the label passed to `start()` is optional.

```js
const stop = timer.start('a');
setTimeout(() => {
  stop();
  setTimeout(timer.start(), 500);
}, 1000);
```

You can inspect the summary statistics as before but might want to wait a couple
of seconds.

```js
setTimeout(() => console.log(timer.summarize()), 2000);
```

It will print something like this:

```console
{ count: 3, mean: 2, min: 1, max: 3 }
```

That's all, folks!

---

__@grr/metrics__ is © 2020 Robert Grimm and licensed under [MIT](LICENSE) terms.
