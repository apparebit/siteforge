# @grr/schemata

This package provides a library for data validation. It does not include a great
many built-in checkers but instead focuses on simple yet expressive combinators.
The goal is for data schemata to be declarative and mostly self-documenting.
While the underlying implementation can be quite a bit grittier (and
imperative), it nonetheless benefits from an interface carefully pared down to
its essence. Notably, to maximize reusability of existing code, any predicate
can be used as a checker function. However, implementing fully expressive
validations requires using a checker's context. This object is transparently
injected as an invocation's second argument by the outermost `Context.ify`'ed
checker function and helps track the current key path, the current value, and
any defects encountered so far. Upon successful validation, that outermost
function returns the validated value, which may have a different, semantically
equivalent representation from the original value. Upon defects, the outermost
function throws an error.

Built-in checkers include `Nullish`, `Number`, `Integer`, `String`, `URL`,
`ObjectLike`, `Map`, and `Set`. Combinators include `Check` and `Recheck` for
changing error messages, `Array` and `Properties` for processing arrays and
objects, as well as `All`, `Any`, and `Each` for combining arbitrary checkers.
While `Option` is included, it would be trivial to implement with what came
before:

```js
const Option = checker => Any(Nullish, checker);
```

The context object tracks the current key path, value, and defects. To scribble
them away and potentially restore them, the context provides the
`withCheckpoint()` method. Its only argument is a callback for whose duration
the state is restorable. To track properties as they are visited, the context
provides the `withProperties()` method. Its only argument is an iterable over
property keys and checker functions, which will be invoked one after the other
on the named properties' values.

---

__@grr/schemata__ is © 2020 Robert Grimm and licensed under [MIT](LICENSE)
terms.
