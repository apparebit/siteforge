# @grr/loader

This package hooks the ESM loader to enable custom module loading policies as
well as module reloading without process restart. The implementation builds on
the `resolve()` hook, which maps the module specifier found in source code to
the module's file URL. The fact that ESM does not use file paths but rather file
URLs adds significant expressive power. After all, the query and fragment of a
URL have no impact on the selection of the actual file. However, they are taken
into consideration when comparing URLs for equality. So by decorating the same
file URL with different fragments inside the `resolve()` hook, we can load the
same module from the same file into the same process more than once. In
particular, we can do that when the on-disk content of some files changed, which
gives us a fully working module reloader.

More specifically, we use a counter to represent each logical epoch and add a
fragment with said logical epoch to all reloadable URLs. When files are changed,
we transition into a new epoch by updating the counter and reloading reloadable
modules that are imported by non-reloadable modules. That of course does imply
that the non-reloadable modules use dynamic `import()` for reloadable modules.
The latter may import both reloadable and non-reloadable modules; they needn't
use dynamic `import()` as long as `resolve()` correctly propagates the fragment
from parent to child in the module graph.

While the basics are simple, one rather tricky challenge when working with
loader hooks is communication between the loader and the main application. As of
Node.js 13.12.0, both loader and application execute within the same realm, even
though module dependencies including module caches are strictly separated.
Consequently, loader and application cannot communicate through shared state
within a shared module, e.g., to update the loader's configuration. While loader
and application can communicate through the global object for now, work is
already under way to migrate the loader to its own thread. That requires its own
global object due to JavaScript's single-threaded execution semantics. With
shared modules and shared memory out of the picture, we need to turn to message
passing. Conveniently, the Worker API already includes such a facility via
`postMessage()`.


## XPC: Cross-Realm Procedure Calls

While certainly reasonable, the choice of `postMessage()` does have the drawback
of introducing a direct dependency from module loader to threading
implementation. That is exactly the kind of dependency I have been avoiding
while designing site:forge's internal interfaces, so I did wonder whether there
is an alternative that requires no additional components and introduces no
additional dependencies. As it turns out, the pluggable module loader itself
provides an alternative messaging substrate. First, the application has full
control over module specifiers in its source code. Even better, they are not
checked or otherwise interpreted by the runtime and treated as opaque until
hand-off to the `resolve()` hook. That suffices for sending requests from
application to loader. Second, the loader has full control over module URLs and
module contents and, via fragments, can even load an arbitrary number of
instances for the same module. That suffices for returning responses from loader
to application.

In more detail, this particular form of cross-realm or cross-domain procedure
calls or XPC serializes requests as module specifiers and responses as module
source code. The module specifier for requests starts with the literal
`@grr/loader/invoke/` followed by a command name, a slash, and the JSON payload.
The module for responses is minimal, comprising only the default export with the
JSON payload, e.g., `export default {"value":42};` and each such response is yet
another version of the same dummy module created by appending a unique fragment
to the fragment- and query-free URL. Since the unadorned URL is not used for XPC
itself, the dummy module can serve a second function, namely as oracle for the
presence of the loader hook. That is accomplished by simply returning a
different module from that hook when application code imports the dummy module
by its `@grr/loader/status` external alias.

XPC's equivalent of `postMessage()` in application code is
[invoke()](./invoke.js). The function accepts the name of a command and some
arbitrary data as only arguments and the data is passed as only argument to the
named action. Its implementation is quite simple; much of its body is devoted to
handling errors upon receipt of the response. The loader's equivalent is the
[Call](./call.js) class. It is more complex because (1) XPC has more work to do
in the loader (including the actual invocation of the targeted action) and (2)
it necessarily is spread between the `resolve()` and `translateCode()` hooks
(though `getSource()` would be equally suitable). The fully resolved URL serves
as connective tissue: It is returned from `resolve()` and passed into
`translateCode()` by the loader already.

---

__@grr/loader__ is © 2020 Robert Grimm and licensed under [MIT](LICENSE) terms.
