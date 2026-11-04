import { useEffect, useRef, useState } from 'preact/hooks';
import type { AppProps } from '../../kernel/types';
import { releaseWineDrop, takeWineDrop, openWineDrop } from '../../kernel/wine';
import { wineAppsById } from '../../generated/wine-apps';
import WineMenuBar, {
  type WineMenu,
  type WineMenuCommand,
} from './WineMenuBar';

function deactivateTerminal() {
  window.dispatchEvent(new CustomEvent('pants:deactivate-terminal'));
}

export default function WineApp({ windowId, appProps, api }: AppProps) {
  const explicitAppId = typeof appProps.wineAppId === 'string' ? appProps.wineAppId : null;
  const inferredAppId = windowId.startsWith('wine-')
    ? windowId.replace(/^wine-/, '').replace(/-\d+$/, '')
    : null;
  const wineAppId = explicitAppId || (inferredAppId && inferredAppId !== 'drop' ? inferredAppId : null);
  const dropToken = typeof appProps.token === 'string' ? appProps.token : null;
  const launchPath = typeof appProps.launchPath === 'string' ? appProps.launchPath : null;
  const app = wineAppId ? wineAppsById[wineAppId] : null;
  const title = String(appProps.title || app?.title || (dropToken ? 'Wine-Assembly' : 'Wine-Assembly'));
  const isDrop = Boolean(dropToken) || Boolean(launchPath);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const dropSent = useRef(false);
  const launchPathSent = useRef(false);
  const dropFiles = useRef<File[]>(isDrop ? takeWineDrop(dropToken) : []);
  const [reloadKey, setReloadKey] = useState(0);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState(isDrop ? 'Waiting for the Wine runtime...' : 'Starting Wine-Assembly...');
  const [error, setError] = useState<string | null>(null);
  const [menus, setMenus] = useState<WineMenu[]>([]);
  const [menuHwnd, setMenuHwnd] = useState(0);
  const [running, setRunning] = useState(false);

  const src = isDrop
    ? '/wine/?embed=1&drop=1&single-app=1'
    : `/wine/?app=${encodeURIComponent(wineAppId || '')}&embed=1&single-app=1`;

  useEffect(() => {
    api.setTitle(title);
    // The window manager creates a fresh API object per render; depending on
    // it here would re-run this effect on every render and update the window
    // store again. The title is the only input that can change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title]);

  useEffect(() => {
    deactivateTerminal();
    return () => {
      if (dropToken) releaseWineDrop(dropToken);
    };
  }, [dropToken]);

  function sendDrop() {
    if (!isDrop || dropSent.current) return;
    const frame = iframeRef.current;
    if (!frame?.contentWindow) return;
    if (!dropFiles.current.length) {
      setError('The dropped files are no longer available. Close this window and drop them again.');
      return;
    }
    dropSent.current = true;
    frame.contentWindow.postMessage(
      { type: 'wine:drop', files: dropFiles.current },
      window.location.origin,
    );
  }

  function markReady() {
    setReady(true);
    setStatus(isDrop ? 'Preparing dropped media...' : 'Wine runtime ready.');
    if (launchPath && !launchPathSent.current) {
      const frame = iframeRef.current;
      if (frame?.contentWindow) {
        launchPathSent.current = true;
        frame.contentWindow.postMessage(
          { type: 'wine:launch-path', path: launchPath, name: appProps.name || '' },
          window.location.origin,
        );
      }
      return;
    }
    sendDrop();
  }

  function probeReady() {
    const frame = iframeRef.current;
    if (!frame) return;
    let attempts = 0;
    const check = () => {
      if (iframeRef.current !== frame) return;
      const runtime = frame.contentWindow as (Window & { wineShell?: unknown }) | null;
      if (runtime?.wineShell && frame.contentWindow?.document.readyState === 'complete') {
        markReady();
        return;
      }
      attempts++;
      if (attempts < 120) window.setTimeout(check, 150);
    };
    window.setTimeout(check, 300);
  }

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const frame = iframeRef.current;
      if (!frame || event.source !== frame.contentWindow) return;
      if (event.origin !== window.location.origin) return;
      const data = event.data as { type?: string; [key: string]: unknown } | null;
      if (!data || typeof data.type !== 'string') return;

      switch (data.type) {
        case 'wine:focus':
          deactivateTerminal();
          window.dispatchEvent(new Event('pants:wine-blur'));
          break;
        case 'wine:ready': {
          markReady();
          break;
        }
        case 'wine:status': {
          const text = String(data.text || '');
          if (text) setStatus(text);
          break;
        }
        case 'wine:title': {
          const next = String(data.title || '');
          if (next) api.setTitle(`Wine-Assembly — ${next}`);
          break;
        }
        case 'wine:menu': {
          const nextMenus = Array.isArray(data.menus) ? (data.menus as WineMenu[]) : [];
          setMenus(nextMenus);
          setMenuHwnd(Number(data.hwnd) || 0);
          break;
        }
        case 'wine:error': {
          const message = String(data.message || 'Wine-Assembly failed to start the program.');
          setError(message);
          setStatus('Launch failed.');
          break;
        }
        case 'wine:external-drop': {
          const files = Array.isArray(data.files) ? (data.files as File[]) : [];
          if (files.length) openWineDrop(files);
          break;
        }
        case 'wine:running':
          setError(null);
          setRunning(true);
          setStatus('Running.');
          break;
        case 'wine:stopped':
          setStatus('The program has stopped.');
          setRunning(false);
          setMenus([]);
          break;
        default:
          break;
      }
    }

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [api, dropToken, isDrop]);

  function reload() {
    setError(null);
    setReady(false);
    setStatus('Reloading Wine-Assembly...');
    setReloadKey((value) => value + 1);
  }

  function fullscreen() {
    const frame = iframeRef.current;
    if (!frame) return;
    frame.requestFullscreen?.().catch(() => api.notify('Fullscreen was denied by the browser.'));
  }

  function openExternal() {
    const url = isDrop
      ? '/wine/?drop=1&debug'
      : `/wine/?app=${encodeURIComponent(wineAppId || '')}`;
    window.open(url, '_blank', 'noopener');
  }

  function about() {
    void api.dialog({
      title: 'About Wine-Assembly',
      message:
        'Wine-Assembly runs original Windows 98 .exe files on an x86 interpreter and Win32 implementation written in WebAssembly.',
      detail:
        'Engine © 2026 Vladimir Grichina, MIT licensed. Application binaries retain their own licenses and provenance. Hosted locally by Pants Place 98.',
      icon: '/icons/wine.svg',
    });
  }

  function menuCommand(command: WineMenuCommand) {
    const frame = iframeRef.current;
    if (!frame?.contentWindow) return;
    frame.contentWindow.postMessage(
      { type: 'wine:menu-command', hwnd: menuHwnd, ...command },
      window.location.origin,
    );
  }

  function hostAction(action: string) {
    switch (action) {
      case 'restart':
        reload();
        break;
      case 'fullscreen':
        fullscreen();
        break;
      case 'browser':
        openExternal();
        break;
      case 'about':
        about();
        break;
      case 'close':
        api.close();
        break;
      default:
        break;
    }
  }

  const hostItems = [
    { label: 'Restart', action: 'restart' },
    { label: 'Full Screen', action: 'fullscreen' },
    { label: 'Open in Browser', action: 'browser' },
    { label: 'About Wine-Assembly...', action: 'about' },
    { label: 'Close Program', action: 'close' },
  ];

  return (
    <div
      class="wine-app"
      onPointerDown={() => deactivateTerminal()}
      style={{ display: 'flex', flexDirection: 'column', height: '100%' }}
    >
      <WineMenuBar
        menus={menus}
        hostItems={hostItems}
        onCommand={menuCommand}
        onHostAction={hostAction}
      />
      <div class="toolbar">
        <button onClick={reload}>Restart</button>
        <button onClick={fullscreen}>Full Screen</button>
        <button onClick={openExternal}>Open in Browser</button>
        <span style={{ marginLeft: 'auto', paddingRight: '4px', color: '#404040' }}>
          Wine-Assembly · real .exe · WebAssembly
        </span>
      </div>
      <div class="wine-frame-wrap">
        <iframe
          key={reloadKey}
          ref={iframeRef}
          class="wine-frame"
          title={title}
          src={src}
          allow="fullscreen; autoplay; clipboard-read; clipboard-write; gamepad; pointer-lock"
          allowFullScreen
          onLoad={() => {
            setStatus((current) => current || 'Wine runtime loaded.');
            deactivateTerminal();
            probeReady();
          }}
        />
        {!ready && !error ? (
          <div class="wine-loading">
            <div class="wine-loading-title">{title}</div>
            <div class="wine-loading-status">{status}</div>
            <div class="progress-indicator" style={{ width: '240px', marginTop: '10px' }}>
              <div class="progress-indicator-bar" style={{ width: ready ? '100%' : '42%' }} />
            </div>
            <div class="wine-loading-note">
              The first launch downloads the emulator and program data.
            </div>
          </div>
        ) : null}
        {error ? (
          <div class="wine-error">
            <div class="wine-error-title">Wine-Assembly could not start this program.</div>
            <div class="wine-error-message">{error}</div>
            <div style={{ display: 'flex', gap: '6px', marginTop: '12px', justifyContent: 'center' }}>
              <button onClick={reload}>Retry</button>
              <button onClick={openExternal}>Open in Browser</button>
            </div>
          </div>
        ) : null}
      </div>
      <div class="status-bar">
        <div class="status-bar-field">{status || 'Wine-Assembly ready.'}</div>
        <div class="status-bar-field">{app?.title || title}</div>
        <div class="status-bar-field">{running ? 'Running' : ready ? 'Ready' : 'Loading'}</div>
      </div>
    </div>
  );
}
