# @grr/oops

This package takes care of operational concerns including logging and metrics
collection.

A logger has `error`, `warning`, `success`, `notice`, `info`, and `debug`
levels. The logger's volume determines which of these levels are silenced. At
the default of 0, `info` and `debug` are silenced. Active levels emit either
line-separated JSON or human-readable, optionally styled text.

Metrics can be monotonically increasing counts and time intervals in
milliseconds. Each metric has one or more labels. Label order matters.

---

__@grr/oops__ is © 2019-2020 Robert Grimm and licensed under [MIT](LICENSE)
terms.
