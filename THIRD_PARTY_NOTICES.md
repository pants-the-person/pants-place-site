# Third-party notices

Pants Place 98 is an unofficial fan project. The following third-party works are used or redistributed by this repository.

## Runtime libraries

- **Astro** — MIT — https://astro.build
- **Preact** — MIT — https://preactjs.com
- **@preact/signals** — MIT — https://github.com/preactjs/signals
- **98.css** — MIT — https://github.com/jdan/98.css (base control styling; the Pixelated MS Sans Serif webfont is included under its MIT license)
- **v86** — BSD-2-Clause — https://github.com/copy/v86
- **spessasynth_lib** — Apache-2.0 — https://github.com/spessasus/spessasynth_lib
- **@fontsource/vt323** — OFL-1.1 — https://fontsource.org/fonts/vt323
- **libmount** — MIT — https://github.com/vip-delete/libmount. Used to build and read the FAT16 disk image mounted as `C:` in the FreeDOS terminal.
- **ZenFS (`@zenfs/core`, `@zenfs/dom`)** — LGPL-3.0-or-later — https://zenfs.dev · https://github.com/zen-fs/core · https://www.npmjs.com/package/@zenfs/core

  ZenFS, Licensed under the LGPL 3.0 or later and COPYING.md, Copyright © James Prevett and other ZenFS contributors.

  Pants Place bundles an unmodified, minified build of ZenFS for its IndexedDB-backed `C:\` drive. ZenFS is used as a separate library under the LGPL's web-application exception: the site is accessed over a network, and its Corresponding Source is available at the repository links above (the library itself is not modified). License and copying terms: https://github.com/zen-fs/core/blob/main/COPYING.md and https://www.gnu.org/licenses/lgpl-3.0.html.

## Icons

- **React95 icons** — MIT — https://github.com/react95-io/React95. A curated subset of the SVG icon set is copied into `public/icons/`.

## Fonts

- **Pixelated MS Sans Serif** — MIT, from 98.css. Files: `public/fonts/ms_sans_serif*.woff2`.
- **Px437 IBM VGA 8x16** — CC BY-SA 4.0, from The Ultimate Oldschool PC Font Pack (int10h.org). File: `public/fonts/Px437_IBM_VGA_8x16.ttf`.

## Emulator assets

- **v86 wasm build** — BSD-2-Clause. See `public/v86/V86-LICENSE.txt`.
- **SeaBIOS** — LGPL-3.0 — https://github.com/copy/v86/tree/master/bios (binary `public/v86/seabios.bin`).
- **SeaVGABIOS** — LGPL-3.0 — https://github.com/copy/v86/tree/master/bios (binary `public/v86/vgabios.bin`).
- **FreeDOS 7.10 boot image** — FreeDOS is GPL-2.0. Image source: https://copy.sh/v86/images/freedos722.img. The FreeDOS project: https://www.freedos.org. GPL text: `public/v86/GPL-2.0.txt`.

## The Old Net

- **The Old Net** — https://theoldnet.com — a public frontend for the Internet Archive Wayback Machine. Pants Place uses its `/get` proxy to render archived pages and its `/find` search endpoint for archive results. A first-party Worker (`pants-place-oldnet-api`, `worker/oldnet.ts`) fetches archived pages on demand, strips active content, and lets Cloudflare cache the sanitized result for up to a year, which reduces repeat load on The Old Net. The Worker sends a browser User-Agent because the origin deflects obvious bots. The Old Net's own terms describe personal use as free; this site attributes and links the service.
- **Internet Archive Wayback Machine** — https://archive.org/web/ — archived page content and assets are served by The Old Net from the Internet Archive. Archived sites retain their original copyright and terms.
- **The Old Net Webring** — https://webring.theoldnet.com/ — member names, URLs and descriptions are scraped into `src/data/oldnet-webring.json`. The webring is attributed and linked on the local `/web/webring/` page.

## Wine-Assembly

- **Wine-Assembly** — MIT, Copyright (c) 2026 Vladimir Grichina — https://github.com/vgrichina/berrry-wine. The runtime, host JavaScript, fonts/icons and compiled wasm are mirrored under `public/wine/`. License: `public/wine/WINE-ASSEMBLY-LICENSE.txt`.
- **WATX compiler and vendored emulator sources** — see the upstream repository and `public/wine/WINE-ASSEMBLY-LICENSE.txt`.
- **Application binaries** — the mirrored Windows programs and games are third-party works. Their provenance, source archives and redistribution notes are recorded in upstream's `test/binaries/SOURCES.md`, mirrored as `public/wine/APP-SOURCES.md`, and summarized below.

### Mirrored Windows programs

Pants Place exposes 41 programs from Wine-Assembly's desktop registry. The following are the non-Microsoft titles that need particular attribution:

- **Best of Windows Entertainment Pack rebuilds** (Cruel, FreeCell, Golf, Pegged, Reversi, SkiFree, Rattler Race, Solitaire, Taipei, TicTactics, Minesweeper) — 32-bit PE rebuilds from the Internet Archive's `BestOfWindowsEntertainmentPack64Bit` item.
- **Rodent's Revenge, JezzBall and the Win16 WEP games** — Microsoft Entertainment Pack / Windows Entertainment Pack 16-bit builds, as documented upstream.
- **DX-Ball** — Michael P. Welch / freeware distribution.
- **Blobby Volley** — freeware, see `packages/freeware/blobby-volley/Instructions.txt`.
- **Winamp 2.91** — Nullsoft; upstream ships the freely redistributable player build.
- **RollerCoaster Tycoon shareware** — Chris Sawyer / Hasbro Interactive shareware distribution.
- **StarCraft Demo** — Blizzard Entertainment. Upstream notes Blizzard permits non-commercial mirroring of unmodified demos when every original file remains present; the full original payload and license files are kept.
- **Diablo Shareware** — Blizzard Entertainment. The shareware installation and its manual are kept; retail CD data is not included.
- **Heroes of Might and Magic II Demo** — New World Computing / 3DO. Its `license.txt` permits giving copies away for free, provided they are not sold.
- **Quake II Demo** — id Software. Distributed under id's Limited Use Software Demo License, which permits free electronic distribution when the license accompanies the software; `DOCS/license.txt` is mounted with the game.
- **Quake III Arena Demo** — id Software. Original 1.11 demo, including its bundled EULA and documentation.

The following upstream desktop titles are deliberately **not** mirrored: **SimCity 2000 Demo**, **Need for Speed II SE Demo**, **Need for Speed III Demo** and **Moorhuhn**. Upstream records these as published at its own site owner's discretion. **Half-Life: Uplink Demo** is also omitted because its installed payload is not published by the upstream host.

## Audio

- **TimGM6mb SoundFont** — GPL-2.0, Copyright 2004 Tim Brechbill, 2010 David Bolton. From Debian's `timgm6mb-soundfont` package. File: `public/soundfonts/TimGM6mb.sf2`. GPL text: `public/soundfonts/GPL-2.0.txt`.
- **"Skiessi - C64"** — CC BY 3.0, by Skiessi, via Wikimedia Commons. File: `public/media/chiptune-c64.ogg`.
- Demo MIDI files `pants-theme.mid`, `dialup-blues.mid`, `overdrive-486.mid` are original compositions generated for this project.

## Trademarks

Windows 98, Internet Explorer, Microsoft, Winamp, Nullsoft, GeoCities, Tripod, and all other marks are the property of their respective owners. This project is a parody/homage and is not affiliated with or endorsed by any of them.

## Fonts and generated media

The MIT-licensed code of this repo does not relicense the third-party assets above. If you redistribute the built site, keep the notice files and license texts in `public/`.
