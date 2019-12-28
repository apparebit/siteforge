# @grr/multitasker

This package enables concurrent execution of more than one asynchronous task.
Since it also enforces an upper concurrency limit, tasks are queued. In fact,
they may be placed into one of three queues by __@grr/multitasker__. The are the
regular _ready_ queue, a high priority _asap_ queue, and a low priority
_blocked_ queue. Tasks in the first two queues are automatically scheduled when
runtime capacity allows, but tasks in the third queue require user intervention
again.

## The Multitasker Class

While `Multitasker` has an overall richer API, most use cases touch on a few,
simple methods only. In particular:

```js
// Import Multitasker.
import Multitasker from '@grr/multitasker';

// Create an instance.
const multitasker = new Multitasker();

// Repeatedly enqueue asynchronous tasks,
// i.e., functions and their arguments.
multitasker.enqueue(fn, ...args);

// Wait until all tasks have completed.
await multitasker.onidle();

// Or, forcibly terminate.
await multitasker.stop();
```


### Constants

The multitasker class defines six constants, two representing task priorities
other than regular and four representing a multitasker's states.

##### Multitasker.Asap

Increase priority for a task.

##### Multitasker.Block

Decrease priority for a task.

##### Multitasker.Idle

The idle state: The instance is not executing any tasks but can start at any
time.

##### Multitasker.Running

The running state: The instance is executing tasks.

##### Multitasker.Stopping

The stopping state: The instance is shutting down, therefore not accepting new
tasks but allowing running tasks to complete.

##### Multitasker.Done

The done state; The instance has shut down and will not run again.


### Promises

The multitasker implementation and unit tests require new promise capabilities
often enough to warrant a helper method.

##### Multitasker.newPromiseCapability(record = {})

Return the only argument enriched with a new promise capability, i.e., a new
`promise` as well as its `resolve` and `reject` methods.


### Creating Multitaskers, Adapting to Other APIs

##### Multitasker({ capacity = 8, context = {} } = {})

Create a new multitasker with the given `capacity`, i.e., maximum concurrency,
and `context` object. The context object is the `this` receiver for task
execution. If it does not have a `multitasker` property, this multitasker is
patched into the context under that name.

##### Multitasker.prototype.handleWalk(handleFile)

Adapt this multitasker to do the scheduling for a file system walk with the
given file handler. This method returns on object with suitable `handleNext`
and `handleFile` properties.


### Polling State, Signalling Changed State

The state of a multitasker can be polled with the `is()`, `hasTaskReady()`,
`hasCapacity()`, and `status()` methods. An application can also be notified of
infrequent and unpredictable state changes with the `onidle()`, `onstopping()`,
and `ondone()` methods. Finally, a custom `toString()` provides a succinct
textual representation of a multitasker's state for debugging.

##### Multitasker.prototype.is(...states)

Determine whether this multitasker is in one of the given states.

##### Multitasker.prototype.hasTaskReady()

Determine whether this multitasker has at least one task ready for execution.

##### Multitasker.prototype.hasCapacity()

Determine whether this multitasker has at least one slot open for execution.

##### Multitasker.prototype.status()

Return a record with the current status for this multitasker, including its
`state`, the number of tasks `inflight`, the maximum `capacity`, the number of
`asap` tasks pending, the number of `ready` tasks, and the number of `blocked`
tasks.

##### Multitasker.prototype.onidle(fn?)

Chain the callback to a promise that fulfills when this multitasker reaches the
idle state again and return the resulting promise. If no callback is provided,
this method returns the former promise, thus facilitating the following idiom:

```js
await multitasker.onidle();
```

##### Multitasker.prototype.onstopping(fn?)

Chain the callback to a promise that fulfills when the `stop()` method is first
invoked on this multitasker and return the resulting promise. If no callback is
provided, this method returns the former promise, thus facilitating the
following idiom:

```js
await multitasker.onstopping();
```

##### Multitasker.prototype.ondone(fn?)

Chain the callback to a promise that fulfills when this multitasker has shut
down and return the resulting promise. If no callback is provided, this method
returns the former promise, thus facilitating the following idiom:

```js
await multitasker.ondone();
```

##### Multitasker.prototype.toString()

Return a succinct string representation of this multitasker's internal state
that is useful for debugging.


### Tasks Execution

The public API only has three more methods to control task execution.

##### Multitasker.prototype.enqueue(priority?, fn, ...args)

Enqueue the task function and its arguments for execution, optionally with high
or low priority. Tasks with high priority execute before all others, even if
that means temporarily blocking all regular task execution. Tasks with low
priority are effectively blocked anyways. The result of this method is a promise
that will settle with the result of the task. The `this` receiver for task
execution is this multitasker's `context` (see constructor above).

##### Multitasker.prototype.unblock()

Release all low priority tasks for execution by moving them to the ready queue.
To correctly implement task blocking, this method should not be invoked while
regular or high priority tasks are still executing, i.e., this multitasker is
not yet idle again. While easy enough to enforce mechanically, this method does
_not_ do so, since draining ready queues only to fill them again has a
significant performance impact. Having said that, if an application truly
requires blocking semantics, it must wait for the multitasker to become idle
before unblocking:

```js
await multitasker.onidle();
multitasker.unblock();
```

##### Multitasker.prototype.stop()

Terminate the multitasker. After this method has been invoked, no new tasks will
be scheduled and a best effort attempt will be made at terminating on-going
tasks early. This method returns the same promise as `ondone()`, which fulfills
when this multitasker has stopped. In other words, stopping a multitasker and
waiting for it to be done is as simple as:

```js
await multitasker.stop();
```

---

__@grr/multitasker__ is © 2019 Robert Grimm and licensed under [MIT](LICENSE)
terms.
