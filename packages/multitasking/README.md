# @grr/multitasking

This package enables concurrent execution of more than one asynchronous task.
Since it also enforces an upper concurrency limit, tasks are queued. In fact,
they may be placed into one of three queues in @grr/multitasking, the regular
_ready_ queue, a high priority _asap_ queue, and a low priority _blocked_ queue.
Tasks in the first two queues are automatically scheduled when runtime capacity
allows, but tasks in the third queue require user intervention again.

## The Multitasking Class

The class starts with the definition of six highly useful constants.

### High and Low Priority

The high and low priority marker values are the optional first argument to
`enqueue()` when requiring a different priority.

#### Multitasking.Asap

Increased priority for a task.

#### Multitasking.Later

Decreased priority for a task.


### The Four Statuses

The four status codes cover the state machine of `Multitasking`.

#### Multitasking.Idle

The idle status: The instance is not executing any tasks but can at any time.

#### Multitasking.Running

The running status: The instance is executing tasks.

#### Multitasking.Stopping

The stopping status: The instance is shutting down but still has outstanding
tasks.

#### Multitasking.Done

The done status; The instance has shut down and will not run again.


### Polling and Signalling Status

The state of a multitasking instance can be queried, with the `is()` method
below, or notified, with the `onevent()` methods below. Use callbacks for
infrequent, unpredictable events and polling for frequently occurring events.

#### Multitasking.prototype.is(...statuses)

Determine whether this multitasking instance has one of the given statuses.

#### Multitasking.prototype.onidle(fn)

Invoke the callback when this multitasking instance next reaches the idle state again.

#### Multitasking.prototype.onstop(fn)

Invoke the callback when this multitasking instance is shutting down due to a call to `stop()`.

#### Multitasking.prototype.ondone(fn)

Invoke the callback when this multitasking instance is done shutting down, i.e.,
all tasks have stopped.


### Tasks Execution

The public API only has three more methods, all of which control task execution.

#### Multitasking.prototype.enqueue(priority?, fn, ...args)

Enqueue the task function and its arguments for execution, optionally with high
or low priority. Tasks with high priority execute before all others, even if
that means temporarily starting regular task execution. Tasks with low priority
are effectively blocked.

#### Multitasking.prototype.unblock()

Release all low priority tasks for execution. This method adds the blocked tasks
to the ready queue. Since low priority tasks are effectively delayed until all
other tasks have completed, this method should only be called once the
multitasking instance is idle, i.e., has in fact completed all other tasks.
However, this constraint is not enforced any more.

#### Multitasking.prototype.stop()

Terminate the multitasking instance. After this method has been invoked, no new
tasks will be scheduled and a best effort attempt will be made at terminating
on-going tasks early.

---

__@grr/multitasking__ is © 2019 Robert Grimm and licensed under [MIT](LICENSE)
terms.
