/*
 * Bridge between a Pants Place Wine window (the parent page) and the
 * Wine-Assembly runtime inside the iframe.
 *
 * The iframe is same-origin, so the parent can post real File objects here.
 * Nothing about dropped media is uploaded: mediaImport reads the File in this
 * document and mounts it into the guest's virtual filesystem.
 */
(function () {
  const params = new URLSearchParams(location.search);
  if (!params.has('embed')) return;

  const host = window.parent;
  const sameWindow = host === window;
  const directApp = params.get('app');
  const dropMode = params.has('drop');

  document.documentElement.classList.add('embed');

  function post(type, payload) {
    if (sameWindow) return;
    try {
      host.postMessage(Object.assign({ type }, payload || {}), location.origin);
    } catch {
      /* a closing window is not an error */
    }
  }

  function statusText() {
    const status = document.getElementById('status');
    if (status && status.textContent) return status.textContent.trim();
    if (window.wineShell && window.wineShell.launchInFlight) return 'Loading...';
    return '';
  }

  // ------------------------------------------------------------- shared C:\
  // The parent document owns the persistent ZenFS C:\ drive. This iframe asks
  // for a snapshot when an app launches and journals guest writes back through
  // the same RPC channel, so Explorer, Notepad, Paint and every Wine program
  // see one filesystem instead of separate copies.
  let fsSeq = 0;
  const fsPending = new Map();

  function fsRequest(type, payload) {
    return new Promise((resolve, reject) => {
      if (sameWindow) {
        reject(new Error('The shared C: drive is unavailable in this window.'));
        return;
      }
      const id = ++fsSeq;
      const timer = setTimeout(() => {
        fsPending.delete(id);
        reject(new Error('The shared C: drive did not respond.'));
      }, 60000);
      fsPending.set(id, { resolve, reject, timer });
      try {
        host.postMessage(Object.assign({ type, id }, payload || {}), location.origin);
      } catch (error) {
        clearTimeout(timer);
        fsPending.delete(id);
        reject(error);
      }
    });
  }

  function fsResult(data) {
    const pending = fsPending.get(data.id);
    if (!pending) return;
    fsPending.delete(data.id);
    clearTimeout(pending.timer);
    if (data.error) pending.reject(new Error(String(data.error)));
    else pending.resolve(data);
  }

  function mountRecords(vfs, records) {
    let files = 0;
    for (const record of records || []) {
      if (!record || typeof record.path !== 'string') continue;
      const path = record.path.toLowerCase();
      if (!/^c:\\/.test(path)) continue;
      // Wine's own system files and the app's mounted data already exist at
      // this point. They win over the cosmetic Pants Place seed so a fake
      // WIN.INI cannot change how a program boots. User-created paths are new
      // and therefore mount normally.
      if (vfs.files.has(path)) continue;
      if (record.kind === 'dir') {
        vfs.dirs.add(path);
        if (vfs.ensureParentDirs) vfs.ensureParentDirs(path);
      } else if (record.kind === 'file' && record.data) {
        const data = record.data instanceof Uint8Array
          ? record.data
          : new Uint8Array(record.data);
        vfs.files.set(path, { data, attrs: (record.attrs >>> 0) || 0x20 });
        if (vfs.ensureParentDirs) vfs.ensureParentDirs(path);
        files++;
      }
    }
    return files;
  }

  window.pantsFS = {
    request: fsRequest,
    async snapshot() {
      return fsRequest('wine:fs-snapshot');
    },
    async read(path) {
      const result = await fsRequest('wine:fs-read', { path });
      if (!result.data) return null;
      return result.data instanceof Uint8Array ? result.data : new Uint8Array(result.data);
    },
    async mount(vfs) {
      const snapshot = await fsRequest('wine:fs-snapshot');
      const records = snapshot.records || [];
      const files = mountRecords(vfs, records);
      return {
        files,
        entries: records.length,
        warnings: snapshot.warnings || [],
      };
    },
    store: {
      kind: 'pants-place',
      async list() {
        const snapshot = await fsRequest('wine:fs-snapshot');
        return (snapshot.records || []).map((record) => ({
          path: record.path,
          kind: record.kind,
          name: record.name,
          attrs: record.attrs || 0,
          size: record.size || (record.data ? record.data.length : 0),
        }));
      },
      async read(path) {
        const result = await fsRequest('wine:fs-read', { path });
        return result.data || null;
      },
      async writeBatch(records) {
        const result = await fsRequest('wine:fs-write', { records: records || [] });
        return { written: result.written || 0, removed: result.removed || 0 };
      },
      async remove(path) {
        await fsRequest('wine:fs-write', {
          records: [{ path, kind: 'whiteout' }],
        });
      },
    },
  };

  function flushSharedFiles() {
    const shell = window.wineShell;
    const apps = (shell && shell.runningApps) || [];
    for (const running of apps) {
      const overlay = running && running.wine && running.wine._pantsFsOverlay;
      if (!overlay) continue;
      try {
        overlay.flush();
      } catch {
        /* the page is going away */
      }
    }
  }

  window.addEventListener('pagehide', flushSharedFiles);
  window.addEventListener('beforeunload', flushSharedFiles);

  let ready = false;
  let lastStatus = '';
  let lastRunning = false;
  let lastMenuJson = '';
  let menuPollTimer = null;

  function menuContext() {
    const shell = window.wineShell;
    const wine = shell && shell.currentWine;
    if (!wine) return null;
    const renderer = wine.renderer;
    let win = null;
    let bestArea = -1;
    if (renderer && renderer.windows) {
      for (const candidate of Object.values(renderer.windows)) {
        if (!candidate || !candidate.visible || candidate.isChild || candidate.isDialog) continue;
        if (candidate.w <= 0 || candidate.h <= 0) continue;
        const exports = (candidate.wasm || wine).exports;
        if (!exports || !exports.menu_bar_count) continue;
        if (renderer._ensureWatMenu) {
          try { renderer._ensureWatMenu(candidate); } catch { /* not ready */ }
        }
        try {
          if ((exports.menu_bar_count(candidate.hwnd) | 0) <= 0) continue;
        } catch {
          continue;
        }
        const area = (candidate.w | 0) * (candidate.h | 0);
        if (area > bestArea) {
          bestArea = area;
          win = candidate;
        }
      }
    }
    if (!win) win = shell.firstTopLevelWindow ? shell.firstTopLevelWindow(wine) : null;
    if (!win) return null;
    const wasm = win.wasm || wine;
    const exports = wasm && wasm.exports;
    const memory = wine.memory || (exports && exports.memory);
    if (!exports || !memory || !exports.menu_bar_count) return null;
    if (renderer && renderer._ensureWatMenu) {
      try { renderer._ensureWatMenu(win); } catch { /* menu may not have loaded yet */ }
    }
    return { wine, win, exports, memory };
  }

  function menuString(memory, ptr, len) {
    if (!ptr || !len || len < 0 || len > 8192) return '';
    try {
      const view = new Uint8Array(memory.buffer, ptr, len);
      const bytes = new Uint8Array(len);
      bytes.set(view);
      return new TextDecoder('windows-1252')
        .decode(bytes)
        .replace(/&&/g, '\u0000')
        .replace(/&/g, '')
        .replace(/\u0000/g, '&')
        .trim();
    } catch {
      return '';
    }
  }

  function menuFlags(flags) {
    return {
      separator: !!(flags & 0x01),
      disabled: !!(flags & 0x02),
      checked: !!(flags & 0x04),
    };
  }

  function snapshotMenu(force = false) {
    const ctx = menuContext();
    if (!ctx) {
      if (force || lastMenuJson !== '[]') {
        lastMenuJson = '[]';
        post('wine:menu', { hwnd: 0, menus: [] });
      }
      return;
    }
    const { win, exports: e, memory } = ctx;
    const hwnd = win.hwnd | 0;
    const count = e.menu_bar_count(hwnd) | 0;
    const menus = [];
    for (let top = 0; top < count; top++) {
      const label = menuString(
        memory,
        e.menu_bar_label_ptr(hwnd, top) | 0,
        e.menu_bar_label_len(hwnd, top) | 0,
      );
      if (!label) continue;
      const topId = e.menu_bar_id(hwnd, top) | 0;
      const childCount = e.menu_child_count(hwnd, top) | 0;
      const items = [];
      for (let child = 0; child < childCount; child++) {
        const flags = e.menu_child_flags(hwnd, top, child) | 0;
        const id = e.menu_child_id(hwnd, top, child) | 0;
        const state = menuFlags(flags);
        const item = {
          label: menuString(
            memory,
            e.menu_child_label_ptr(hwnd, top, child) | 0,
            e.menu_child_label_len(hwnd, top, child) | 0,
          ),
          shortcut: menuString(
            memory,
            e.menu_child_shortcut_ptr(hwnd, top, child) | 0,
            e.menu_child_shortcut_len(hwnd, top, child) | 0,
          ),
          id,
          ...state,
        };
        if (!item.separator && !item.label) item.label = `Item ${id || child + 1}`;
        const subCount = e.menu_child_sub_count(hwnd, top, child) | 0;
        if (subCount > 0) {
          const children = [];
          for (let sub = 0; sub < subCount; sub++) {
            const subFlags = e.menu_subchild_flags(hwnd, top, child, sub) | 0;
            const subId = e.menu_subchild_id(hwnd, top, child, sub) | 0;
            const subState = menuFlags(subFlags);
            const subItem = {
              label: menuString(
                memory,
                e.menu_subchild_label_ptr(hwnd, top, child, sub) | 0,
                e.menu_subchild_label_len(hwnd, top, child, sub) | 0,
              ),
              id: subId,
              ...subState,
            };
            if (!subItem.separator && !subItem.label) subItem.label = `Item ${subId || sub + 1}`;
            children.push(subItem);
          }
          item.children = children;
        }
        items.push(item);
      }
      menus.push({
        top,
        label,
        id: topId,
        items,
      });
    }
    const json = JSON.stringify(menus);
    if (force || json !== lastMenuJson) {
      lastMenuJson = json;
      post('wine:menu', { hwnd, menus });
    }
  }

  async function handleMenuCommand(data) {
    const ctx = menuContext();
    if (!ctx) return;
    const hwnd = (data.hwnd | 0) || (ctx.win.hwnd | 0);
    const e = ctx.exports;
    const top = data.top | 0;
    if (data.child == null) {
      e.menu_activate_bar_command(hwnd, top);
    } else {
      e.menu_open(hwnd, top);
      // menu_open posts WM_INITMENU/WM_INITMENUPOPUP; give the guest a slice
      // to refresh dynamic labels and enable/check states before activating.
      await new Promise((resolve) => setTimeout(resolve, 120));
      e.menu_set_hover(data.child | 0);
      if (data.sub != null && e.menu_set_sub_hover) e.menu_set_sub_hover(data.sub | 0);
      const id = e.menu_activate() | 0;
      if (!id && e.menu_close) e.menu_close();
    }
    lastMenuJson = '';
    setTimeout(() => snapshotMenu(true), 250);
  }

  function startMenuPolling() {
    if (menuPollTimer) return;
    menuPollTimer = setInterval(() => {
      if (window.wineShell && window.wineShell.runningApps && window.wineShell.runningApps.length) {
        snapshotMenu(false);
        publishMetrics(false);
      }
    }, 500);
  }

  let lastMetricsJson = '';

  function publishMetrics(force = false) {
    const shell = window.wineShell;
    const wine = shell && shell.currentWine;
    const renderer = wine && wine.renderer;
    if (!wine || !renderer) return;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const win of Object.values(renderer.windows || {})) {
      if (!win || !win.visible || win.isChild || win.isDialog || win.w <= 0 || win.h <= 0) continue;
      if (String(win.className || '').toLowerCase() === 'progman') continue;
      if (renderer._computeClientRect) {
        try { renderer._computeClientRect(win); } catch { /* not ready */ }
      }
      const rect = win.clientRect;
      if (!rect || rect.w <= 0 || rect.h <= 0) continue;
      x0 = Math.min(x0, rect.x | 0);
      y0 = Math.min(y0, rect.y | 0);
      x1 = Math.max(x1, (rect.x | 0) + (rect.w | 0));
      y1 = Math.max(y1, (rect.y | 0) + (rect.h | 0));
    }
    if (!Number.isFinite(x0) || !Number.isFinite(y0)) return;
    const metrics = { width: Math.max(1, x1 - x0), height: Math.max(1, y1 - y0) };
    const json = JSON.stringify(metrics);
    if (!force && json === lastMetricsJson) return;
    lastMetricsJson = json;
    post('wine:metrics', metrics);
  }

  function publishStatus(force) {
    const text = statusText();
    if (force || text !== lastStatus) {
      lastStatus = text;
      post('wine:status', { text });
    }
    const running = Boolean(window.wineShell && window.wineShell.runningApps && window.wineShell.runningApps.length);
    if (running !== lastRunning) {
      lastRunning = running;
      post(running ? 'wine:running' : 'wine:stopped');
      if (running) {
        startMenuPolling();
        setTimeout(() => snapshotMenu(true), 500);
        setTimeout(() => publishMetrics(true), 600);
      } else {
        lastMenuJson = '[]';
        post('wine:menu', { hwnd: 0, menus: [] });
      }
    }
  }

  function publishError(message) {
    if (!message) return;
    post('wine:error', { message: String(message) });
  }

  function watchLaunchError() {
    const launch = document.querySelector('.wa-launch');
    if (!launch) return;
    const observer = new MutationObserver(() => {
      if (!launch.classList.contains('wa-launch-error')) return;
      const heading = launch.querySelector('.wa-launch-heading');
      const status = launch.querySelector('.wa-launch-status');
      const text = [heading && heading.textContent, status && status.textContent]
        .filter(Boolean).join(': ').trim();
      if (text) publishError(text);
    });
    observer.observe(launch, { subtree: true, childList: true, characterData: true, attributes: true });
  }

  function watchChrome() {
    const status = document.getElementById('status');
    if (status) {
      new MutationObserver(() => publishStatus(false)).observe(status, {
        subtree: true, childList: true, characterData: true,
      });
    }
    new MutationObserver(() => publishStatus(false)).observe(document.body, {
      attributes: true, attributeFilter: ['class'],
    });
    watchLaunchError();
    setInterval(() => publishStatus(false), 500);
    publishStatus(true);
  }

  async function launchFiles(files) {
    const list = Array.from(files || []).filter(Boolean);
    if (!list.length) return;
    if (!window.mediaImport || !window.wineApps || !window.wineShell) {
      publishError('The Wine runtime is not ready yet.');
      return;
    }
    try {
      publishStatus(true);
      post('wine:status', { text: `Reading ${list[0].name || 'media'}...` });
      const plans = await window.mediaImport.analyzeFiles(list);
      let chosen = null;
      for (const plan of plans) {
        if (!plan || !plan.exeCandidates || !plan.exeCandidates.length) continue;
        const entry = window.mediaImport.makeAppEntry(plan, {});
        window.wineApps.APPS[plan.id] = entry;
        if (!chosen) chosen = { plan, entry };
      }
      if (!chosen) {
        const names = list.map((file) => file.name).join(', ');
        throw new Error(`No Windows executable was found in ${names || 'the dropped media'}.`);
      }
      const title = chosen.entry.label || chosen.plan.name || 'Dropped program';
      post('wine:title', { title });
      post('wine:status', { text: `Starting ${title}...` });
      await window.wineShell.launchApp(chosen.plan.id, { startedAt: 0 });
      publishStatus(true);
    } catch (error) {
      publishError(error && error.message ? error.message : error);
    }
  }

  async function launchStoredPath(data) {
    const path = String((data && data.path) || '');
    if (!path) return;
    if (!window.pantsFS) {
      publishError('The shared C: drive is not available.');
      return;
    }
    try {
      const label = String((data && data.name) || '').trim() ||
        path.split('\\').pop() || 'program.exe';
      post('wine:status', { text: `Reading ${label} from C:...` });
      const bytes = await window.pantsFS.read(path);
      if (!bytes || !bytes.length) {
        throw new Error(`Cannot read ${path} from the shared C: drive.`);
      }
      const file = new File([bytes], label, { type: 'application/octet-stream' });
      await launchFiles([file]);
    } catch (error) {
      publishError(error && error.message ? error.message : error);
    }
  }

  async function launchRegisteredApp(data) {
    const id = String((data && data.app) || '');
    const args = String((data && data.args) || '');
    if (!id) return;
    if (!window.wineApps || !window.wineShell) {
      publishError('The Wine runtime is not ready yet.');
      return;
    }
    const entry = window.wineApps.APPS && window.wineApps.APPS[id];
    if (!entry) {
      publishError(`The registry has no program named ${id}.`);
      return;
    }
    try {
      if (args) {
        entry.args = args;
        entry.singleAppArgs = args;
      }
      post('wine:title', { title: String((data && data.name) || entry.label || id) });
      post('wine:status', { text: `Starting ${entry.label || id}...` });
      await window.wineShell.launchApp(id, { startedAt: 0 });
      publishStatus(true);
    } catch (error) {
      publishError(error && error.message ? error.message : error);
    }
  }

  window.addEventListener('message', (event) => {
    if (event.origin !== location.origin) return;
    if (event.source !== host) return;
    const data = event.data;
    if (!data || typeof data !== 'object') return;
    if (typeof data.type === 'string' && data.type.startsWith('wine:fs-') && data.id != null) {
      fsResult(data);
      return;
    }
    if (data.type === 'wine:drop') {
      void launchFiles(data.files);
    } else if (data.type === 'wine:launch-path') {
      void launchStoredPath(data);
    } else if (data.type === 'wine:launch-app') {
      void launchRegisteredApp(data);
    } else if (data.type === 'wine:menu-command') {
      void handleMenuCommand(data);
    }
  });

  window.addEventListener('error', (event) => {
    if (event && event.message) publishError(event.message);
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event && event.reason;
    publishError(reason && reason.message ? reason.message : reason);
  });

  // A drop that lands directly on the runtime gets routed explicitly: an app
  // window asks the parent for a new window, while the empty drop window runs
  // the media in place.
  window.addEventListener('dragover', (event) => {
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  });
  window.addEventListener('drop', (event) => {
    event.preventDefault();
    const files = event.dataTransfer && event.dataTransfer.files;
    if (!files || !files.length) return;
    if (dropMode) {
      void launchFiles(files);
    } else if (directApp) {
      post('wine:external-drop', { files: Array.from(files) });
    }
  });

  document.addEventListener('pointerdown', () => post('wine:focus'), true);
  document.addEventListener('keydown', () => post('wine:focus'), true);

  function whenReady() {
    if (!window.wineShell || !window.wineApps) {
      setTimeout(whenReady, 100);
      return;
    }
    const finish = () => {
      if (ready) return;
      ready = true;
      post('wine:ready');
      watchChrome();
      if (dropMode) post('wine:status', { text: 'Waiting for media...' });
    };
    if (document.readyState === 'complete') {
      setTimeout(finish, 100);
    } else {
      window.addEventListener('load', () => setTimeout(finish, 100), { once: true });
    }
  }
  whenReady();
})();
