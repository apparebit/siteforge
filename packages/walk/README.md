
# @grr/walk

This package makes recursive directory scans convenient. With a little
concurrency from `@grr/async`, they also become fast.

```js
import Runner from '@grr/async';
import walk from '@grr/walk';

// Create a new runner with the default concurrency.
const runner = new Runner();

// Walk the entire file system and log each file.
// Defer scheduling to the runner.
const { done } = walk('/', {
  onFile(_, path, virtualPath, status) {
    console.log(path, virtualPath, status);
  },
  run: runner.as
  run(...args) {
    // Hide result of run() so it won't be awaited.
    return { done: runner.run(...args) };
  },
});

await done;
```

---

__@grr/walk__ is © 2020 Robert Grimm and licensed under [MIT](LICENSE) terms.
