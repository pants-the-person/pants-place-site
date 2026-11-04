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

  let ready = false;
  let lastStatus = '';
  let lastRunning = false;

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

  window.addEventListener('message', (event) => {
    if (event.origin !== location.origin) return;
    if (event.source !== host) return;
    const data = event.data;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'wine:drop') {
      void launchFiles(data.files);
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
