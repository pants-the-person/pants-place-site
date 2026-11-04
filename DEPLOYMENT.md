# Deployment

## Production

- Domain: `https://pants.place`
- Runtime: **Cloudflare Workers static assets**
- Worker: `pants-place-site`
- Route: `pants.place/*` (zone `pants.place`)
- Build: `npm run build` → `dist`
- Deploy: `npm run deploy` (`npm run build && wrangler deploy`)
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
npm install
npm run build
npm run deploy
```

`wrangler.jsonc` also has a dry-run path:

```bash
npm run cf:dry-run
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

- Remove the `pants.place/*` Worker route (or deploy a version without routes).
- The Pages project and its custom domain are still intact and will serve the previous deployment.
- The Pages production/preview compatibility date was updated to `2026-10-01` during the transition.

## What was removed

The old ActivityPub/OpenID `webfinger` and `nodeinfo` endpoints were removed. This site no longer serves `/.well-known/webfinger` or `/.well-known/nodeinfo`.
