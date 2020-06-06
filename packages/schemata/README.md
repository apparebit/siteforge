# @grr/schemata

This package implements lightweight and extensible data validation for
JavaScript. It does not include a large number of built-in, type-specific
checkers. It rather focuses on simple and expressive combinators that compose
with each other and accommodate outside code alike:

 1. Any predicate taking a value and returning a boolean automatically is a
    checker for purposes of this package. In fact, the result needn't be
    boolean, any truthy value will do. Since this package is for validating
    values, a truthy result indicates that the passed-in value is acceptable.

 2. More complicated checkers make use of a [`Context`](./context.js) object
    that is passed as the second argument to checkers. To correctly use this
    context, checker functions need to be wrapped with `Context.ify()`, which
    ensures that the wrapped checker is invoked with a context, and need to
    invoke nested checkers with both value and context.

## 1. The Context

The context object serves three major roles:

  * The context tracks the possibly nested __original key and value__ currently
    being checked. Checkers read that state through a context's `path`, `key`,
    and `value` properties. They access individual, possibly nested properties
    via the context's `withKeyArray()` method and (filtered) properties via the
    `withProperties()` method.
  * The context tracks the __resulting value__, which may be an optimized
    representation, e.g., using `Set` and `Map` for fast look-ups. Checkers
    access that value through the context's `result` property.
  * Finally, the context tracks validaton failures or __defects__. Checkers use
    `hasDefects()` to check for prior defects, `defect()` to report defects, and
    `toError()` to convert all defects into an error. Checkers can also use
    `withCheckpoint()` in combination with `hasDefectsSinceCheckpoint()` and
    `clearDefectsSinceCheckpoint()` to manipulate reported defects in a scoped
    manner.

### 1.1 Contextification

The `Context.ify()` method wraps a checker function to ensure that the checker
always is invoked with a context object.

 1. If the __wrapper is invoked without context__, it initializes a fresh
    context and invokes the checker with value and context.

     1. If the checker returns a __truthy value__ and the context has __no
        defects__, the wrapper returns the context's result.
     2. If the checker returns a __falsy value__ or the context has __defects__,
        the the wrapper throws a newly created error object with the same
        information.

 2. If the __wrapper is invoked with value and context__, it simply forwards
    both to the checker and returns the result.

The case analysis already implies that `@grr/schemata` does not stop upon
encountering the first defect. In fact, the checkers created by the `Array`,
`Dictionary`, and `Properties` factories (see below) tolerate that individual
properties are defective and still return `true` in that case. Otherwise,
`Report` (also see below) results in altogether too many error messages.

## 2. Exported Schemata and Combinators

Most schema implementations do not need to directly access the context. Instead
they leverage existing schemata and their combinators from this package. There
are:

  * `MakeTrace` and `Trace` for debugging schemata.
  * `Report` for emitting human-readable error messages.
  * `Number`, `Integer`, `BigInt`, `String`, and `Nullish` to check for
    primitive types.
  * `Enum` to check for one or more constants.
  * `Any` and `All` to combine several checkers for the same value.
  * `Option` as a convenient `s => Any(Nullish, s)`.
  * `From` to check a single possibly nested property.
  * `Array`, `Dictionary`, and `Properties` to check objects and their
    properties.
  * `IntoSet`, `IntoMap`, and `IntoRecord` to convert objects.

With exception of `Nullish` and `Enum`, which are regular predicates, all other
schemata and the schemata resulting from combinators are `Context.ify()`'d.

## 3. Example

The following definitions are part of the [schema for
`@grr/html`](../html/schema.js) and thus reflect an actual use case. That module
starts by importing much of `@grr/schemata` and later on includes the schema for
an HTML element's content:

```js
import {
  Any,
  Array,
  Enum,
  From,
  IfNonNull,
  IntoSet,
  Properties,
  Report,
  String,
  WithAtLeastOne,
} from '@grr/schemata';

// Some 120 lines later...

const ElementContent = Properties(
  {
    category: Report(
      `should be a valid content category`,
      Enum(CONTENT_CATEGORY),
    ),
    elements: Report(
      `should list HTML elements valid as content`,
      Array(String)
    ),
  },
  WithAtLeastOne
);
```

The schema tells us that element content must be an object with at least one of
two properties. The `category` property must be a valid category name. If not,
the reported error message will say as much. It is automatically prefixed with
the current key path, eg:

>   Property $.elements.video.category should be a valid content category

Furthermore, the `elements` property must be an array of HTML element names. The
error message for an array entry not being a string is automatically generated
by `String`. But if the value is not an array, the specified error message is
used.

As another example, the schema for DOM events improves on the original object by
renaming `*` to `events` and `window` to `windowEvents`:

```js
const Events = From(
  `events`,
  Properties({
    events: { from: '*', schema: EventNames },
    windowEvents: { from: 'window', schema: EventNames },
  })
);
```

It depends on `EventNames` for both properties. That schema, in turn, improves
on performance by changing the representation:

```js
const EventNames = IntoSet(
  Report('should be array listing all event names', Array(String))
);
```

---

__@grr/schemata__ is © 2020 Robert Grimm and licensed under [MIT](LICENSE)
terms.
