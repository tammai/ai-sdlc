---
title: Welcome to the blog
description: What this blog is for and how a post is written.
date: 2026-10-01
author: The editors
---

A post is a Markdown file in `content/blog`. The file name is the URL: this one is `welcome.md`, so it lives at `/blog/welcome`.

The block at the top of the file (between the `---` lines) is the post's frontmatter. It is checked when the site is built, so a missing title or a date that is not `YYYY-MM-DD` stops the build instead of publishing a broken page.

To work on a post before it is public, keep it in `content/blog/drafts/`. `pnpm dev` shows it with a Draft badge; `pnpm build` leaves it out completely, so it is not in the pages, the sitemap or the content data the browser downloads. Move it up a folder to publish.
