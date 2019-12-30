# site:forge

## The Case for Proactive View Components

__site:forge__ is a static website generator centered around *proactive view
components*, that is, components that are rendered well ahead of time. By
limiting itself to that use case, site:forge can eschew much of the complexity
and framework lock-in of a [Gatsby](https://www.gatsbyjs.org),
[Next.js](https://nextjs.org), or [Nuxt.js](https://nuxtjs.org). The trade-off
is that site:forge also lacks their seamless integration between server-side and
client-side execution environments. In fact, despite the view components,
site:forge's more focused and thereby leaner approach to static website
generation is closer to a [Metalsmith](https://metalsmith.io) or
[11ty](https://www.11ty.dev). Yet, site:forge dispenses with their fondness for
small-ish, often awkward, and at times obscure domain-specific languages.
Instead, it standardizes on JavaScript as the only language for expressing
business and view logic alike.

As far as users are concerned, the goal is to replace templating and styling
languages with tagged templates for verbatim content and vanilla JavaScript for
logic. That is not to argue for a free-for-all mixing business logic and view
components. Users should still follow well-established best practices and keep
those two concerns separate. Doing so should keep noticeable differences between
site:forge and template-based website generators manageable. site:forge's
approach does, however, offer one significant advantage: There is no custom code
written in some ad-hoc language and running in some subpar interpreter. It's all
modern JavaScript executing in a modern runtime environment, with all the
sophisticated performance optimizations that entails. This does assume that
users can build on (some) familiarity with programming. But that is increasingly
a requirement for any (white collar) profession. At the same time, skills honed
while writing view components for this website generator are more easily
transferable than expertise with a particular templating or styling language.

site:forge's view components also are far more lightweight than
[React.js](https://reactjs.org) or [Vue.js](https://vuejs.org). They just are
functions that take a component's properties and context as arguments and then
produce nodes belonging to site:forge's pared down, ahead-of-time [virtual
DOM](https://github.com/sethvincent/awesome-virtual-dom). That is feasible
because many of the more sophisticated features of the above frameworks are
neither necessary nor even useful when creating content well before deployment
to the server. Notably, there is no need for view reconciliation or state
management. At the same time, using a virtual DOM entails two important
benefits: First, content is syntactically well-formed by construction. Second,
content can be more easily validated. As a proof of potential, site:forge
already includes a [mechanized model](packages/html/README.md) for
HTML—capturing the rules from the
[HTML](https://html.spec.whatwg.org), [WAI-ARIA](https://w3c.github.io/aria/),
and [OpenGraph](https://ogp.me) standards.

### Prehistory

This project is based, in part, on experiences with two earlier and by now
discarded prototypes. But whereas tooling came first for those earlier two
attempts, the website takes precedence for this third iteration. In fact,
site:forge started out as a few ad-hoc scripts to build and deploy Apparebit. I
expect that I will alternate focus between website and website generator for the
forseeable future and thereby hope to ensure that site:forge's development
remains focused on features that are useful when building small to medium sized
websites. It also serves as a end-to-end test for the tool and its usability.


## The Packages of site:forge

In addition to the tool for generating websites itself, found in the `source`
directory, this repository also includes the source code for several packages
that are more generally useful, in the `packages` directory. In refactoring
site:forge's runtime from a monolithic assortment of modules into distinct
packages with well-defined interfaces, I carefully minimized any dependencies
between these packages. At times, that meant implementing the same helper
functionality more than once. But I consider that an acceptable trade-off, since
site:forge explicitly seeks to avoid framework lock-in.

In building out these packages, I mostly wrote the code from scratch and reused
only few, carefully vetted, existing packages. That is largely a personal
reaction to the state of the npm ecosystem. In my opinion, it features too many
packages that comprise only a single, straight-forward function. Furthermore,
even packages that contain more functionality often take modularization to
dubious extremes, with each module containing just one function. This is not to
argue that a module having only a default export necessarily is a bad idea.
Quite the contrary: A narrow, well-designed interface can be a feature in and of
itself. Nonetheless, many npm packages have gone a bit far with this trend
towards ever smaller code units and I'm leveraging the site:forge project as an
opportunity for exploring a different balance.

A nice side-effect of revisiting seemingly familiar topics, such as command line
argument parsing, are opportunities for redefining the task at hand and thereby
enabling more powerful and easier to use APIs. In the case of command line
argument parsing, I realized that command line arguments are just one source of
a tool's configuration state. Consequently, the `@grr/options` package relies on
the same schema declaration for parsing command line arguments or the equivalent
records from a `package.json` manifest. The package still has two distinct entry
points, `optionsFromObject()` and `optionsFromArguments()`. But both functions
share the same underlying data model, take almost the same arguments, perform
the same validations on the raw data, and produce the same kind of configuration
state.

Another consideration in factoring functionality into distinct packages has been
unit testing. While code coverage of the existing unit tests has not yet reached
100% for all packages, it generally comes very close already and my goal is to
get to 100% eventually. Furthermore, test coverage for the packages is far
better than for site:forge itself. However, the latter benefits significantly
from end-to-end testing as Apparebit's static site generator.

_Oops!_ It does appear that I have more and more strongly felt opinions about
view components and package management than I expected. But I believe we covered
the substance thereof and are ready for switching gears. So without further ado,
here are site:forge's packages so far:

  * [__@grr/glob__](packages/glob) implements wildcard patterns for file system
    paths by translating them into predicate functions. Unlike many other npm
    packages, `@grr/glob` does not compete on features and is purposefully
    minimal.
  * [__@grr/fs__](packages/fs) is a grab bag of regular and empowered helper
    functions for performing file I/O. Some are just easier to import,
    promisified file operations from Node.js' own `fs` module. Some come with
    their own superpowers, including the ability to fix `ENOENT` errors on the
    fly, to rename files depending on their content, and to easily walk the file
    system hierarchy.
  * [__@grr/options__](packages/options) helps determine a tool's configuration
    based on command line arguments and `package.json` manifest alike, with both
    sources being subjected to the same validations based on the same schema.
  * [__@grr/sequitur__](packages/sequitur) provides expressive and lazy
    sequences that may just be synchronous or asynchronous.
  * [__@grr/multitasker__](packages/multitasker) performs concurrent,
    asynchronous task execution in an orderly and context-aware manner. While
    the package necessarily deals in promises, it mostly focuses on the
    promise-producing tasks. After all, they actually get shit done.
  * [__@grr/reloader__](packages/reloader) provides a module hook that enables
    hot module reloading, but only for modules in select directories and at
    select times. Since Node.js module hook API will likely change in the
    future, this package must be considered experimental.
  * [__@grr/html__](packages/html) provides a model for well-formed HTML based
    on HTML5, WAI-ARIA, and the Open Graph Protocol.
  * [__@grr/proact__](packages/proact) implements the proactive view system,
    notably a template tag for creating virtual DOM fragments and a render
    function for validating and emitting HTML.

---

site:forge is © 2019 Robert Grimm and licensed under [MIT](LICENSE) terms.
