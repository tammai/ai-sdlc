---
title: Serving images and video from R2
description: Where media files live, how a post refers to them, and how to upload one.
date: 2026-10-03
image: blog/r2-cover.svg
imageAlt: Two stacked boxes joined by an arrow, standing for a site and its media bucket
---

Images, video and downloads are not stored in git or in the build. They live in a Cloudflare R2 bucket and the site serves them at `/media/<key>`.

![A site and its media bucket](/media/blog/r2-cover.svg)

In a post, refer to a file by its key: `![alt text](/media/blog/r2-cover.svg)`. In the frontmatter, `image: blog/r2-cover.svg` is the key without `/media/`. Always write the alt text.

## Upload a file

Uploading changes the real bucket, so it is a deliberate step:

```bash
pnpm exec wrangler r2 object put my-site-media/blog/photo.webp --file ./photo.webp --content-type image/webp --remote
```

Use lowercase keys with letters, digits and `-`, and a folder per post. To replace a file that visitors may have cached, upload it under a new key (`photo.v2.webp`).

## Work locally

`media/` in the project is the local copy: `pnpm dev` serves it at `/media`, and `pnpm dev:worker` copies it into a local R2 first, so `/media/...` works the same way as in production. Keep only small samples there.
