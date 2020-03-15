# The Case for site:forge

When reading other people's code, I often wish there was more documentation on
the motivation for a particular design or software architecture. After all, we
routinely make trade-offs while developing software based on functional
requirements, resource constraints, and technical experience. They all clearly
impact the resulting artifact but they usually aren't spelled out anywhere.
That's too bad because the trope that good code documents itself is nonsense.
Even cleanly layed out code—with descriptive names and reasonable abstractions
but without cute little hacks and other obscure incantations—captures just one
possible solution to a problem that, without documentation, is largely unknown.

site:forge results from me playing with Node.js at home, outside of work, and is
my third iteration on the topic of static website generation. I discarded each
of the previous two artifacts somewhere midway to a working minimum viable
prototype because I was still learning the intricacies of the platform.
Furthermore, that period also coincided with Node.js transitioning from CommonJS
to EMS for module system and from event handlers to promises to `async`/`await`
for idiomatic asynchronous code. Now that these transitions are complete, I
believe it is time for a static website generator that leverages the JavaScript
language and the Node.js platform to their maximum potential. In practice, that
means supporting asynchronous operations throughout, preferring `async`/`await`
over promises and falling back onto event handlers only in exceptional cases,
and wrapping it all in ECMAScript modules. Beyond this bias for more modern and
ergonomic language idioms, the design of site:forge is informed by three more
guidelines that emerged from my previous experimentation.


## 1. Avoid Ad-Hoc and Domain-Specific Languages

