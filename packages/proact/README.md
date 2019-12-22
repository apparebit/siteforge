# @grr/proact

This package implements site:forge's _proactive_ views, which are rendered way
ahead of time, i.e., before clients access resources on the server. The main
benefit of doing so is that views are far less complex than on the client: Since
such views are rendered just once, all the complexities of managing state
updates and reconciling vDOM trees are irrelevant for this use case.

As a consequence, plain functions represent a perfectly fine choice for
implementing view components. The arguments passed to a view component during
rendering are its properties from the vDOM and a context object with information
on the current page as well as the website's collections of pages. The result
returned from the view component is a new, different vDOM fragment:

    Component: (Props, Context) -> vDOM

Eventually, the vDOM contains no more view components but only HTML and SVG
tags. In other words, the vDOM has been reduced to its viewable substance and
can safely be rendered. In fact, creating vDOM fragments with the `html`
template tag and then rendering the vDOM with the asynchronous generator
function `render()` pretty much captures the extent of Proact's functionality.

It is worth mentioning that Proact's view components may execute asynchronously,
so that they can easily retrieve data from external sources. However, when a
view component returns a promise, rendering is suspended until the promise
returned from the component resolves to a vDOM fragment. Since that can easily
become a performance bottleneck, site:forge supports data retrieval before
rendering and with higher concurrency.

Proact's vDOM has the additional advantage of being slightly more compact than
most other vDOM implementations. That follows from Proact's execute-once
semantics: Since Proact does not manage state updates and since it also does not
perform reconciliation between versions of the vDOM, it does not need to track
any information beyond what's already in the vDOM. Proact thus dispenses with
the customary outer wrapper object of a vDOM node having `type` and `props` and
instead makes `type`, like `children`, just another property of the node/props
object.


---

__@grr/proact__ is © 2019 Robert Grimm and licensed under [MIT](LICENSE)
terms.
