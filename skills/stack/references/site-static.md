# Profile: site-landing / site-marketing — static sites (SSG) on Cloudflare

**Both:** Nuxt 4 · Nuxt UI · Tailwind v4 · `nuxt generate` · served by a Cloudflare Worker with static assets · no database, no API, no auth.
**`site-landing`:** a handful of static pages (home, about, contact, privacy). All copy (site name, nav and the text of every page) lives in `app/data/site.ts`. No Nuxt Content, no R2, no Worker code.
**`site-marketing`:** adds Nuxt Content 3 (Markdown pages and a blog with validated frontmatter), a sitemap, and media in R2 served at `/media/*` by a small Worker (`worker/index.ts`).

Sites are Nuxt on **both** stack choices ("Let Claude choose" and "From templates"): the Markdown, content and static-asset story is Nuxt's, and `--ui` does not change it. They are not part of the shared `packages/ui-layer`; a repo with an app and a site keeps two separate Nuxt projects (`web/` and `site/`).

## The SSR exception
Every app profile runs `ssr: false`. A site is the one exception, and it is recorded per component (`render: "prerender"` in `.sdlc/stack.json`): `ssr: true` with `nuxt generate` renders every page to HTML **at build time**. There is no server rendering at runtime, no Nitro routes, and no API. Do not "fix" it back to `ssr: false`: the output would be an empty shell with no SEO or link previews.

## Choosing between them
- **marketing** when there is a blog or news, people other than developers edit the content, there are many pages, or there is media (images, video, downloads) beyond a favicon.
- **landing** for a handful of pages that one developer maintains. Moving from landing to marketing later is a tier-M change (adds Content, the Worker and R2).
- Anything with accounts, forms that store data, search over private data or per-user pages is not a site: it is `edge-web` or `spa-web`.

## Layout
```
app/pages/              file routes; each page sets useSeoMeta({ title, description })
app/data/site.ts        site name, tagline, nav and sample copy (landing: every page; marketing: the home page, the rest is content/*.md)
app/components/         SiteHeader, SiteFooter (+ MediaImage in marketing)
public/                 favicon, robots.txt, _headers (security headers, long cache for /_nuxt/*)
wrangler.jsonc          assets: .output/public, html_handling drop-trailing-slash, not_found_handling 404-page; env.staging / env.production
marketing only:
content/*.md            top-level pages at /<name> (app/pages/[...slug].vue); content/blog/*.md at /blog/<name>
content.config.ts       collections + Zod frontmatter schema (validated at build)
worker/index.ts         /media/* from R2: GET/HEAD, ranges, ETag/304, colo cache; everything else is static
media/                  small local sample set; served at /media by `nuxt dev`, seeded into the LOCAL R2 by `pnpm media:seed`
scripts/media-seed.mjs  local-only seed (always --local)
```

