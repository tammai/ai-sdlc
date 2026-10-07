---
title: Writing posts in Markdown
description: Headings, links, lists and code, and what to link to.
date: 2026-10-02
---

Write in plain Markdown. Use `##` for sections; the page title is already the main heading.

- Link to other pages with a path: `[pricing](/pricing)`. A broken internal link fails the build.
- Link to files that live in R2 with `/media/<key>`; those links are not checked at build time.

Code blocks are highlighted for `bash`, `json`, `ts` and `vue`:

```bash
pnpm dev
```
