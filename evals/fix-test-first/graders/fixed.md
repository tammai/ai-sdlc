---
type: regex
pattern: 'Math\.floor\(total / size\) \+ 1'
match: not_contains
target: {source: file, path: src/paging.js}
---
The off-by-one is gone from the code.
