
# @grr/walk

This package makes recursive directory scans convenient. With a little help from
`@grr/async`, they also become fast:

```js
import Task from '@grr/async/task';
import walk from '@grr/walk';

// Create a new runner with the default concurrency.
const runner = new Task.Executor();

// Walk the entire file system and log each file.
// Defer scheduling to the runner.
const { done } = walk('/', {
  onFile(_, path, virtualPath, status) {
    console.log(path, virtualPath, status);
  },
  run: runner.start.bind(start),
});

await done;
```

In more detail:

#### walk(root, options)

Perform a recursive directory scan starting at the given `root` and using the
given `options`; return the control for the walk. This function follows both
hard and symbolic links. To prevent cycles due to symbolic links, the walk
tracks the real `path` of already processed file system entities in addition to
the `virtualPath`, which preserves the names of symbolic links.

Valid options are:

  * `ignoreNoEnt` indicates whether to silently ignore `NOENT` errors.
    Otherwise, the first error also aborts the walk. By default, it does not
    ingore such errors.
  * `isExcluded(path)` tests whether the walk should skip the file system entity
    at that path. By default, it skips entries whose name starts with a dot.
  * `onFile('file', path, virtualPath, status)` makes a walk with a single file
    event handler easier to start. By default, this option is `undefined`. See
    `on()` below.
  * `run(fn, that, ...args)` makes arrangements for the call of the given
    function with the given receiver on the given arguments to be executed at
    some point in the future. The walk waits on the resulting promise.
  * `lstat`, `readdir`, and `realpath` should be the promisified functions of
    the same name from the built-in `fs` module. They are exposed for testing.

The control object has the following properties:

  * `on(event, handler)` registers an event handler for `directory`, `file`, or
    `symlink` events during the walk. The result of a successful registration is
    the corresponding `off()` function, which un-registers the event handler
    again. This package emits events by invoking handlers with four arguments,
    namely the event name, real `path`, `virtualPath`, and `status` object.
  * `abort(reason)` stops the walk with the given reason.
  * `done` is a promise for the walk's completion.
  * `metrics` is an object with statistics about the walk.


---

__@grr/walk__ is © 2020 Robert Grimm and licensed under [MIT](LICENSE) terms.
