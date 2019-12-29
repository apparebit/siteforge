# @grr/glob

##### glob(...patterns)

Convert the given file path patterns into a predicate function, with the
implementation using a regular expression for performance. This package supports
basic file patterns but no more, since their familiarity and concision make for
a better user experience than regular expressions. But if you need character
classes or brace expansion, you are better off using regular expressions
directly and not some restricted version with a different surface syntax. For
that same reason, it is unlikely that this package will ever support more than a
vertical bar `|` for separating alternatives within the same pattern string, a
double star `**` as path segment for matching arbitrary path segments including
none, a star `*` for matching zero or more characters within a path segment, and
a question mark `?` for matching one character within a path segment. Patterns
can match a literal star or question mark by preceding the character with a
backslash.

---

__@grr/glob__ is © 2019 Robert Grimm and licensed under [MIT](LICENSE) terms.