The web speaks only _three_ languages, that is, _programming languages_. They
are HTML for content, CSS for appearance, and JavaScript for behavior. Yet web
developers and designers regularly use a good number of other languages as well.
They include templating languages such as [Handlebars](https://handlebarsjs.com)
or [Mustache](http://mustache.github.io), alternative markup languages such as
[HAML](https://github.com/tj/haml.js), and extended dialects of CSS such as
[less](http://lesscss.org) or [SASS](https://sass-lang.com). Some of these
languages may have been a necessary evil during a time when Microsoft's Internet
Explorer (IE) held the browser market hostage and the [World Wide Web
Consortium](https://www.w3.org) (W3C) fought the threat of irrelevance as web
standards body by acting as a lobbying arm for big tech.

But those days are thankfully past us. Google's Chrome, Mozilla's Firefox, and
Apple's Safari have broken through the stranglehold of Internet Explorer. In
fact, IE's successor, Microsoft Edge, is now implemented on top of the same
browser engine as Chrome. Sadly, Chrome is increasingly looking like the next
Internet Explorer. At the same time, the W3C has [publicly
acknowledged](https://www.w3.org/2019/04/WHATWG-W3C-MOU.html) the supremacy of
the [WHATWG](https://whatwg.org)'s living standards and is now collaborating in
the open, on GitHub. So does [Technical Committee 39](https://github.com/tc39),
which shepherds the [ECMA-262](https://tc39.github.io/ecma262/) standard for
ECMAScript, as JavaScript is officially known. The result has been a renaissance
of sorts for the web. HTML5 supports document and user interface markup alike.
CSS gained powerful new layout capabilities and many other long overdue
conveniences. And with ES6, i.e., the sixth major version of the standard,
JavaScript turned from ugly duckling into a mature language that can even be fun
to use. Since release of ES6 in 2015, yearly updates correct specification bugs
and introduce new but scoped features, thus preventing stagnation.

Consequently, it is time to ditch the many ad-hoc and domain-specific languages
and fall back to the three foundational languages of the web. At this point, the
many domain-specific niche languages only serve to fragment the ecosystem. They
also increase our dependency on complex and brittle build tools. Any claimed
benefit of being more accessible to non-developers is easily lost due the
language _du jour_ being often ill-considered and immature. For example,
Shopify's [Liquid](https://shopify.github.io/liquid/) is supposed to be a "safe,
customer-facing template language." Yet it bizarrely evaluates operators [from
right to left without
precedence](https://shopify.github.io/liquid/basics/operators/). Besides, basic
knowledge about computation nowadays is as important as knowledge about civics
or history, i.e., essential.


## 2. Encapsulate Reusable Content in View Components

One significant advantage of using a static website generator instead of more
dynamic approaches to content rendering is that some very difficult problems,
such as website security or capacity provisioning, become much simpler. View
components also benefit from this effect. Since each page has at most one view
and no current human viewers, rendering way ahead of time becomes that much
simpler than rendering on the client. For example, there is no need for
placeholder content, reconciliation, state management, or effects. We thus can
get away with little more than a rather basic [virtual
DOM](https://github.com/sethvincent/awesome-virtual-dom) (vDOM) that is
instantiated via tagged templates and eventually renders to HTML. Furthermore,
components need to be nothing fancier than functions that take `props` and
possibly a `context` as arguments and return one or more vDOM nodes.

Such _proactive_ view components have a number of advantages: Very much like
templates, they let developers write HTML mostly. Only now, markup is
encapsulated by tagged templates and intra-component logic is expressed in
standard JavaScript instead of some ad-hoc language. Since the text appearing
inside tagged templates is parsed as markup instead of being treated as blobs of
text, proactive view components are more robust. They also make global
validation and transformation that much easier, for example to check for
standards compliance or to rewrite anchor links. Finally, proactive view
components are considerably more lightweight than familiar, client-side
frameworks such as [React.js](https://reactjs.org) or
[Vue.js](https://vuejs.org). Yet the narrow API of proactive view components
also allows for a straight-forward implementation on top of these frameworks, if
seamless integration with the client is a requirement.


## 3. Write Components in Modern JavaScript

Fully modernizing JavaScript development obviously requires adaption of modern
language idioms, notably `async`/`await` and ECMAScript modules (ESM). But the
benefits of doing so are very limited if source code is then transpiled to
ancient dialects of JavaScript so that no browser or outdated Node.js
installation is left behind. That only adds complexity to the build process and
imposes significant runtime overheads, notably when reifying the state machines
behind generators and the queues behind asynchronous iterators. Doing so seems
almost silly in light of the fact that modern browsers are _evergreen_, i.e.,
automatically update to the latest version at first opportunity. By the same
logic, we should not convert ECMAScript modules to AMD or CommonJS. Neither
should we "bundle" several modules into often significantly larger files that
combine mostly arbitrary slices through the code base. HTTP/2 is perfectly
capable of serving ESM efficiently. Browsers are perfectly capable of executing
them natively. Even the last holdout, Node.js is perfectly capable of executing
ESM as of version 12.0. The process of Node.js getting there was admittedly slow
and contentious. But the result is most welcome and technically outstanding,
playing nice with its own legacy modules and modern browsers conventions alike.

### 3.1 Right-Size Modules and Packages

There is one legitimate obstacle to dropping bundlers, namely widespread
confusion about the purpose of modules and packages. I have long noticed that
some JavaScript developers implement a single function per module and I recently
discovered that [Lerna](https://github.com/lerna/lerna) seemingly uses a package
per module. In the extreme, that implies JavaScript packages with a single
module containing a single function. Sure enough, a quick look at site:forge's
top-level `node_modules` directory reveals several examples for not only such
emaciated packages but also obese packages:

  * One such _emaciated package_ is `is-obj`, which implements the obvious
    predicate for a value being a JavaScript object. While I can appreciate the
    temptation to abstract over this idiom, I also find that it usually performs
    redundant operations when compared to the inline alternative. But thanks to
    another developer with lesser impulse control, the barely 140 bytes for that
    function's text have turned into 2,400 bytes across five files for the
    package and take up 16 kB on disk.
  * One such _obese package_ is [Istanbul](https://istanbul.js.org) for
    determining test coverage. In fact, it is so humongous it ships in form of
    nine actual packages, one for the `nyc` command line tool and eight more for
    supporting libraries. All nine packages are present amongst site:forge's
    `node_modules` despite site:forge using built-in
    [Node.js](https://medium.com/the-node-js-collection/rethinking-javascript-test-coverage-5726fb272949)
    and [V8](https://v8.dev/blog/javascript-code-coverage) facilities for
    collecting coverage data and delegating to a different tool,
    [c8](https://github.com/bcoe/c8), for report generation. Further analysis of
    package manifests shows that `c8` pulls in four of Istanbul's eight libaries
    and [Node Tap](https://node-tap.org) pulls in `nyc` and all of Istanbul's
    libraries. That is despite site:forge relying on Node Tap only for
    assertions and book-keeping, since its newly maximalist approach towards
    test runner design has resulted in too many bugs while trying to test other
    code.

The overall impact of emaciated and obese packages together is one of
significant package bloat. On March 13, 2020, site:forge's top-level
`node_modules` directory contained 506 packages taking up 166.9 MB of disk
space. Since [site:forge's repository](https://github.com/apparebit/siteforge)
is a monorepo hosting all constituent packages, the top-level `node_modules`
directory contains only development dependencies. At the time, there were four
of them, namely [c8](https://github.com/bcoe/c8), [ESLint](https://eslint.org),
[Node Tap](https://node-tap.org), and [Prettier](https://prettier.io).

Avoiding comparably grotesque application sizes requires that we developers
become far more mindful of how we break functionality into modules and packages
and how we design the interfaces between them. In particular, packages should be
both easily reusable and easily extensible. Achieving both equally will require
that we stop piling on dependencies, as Node Tap does when just brinign in all
of Istanbul, and instead start defining narrow interfaces that are easier to
accommodate by different implementations. In case of site:forge, this worked out
nicely for the `@grr/walk` and `@grr/async` packages. The former provides file
system directory traversal, while the latter serves as concurrent executor for
asynchronous code. Whereas `@grr/walk` runs step after step by default, it has a
`run()` option for overriding that behavior. `@grr/async`'s interface may be
more complex—and expressive—than that one function. However, its `schedule()`
method purposefully has the same signature as `run()` and, coincidentally,
`Reflect.apply()`, resulting in easy interoperability and easy extensibility
alike.
