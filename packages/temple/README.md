# @grr/temple

This package worships at the altar of JavaScript template literals as the one
true templating system and rejects the myriad impostors, idols, and one hellgod
of ad-hoc, domain-specific templating languages. With (tagged) template
literals, we can already embed fragments of text written in arbitrary other
languages, be they executable code or document markup, inside JavaScript
modules. This package addresses the reverse use case, embedding JavaScript
fragments inside document markup. It very much reflects a minimalist approach to
such tooling, taking care of turning the source code of such a template into an
executable function.

To ensure that such template functions have a clean, well-defined interface, you
need to explicitly define the identifiers that may be bound in the template's
execution environment. Such bindings come in two flavors, those made at creation
time and those made on every invocation of the template function. Since they
provide the same values on every invocation, the former are useful for helper
functionality, while the latter specify the data. It's all rather
straight-forward:

```js
import temple from '@grr/temple';

// Let's create a friendly new template function:
const greet = temple({
  name: 'greet',
  library: { lower: s => s.toLowerCase() },
  data: ['name'],
  source: 'hello, ${lower(name)}!',
});

// => 'hello, robert!'
greet({ name: 'Robert' });

// greet() is equivalent to:
const greet2 = (function greet2({ lower }, { name }) {
  return `hello, ${lower(name)}!`;
})
.bind(null, { lower: s => s.toLowerCase() });
```

The `library` parameter might also be called `bindNow` and the `data` parameter
might also be called `bindOnCall`, reflecting the different times when
identifiers are bound. If you need additional control over template
instantiation, you can also specify a `tag` function. It is bound under its
name, which isn't `tag` unless you name it so.

Oh, the hellgod mentioned above obviously is
[Liquid](https://shopify.github.io/liquid/). There is no other way to account
for the fact that the language was created by an e-commerce provider, people who
know the importance of trust and predictability, yet the templating language has
no notion of operator precedence, evaluating all binary expressions strictly
right to left, and doesn't even support parentheses, thus driving its users mad
too. As I said, obviously a hellgod.

---

__@grr/temple__ is © 2020 Robert Grimm and licensed under [MIT](LICENSE) terms.
