# Deployment

## Production

- Domain: `https://pants.place`
- Runtime: **Cloudflare Workers static assets**
- Worker: `pants-place-site`
- Route: `pants.place/*` (zone `pants.place`)
- Archive API Worker: `pants-place-oldnet-api` (`wrangler.api.jsonc`)
- Build: `npm run build` → `dist`
- Deploy: `npm run deploy` (site) or `npm run deploy:all` (site + API)
- Compatibility date: **2026-10-01** (`wrangler.jsonc`)
- Node: **26.13.0** (`.nvmrc`, `.node-version`, `engines`)
- Package manager: npm 11.20.0 (`packageManager` field)
- Config: `wrangler.jsonc`

There is no separate development URL. Canonical URLs, the sitemap, robots and social metadata all point at `https://pants.place`.

## Current cutover state

The old Pages project `pants-place-site` still exists and still owns the `pants.place` custom domain/DNS record. The Worker route `pants.place/*` is more specific than the Pages hostname and serves all production traffic.

Do **not** delete the Pages custom domain or its DNS records yet. That would remove the hostname the Worker route runs on. Rollback is simply removing the Worker route; Pages can serve the old deployment again.

To fully detach Pages later, use the Cloudflare dashboard:

1. Create a Worker custom domain for `pants-place-site` on `pants.place` (Cloudflare will replace the Pages DNS record).
2. Verify the Worker custom domain.
3. Remove `pants.place` from the Pages project.
4. Disable Pages production deployments.

This requires DNS/custom-domain permissions that the current Wrangler OAuth token does not include.

## Commands

```bash
nvm use
git submodule update --init --recursive
npm install
npm run build
npm run deploy
```

`wrangler.jsonc` also has a dry-run path:

```bash
npm run cf:dry-run
```

## Personal-site Workers

The member and character sites are independent Astro repositories. Each one is
deployed as its own assets-only Cloudflare Worker under an internal `/sites/`
path, while the parent Worker owns the public deep links:

```text
site-member-pants   -> pants-place-member-pants   -> pants.place/sites/member/pants/*
site-member-kylie   -> pants-place-member-kylie   -> pants.place/sites/member/kylie/*
site-member-shades  -> pants-place-member-shades  -> pants.place/sites/member/shades/*
site-member-pip     -> pants-place-member-pip     -> pants.place/sites/member/pip/*
site-char-chogi     -> pants-place-char-chogi     -> pants.place/sites/char/chogi/*
site-char-jiroji    -> pants-place-char-jiroji    -> pants.place/sites/char/jiroji/*

Public routes owned by the parent:
  /member/pants, /member/pants/*  -> desktop launcher -> IE -> /sites/member/pants/*
  /char/chogi,   /char/chogi/*    -> desktop launcher -> IE -> /sites/char/chogi/*
```

They are not git submodules. The parent build does not clone, install, or execute
any subsite code.

### How the mount works

Each subsite is an assets-only Worker. Astro builds with an internal base and a
matching nested output directory:

- routes for both `/sites/member/<slug>` and `/sites/member/<slug>/*`
- `assets.directory: "./dist"`
- Astro `base: "/sites/member/<slug>"` and
  `outDir: "./dist/sites/member/<slug>"`

The request and file paths line up without a Worker script:

```text
request:           /sites/member/pants/about/
asset served from: ./dist/sites/member/pants/about/index.html
```

`assets.base_path` would be simpler, but it is not enabled on all Cloudflare
accounts (`100343: A non-root assets.base_path is not enabled for this
account`). The nested output above works on standard accounts.

There is no `main`, no `ASSETS` binding and no prefix stripping. The site is
served and billed as static assets.

### Public deep links

`src/pages/[...path].astro` generates one launcher page per site at its public
path (`/member/pants/`, `/char/chogi/`, and so on). `public/_redirects` proxies
nested paths to that launcher:

```text
/member/pants/* /member/pants/ 200
```

The proxy keeps the browser URL at `/member/pants/about/`. The launcher page
reads the real URL, boots the desktop, and opens IE at
`http://www.pants.place/member/pants/about/`. IE loads the iframe from
`/sites/member/pants/about/`, so the address bar and the content stay in sync
without loading the desktop inside itself.

Cloudflare route matching is most-specific-first:

```text
pants.place/sites/member/pants/*  -> pants-place-member-pants
pants.place/*                     -> pants-place-site
```

Workers "Custom Domains" bind hostnames, not paths. These sites use Routes on the
`pants.place` zone instead.

### Parent metadata

`src/data/personal-sites.ts` is checked in. It contains display metadata, the
public launcher path and the internal content path for the Start menu, IE
favorites, webring and search. Update it here when a site changes its title,
description, handle or paths.

### Setting up a site repository

