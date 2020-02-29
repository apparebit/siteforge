# @grr/inventory

This package provides the scaffolding for tracking the files processed by a
static website generator. That includes the primary index, a hierarchical mirror
of the file system subtree, as well as secondary indexes, notably by content
kind, by tool processing phase, and by user-specified label.

Correctly tracking files in the inventory requires correctly manipulating paths,
both for the local file system (POSIX or Win32 style) and for URLs (POSIX
style). This package includes a module with helper functions that take these
differences into account. Having said that, the canonical representation of
paths are absolute POSIX style paths. The helper module can be imported directly
through the `@grr/inventory/path` specifier.

---

__@grr/inventory__ is © 2020 Robert Grimm and licensed under [MIT](LICENSE)
terms.
