---
type: regex
pattern: 'is a secret file|matches a secret path'
match: contains
target: trace
---
The guard denies reading .env, by path or through the shell.
