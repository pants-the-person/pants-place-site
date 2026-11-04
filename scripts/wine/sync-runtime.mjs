import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { projectRoot, wineRoot, publicWineRoot } from './config.mjs';

function copyTree(from, to, filter) {
  if (!fs.existsSync(from)) return;
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const src = path.join(from, entry.name);
    const dst = path.join(to, entry.name);
    if (filter && !filter(src, entry)) continue;
    if (entry.isDirectory()) copyTree(src, dst, filter);
    else if (entry.isFile()) {
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(src, dst);
    }
  }
}

function patchIndex(source, version) {
  let html = source;

  const queryLine = 'var q = new URLSearchParams(location.search);';
  if (!html.includes(queryLine)) throw new Error('Wine runtime index.html changed: query line not found');
  html = html.replace(
    queryLine,
    `${queryLine}\n      if (q.has('embed')) document.documentElement.classList.add('embed');`,
  );

  if (!html.includes('</head>')) throw new Error('Wine runtime index.html changed: no </head>');
  html = html.replace(
    '</head>',
    `  <meta name="robots" content="noindex">\n  <link rel="stylesheet" href="embed.css?v=${encodeURIComponent(version)}">\n</head>`,
  );

  html = html.replace(
    '<link rel="canonical" href="https://wine-assembly.berrry.app/">',
    '<link rel="canonical" href="https://pants.place/wine/">',
  );
  html = html.replace(
    '<title>Wine-Assembly — Run Windows 98 apps and games in your browser</title>',
    '<title>Wine-Assembly — Pants Place 98</title>',
  );

  if (!html.includes('</body>')) throw new Error('Wine runtime index.html changed: no </body>');
  html = html.replace('</body>', `  <script src="embed.js?v=${encodeURIComponent(version)}"></script>\n</body>`);
  return html;
}

function patchRenderer() {
  const rendererPath = path.join(publicWineRoot, 'lib/renderer.js');
  let renderer = fs.readFileSync(rendererPath, 'utf8');
  if (renderer.includes('PANTS_EMBED_CLIENT_CROP')) return;

  const anchor = '    // An open dropdown is painted straight onto the desktop canvas and can\n';
  if (!renderer.includes(anchor)) {
    throw new Error('Wine renderer patch: open-dropdown anchor not found');
  }

  const crop = `    // PANTS_EMBED_CLIENT_CROP: Pants Place owns the outer window frame and
    // menu bar. Present only the guest's client area so the guest caption,
    // close buttons, borders and menu bar cannot appear as a second window
    // inside ours. Dialogs and other top-level windows are still unioned in
    // below, so a modeless dialog is never cut off.
    const embedClientCrop = this.embedClientCrop === true ||
      (typeof location !== 'undefined' && new URLSearchParams(location.search).has('embed'));
    if (embedClientCrop && !this._exclusiveFullscreen) {
      let main = null;
      for (const win of topLevels) {
        if (!win || !win.visible || win.isChild || win.isDialog || win.w <= 0 || win.h <= 0) continue;
        if (String(win.className || '').toLowerCase() === 'progman') continue;
        if (!win.clientRect) this._computeClientRect(win);
        if (!win.clientRect || win.clientRect.w <= 0 || win.clientRect.h <= 0) continue;
        const area = (win.clientRect.w | 0) * (win.clientRect.h | 0);
        if (!main || area > main.area) main = { win, area };
      }
      if (main) {
        const cr = main.win.clientRect;
        x0 = cr.x | 0;
        y0 = cr.y | 0;
        x1 = (cr.x | 0) + (cr.w | 0);
        y1 = (cr.y | 0) + (cr.h | 0);
        for (const win of topLevels) {
          if (!win || win === main.win || !win.visible || win.isChild || win.w <= 0 || win.h <= 0) continue;
          if (String(win.className || '').toLowerCase() === 'progman') continue;
          x0 = Math.min(x0, win.x | 0);
          y0 = Math.min(y0, win.y | 0);
          x1 = Math.max(x1, (win.x | 0) + (win.w | 0));
          y1 = Math.max(y1, (win.y | 0) + (win.h | 0));
        }
      }
    }

`;

  renderer = renderer.replace(anchor, crop + anchor);
  fs.writeFileSync(rendererPath, renderer);
}

export function syncRuntime() {
  fs.mkdirSync(publicWineRoot, { recursive: true });

  for (const file of ['host.js', 'sw-coi.js', 'manifest.webmanifest']) {
    fs.copyFileSync(path.join(wineRoot, file), path.join(publicWineRoot, file));
  }

  copyTree(path.join(wineRoot, 'lib'), path.join(publicWineRoot, 'lib'));
  patchRenderer();
  copyTree(path.join(wineRoot, 'fonts'), path.join(publicWineRoot, 'fonts'));
  copyTree(path.join(wineRoot, 'icons'), path.join(publicWineRoot, 'icons'));
  copyTree(path.join(wineRoot, 'src'), path.join(publicWineRoot, 'src'), (src, entry) => {
    if (entry.isDirectory()) return true;
    return entry.name === 'api_table.json';
  });

  fs.mkdirSync(path.join(publicWineRoot, 'build'), { recursive: true });
  for (const file of ['wine-assembly.wasm', 'wine-assembly.compat.wasm']) {
    fs.copyFileSync(path.join(wineRoot, 'build', file), path.join(publicWineRoot, 'build', file));
  }

  const license = path.join(wineRoot, 'LICENSE');
  if (fs.existsSync(license)) {
    fs.copyFileSync(license, path.join(publicWineRoot, 'WINE-ASSEMBLY-LICENSE.txt'));
  }
  const sources = path.join(wineRoot, 'test/binaries/SOURCES.md');
  if (fs.existsSync(sources)) {
    fs.copyFileSync(sources, path.join(publicWineRoot, 'APP-SOURCES.md'));
  }

  fs.copyFileSync(path.join(projectRoot, 'src/wine/embed.css'), path.join(publicWineRoot, 'embed.css'));
  fs.copyFileSync(path.join(projectRoot, 'src/wine/embed.js'), path.join(publicWineRoot, 'embed.js'));

  let sha = 'unknown';
  try {
    sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: wineRoot, encoding: 'utf8' }).trim();
  } catch {
    /* source archive without .git */
  }
  const hash = crypto.createHash('sha256')
    .update(fs.readFileSync(path.join(publicWineRoot, 'build/wine-assembly.wasm')))
    .update(fs.readFileSync(path.join(publicWineRoot, 'build/wine-assembly.compat.wasm')))
    .update(fs.readFileSync(path.join(publicWineRoot, 'embed.js')))
    .digest('hex')
    .slice(0, 12);
  const version = `${sha}+${hash}`;

  const index = fs.readFileSync(path.join(wineRoot, 'index.html'), 'utf8');
  fs.writeFileSync(path.join(publicWineRoot, 'index.html'), patchIndex(index, version));

  fs.writeFileSync(
    path.join(publicWineRoot, 'build-info.js'),
    `// Generated by Pants Place scripts/wine/sync-runtime.mjs\nwindow.WINE_BUILD = ${JSON.stringify(version)};\n`,
  );
  fs.writeFileSync(
    path.join(publicWineRoot, 'version.json'),
    JSON.stringify({ source: 'https://github.com/vgrichina/berrry-wine', commit: sha, build: version }, null, 2) + '\n',
  );

  return { commit: sha, version };
}
