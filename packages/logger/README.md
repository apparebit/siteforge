# @grr/logger

The one and only logger for Node.js: Semantic and colorful output generated
without any dependencies and, in particular, without any library for colorizing
terminal output. Logging methods are `error`, `warning`, `success`, `notice`,
`info`, and `debug` in decreasing order of severity. You create a new logger
with those methods by invoking this package's default export. Supported options
are `label` for marking lines as stemming from some named subsystem, `println`
for using an output stream other than `stderr`, and `volume` for silencing
overly eager logging code. The default volume is zero, which corresponds to all
levels but `info` (-1) and `debug` (-2) — nicely symmetric to `warning` (1) and
`error` (2). That's it. Feature requests will be treated with extreme prejudice.

---

__@grr/logger__ is © 2019-2020 Robert Grimm and licensed under [MIT](LICENSE)
terms.
