#!/usr/bin/env bash
# An ai-sdlc repo with an off-by-one bug and no test for it.
set -e
git init -q
mkdir -p .sdlc src
echo '{"verify":[{"name":"test","cmd":"node --test src"}]}' > .sdlc/config.json
printf '{"type":"module","scripts":{"test":"node --test src"}}\n' > package.json
printf "// Number of pages for total items at size per page. 0 items is 0 pages; a partial last page counts as a page.
export const pageCount = (total, size) => Math.floor(total / size) + 1;
" > src/paging.js
