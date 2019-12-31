# site:forge

A static website generator.

## 1. The Case for site:forge

When reading other people's code, I often wish there was more documentation on
the motivation for a particular design or software architecture. After all, we
routinely make trade-offs while developing code and understanding those
trade-offs as well as other, non-technical factors that nonetheless influence
our work most certainly helps in understanding the resulting artifact. With that
in mind, there are two topics that have an outsize impact on site:forge.


### 1.1 Proactive View Components

site:forge is based on *proactive view components*, that is, components that are
rendered well ahead of time. By limiting the tool to that use case, site:forge
can eschew much of the complexity and framework lock-in of a
[Gatsby](https://www.gatsbyjs.org), [Next.js](https://nextjs.org), or
[Nuxt.js](https://nuxtjs.org). The trade-off is that site:forge also lacks their
seamless integration between server-side and client-side execution environments.
In fact, despite the view components, site:forge's more focused and thereby
leaner approach to static website generation is closer to a
[Metalsmith](https://metalsmith.io) or [11ty](https://www.11ty.dev). Yet,
site:forge dispenses with their fondness for small-ish, often awkward, and at
times obscure domain-specific languages. Instead, it standardizes on JavaScript
as the only language for expressing business and view logic alike.

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

#### Prehistory

This project is based, in part, on experiences with two earlier and by now
discarded prototypes. But whereas tooling came first for those earlier two
attempts, the website takes precedence for this third iteration. In fact,
site:forge started out as a few ad-hoc scripts to build and deploy Apparebit. I
expect that I will alternate focus between website and website generator for the
forseeable future and thereby hope to ensure that site:forge's development
remains focused on features that are useful when building small to medium sized
websites. It also serves as a end-to-end test for the tool and its usability.


### 1.2 The Limits of Modularity

In addition to the tool for generating websites itself (found in
[`source`](source)), this repository also includes the source code for several
other packages that are more generally useful (found in [`packages`](packages)).
While I started with a single unified codebase, I began breaking out packages
soon thereafter. In refactoring site:forge from an assortment of modules into a
more structured application with distinct packages and well-defined internal
interfaces, I carefully minimized any dependencies between these packages. At
times, that meant implementing variations of the same helper functionality more
than once. But I consider that an acceptable trade-off. As discussed above,
site:forge explicitly seeks to avoid framework lock-in and so I could hardly
create my own framework, which can only be consumed as a framework.

I am also writing most of the code for site:forge myself, falling back onto
existing packages in a few well-considered cases only. That is somewhat of an
allergic reaction to the state of the npm ecosystem at large. In my experience,
there are altogether too many packages that comprise a single, straight-forward
function only. Furthermore, even packages that provide more substantial
functionality often take modularization to dubious extremes, with each module
containing just one function. This is not to argue that a module having only a
default export necessarily is a bad idea. Quite the contrary: A narrow,
well-designed interface can be a feature in and of itself. Nonetheless, many npm
packages have taken this trend towards small modules and packages to
unproductive extremes, incurring significant storage, maintenance, and
compliance overheads. I'm thus treating site:forge as an opportunity for
exploring a different balance with a coarser granularity.

A nice side-effect of revisiting seemingly familiar topics, such as command line
argument parsing, are opportunities for redefining the task at hand and thereby
enabling simpler and also more powerful APIs. In the case of command line
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
get to 100% eventually. But unit tests are only feasible where there is a unit
of code to test, with a clearly defined interface to boot. In practice, that
means that command line tools often don't have comprehensive unit and/or
integration tests. Since I am guilty of just that omission myself, the breaking
out of packages helps with more targeted testing. And I'm claiming my use of
site:forge for my own website as the definitive integration test. After all, if
I don't like the results, I am likely to fix the tool.


## 2. The Diversity of a Monorepo

In addition to @grr/siteforge, the static website generator itself, this
monorepo hosts a number of packages. For now, none of them have been released to
npm yet. The packages are:

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
