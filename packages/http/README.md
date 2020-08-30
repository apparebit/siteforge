# @grr/http

__@grr/http__ is a Node.js web framework along the lines of
[Express.js](http://expressjs.com) and [Koa.js](https://koajs.com). But whereas
Express.js and Koa.js were built for HTTP/1.1 and gained support for HTTP/2 only
later on, __@grr/http__ is explicitly designed for HTTP/2. As a result, Express.js
and Koa.js use Node.js' original message-based HTTP API and its compatibility
API for HTTP/2, which silently ignores some errors. In contrast, __@grr/http__
uses Node.js' connection-based HTTP/2 API. That way, __@grr/http__ can offer more
robust support for HTTP/2 including error conditions while still supporting a
simpler promise-based API.

That does not mean everything is new again. __@grr/http__ reuses proven patterns
where possible, notably by exposing the same middleware calling convention as
Koa.js. Each middleware function takes a `context` object and a `next` callback.
The context object holds the request and response state and provides a number of
helper functions to make common server-side operations straight-forward to
implement. Some of that functionality only exists to support the builtin
middleware and probably will be moved to the `Server` class.

`Server` largely functions as a resource manager. It manages HTTP/2 connections
as well as the middleware receiving requests and sending responses over those
connections. To cover basic request validation and redirection, serving static
assets from files, error handling, common headers necessary for security, and
responding, the server class also provides a number of builtin middleware
handlers. That makes some of the most basic aspects of __@grr/http__ arbitrarily
extensible and configurable, since all builtin middleware uses only public
functionality in their implementation and can be replaced or disabled at will.

Instead of invoking all registered middleware on all request, response
exchanges, the server class uses a simple router component that triggers
middleware based on paths. That router is also reusable as `Server.Router`.
However, since its dispatch latency scales linearly with the number of
middleware handlers, it should be used for coarse-grained routing only.

__@grr/http__ is almost self-contained. __@grr/temple__ is its only external
dependency beyond builtin Node.js modules. That package, in turn, has no
external dependencies of its own. Yet, as a featherweight template engine based
on JavaScript template literals, __@grr/temple__ is useful on its own and also
useful in __@grr/http__.

---

__@grr/http__ is © 2020 Robert Grimm and licensed under [MIT](LICENSE) terms.
