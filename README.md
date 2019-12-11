# site:forge

## Proactive View Components

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
already includes a [mechanized model](lib/markup/model.json) for
HTML—incorporating the basic structural and typing rules from the
[HTML](https://html.spec.whatwg.org), [WAI-ARIA](https://w3c.github.io/aria/),
and [OpenGraph](https://ogp.me) standards.

### History and Process

This project is based, in part, on experiences with two earlier and by now
discarded prototypes. To keep myself honest for this third iteration, I started
with an actual website, v3 of my personal website https://apparebit.com. In
fact, the starting point for this repository were the very much site-specific
and also ad-hoc scripts I wrote for generating and deploying the website
originally. Once the initial push on site:forge is complete, I expect to
alternate between the two projects, thus ensuring a very direct feedback loop in
both directions.

## Using site:forge

site:forge's first release still is some time off. Especially when first
drafting a new module, I may wait before the first commit, usually to also write
some tests. But overall, I push code to GitHub as I commit it.

---

site:forge is © 2019 Robert Grimm and licensed under [MIT](LICENSE) terms.
