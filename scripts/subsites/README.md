# Personal-site Workers

The six personal sites are no longer git submodules and are no longer built as
part of this repository. Each one is its own assets-only Cloudflare Worker
mounted on the `pants.place` zone under an internal path:

```text
site-member-pants   -> pants-place-member-pants   -> pants.place/sites/member/pants/*
site-member-kylie   -> pants-place-member-kylie   -> pants.place/sites/member/kylie/*
site-member-shades  -> pants-place-member-shades  -> pants.place/sites/member/shades/*
site-member-pip     -> pants-place-member-pip     -> pants.place/sites/member/pip/*
site-char-chogi     -> pants-place-char-chogi     -> pants.place/sites/char/chogi/*
site-char-jiroji    -> pants-place-char-jiroji    -> pants.place/sites/char/jiroji/*
```

The parent `pants-place-site` Worker owns the public routes:

```text
/member/pants, /member/pants/*   -> desktop launcher, opens IE at the site
/char/chogi,   /char/chogi/*     -> desktop launcher, opens IE at the site
/sites/member/pants/*            -> that site's own Worker (iframe content)
```

A push to a subsite repository deploys only that Worker. The parent site does not
rebuild, and no parent deploy is required.

> Cloudflare's "Custom Domains" bind a hostname, not a path. These sites use
> **Workers Routes** on the existing `pants.place` zone instead.

## How the mount works

Each site is an **assets-only Worker**. Astro still writes a normal `dist/`
folder, but it builds with `base: "/sites/member/pants"`, so its links and assets
use the internal route. `wrangler.jsonc` sets `assets.base_path` to the same
prefix:

```jsonc
"assets": {
  "directory": "./dist",
  "base_path": "/sites/member/pants"
}
```

Cloudflare maps the public route onto the files at the root of `dist`:

```text
request:           /sites/member/pants/about/
asset served from: ./dist/about/index.html
```

No Worker script, prefix stripping or `ASSETS` binding is needed. The site ships
only static files, so requests are served and billed as static assets.

## Public deep links

The parent site generates a launcher page for each site root (for example
`/member/pants/`). Its `_redirects` file proxies nested paths to that launcher:

```text
/member/pants/* /member/pants/ 200
```

The proxy keeps the browser URL at `/member/pants/about/`. The launcher page
reads that URL, boots the desktop, and opens IE at the same address. IE loads the
page from `/sites/member/pants/about/`, so the fake browser shows
`http://www.pants.place/member/pants/about/` while the actual content comes from
the standalone Worker.

## Set up a site repository

From a checkout of this repository:

```bash
node scripts/subsites/setup.mjs \
  --dir ../site-member-pants \
  --kind member \
  --slug pants
```

The script writes:

- `wrangler.jsonc` — Worker name, routes, assets directory and `base_path`
- `astro.config.mjs` — `site: "https://pants.place"`,
  `base: process.env.PANTS_SITE_BASE || "/sites/member/pants"`, and
  `outDir: "./dist"`
- cross-site links — rewrites old
  `https://pants-the-person.github.io/site-<kind>-<slug>/` links to
  `https://pants.place/sites/<kind>/<slug>/`

Use `--github-workflow` if that repository should deploy through GitHub Actions
instead of Cloudflare Workers Builds. The generated workflow needs
`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets.

## Deploy

### Cloudflare Workers Builds (recommended)

For each subsite repository, create a Workers Builds project:

- repository: the subsite repository
- build command: `npm run build`
- deploy command: `npx wrangler@4 deploy`
- root directory: repository root

`wrangler.jsonc` is committed in the repository, so the Worker name and routes
are part of the site's own source.

### GitHub Actions

```bash
npm ci
npm run build
npx --yes wrangler@4 deploy
```

Store `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as repository secrets.

## Local development

Run the subsite on its own:

```bash
npm ci
npm run dev
# http://localhost:4321/sites/member/pants/
```

The parent desktop links to the public path and loads the internal route inside
IE. Because both are on `pants.place`, deployed subsites work inside the IE
window without any cross-origin plumbing.

## Notes

- The IE iframe is sandboxed without `allow-scripts`, so a subsite's scripts do
  not run inside the desktop. The sites are designed to be no-JS; the direct
  `/sites/...` route is the only place a script could run.
- `assets.base_path` requires Wrangler 4.148.0 or later. This repository uses
  Wrangler 4.157.0.
- The site's GitHub Pages workflow should be removed (or kept only as a
  historical backup). Production is the Worker.
- If a site needs custom `_headers` or `_redirects`, use the public/internal
  path in those rules. `assets.base_path` paths in `_headers`, `_redirects` and
  `run_worker_first` are public URL paths.

## Adding another site

1. Create the repository as usual.
2. Add its metadata to `src/data/personal-sites.ts` in this repository.
3. Add a nested deep-link proxy to `public/_redirects` here:
   `/kind/slug/* /kind/slug/ 200`.
4. Run the setup script against the new repository.
5. Deploy its Worker and verify its route.
6. Commit the metadata and redirect changes here.

The parent build no longer clones, installs, or executes any subsite code. Each
site's build runs only in that site's own deployment pipeline.
