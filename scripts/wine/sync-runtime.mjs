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
        // MFC docked control bars can sit a pixel or two outside the client
        // rect (WordPad's toolbars start at x=2,y=40 while the client starts
        // at x=4,y=42). Union visible child controls that are inside the main
        // window so their top-left edge is not clipped.
        let childExpanded = false;
        for (const win of topLevels) {
          if (!win || win === main.win || !win.visible || !win.isChild || win.w <= 0 || win.h <= 0) continue;
          if (!win.clientRect) this._computeClientRect(win);
          const child = win.clientRect;
          if (!child || child.w <= 0 || child.h <= 0) continue;
          if ((child.x | 0) < (cr.x | 0) || (child.y | 0) < (cr.y | 0)) childExpanded = true;
          if (child.x < (cr.x | 0) - 8 || child.y < (cr.y | 0) - 8 ||
              (child.x | 0) + (child.w | 0) > (cr.x | 0) + (cr.w | 0) + 8 ||
              (child.y | 0) + (child.h | 0) > (cr.y | 0) + (cr.h | 0) + 8) continue;
          x0 = Math.min(x0, child.x | 0);
          y0 = Math.min(y0, child.y | 0);
          x1 = Math.max(x1, (child.x | 0) + (child.w | 0));
          y1 = Math.max(y1, (child.y | 0) + (child.h | 0));
        }
        if (childExpanded) {
          x0 = Math.max(0, x0 - 2);
          y0 = Math.max(0, y0 - 2);
          x1 += 2;
          y1 += 2;
        }
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

function patchBrowserShell() {
  const shellPath = path.join(publicWineRoot, 'lib/browser-shell.js');
  let shell = fs.readFileSync(shellPath, 'utf8');
  if (shell.includes('PANTS_SHARED_FS')) return;

  const launchAnchor = '      if (app.exeBytes) {\n        const vfs = wine._helpCtx && wine._helpCtx.vfs;';
  if (!shell.includes(launchAnchor)) {
    throw new Error('Wine browser-shell patch: app.exeBytes anchor not found');
  }

  const mount = `      // PANTS_SHARED_FS: the parent page owns the persistent C:\\ drive.
      // Mount its snapshot before the EXE is loaded, then journal guest writes
      // back through window.pantsFS so Explorer and Wine share one filesystem.
      if (window.pantsFS && window.VfsOverlay && wine._helpCtx && wine._helpCtx.vfs) {
        try {
          const sharedVfs = wine._helpCtx.vfs;
          const shared = await window.pantsFS.mount(sharedVfs);
          wine._pantsFsOverlay = window.VfsOverlay.attach(sharedVfs, {
            store: window.pantsFS.store,
            drives: ['c'],
            log: message => { log.textContent += \`\${message}\\n\`; },
          });
          wine._pantsFsFlushTimer = setInterval(() => {
            if (!wine._pantsFsOverlay) return;
            wine._pantsFsOverlay.flush().then(result => {
              if (result && result.written) {
                log.textContent += \`Shared C: saved \${result.written} file(s)\\n\`;
              }
            }).catch(() => {});
          }, 5000);
          log.textContent += \`Mounted shared C: (\${shared.files || 0} files)\\n\`;
          for (const warning of shared.warnings || []) log.textContent += \`\${warning}\\n\`;
        } catch (error) {
          log.textContent += \`Shared C: unavailable: \${(error && error.message) || error}\\n\`;
        }
      }

`;

  shell = shell.replace(launchAnchor, mount + launchAnchor);

  const stopAnchor = '    function stopRunningApp(running, repaint) {\n' +
    '      if (!running || !running.wine) return;\n' +
    '      if (running.wine._vfsPersistence) running.wine._vfsPersistence.flush();';
  if (!shell.includes(stopAnchor)) {
    throw new Error('Wine browser-shell patch: stopRunningApp anchor not found');
  }

  const stop = `${stopAnchor}
      // PANTS_SHARED_FS: stop the periodic writer and flush the final batch
      // before the guest filesystem is torn down.
      if (running.wine._pantsFsFlushTimer) {
        clearInterval(running.wine._pantsFsFlushTimer);
        running.wine._pantsFsFlushTimer = null;
      }
      if (running.wine._pantsFsOverlay) {
        const sharedOverlay = running.wine._pantsFsOverlay;
        running.wine._pantsFsOverlay = null;
        sharedOverlay.detach().catch(() => {});
      }`;

  shell = shell.replace(stopAnchor, stop);
  fs.writeFileSync(shellPath, shell);
}

function patchBrowserInput() {
  const inputPath = path.join(publicWineRoot, 'lib/browser-input.js');
  let input = fs.readFileSync(inputPath, 'utf8');
  if (input.includes('PANTS_DOUBLE_CLICK')) return;

  const anchor = 'renderer.handleMouseDown(cx, cy, e.button, { ctrlKey: e.ctrlKey, shiftKey: e.shiftKey });';
  if (!input.includes(anchor)) {
    throw new Error('Wine browser-input patch: mouseDown anchor not found');
  }
  // PANTS_DOUBLE_CLICK: carry the browser's click count into the guest so
  // common dialogs receive WM_LBUTTONDBLCLK and can navigate listbox folders.
  input = input.replace(
    anchor,
    '/* PANTS_DOUBLE_CLICK */ renderer.handleMouseDown(cx, cy, e.button, { ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, doubleClick: e.detail > 1 });',
  );
  fs.writeFileSync(inputPath, input);
}

export function syncRuntime() {
  fs.mkdirSync(publicWineRoot, { recursive: true });

  for (const file of ['host.js', 'sw-coi.js', 'manifest.webmanifest']) {
    fs.copyFileSync(path.join(wineRoot, file), path.join(publicWineRoot, file));
  }

  copyTree(path.join(wineRoot, 'lib'), path.join(publicWineRoot, 'lib'));
  patchRenderer();
  patchBrowserShell();
  patchBrowserInput();
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
