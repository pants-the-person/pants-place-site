# Pants Place 98

A functional Windows 98-style desktop that runs entirely in the browser.

- **Astro 7 + Preact** shell with a real window manager, taskbar, Start menu, desktop icons, dialogs and persistent settings.
- **MS-DOS Prompt** running a real **FreeDOS 7.10** virtual machine in **v86 / WebAssembly**. Type `VER`, `DIR`, `MEM`, `INVADERS`, `SNAKE` or `TETRIS`.
- **Winamp 2.8** clone with playlist, 10-band EQ and spectrum analyser. Plays **MIDI** through a General MIDI SoundFont and **OGG** through the Web Audio API.
- **Internet Explorer 4** clone browsing a fake 1998 internet at `/web/` with news, a devlog, guestbook, webring, downloads and an AltaVista-style search.
- **Explorer, Notepad, Paint, Minesweeper, Calculator, Display Properties and Help**.
- **Wine-Assembly** running 41 real Windows 98 programs and games from mirrored `.exe` files in a WebAssembly x86 emulator. Open it from the desktop, Start menu or `Program Files\Wine-Assembly`.
- **Explorer drag-and-drop / Open with Wine** for `.exe`, `.zip`, `.iso` and `.cue` media. Dropped files stay in the browser.
- Boot sequence, shutdown screen, BSOD easter egg, CRT filter, colour schemes (including Hot Dog Stand), wallpapers and system sounds.

## Run locally

Node **26.13.0** is required (`.nvmrc` / `nvm use`). Astro 7 requires at least Node 22.23.4.

```bash
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

## Media

Drop `.mid`, `.midi`, `.ogg` or `.oga` files into `public/media/`. The Winamp playlist is generated from that folder at build time and watched while the dev server is running. Subfolders are supported.

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

### Licensing

The Wine-Assembly engine is MIT. The mirrored application binaries keep their own licenses and provenance; see `THIRD_PARTY_NOTICES.md` and the generated `public/wine/APP-SOURCES.md` (upstream's `test/binaries/SOURCES.md`).

## Fake internet

Every page under `src/pages/web/` is a real static Astro route. The IE window maps period-correct addresses such as `http://www.pantsplace.net/news/` to those routes, so the fake web is crawlable and works without the desktop.

Content lives in `src/content/web/` (news + blog collections). Documents shown in `C:\My Documents` live in `src/content/documents/`.

## Deployment

The site is now a **Cloudflare Workers static-assets project** served on the `pants.place/*` route. The build is still static Astro output in `dist`.

- Build command: `npm run build`
- Deploy: `npm run deploy` (runs the build, then `wrangler deploy`)
- Node: **26.13.0** (`.nvmrc`, `.node-version`, and `engines`)
- Compatibility date: **2026-10-01** in `wrangler.jsonc`
- Worker name: `pants-place-site`
- Route: `pants.place/*`

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
- `npm run deploy` — build and deploy the Worker
- `npm run cf:dry-run` — validate the Worker/assets config without deploying
- `npm run cf:preview` — run the Worker locally with Wrangler
- `npm run wine:prepare` — initialise the submodule, compile the wasm, mirror app assets and regenerate the Wine registry
- `npm run wine:assets` — refresh only the mirrored app assets
- `npm run wine:registry` — regenerate `src/generated/wine-apps.ts`
- `npm run wine:verify` — validate the asset mirror against `wine-assets.lock.json`
- `npm run wine:smoke` — Playwright check for the launcher, two Wine windows, dropped `.exe`, and FreeDOS input isolation
- `npm run generate:media` — regenerate the demo MIDI files
- `npm run generate:og` — regenerate `public/og.png`

`scripts/smoke-wine.mjs` accepts `--all` to launch all 41 mirrored programs. `scripts/smoke-all.mjs` uses Playwright. Set `BASE_URL` to test a deployed URL; both default to `http://127.0.0.1:4321`.
