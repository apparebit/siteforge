# @grr/multitasker

This package enables concurrent execution of more than one asynchronous task.
Since it also enforces an upper concurrency limit, tasks are queued. In fact,
they may be placed into one of three queues in @grr/multitasker, the regular
_ready_ queue, a high priority _asap_ queue, and a low priority _blocked_ queue.
Tasks in the first two queues are automatically scheduled when runtime capacity
allows, but tasks in the third queue require user intervention again.

## The Multitasker's Public Interface

The public interface starts with six useful constants.

### High and Low Priority

The high and low priority marker values are the optional first argument to
`enqueue()` when requiring a different priority.

#### Multitasker.Asap

Increase priority for a task.

#### Multitasker.Block

Decrease priority for a task.


### The Four Statuses

The four status codes cover the state machine of `Multitasker`.

#### Multitasker.Idle

The idle status: The instance is not executing any tasks but can at any time.

#### Multitasker.Running

The running status: The instance is executing tasks.

#### Multitasker.Stopping

The stopping status: The instance is shutting down but still has outstanding
tasks.

#### Multitasker.Done

The done status; The instance has shut down and will not run again.


### Polling and Signalling Status

The state of a multitasker can be queried, with the `is()` method below, or one
can be notified of state changes, with the `onevent()` methods below. Use
callbacks for infrequent, unpredictable events and polling for frequently
occurring events.

#### Multitasker.prototype.is(...statuses)

Determine whether this multitasker has one of the given statuses.

#### Multitasker.prototype.onidle(fn)

Invoke the callback when this multitasker next reaches the idle state again.

#### Multitasker.prototype.onstop(fn)

Invoke the callback when this multitasker is shutting down due to a call to
`stop()`.

#### Multitasker.prototype.ondone(fn)

Invoke the callback when this multitasker is done shutting down, i.e., all tasks
have stopped.


### Tasks Execution

The public API only has three more methods, all of which control task execution.

#### Multitasker.prototype.enqueue(priority?, fn, ...args)

Enqueue the task function and its arguments for execution, optionally with high
or low priority. Tasks with high priority execute before all others, even if
that means temporarily starting regular task execution. Tasks with low priority
are effectively blocked.

#### Multitasker.prototype.unblock()

Release all low priority tasks for execution. This method adds the blocked tasks
to the ready queue. Since low priority tasks are effectively delayed until all
other tasks have completed, this method should only be called once the
multitasker is idle, i.e., has in fact completed all other tasks. However, this
constraint is not enforced any more, since draining all queues only to fill them
again defies the very purpose of this package.

#### Multitasker.prototype.stop()

Terminate the multitasker. After this method has been invoked, no new tasks will
be scheduled and a best effort attempt will be made at terminating on-going
tasks early.

---

__@grr/multitasker__ is © 2019 Robert Grimm and licensed under [MIT](LICENSE)
terms.
