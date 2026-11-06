# Pants Place 98

A functional Windows 98-style desktop that runs entirely in the browser.

- **Astro 7 + Preact** shell with a real window manager, taskbar, Start menu, desktop icons, dialogs and persistent settings.
- **MS-DOS Prompt** running a real **FreeDOS 7.10** virtual machine in **v86 / WebAssembly**. Type `VER`, `DIR`, `MEM`, `INVADERS`, `SNAKE` or `TETRIS`.
- **Winamp 2.91** with the original base-skin sprites, playlist, 10-band EQ and spectrum analyser. Plays **MIDI** through a General MIDI SoundFont and **OGG/Opus/MP3/WAV** through the Web Audio API.
- **Internet Explorer 5** clone browsing a fake 1998 internet at `/web/` with news, a devlog, guestbook, webring, downloads and an AltaVista-style search. It can also browse archived real websites through **The Old Net**, with a year selector, URL tracking and Copy Link.
- **The Old Net Webring** with 223 scraped retro sites and a filter/random button.
- **Six personal sites** under `/member/` and `/char/`, each maintained and deployed independently as its own static Worker.
- **Explorer, Notepad, Paint, Minesweeper, Calculator, Display Properties and Help**.
- **Wine-Assembly** running 41 real Windows 98 programs and games from mirrored `.exe` files in a WebAssembly x86 emulator. Open them from **Start → Programs → Accessories**, **Games**, or **System Tools**.
- **Three VFS drives**: writable `C:` with the full Windows 98 mock tree, read-only `D:` backed by the R2 bucket, and read-only `A:` backed by the FreeDOS boot floppy. Explorer, Notepad and Wine share `C:`.
- **Explorer drag-and-drop / Open with Wine** for `.exe`, `.zip`, `.iso` and `.cue` media. Dropped files stay in the browser.
- Boot sequence, shutdown screen, BSOD easter egg, CRT filter, colour schemes (including Hot Dog Stand), wallpapers and system sounds.

## Run locally

Node **26.13.0** is required (`.nvmrc` / `nvm use`). Astro 7 requires at least Node 22.23.4.

```bash
git submodule update --init --recursive
npm install
npm run dev
```

Open <http://localhost:4321>.

> Use `nvm use` to select Node 26 from `.nvmrc`. The Workers Builds environment should set `NODE_VERSION=26.13.0`.

## Adding an app

The shell is app-agnostic. To add a program:

1. Create `src/components/apps/MyApp.tsx` with a default export that receives `AppProps` (`windowId`, `appProps`, `api`).
2. Add an `AppDefinition` to `src/kernel/app-registry.ts` with a lazy `component: () => import('../components/apps/MyApp')`, a size, an icon and a category.
3. Optionally add a `desktopShortcuts` entry or let it appear in the Start menu via `startMenu`.

Windows, taskbar buttons, focus, dragging and resizing are handled by the shell. Apps only render their body and call `api.close()`, `api.setTitle()`, `api.openApp()` or `api.dialog()`.

## VFS drives

Explorer exposes three drives, all resolved through the `worker/vfs.ts` API:

- **A:** is a read-only FAT12 view of the same `public/v86/freedos722.img` floppy that the FreeDOS/v86 VM boots from.
- **C:** is a writable Windows 98 mock tree. Explorer, Notepad, Paint and Wine-Assembly all read and write it.
- **D:** is the read-only R2 bucket binding (`VFS_BUCKET`).

- Implementation: `src/kernel/fs-layers.ts` mounts ZenFS layers at `/a`, `/c` and `/d`:
  - **OPFS** (`@zenfs/dom` `WebAccess`) is the writable C: layer.
  - **Worker-backed C: mock tree** (`/api/vfs/c/`) is the read-only base, with a direct `/vfs-static` fallback for local development.
  - **D:** is a read-only Fetch layer over `/api/vfs/d/` (the R2 binding).
  - **A:** is a read-only Fetch layer over `/api/vfs/a/`, with a browser-side FAT12 fallback for local development.
  - ZenFS `CopyOnWrite` overlays guarantee C: writes only ever land in OPFS. Edits to lower-layer files are copied up; deletes are persisted as journals in `pants-place-state`.