From this repository, against a checkout of the subsite repository:

```bash
node scripts/subsites/setup.mjs --dir ../site-member-pants --kind member --slug pants
```

This writes `wrangler.jsonc`, patches `astro.config.*` to use
`site: "https://pants.place"`,
`base: process.env.PANTS_SITE_BASE || "/sites/member/pants"` and
`outDir: "./dist/sites/member/pants"`, and rewrites cross-site GitHub Pages
links to `https://pants.place/sites/...`.

See [`scripts/subsites/README.md`](scripts/subsites/README.md) for details.

### Deploying a site

Recommended: connect the subsite repository to Cloudflare Workers Builds.

- Build command: `npm run build`
- Deploy command: `npx wrangler@4 deploy`
- Root directory: repository root
- Worker config: `wrangler.jsonc` in the repository

Alternative: use the optional generated GitHub Actions workflow and store
`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` in that repository's secrets.

Each subsite deploys on its own. No parent rebuild or redeploy is involved, and a
subsite repository's build never runs in the parent Cloudflare build.

### Local development

Run a subsite from its own checkout:

```bash
npm ci
npm run dev
# http://localhost:4321/sites/member/pants/
```

The parent desktop links to the public path and loads the internal route inside
IE. Deployed subsites work inside the IE window because all sites share the
`pants.place` origin.

### Redirects and aliases

`public/_redirects` in the parent Worker keeps old URLs and nested deep links
working:

- `/members/<slug>` and `/users/<slug>` -> `/member/<slug>`
- `/web/member/...` and `/web/char/...` -> the public `/member` and `/char`
  deep links
- `/member/<slug>/*` and `/char/<slug>/*` -> the launcher page for that site
  (200 proxy, browser URL preserved)
- `/web/~pants/...`, `/web/~kylie/...`, `/web/~ultimateshades/...` -> the
  corresponding public deep links
- `/~pants/...`, `/~kylie/...`, `/~ultimateshades/...` -> the corresponding
  public deep links

These redirects run on requests that reach the parent Worker. A request under a
deployed subsite's route is handled by that subsite's Worker instead.

## Cached Old Net API Worker

The archive API is a second Worker deployed from this repository. It does **not**
replace or modify the site Worker.

- Worker: `pants-place-oldnet-api`
- Config: `wrangler.api.jsonc`
- Source: `worker/oldnet.ts`
- Routes: `pants.place/api/oldnet` and `pants.place/api/oldnet/*`
- Deploy: `npm run deploy:api`
- Local: `npm run cf:preview:api`
- Config check: `npm run cf:dry-run:api`

Cloudflare route matching is most-specific-first, so `pants.place/api/oldnet/*`
wins over the site's `pants.place/*` route. No DNS record, certificate or
custom-domain change is needed.

Cloudflare Workers Cache is enabled in `wrangler.api.jsonc`:

- archived pages: `Cache-Control: public, max-age=31536000, immutable, no-transform`
- search results: `public, max-age=300, no-transform`
- `cross_version_cache: true`, so a new API deployment does not discard the
  year-long cache

`no-transform` is required. Without it, the zone's JavaScript detections inject
a Cloudflare challenge script into HTML after the Worker returns, which both
pollutes the archived page and makes the body differ per request.

Only successful `200` responses are cacheable. Errors, `429`s and upstream
failures return `no-store`. The client sends canonical query strings and the
Worker `308`s non-canonical ones, because Workers Cache keys on the exact path
and query string.

The Worker must send a browser User-Agent. The Old Net deflects obvious bots
with a `200 Hello World` placeholder; caching that would poison the entry.
That is why `worker/oldnet.ts` sets `BROWSER_UA`.

To invalidate cached pages after a sanitizer or URL-rewriting change, bump the
API prefix (for example, `/api/oldnet/v2` to `/api/oldnet/v3`) and update
`src/kernel/web.ts` and the inline scripts. The new path is a fresh cache
namespace.

Verify after a deploy:

```bash
# 200, then a cached 200 with cf-cache-status: HIT
curl -fsS -D- -o /dev/null \
  'https://pants.place/api/oldnet/v2/health'
curl -fsS -D- -o /dev/null \
  'https://pants.place/api/oldnet/v2/get?url=http%3A%2F%2Fexample.com%2F&year=1998'
curl -fsS -D- -o /dev/null \
  'https://pants.place/api/oldnet/v2/get?url=http%3A%2F%2Fexample.com%2F&year=1998'
```

## Static assets

`public/_headers` and `public/_redirects` are copied into `dist/` and honoured by Workers static assets.

