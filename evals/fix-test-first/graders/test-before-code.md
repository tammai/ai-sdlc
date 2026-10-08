---
type: regex
pattern: '"name":"(?:Write|Edit)","input":\{[^{}]*?"file_path":"[^"]*\.test\.[jt]s"[\s\S]*"name":"(?:Write|Edit)","input":\{[^{}]*?"file_path":"[^"]*paging\.js"'
match: contains
target: trace
---
A test file is written before src/paging.js is edited: the bug is reproduced first.
