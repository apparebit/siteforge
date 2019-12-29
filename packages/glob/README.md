# @grr/glob

##### glob(...patterns)

Convert file path patterns into the corresponding predicate. One pattern string
may contain several patterns separated by a vertical bar `|`. If a path segment
is `**`, it matches zero or more path segments. If a path segment contains `*`,
it matches any number of characters. If a path segment contains `?`, it matches
any single character.

---

__@grr/glob__ is © 2019 Robert Grimm and licensed under [MIT](LICENSE) terms.