- `/_astro/*` — immutable, one year
- `/v86/*` — one week
- `/soundfonts/*` — one week
- `/media/*` — one hour
- `/fonts/*`, `/icons/*` — immutable, one year
- `/wine/*` — cross-origin isolation headers (`COOP`, `COEP`, `CORP`) for SharedArrayBuffer and threaded guest execution
- `/wine/lib/*`, `/wine/build/*.wasm`, `/wine/src/*`, `/wine/icons/*`, `/wine/fonts/*` — immutable, one year
- `/wine/binaries/*`, `/wine/test/binaries/*`, `/wine/packages/*` — one day

The Wine-Assembly static mirror is roughly **300 MiB / 1,200 files**. The first deploy uploads it; later deploys upload only changed assets. Every file is under the 25 MiB Workers static-asset limit because files over 20 MB are split into 10 MB `.partNNN` chunks.

The assets are served locally; there are no runtime CDN dependencies. `.wasm`, `.mid` and `.ogg` are served with inferred MIME types.

### Preparing Wine assets

`npm run build` runs `scripts/wine/ensure.mjs`. On a fresh checkout it will:

1. initialise `vendor/wine-assembly`
2. install its build-only dependencies
3. compile the two wasm artifacts
4. copy the runtime into `public/wine/`
5. download and mirror the 41 supported app asset closures
6. generate `src/generated/wine-apps.ts` and `public/wine/apps.manifest.json`

Use `npm run wine:prepare` to force the whole pipeline and `npm run wine:verify` to check the mirror against `wine-assets.lock.json`.

The preparation step also applies Pants Place's small runtime patches: the renderer crop that removes guest window chrome, and two temporary menu exports in `src/09c5-menu.wat` used to publish the guest menu bar. The WAT file is restored from the submodule's `HEAD` immediately after the wasm build, so the submodule stays clean.

## Future auto-deploy

The current deployment was performed with an authenticated local `wrangler deploy`. To restore push-to-deploy for the Worker:

1. In Cloudflare, open Workers & Pages → `pants-place-site` → Settings → Builds.
2. Connect the GitHub repository (`pants-the-person/pants-place-site`, production branch `main`). This installs/authorises the Cloudflare GitHub App once.
3. Build command: `npm run build`.
4. Deploy command: `npx wrangler deploy`.
5. Set the build variable `NODE_VERSION=26.13.0`.
6. Verify a production build.
7. Disable the Pages project’s production auto-deploy.

Workers Builds currently defaults to Node 24.22.1 and preinstalls 22.23.4/24.22.1. Node 26.13.0 is selected via `.nvmrc`/`NODE_VERSION`; if Cloudflare’s build image cannot install Node 26, fall back to `NODE_VERSION=24.22.1` until the image moves to the next LTS.

The archive API needs a second Workers Builds project, also connected to this repository:

1. Create a Workers Builds project for `pants-place-oldnet-api`.
2. Point it at the same GitHub repository and `main` branch.
3. Build command: `npm ci` (the API has no Astro build step).
4. Deploy command: `npx wrangler deploy -c wrangler.api.jsonc`.
5. Set `NODE_VERSION=26.13.0`.

Both projects can use the same repository; they deploy different Worker names and routes.

## Matrix `.well-known`

Matrix discovery documents are part of the Worker as static files and are also served canonically by the standalone `pants-place-well-known` Cloudflare Worker:

- `/.well-known/matrix/server` — `m.server: "matrix.pants.place:443"`
- `/.well-known/matrix/client` — `m.homeserver.base_url: "https://matrix.pants.place"` plus LiveKit RTC focus
- `/.well-known/matrix/support` — optional admin contact

The site Worker route is `pants.place/*`; the more specific `pants.place/.well-known/matrix/*` Worker route, if deployed, takes precedence. If it is not, the static files in `public/.well-known/matrix/` and the CORS headers in `public/_headers` serve the same documents. Extensionless copies are kept for direct serving; the `.json` copies plus `public/_redirects` guarantee an `application/json` content type.

Do not switch the well-known Worker to a custom-domain Worker that takes over all apex paths, or it will hide this site.

Verify after a deploy:

```bash
curl -fsS https://pants.place/.well-known/matrix/server | jq .
curl -fsS -D- -o /dev/null https://pants.place/.well-known/matrix/client
curl -fsS https://pants.place/ | head
```

## Rollback

- Site: remove the `pants.place/*` Worker route (or deploy a version without routes).
- API: `wrangler rollback -c wrangler.api.jsonc`, or remove the `pants.place/api/oldnet*` routes. The site Worker is unaffected because it never ran the API code.
- The Pages project and its custom domain are still intact and will serve the previous deployment.
- The Pages production/preview compatibility date was updated to `2026-10-01` during the transition.

## What was removed

The old ActivityPub/OpenID `webfinger` and `nodeinfo` endpoints were removed. This site no longer serves `/.well-known/webfinger` or `/.well-known/nodeinfo`.
