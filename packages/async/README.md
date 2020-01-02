# @grr/async

This package enables concurrent execution of more than one asynchronous task.
Since it also enforces an upper concurrency limit, tasks may not always execute
right away but only after having been queued for a while. I originally started
with a version that supported different task priorities but found it brittle in
practice, so reverted to this more straight-forward design and implementation.
Any undocumented feature is likely to suddenly vanish as soon as private class
members work reliably enough. Node.js 13.5.0 had one remaining bug in my
testing.

## Overview

While this package also exports some helper functionality and the
default-exported executor has a fair number of methods, basic usage is quite
straight-forward:

```js
// Import the package.
import Executor from '@grr/async';

// Create an instance.
const runner = new Executor();

// Run some tasks.
const complete = Promise.all(
  tasks.map(([fn, ...args]) => runner.enqueue(fn, ...args))
);

// Wait for their completion.
await complete;

// Or, stop the executor.
await runner.stop();
```

## Helpers

##### rethrow(error)

Throw the given error again, but do so upon the next iteration of the event
loop, i.e., via `setImmediate`.

##### newPromiseCapability(container = {})

Enrich the given container with a new promise capability, i.e., a new `promise`
and its `resolve` and `reject` settlement handlers.

##### Task(fn, receiver, ...args)

Create a new task with the given function, receiver (`this`), and arguments.

##### Task.prototype.get()

Return a promise for this task's result.

##### Task.prototype.run()

Run the task and return a promise for its result. This method _synchronously_
throws an exception if it is called more than once. That violation of prudent
interface design for Node.js practices is a conscious one, i.e., designed to
bring down the process.

##### Task.prototype[Symbol.toStringTag]

Return the string tag for this type, which is `@grr/async/Task`.


## Asynchronous Task Executor

##### Executor({ capacity = 8, context = {} } = {})

Create a new executor with the given `capacity`, i.e., maximum concurrency, and
`context` object. The latter provides the `this` receiver for task execution. If
a context does not have an `executor` property, the executor patches itself into
the context under that name.

### State Inspection

The internal fields of an executor can be polled with the `isIdle()`,
`isBusy()`, `isStopping()`, `isStopped()`, `hasCapacity()`, `hasTaskReady()`,
`status()`, and `toString()` methods. An executor can also notify applications
of significant state changes with the `onIdle()` and `onStopped()` methods, both
of which return a promise that resolves when the condition next becomes true.

##### Executor.prototype.isIdle()

Determine whether the executor is idle. An idle executor has no tasks queued up
and is not running any tasks. It becomes busy after receiving some tasks to
execute via `run()`. It becomes stopped after a call to `stop()`.

##### Executor.prototype.isBusy()

Determine whether the executor is busy. A busy executor is running at least one
task. It becomes idle again if the last running task completes and has no tasks
queued up. It becomes stopping after a call to `stop()`.

##### Executor.prototype.isStopping()

Determine whether the executor is stopping. A stopping executor does not accept
new tasks but allows running tasks to finish.

##### Executor.prototype.isStopped()

Determine whether the executor is stopped. A stopped executor is done for. It
does not accept new tasks, it has not tasks queued up, and it is not executing
any tasks.

##### Executor.prototype.hasCapacity()

Determine whether the executor currently has any capacity for running another
task. That is the case if the number of running tasks is strictly smaller than
the capacity or maximum concurrency.

##### Executor.prototype.hasTaskReady()

Determine whether the executor currently has any tasks queued up that are ready
to run but have not yet been started.

##### Executor.prototype.status()

Return a record with the current status for this executor, including its
`state`, the number of tasks `ready` for execution, the number of tasks
`inflight`, the maximum `capacity`, and the number of `completed` tasks.

##### Executor.prototype.toString()

Return a string representation of the current status for this executor. This
method is the stringified version of `status()`.

##### Executor.prototype[Symbol.toStringTag]

Return the string tag for this type, which is `@grr/async/Executor`.

##### Executor.prototype.onIdle()

Return a promise that resolves when the executor next becomes idle. If an
handler on the returned promise calls this method, it receives a new promise
that is resolved when the executor next _becomes_ idle, i.e., it first needs to
go busy again.

##### Executor.prototype.onStopped()

Return a promise that resolves when the executor has stopped.


### Task Execution

To actually do something useful, this class implements two more methods.

##### Executor.prototype.run(fn, ...args)

Eventually run the given task by calling the function on the configured receiver
and the given arguments. The task runs immediately, if there are fewer running
tasks than the configured maximum. It runs after some indeterminate queueing
delay otherwise.

##### Executor.prototype.stop()

Stop this executor. With the first call, this executor clears the task queue and
stops accepting new tasks, thanks to its new stopping state. Upon completion of
the last running task, the executor is in the terminal stopped state. This
method returns the same promise as `onStopped()`. It resolves when this executor
has stopped. In other words, stopping an executor and waiting for it to be done
is as simple as:

```js
await executor.stop();
```

---

__@grr/async__ is © 2019 Robert Grimm and licensed under [MIT](LICENSE) terms.
