# site:forge

When reading other people's code, I often wish there was more documentation on
the motivation for a particular design or software architecture. After all, we
routinely make trade-offs while developing software based on functional
requirements, resource constraints, and technical experience. They all clearly
impact the resulting artifact but they usually aren't spelled out anywhere.
That's too bad because the trope that good code documents itself is nonsense.
Even cleanly layed out code—with descriptive names and reasonable abstractions
but without cute little hacks and other obscure incantations—captures just one
possible solution to a problem that, without documentation, is largely unknown.

## 1. The Case for site:forge

site:forge results from me playing with Node.js at home, outside of work, and is
my third iteration on the topic of static website generation. I discarded each
of the previous two artifacts somewhere midway to a working prototype because I
was still learning the intricacies of the platform and the established way of
writing code for Node.js was rapidly transitioning from CommonJS to EMS for
grouping related functionality in modules and from event handlers to promises to
async/await for writing idiomatic asynchronous code. Now that this transition is
complete, I believe it is time for a static website generator that leverage the
language to its maximum potential, including by treating async/await as the
default and resorting to promises or raw event handlers only in appropriate
corner cases.

Furthermore, three goals, or more precisely _guidelines_, emerged out of these
experiments:

 1. __Avoid ad-hoc and domain-specific languages__, including templating
    languages such as [Handlebars](https://handlebarsjs.com) or
    [Mustache](http://mustache.github.io), alternative markup languages such as
    [HAML](https://github.com/tj/haml.js), or extended dialects of CSS such as
    [less](http://lesscss.org) or [SASS](https://sass-lang.com). Instead build
    on JavaScript as the universal execution substrate. The many domain-specific
    niche languages only serve to fragment the ecosystem and to increase our
    dependency on complex and brittle build tools. Furthermore, any claimed
    benefit of being more accessible to non-developers is easily lost due to
    ill-considered language design choices. For example, Shopify's
    [Liquid](https://shopify.github.io/liquid/) is supposed to be a "safe,
    customer-facing template language." Yet it bizarrely evaluates operators
    [from right to left without
    precedence](https://shopify.github.io/liquid/basics/operators/).

 2. __Encapsulate reusable snippets of content in view components__. Each page
    having at most one view and no human viewers yet makes rendering way ahead
    of time that much simpler than rendering on the client. In particular, there
    is no need for placeholder content, reconciliation, state management, or
    effects. We thus can get away with little more than a rather basic [virtual
    DOM](https://github.com/sethvincent/awesome-virtual-dom) (vDOM) that allows
    instantiation via tagged templates and also renders to HTML. Components
    simply are functions that take `props` and `context` as arguments and return
    one or more vDOM nodes.

    Such _proactive_ view components have a number of advantages: Very much like
    templates, they let developers write HTML mostly. Only now, markup is
    encapsulated by tagged templates and intra-component logic is expressed in
    standard JavaScript instead of some ad-hoc language. Since tagged templates
    are parsed by default, proactive view components are more robust. They also
    nicely accommodate global validation and transformation, for example to
    check for standards compliance, to rewrite internal anchor links, or to
    force a new browsing context for external anchor links. Finally, proactive
    view components are considerably more lightweight than familiar, client-side
    frameworks such as [React.js](https://reactjs.org) or
    [Vue.js](https://vuejs.org). Yet the narrow API of proactive view components
    also allows for a straight-forward implementation based on top of one of
    these frameworks, if seamless integration with the client is a requirement.

 3. __Develop components with modern JavaScript__. It's not enough to rely on
    the built-in module system for structuring code and on async/await as well
    as asynchronous iterators for handling I/O. It's high time to also ditch
    transpilation to ancient dialects of JavaScript and CommonJS. It only adds
    complexity to the build process and incurs significant runtime overheads as
    well, notably when reifying the state machines behind generators and the
    queues behind asynchronous iterators. Meanwhile, Node.js and evergreen
    browsers (which are named as such because they automatically update to the
    latest version) are closely following the evolving JavaScript standard for
    new constructs and additions to the standard library. Furthermore, the
    biggest obstacle to eliminating transpilation—Node.js' lack of native ESM
    support—was finally addressed with version 12. In light of the rather
    contentious process getting there, which required consensus not just amongst
    Node.js contributors but also stakeholders from the JavaScript and web
    standards camps, the result is most welcome and technically outstanding.

 4. __Carve out targeted, complementary, yet loosely-coupled packages__. The
    full-on embrace of modern JavaScript without transpilation is a great
    opportunity to reflect on how we break functionality into packages, which
    are then distributed via npm's registry and thereby become part of the
    commons. For instance, site:forge's `node_modules` directory, as of January
    12, 2020, contains 480 packages and requires 205 MB of disk space. Since I
    have been exceedingly conservative in onboarding dependencies, almost all of
    this package bloat is due to development dependencies. But for many other
    libraries and tools, that same package bloat also holds in production.

    The cause are two opposing but equally corrosive practices, namely the
    creation of tiny packages that contain only a single, mostly trivial
    function and of humongous packages that seemingly only change by adding
    code. A quick look at site:forge's `node_modules` on January 12, 2020
    reveals plenty of examples for either extreme:

      * One such _tiny package_ is `is-obj`, which implements the obvious
        predicate for a value being a JavaScript object. While I can appreciate
        the temptation to abstract over this idiom, I also find that it usually
        performs redundant operations in practice, that is, unless I inline the
        equivalent code. But thanks to another developer with lesser impulse
        control, the barely 140 bytes for that function's text have turned into
        2,400 bytes across five files for the package and take up 16 kB on disk.

      * One such _humongous package_ is [Istanbul](https://istanbul.js.org) for
        determining test coverage. In fact, it is so humongous it ships in form
        of nine actual packages, one for the `nyc` command line tool and eight
        more for supporting libraries. All nine packages are present amongst
        site:forge's `node_modules` despite site:forge using built-in
        [Node.js](https://medium.com/the-node-js-collection/rethinking-javascript-test-coverage-5726fb272949)
        and [V8](https://v8.dev/blog/javascript-code-coverage) facilities for
        collecting coverage data and delegating to a different tool,
        [`c8`](https://github.com/bcoe/c8), for report generation. Further
        analysis of package manifests shows that `c8` pulls in four of
        Istanbul's eight libaries and [Node Tap](https://node-tap.org) pulls in
        `nyc` and all of Istanbul's libraries. That is despite site:forge
        relying on Node Tap only for assertions and book-keeping, since its
        newly maximalist approach towards tool design had caused test run
        failures before.

    Avoiding these two extremes requires not only developer discipline but
    avoiding humongous packages also requires context that helps determine what
    features are strictly necessary, what features are nice to have, and what
    features are orthogonal. It thus helps to build tools and applications first
    and carve out packages with well-defined interfaces only later, after
    gaining experience with the larger codebase.


## 2. The Diversity of a Monorepo

In addition to the static website generator [__@grr/siteforge__](source) itself,
this monorepo also hosts the constituent components. For now, none of the
packages have been released to npm, largely because the process of building a
minimum viable site:forge and refactoring supporting functionality into separate
packages is not yet complete. Roughly organized by focus area, the component
packages are:

### Synchronous, Asynchronous, Concurrent

  * [__@grr/sequitur__](packages/sequitur) provides expressive and lazy
    sequences that may just be synchronous or asynchronous. Furthermore,
    transition from a synchronous to an asynchronous sequence is automatic.
    Alas, the reverse is not possible.

  * [__@grr/async__](packages/async) performs concurrent, asynchronous task
    execution in an orderly and context-aware manner. While the package
    necessarily deals in promises, it mostly focuses on the promise-producing
    tasks. After all, promise-producing tasks are the ones that get shit done.

### Configuration

  * [__@grr/options__](packages/options) helps determine a tool's configuration
    based on command line arguments and `package.json` manifest alike, with both
    sources being subjected to the same validations based on the same schema.
  * [__@grr/reloader__](packages/reloader) provides a module hook that enables
    hot module reloading, but only for modules in select directories and at
    select times. Since Node.js module hook API will likely change in the
    future, this package must be considered experimental.

### Logging

  * [__@grr/logger__](packages/logger) prints semantic messages to the terminal
    in beautiful color through sheer will and raw ANSI escape codes. It's the
    one and only logging package for Node.js tools.

### File Storage

  * [__@grr/fs__](packages/fs) is a grab bag of basic and empowered helper
    functions for file I/O. Some exports are just easier to use, promisified
    file operations from Node.js' own fs module. Some come with their own
    superpowers, including the ability to fix `ENOENT` errors on the fly.
  * [__@grr/glob__](packages/glob) implements wildcard patterns for file system
    paths by translating them into predicate functions. Unlike many similar npm
    packages, `@grr/glob` does not compete on features and only supports `?` to
    match a single character, `*` to match zero or more characters in a path
    segment, and `**` to match zero or more path segments. If more complex
    patterns are needed, applications should use regular expressions.
  * [__@grr/walk__](packages/walk) looks like a straight-forward recursive
    directory scan and it is just that when using the package with the default
    configuration. But then providing a callback into `@grr/async`, the scan
    becomes concurrent and can thus leverage more of the available I/O
    bandwidth.

### Web

  * [__@grr/html__](packages/html) provides a model for well-formed HTML based
    on HTML5, WAI-ARIA, and the Open Graph Protocol.
  * [__@grr/proact__](packages/proact) implements the proactive view system,
    notably a template tag for creating virtual DOM fragments and a render
    function for validating and emitting HTML.
  * [__@grr/inventory__](packages/inventory) provides an in-memory
    representation of a file system hierarchy and methods for processing the
    those files.


## 3. The Guidelines in Practice

Having discussed the design guidelines and provided an overview of site:forge's
breakdown into packages, we can now reflect on the interaction of theory and
practice more concretely.

### Loose Coupling

Breaking a tool into packages while also minimizing dependencies sounds more
difficult than it often is in practice: The basic idea is to expose hooks in a
package's API that allow for progressive enhancement of the package's
functionality. For instance, `@grr/walk` defaults to a serial traversal of the
file system, performing one I/O operation after the other I/O operations.
However, it can also perform several I/O operations concurrently—as long as it
receives a suitable `run` callback. As it happens, `@grr/async`'s executors have
a `start()` method with the exact same signature. Hence, making a file system
traversal concurrent is as straight-forward as:

```js
import Executor from '@grr/async';
import walk from '@grr/walk';

const executor = new Executor();
const control = walk(root, { run: executor.start.bind(executor) });
// walk() exposes visited file system entities through events,
// since an asynchronous iterator would be too limiting.
control.on('file', (_, path, virtualPath, status) => ...);
```

At the same time, the callback's signature—which takes a function, the `this`
receiver, and any number of arguments—is both familiar and simple enough so that
using another npm package for the same purpose would not be any more difficult.

### From Scratch

By reducing reliance on existing packages, the development process also becomes
an opportunity for not using the same old abstractions again. That has paid off
in practice for configuration. While writing a minimal command line argument
parser is easy enough, that really isn't the whole story for configuration. Like
many other command line tools running on Node.js, site:forge can be configured
via command line arguments and a `package.json` manifest alike. Since the data
from either source must be parsed and validated, it makes eminent sense for the
same package to implement both. That way, the code for expressing the schema and
validating data items against it can be shared. The `@grr/options` package takes
just that approach. While it still has two distinct entry points,
`optionsFromObject()` and `optionsFromArguments()`, the schema and internal
logic for enforcing it are shared. That, in turn, simplifies [ingestion of the
configuration](source/config.js).

### To Package Or Not to Package

When building without third-party libraries as much as possible, small helper
functions tend to accumulate with time and could conceivably be packaged in a
themed bundle. Arguably, the [@grr/fs](packages/fs) package is just one instance
of this approach, seeing that it combines functions for managing file names,
functions for versioning file names, and functions that update the file system
while also tolerating `ENOENT` errors. In that case, I considered the benefit of
easier file operations far outweighing the drawbacks of maintaining such a grab
bag. But in several other cases, that same trade-off very much favored not
creating another package. The [@grr/inventory](packages/inventory) package is
the other exception and, at first glance, appears even more random, notably when
looking at the `File` class. But in that case the seeming randomness of features
directly reflects the union of features necessary for processing a basic range
of file types. In other words, domain-specific requirements justify the
bundling.

---

site:forge is © 2019-2020 Robert Grimm and licensed under [MIT](LICENSE) terms.