## Rules
- Pages stay static. In marketing only `/media/*` runs the Worker (`run_worker_first`); do not widen it.
- Frontmatter is part of the contract: change `content.config.ts` when a post needs a new field, and keep the build failing on bad data.
- Everything in `content/` is public: on static hosting the browser downloads the whole collection (`/__nuxt_content/<collection>/sql_dump.txt`). A `draft: true` flag therefore hides nothing. Drafts live in `content/blog/drafts/`, which the collection includes only in `nuxt dev` and drops from production builds. Don't put embargoed text in `content/` until it is meant to be public.
- Media lives in R2, not in git and not in the build. Refer to files by key (`/media/blog/x.webp`, `<MediaImage src="blog/x.webp" alt="…">`, `image: blog/x.webp`). Alt text is required. Keys use letters, digits and `._~-` with `/` between folders. Replace a cached file under a new key.
- Ship only what the site uses. Nuxt UI components are auto-imported, so unused ones stay out of the JS (use them by name; never register the whole library). That does not trim the CSS by itself: Tailwind scans all ~120 generated component themes. `ui.experimental.componentDetection: true` generates styles only for the components the site renders (measured: landing 187 → 79 KB, marketing 224 → 119 KB); a component chosen at runtime (`<component :is>`) is invisible to the scan and must be listed (`['Modal']`). Icons come from the local `@iconify-json/lucide` and only the used ones are bundled (`icon.clientBundle.scan`), and the browser never calls the Iconify API (`icon.fallbackToApi: false`). Code highlighting lists its languages. After adding MDC components to Markdown, check in a browser that their styles survived.
- Internal links are crawled at build time and a broken one fails `pnpm build`. Links under `/media` are not checked.
- No invented content: no fake metrics, logos, testimonials or prices. The copy in the templates is sample text: write real copy only from what the user told you, keep it modest, and list every product claim you wrote so the owner can confirm it.
- Marketing's sample posts, the `features` and `pricing` pages and `media/blog/r2-cover.svg` describe the template itself: replace or delete them as a first change. Keep at least one post (the blog index and home page expect them) and the validated frontmatter. A post may carry an optional `author` (shown in the byline); add other fields in `content.config.ts`.
- Pages that use `UPage` sit inside a `UContainer` (the templates use `max-w-3xl` for reading pages): without it the content runs flush to the viewport edge.
- Contact is a `mailto:` link or a link to a booking page or form service. A form that stores data needs a backend, which makes it an app.
- Set `NUXT_PUBLIC_SITE_URL` at build time (sitemap and canonical URLs) and update `public/robots.txt` to the real host.

## Tests & verify
Verify preset: typecheck · lint · test · build (all offline). Tests: page and component tests in the Nuxt runtime (happy-dom); in marketing also the Worker against a stub R2 bucket (ranges, 304, traversal, methods), the media key helper, and checks that every nav link has a page, every post has valid frontmatter and every Markdown image has alt text.
A green verify does not prove the deployed behaviour. Before a first deploy run `pnpm dev:worker` and check: `/about` returns 200 (no redirect), an unknown path returns 404 with the error page, client-side navigation between content pages works, and (marketing) `/media/<sample>` serves from the local R2.

## Deploy
Preview: `wrangler deploy --env staging` (agent may run). Production: `wrangler deploy --env production` from CI on merge to main (prod gate). Marketing: create each environment's bucket once (`wrangler r2 bucket create <app>-media[-staging|-production]`, a human step), and upload media with `wrangler r2 object put <bucket>/<key> --file … --content-type … --remote`. Always pass `--local` or `--remote`; the default differs between wrangler versions. Package scripts hide the wrangler call from the prod gate, so none of the templates define a deploy or remote-upload script.

## Scaffold
`sdlc scaffold-app` copies `site-landing-nuxt` or `site-marketing-nuxt` (`templates/apps/`) into `site/` (the repo root when it is the only component). The notes below describe how the templates were built; use them only when adding the pieces by hand.
`pnpm create nuxt@latest`, then add `@nuxt/ui`, `@iconify-json/lucide`, `@nuxtjs/sitemap`, `@nuxt/eslint`, `@nuxt/test-utils`, `vitest`, `wrangler`; marketing also `@nuxt/content` with `content.experimental.sqliteConnector: 'native'` (Node's built-in `node:sqlite`, no native package to compile). `nuxt.config.ts`: `ssr: true`, `nitro.prerender: { crawlLinks: true, failOnError: true }`.

## CLAUDE.md snippet
- Stack: Nuxt 4 static site (SSG, `ssr: true` + `nuxt generate`, no runtime server) + Nuxt UI/Tailwind v4 on Cloudflare Workers static assets. Marketing: Nuxt Content 3 (Markdown in `content/`, frontmatter validated at build), media in R2 at `/media/*`.
- Pages stay static; only `/media/*` runs the Worker. Media goes to R2 (never git), by key, with alt text. Uploading to the real bucket, creating buckets and production deploys need a human; `wrangler deploy --env staging` is the preview.
