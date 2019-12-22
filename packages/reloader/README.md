# @grr/reloader

An ESM module loader hook that allows for the orderly hot-reloading of ESM
modules. Node.js' module loader hook is actively being redesigned, so this
package probably may change rather substantially in the future. In the meantime,
however, this module loader hook is configured through the `RELOADER_SCOPES`
environment variable, which contains a JSON string or JSON array of strings
naming directories that contain reloadable modules. When such a module is loaded
by code that is _not_ reloadable, then it is associated with the current epoch.
If that epoch changes and the module is loaded by non-reloadable code again, the
module is freshly reloaded. The function

    globalThis[Symbol.for('@grr/reloader/epoch/current')]

returns the current epoch number and the function

    globalThis[Symbol.for('@grr/reloader/epoch/next')]

increments the current epoch number. Loading a module is as simply as `await
import('name')`.


---

__@grr/reloader__ is © 2019 Robert Grimm and licensed under [MIT](LICENSE)
terms.
