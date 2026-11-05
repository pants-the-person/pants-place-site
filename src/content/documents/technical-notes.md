---
title: Technical Notes
description: How the desktop, VM, MIDI player and media pipeline work.
updated: 11/04/1998 09:42 AM
---

TECHNICAL NOTES
===============

SHELL
-----
The desktop, window manager, taskbar and Start menu are a single Preact
island on top of Astro. Windows are draggable, resizable, minimizable and
stack by focus. Settings persist in localStorage.

FREEDOS
-------
The MS-DOS Prompt embeds v86, an x86 PC emulator compiled to WebAssembly.
It boots the 720 KB FreeDOS 7.10 boot image from public/v86. This is a
real virtual machine: commands, memory and programs all run in the guest.

Try: VER, DIR, MEM, CLS, INVADERS, SNAKE, TETRIS.

WINAMP
------
Playlist entries come from public/media. Drop in .mid, .midi, .ogg or
.oga files and restart the dev server (or rebuild).

MIDI playback uses spessasynth_lib with the TimGM6mb General MIDI
SoundFont. OGG playback uses the Web Audio API. Both share the same
10-band EQ and spectrum analyser.

INTERNET EXPLORER
-----------------
The browser frame loads real Astro routes under /web. A small address map
translates fake 1998 URLs such as http://www.pants.place/ into those
routes. The fake web is static, crawlable and works without the desktop.

MEDIA
-----
public/media/
  pants-theme.mid
  dialup-blues.mid
  overdrive-486.mid
  chiptune-c64.ogg

See README.md in that folder for credits and instructions.

MATRIX
------
Matrix discovery at /.well-known/matrix/* is served by the separate
pants-place-well-known Cloudflare Worker. This site does not duplicate it.