- Paths are mapped between `A:\`, `C:\`, `D:\` and ZenFS with a case-insensitive resolver, matching Windows behaviour. A: and D: are read-only in Explorer.
- `scripts/vfs/build-static-layer.mjs` generates the base `C:` tree from `src/content/documents`, `public/media`, shortcuts and system files. A marker in `C:\.pants\` stops the seed fallback from running twice.
- Metadata that is not part of a real file (Explorer `openWith`, icons, media ids, shortcut props) lives in `C:\.pants\meta.json`, merged with the generated static metadata manifest.
- Existing Notepad notes in `localStorage` (`pp98:note:*`) are migrated into `C:\My Documents` once.
- Wine integration: when a Wine app starts, `src/kernel/fs-bridge.ts` answers a snapshot request from the iframe, mounts those files into the guest's `VirtualFS`, and attaches `VfsOverlay`. Guest writes are journaled back to ZenFS every few seconds and when the app closes. `WINDOWS\TEMP`, `TEMP` and `WINDOWS\RECENT` are ignored, and a single Wine file is capped at 64 MB (256 MB total) to keep snapshot messages bounded.
- The `wine:fs-*` RPC channel is same-origin and only accepts messages from the Wine iframe. No file content leaves the browser.

ZenFS is LGPL-3.0-or-later; attribution and license links are in `THIRD_PARTY_NOTICES.md`. The build sets `keepNames` in `astro.config.ts` because ZenFS/memium registers struct types by class name at runtime.

### Worker routes

- `public/vfs-static/` is generated at build time from the current desktop seed.
- `worker/vfs.ts` exposes `/api/vfs/drives.json`, `/api/vfs/{a,c,d}/index.json` and `/api/vfs/{a,c,d}/<path>`. `/api/vfs/r2/*` remains as an alias for D:.
- The R2 binding is `VFS_BUCKET` in `wrangler.vfs.jsonc`; object keys map directly to D:\ paths. `VFS_SITE_ORIGIN` and `VFS_FLOPPY_URL` point the worker at the static C: mirror and the FreeDOS floppy image.
- Deploy it with:

```bash
npm run deploy:vfs
```

- `npm run deploy:all` deploys the site, the VFS Worker and the Old Net API Worker.
- Deleting a C: static file writes a persisted whiteout journal in OPFS rather than modifying the read-only layer.
- A future Cloudflare Access layer can be inserted between OPFS and the C: base layer by adding another `CopyOnWrite` mount and an access-scoped binding.


### MS-DOS C: drive

The FreeDOS terminal also gets a real `C:` drive built from the shared filesystem:

- `src/kernel/dos-drive.ts` uses **libmount** (MIT) to format a 64 MB FAT16 partition, write the current `C:\` tree into it, and attach it to v86 as the first hard disk while FreeDOS keeps booting from its floppy image.
- v86's `ide-write-end` event marks the image dirty. DOS writes are synced back to ZenFS after a short debounce, when the terminal closes, and on `pagehide`.
- DOS-created files appear in Explorer; deleting a file in DOS removes it from the shared drive. `WINDOWS\TEMP`, `TEMP`, and files over 8 MB are skipped.
- The terminal is a singleton so two VMs cannot write the same disk image at once.
- If the FAT image cannot be created, FreeDOS still boots normally and the status bar reports that `C:` is unavailable.

## Duplicate Windows programs

Native HTML5 duplicates are no longer exposed in the Start menu or on the desktop. The visible Notepad, Paint, Calculator, Minesweeper and WordPad entries are the Wine versions. **Winamp is native**: it uses the real Winamp 2.91 base-skin sprites and is the only Winamp launch target.

## Media

Winamp starts with the tracks in `public/media/` and accepts additional files through the playlist **ADD** button or drag-and-drop. Drop `.mid`, `.midi`, `.ogg`, `.oga`, `.opus`, `.mp3`, `.wav`, `.flac`, `.m4a` or `.aac` files into `public/media/` to include them in the build-time queue. Subfolders are supported.

`npm run wine:skin` extracts the base-skin sprites from the bundled `winamp.exe` into `public/wine/skin/`; `npm run smoke:winamp` runs the Playwright UI and drive checks.

The repo ships with three original demo MIDI files and one CC-licensed chiptune OGG. See `public/media/README.md` and `CREDITS.md`.

MIDI playback downloads `public/soundfonts/TimGM6mb.sf2` on first use; OGG playback decodes into an `AudioBuffer`.

## FreeDOS VM

The terminal uses v86 and the FreeDOS 7.10 720k boot image in `public/v86/`. It is lazy-loaded when the terminal is first opened. The VM is real: commands, memory and bundled DOS games run in the guest.

Files:

```text
public/v86/
├── v86.wasm
├── seabios.bin
├── vgabios.bin
└── freedos722.img
```

## Wine-Assembly

Wine-Assembly is a separate MIT-licensed project that runs original Windows `.exe` files on an x86 interpreter and Win32 implementation written in WebAssembly. Pants Place mirrors its runtime and the programs from its desktop app registry into a same-origin iframe at `/wine/`.

There is no separate Wine-Assembly launcher. Every mirrored program is listed under **Start → Programs** in Accessories, Games, or System Tools. Programs with native Pants Place equivalents are suffixed **(Wine)**.

- Source submodule: `vendor/wine-assembly` → https://github.com/vgrichina/berrry-wine
- Runtime output: `public/wine/` (generated, gitignored)
- App assets: `public/wine/binaries/`, `public/wine/test/binaries/`, `public/wine/packages/` (generated, gitignored)
- Generated registry: `src/generated/wine-apps.ts`
- Asset lock: `wine-assets.lock.json`

Prepare or refresh everything:

```bash
git submodule update --init --recursive
npm run wine:prepare
```

The compiler produces both `wine-assembly.wasm` and the trampoline-dispatch `wine-assembly.compat.wasm` from the submodule source. Assets larger than 20 MB are mirrored using Wine-Assembly's own `name.part000` convention so every static asset remains under Cloudflare's 25 MiB per-file limit.

`npm run build`, `npm run dev`, and `npm run deploy` call `scripts/wine/ensure.mjs`, which runs the full preparation only when the submodule or generated output is missing/stale.

### Excluded programs

The upstream desktop lists 46 programs. Pants Place deliberately does not mirror:

- `simcity2000_demo`
- `nfs2se_glide_demo`
- `nfs3_glide_demo`
- `moorhuhn`

Upstream documents these as published only at its own site owner's discretion. `halflife_uplink` is also omitted because every one of its installed assets currently returns 404 from the upstream host.

### Running your own files

Explorer's **Run with Wine...** button or a drag-and-drop onto an Explorer window accepts `.exe`, `.zip`, `.iso` and `.cue` bundles. The file is read by the browser, mounted into the guest's virtual filesystem, and launched through the same registry path as the built-in programs. Nothing is uploaded.

### Window chrome and menus

Wine programs open inside the normal Pants Place window frame. The guest program's own caption, borders, minimize/maximize/close buttons and menu bar are cropped out of the iframe; its menu bar is published through a small bridge and rendered in the Pants Place menu bar next to the host **Wine** menu.

- Guest `File`, `Edit`, `View`, `Game`, `Help`, and similar menus work as normal.
- **Wine** contains Restart, Full Screen, Open in Browser, About and Close Program.
- Programs with custom-drawn chrome (notably Winamp) keep their own skin, because those controls are part of the program's client pixels rather than a Win32 caption.
- Programs with no Win32 menu (Pinball, RollerCoaster Tycoon's game screen) show only the **Wine** menu.
- Guest dialogs still use their own window rectangle, so a modal dialog is never cropped.

### Licensing

The Wine-Assembly engine is MIT. The mirrored application binaries keep their own licenses and provenance; see `THIRD_PARTY_NOTICES.md` and the generated `public/wine/APP-SOURCES.md` (upstream's `test/binaries/SOURCES.md`).

## Fake internet

Every page under `src/pages/web/` is a real static Astro route. The IE window maps period-correct addresses such as `http://www.pantsplace.net/news/` to those routes, so the fake web is crawlable and works without the desktop.

Content lives in `src/content/web/` (news + blog collections). Documents shown in `C:\My Documents` live in `src/content/documents/`.

### Browsing The Old Net

Enter a real external address such as `www.winamp.com` in IE. It is fetched through The Old Net archive at the selected year and rendered in a same-origin `srcdoc` document, which lets IE:

- update the address bar as links inside the archived page are clicked
- keep Back/Forward history against the original URLs
- copy the current original URL with **Copy Link**
- fall back to a normal iframe document when an archived page uses framesets or cannot be safely rendered

The toolbar year selector defaults to **1998**. Archived pages are fetched through the same-origin `/api/oldnet/v2/get` API (deployed separately as the `pants-place-oldnet-api` Worker). That Worker fetches The Old Net once, strips scripts and inline handlers, and returns a response that Cloudflare caches at the edge for a year with `immutable`. Repeat views therefore don't reach The Old Net or rerun the Worker. If the API is unavailable, IE falls back to The Old Net's own CORS-enabled `/get` endpoint.

### Search

The AltaVista search page searches both:

- the local Pants Place index
- The Old Net archive via the cached `/api/oldnet/v2/find` endpoint

Archive result links route back through IE so the address bar stays in sync.

### Webring

`src/data/oldnet-webring.json` is a committed snapshot of the live The Old Net Webring, currently 223 members. Refresh it with:

```bash
npm run sync:webring
```

The webring page links members through The Old Net archive and supports filtering and a random-site button.

## Personal sites

The member and character homepages live in separate repositories and are
deployed as independent Cloudflare Workers. Each Worker serves an internal
`/sites/...` route; the public path is the desktop deep link:

```text
site-member-pants   -> https://github.com/pants-the-person/site-member-pants   -> /member/pants
site-member-kylie   -> https://github.com/pants-the-person/site-member-kylie   -> /member/kylie
site-member-shades  -> https://github.com/pants-the-person/site-member-shades  -> /member/shades
site-member-pip     -> https://github.com/pants-the-person/site-member-pip     -> /member/pip
site-char-chogi     -> https://github.com/pants-the-person/site-char-chogi     -> /char/chogi
site-char-jiroji    -> https://github.com/pants-the-person/site-char-jiroji    -> /char/jiroji
```

They are **not** git submodules and they are **not** built by this repository.
Each repository owns a `wrangler.jsonc` and is deployed as its own assets-only
Worker. The Worker is mounted under the internal `/sites/<kind>/<slug>/*`
namespace; the parent keeps the public `/member/<slug>` and `/char/<slug>` deep
links. A push to one subsite deploys only that Worker; the desktop does not
rebuild.

The parent keeps a checked-in description of each site in
`src/data/personal-sites.ts` for the Start menu, IE favorites, webring and
search. It contains only metadata (title, description, public path, internal
path, favorite flag), no site source.

Each site is an assets-only Astro build with
`base: "/sites/member/<slug>"` and
`assets.base_path: "/sites/member/<slug>"`, so Cloudflare serves the files at
the internal route without a Worker script:

```text
request:           /sites/member/pants/about/
asset served from: ./dist/about/index.html
```

Cloudflare route matching is most-specific-first, so:

```text
pants.place/sites/member/pants/*  -> pants-place-member-pants Worker
pants.place/*                     -> pants-place-site Worker (everything else)
```

`/member/<slug>` is a parent-owned desktop deep link. The parent generates a
launcher page there, proxies nested paths such as `/member/pants/about` to that
launcher with `_redirects`, and the launcher opens IE at the same fake address.
IE loads the actual content from `/sites/member/<slug>/...`, so the address bar
still reads `http://www.pants.place/member/pants/about/`.

`/members/<slug>` and `/users/<slug>` redirect to `/member/<slug>`. Old
`/web/member/...`, `/web/char/...` and `~pants`/`~kylie`/`~ultimateshades`
addresses redirect to the new paths.

The setup helper and full per-repository instructions live in
[`scripts/subsites/README.md`](scripts/subsites/README.md). The short version,
run from this repository against a subsite checkout:

```bash
node scripts/subsites/setup.mjs --dir ../site-member-pants --kind member --slug pants
```

That writes `wrangler.jsonc`, sets the Astro internal `base`, and rewrites
cross-site GitHub Pages links to `https://pants.place/sites/...`. Deploy the site
from its own repository with Cloudflare Workers Builds (`npm run build` then
`npx wrangler@4 deploy`) or the optional generated GitHub Actions workflow.

### Path-based desktop entry

Every site path is a desktop deep link:

```text
/member/pants
/member/pants/about
/member/kylie
/member/shades
/member/pip
/char/chogi
/char/jiroji
```

Visiting one of those paths renders the desktop and opens IE at the
corresponding fake address, for example `http://www.pants.place/member/pants/`.
Internal content stays at `/sites/member/pants/`, so the IE iframe never loads
the desktop inside itself.

Members also accept the original `/users/<name>` form, including nested pages:

```text
/users/pants
/users/pants/about
```

The IE homepage at `/web/` is a PantsNet start page: it explains the browser
controls, links the local webring, and places The Old Net Webring underneath it.

The old `~pants`, `~kylie` and `~ultimateshades` pages were removed. Their URLs
redirect to the new sites, and their Tripod/GeoCities aliases still resolve.

### Query-based autostart

`autostart` opens registered apps after the desktop boots:

```text
/?autostart=notepad.exe
/?autostart=notepad.exe,winamp.exe
/?autostart=notepad.exe&autostart=winamp.exe
/member/pants?autostart=winamp.exe
```

`.exe` names resolve to their Wine equivalents where one exists. Path autostart
and query autostart are independent and combine on the same URL.

### Adding a site

1. Create a repository named `site-<kind>-<slug>`.
2. Add its metadata to `src/data/personal-sites.ts`.
3. Add `/kind/slug/* /kind/slug/ 200` to `public/_redirects` for nested deep
   links.
4. Run `node scripts/subsites/setup.mjs --dir ../site-<kind>-<slug> --kind <kind> --slug <slug>`.
5. Deploy its Worker and verify `https://pants.place/<kind>/<slug>/` and
   `https://pants.place/sites/<kind>/<slug>/`.
6. Commit the metadata and redirect changes here.

Site authors can update and deploy their own repository without touching this
one. Because the parent no longer runs their `npm ci` or build scripts, a site
repository cannot execute code in the parent Cloudflare build or deployment.

## Deployment

The site is now a **Cloudflare Workers static-assets project** served on the `pants.place/*` route. The build is still static Astro output in `dist`.

- Build command: `npm run build`
- Deploy: `npm run deploy` (builds, then deploys the site Worker)
- Deploy everything: `npm run deploy:all` (site + archive API)
- Node: **26.13.0** (`.nvmrc`, `.node-version`, and `engines`)
- Compatibility date: **2026-10-01** in `wrangler.jsonc`
- Worker name: `pants-place-site`
- Route: `pants.place/*`

The archive API is a second Worker from the same repository:

- Config: `wrangler.api.jsonc`
- Source: `worker/oldnet.ts`
- Worker name: `pants-place-oldnet-api`
- Route: `pants.place/api/oldnet/*` (more specific than `pants.place/*`, so it wins for API paths)
- Cache: Cloudflare Workers Cache, one-year TTL for pages, five-minute TTL for search
- Deploy: `npm run deploy:api`
- Local: `npm run cf:preview:api`

The site Worker stays assets-only; adding `main`/Workers Cache to it would make static-asset requests billable.

The old Pages project still exists as a rollback target and currently provides the `pants.place` DNS/custom-domain anchor. The Worker route takes precedence for traffic. Do not delete the Pages custom domain or its DNS record without first attaching a Worker custom domain, or the route will have no hostname to serve.

For future Git-connected deployments, connect `pants-place-site` to the repo using Workers Builds in the Cloudflare dashboard (Cloudflare GitHub App is a one-time prerequisite). Build command `npm run build`, deploy command `npx wrangler deploy`, and set `NODE_VERSION=26.13.0` in the build environment. The Pages Git integration can then be disabled.

Matrix discovery at `/.well-known/matrix/*` is included in the Worker as static files with the correct CORS and JSON headers. The separate **pants-place-well-known** Worker route remains the canonical endpoint when deployed. See `DEPLOYMENT.md` for verification steps.

## Credits & licenses

See `THIRD_PARTY_NOTICES.md`. Windows 98, Internet Explorer and Winamp are trademarks of their respective owners. This is an unofficial fan project and is not affiliated with Microsoft, AOL/Nullsoft, or anyone else.

## License

The site code is released under the MIT license in `LICENSE`. Third-party assets keep their own licenses; see `THIRD_PARTY_NOTICES.md`.

## Scripts

- `npm run dev` — start the dev server
- `npm run build` — build `dist/`
- `npm run preview` — preview the build locally
- `npm run deploy` — build and deploy the site Worker
- `npm run deploy:api` — deploy the cached Old Net API Worker
- `npm run deploy:all` — deploy the site and API Workers
- `npm run cf:dry-run` — validate the site Worker/assets config without deploying
- `npm run cf:dry-run:api` — validate the API Worker config without deploying
- `npm run cf:preview` — run the site Worker locally with Wrangler
- `npm run cf:preview:api` — run the API Worker locally with Wrangler
- `npm run wine:prepare` — initialise the submodule, compile the wasm, mirror app assets and regenerate the Wine registry
- `npm run wine:assets` — refresh only the mirrored app assets
- `npm run wine:registry` — regenerate `src/generated/wine-apps.ts`
- `npm run wine:verify` — validate the asset mirror against `wine-assets.lock.json`
- `npm run wine:smoke` — Playwright check for the Start menu entries, two Wine windows, dropped `.exe`, and FreeDOS input isolation
- `npm run sync:webring` — refresh the scraped The Old Net Webring snapshot
- `npm run subsites:setup -- --dir <checkout> --kind <kind> --slug <slug>` — convert a personal-site repo into its own static Worker
- `npm run generate:media` — regenerate the demo MIDI files
- `npm run generate:og` — regenerate `public/og.png`

`scripts/smoke-wine.mjs` accepts `--all` to launch all 41 mirrored programs. `scripts/smoke-all.mjs` uses Playwright. Set `BASE_URL` to test a deployed URL; both default to `http://127.0.0.1:4321`.
