import { useEffect, useRef, useState } from 'preact/hooks';
import {
  addressToPath,
  pathToAddress,
  webSites,
  oldNetFavorites,
  oldNetOriginalUrl,
  oldNetProxyUrl,
  normalizeExternalUrl,
  isOldNetHost,
  OLDNET_DEFAULT_YEAR,
  OLDNET_YEARS,
} from '../../kernel/web';
import { showDialog } from '../../kernel/dialogs';
import { playSound } from '../../kernel/audio';
import { openApp } from '../../kernel/windows';
import { playTrackById } from '../../kernel/player';
import type { AppProps } from '../../kernel/types';

interface HistoryEntry {
  address: string;
  path?: string;
  external: boolean;
  year: number;
}

type ExternalMode = 'srcdoc' | 'iframe';

export default function InternetExplorer({ appProps, api }: AppProps) {
  const startAddress = String(appProps.address ?? 'http://www.pantsplace.net/');
  const startPath = addressToPath(startAddress) ?? '/web/';
  const [path, setPath] = useState(startPath);
  const [address, setAddress] = useState(startAddress);
  const [input, setInput] = useState(startAddress);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [future, setFuture] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState('Microsoft Internet Explorer');
  const [favoritesOpen, setFavoritesOpen] = useState(false);
  const [year, setYear] = useState(OLDNET_DEFAULT_YEAR);
  const [external, setExternal] = useState(false);
  const [externalMode, setExternalMode] = useState<ExternalMode>('srcdoc');
  const [externalHtml, setExternalHtml] = useState<string | null>(null);
  const [externalSrc, setExternalSrc] = useState('');
  const frameRef = useRef<HTMLIFrameElement>(null);
  const suppressPush = useRef(false);
  const requestId = useRef(0);
  const yearRef = useRef(year);
  const addressRef = useRef(address);

  useEffect(() => {
    yearRef.current = year;
  }, [year]);

  useEffect(() => {
    addressRef.current = address;
  }, [address]);

  useEffect(() => {
    api.setTitle(`${title} - Microsoft Internet Explorer`);
    // The window manager creates a fresh API object each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title]);

  function currentEntry(): HistoryEntry {
    return { address, path: external ? undefined : path, external, year };
  }

  function pushHistory() {
    setHistory((h) => [...h, currentEntry()]);
    setFuture([]);
  }

  function loadPath(nextPath: string, nextAddress = pathToAddress(nextPath), push = true) {
    if (push) pushHistory();
    requestId.current++;
    suppressPush.current = true;
    setExternal(false);
    setExternalHtml(null);
    setExternalSrc('');
    setPath(nextPath);
    setAddress(nextAddress);
    setInput(nextAddress);
    setLoading(true);
    playSound('click');
  }

  function sanitizeArchivedHtml(html: string) {
    return html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
      .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')
      .replace(/javascript:/gi, '');
  }

  function decodeHtml(buffer: ArrayBuffer, contentType: string) {
    const match = /charset=([^;]+)/i.exec(contentType || '');
    const charset = (match?.[1] || 'windows-1252').trim().replace(/["']/g, '');
    try {
      return new TextDecoder(charset).decode(buffer);
    } catch {
      return new TextDecoder('windows-1252').decode(buffer);
    }
  }

  async function loadExternal(rawUrl: string, requestedYear = yearRef.current, push = true) {
    const url = normalizeExternalUrl(rawUrl);
    if (!url) return false;
    if (push) pushHistory();
    requestId.current++;
    const id = requestId.current;
    yearRef.current = requestedYear;
    setYear(requestedYear);
    setExternal(true);
    setExternalMode('srcdoc');
    setExternalHtml(null);
    setExternalSrc(oldNetProxyUrl(url, requestedYear));
    setAddress(url);
    addressRef.current = url;
    setInput(url);
    setLoading(true);
    setTitle(`${new URL(url).hostname} - The Old Net`);
    playSound('click');

    if (isOldNetHost(url)) {
      setExternalMode('iframe');
      setExternalSrc(url.replace(/^http:/i, 'https:'));
      setLoading(false);
      return true;
    }

    try {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), 20000);
      const response = await fetch(oldNetProxyUrl(url, requestedYear), {
        mode: 'cors',
        signal: controller.signal,
      });
      window.clearTimeout(timer);
      if (id !== requestId.current) return true;
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buffer = await response.arrayBuffer();
      if (id !== requestId.current) return true;
      const html = sanitizeArchivedHtml(decodeHtml(buffer, response.headers.get('content-type') || ''));
      const needsFrameFallback =
        /<frameset[\s>]/i.test(html) ||
        /<frame[\s>]/i.test(html) ||
        /http-equiv\s*=\s*["']?refresh/i.test(html);
      if (needsFrameFallback) {
        setExternalMode('iframe');
        setExternalHtml(null);
        setTitle(`${new URL(url).hostname} - The Old Net`);
      } else {
        setExternalMode('srcdoc');
        setExternalHtml(html);
      }
      setLoading(false);
    } catch {
      if (id !== requestId.current) return true;
      // Keep the address and let The Old Net's own cross-origin page load.
      // Links clicked inside it will not update our URL bar, but the page is
      // still usable when a snapshot cannot be safely rendered in srcdoc.
      setExternalMode('iframe');
      setExternalHtml(null);
      setTitle(`${new URL(url).hostname} - The Old Net`);
      setLoading(false);
    }
    return true;
  }

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const frame = frameRef.current;
      if (!frame?.contentWindow || event.source !== frame.contentWindow) return;
      if (event.origin !== window.location.origin) return;
      const data = event.data as { type?: string; id?: string; url?: string; year?: number } | null;
      if (!data) return;
      if (data.type === 'pants:play' && typeof data.id === 'string') {
        openApp('winamp');
        playTrackById(data.id);
      }
      if (data.type === 'pants:navigate' && typeof data.url === 'string') {
        void loadExternal(data.url, Number(data.year) || yearRef.current, true);
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
    // loadExternal reads the latest year through yearRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function go(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed) return;
    const internalPath = trimmed.startsWith('/web') ? trimmed : addressToPath(trimmed);
    if (internalPath) {
      const queryAt = internalPath.indexOf('?');
      const internalPathOnly = queryAt >= 0 ? internalPath.slice(0, queryAt) : internalPath;
      const query = queryAt >= 0 ? internalPath.slice(queryAt) : '';
      const nextAddress = trimmed.startsWith('/web')
        ? pathToAddress(internalPathOnly) + query
        : trimmed;
      loadPath(internalPath, nextAddress);
      return;
    }
    const externalUrl = normalizeExternalUrl(trimmed);
    if (externalUrl) {
      void loadExternal(externalUrl);
      return;
    }
    pushHistory();
    setAddress(trimmed);
    setInput(trimmed);
    setExternal(false);
    setExternalHtml(null);
    setPath(`/web/cannot/?url=${encodeURIComponent(trimmed)}`);
    setLoading(true);
  }

  function restore(entry: HistoryEntry) {
    if (entry.external) {
      void loadExternal(entry.address, entry.year, false);
      return;
    }
    requestId.current++;
    setExternal(false);
    setExternalHtml(null);
    setExternalSrc('');
    setPath(entry.path || '/web/');
    setAddress(entry.address);
    setInput(entry.address);
    setLoading(true);
  }

  function back() {
    const previous = history[history.length - 1];
    if (!previous) return;
    setFuture((f) => [currentEntry(), ...f]);
    setHistory((h) => h.slice(0, -1));
    restore(previous);
  }

  function forward() {
    const next = future[0];
    if (!next) return;
    setHistory((h) => [...h, currentEntry()]);
    setFuture((f) => f.slice(1));
    restore(next);
  }

  function refresh() {
    if (external) {
      void loadExternal(addressRef.current, yearRef.current, false);
      return;
    }
    setLoading(true);
    try {
      frameRef.current?.contentWindow?.location.reload();
    } catch {
      if (frameRef.current) frameRef.current.src = path;
    }
  }

  function changeYear(next: number) {
    setYear(next);
    yearRef.current = next;
    if (external) void loadExternal(addressRef.current, next, false);
  }

  function copyLink() {
    const value = addressRef.current;
    void navigator.clipboard
      .writeText(value)
      .then(() => api.notify(`Copied ${value}`))
      .catch(() => api.notify('The browser denied clipboard access.'));
  }

  function openFrameLink(anchor: HTMLAnchorElement) {
    const href = anchor.getAttribute('href');
    if (!href || href.startsWith('#') || /^javascript:/i.test(href)) return false;
    if (/^mailto:/i.test(href)) return false;
    const absolute = new URL(href, 'https://theoldnet.com/').href;
    const original = oldNetOriginalUrl(absolute);
    if (original) {
      void loadExternal(original, yearRef.current, true);
      return true;
    }
    if (/^https?:\/\//i.test(absolute)) {
      if (new URL(absolute).hostname.endsWith('theoldnet.com')) return false;
      void loadExternal(absolute, yearRef.current, true);
      return true;
    }
    return false;
  }

  function wireExternalDocument() {
    const frame = frameRef.current;
    if (!external || externalMode !== 'srcdoc' || !frame) return;
    const doc = frame.contentDocument;
    if (!doc) return;
    if ((doc as Document & { __pantsWired?: boolean }).__pantsWired) return;
    (doc as Document & { __pantsWired?: boolean }).__pantsWired = true;
    if (doc.title) setTitle(`${doc.title} - The Old Net`);
    doc.addEventListener(
      'click',
      (event) => {
        if (event.defaultPrevented || event.button !== 0) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const target = event.target as Element | null;
        const anchor = target?.closest?.('a') as HTMLAnchorElement | null;
        if (!anchor) return;
        if (openFrameLink(anchor)) event.preventDefault();
      },
      true,
    );
  }

  useEffect(() => {
    if (!external || externalMode !== 'srcdoc' || !externalHtml) return;
    const timer = window.setTimeout(() => wireExternalDocument(), 80);
    return () => window.clearTimeout(timer);
    // wireExternalDocument reads the current iframe document.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [external, externalMode, externalHtml]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div class="menu-bar">
        <button onClick={() => void showDialog({ title: 'Internet Explorer', message: 'File menu is not implemented. This is a browser, not a word processor.', icon: '/icons/ie.svg' })}>File</button>
        <button onClick={() => void showDialog({ title: 'Internet Explorer', message: 'Edit menu is not implemented.', icon: '/icons/ie.svg' })}>Edit</button>
        <button onClick={refresh}>View</button>
        <button onClick={() => setFavoritesOpen((v) => !v)}>Favorites</button>
        <button onClick={() => void showDialog({ title: 'Internet Options', message: 'Connection: Dial-up (56k). Home page: http://www.pantsplace.net/', icon: '/icons/ie.svg' })}>Tools</button>
        <button onClick={() => void showDialog({ title: 'About Internet Explorer', message: 'Microsoft Internet Explorer 4.0\n\nThis is a loving re-creation for Pants Place 98.', detail: 'Not affiliated with Microsoft.', icon: '/icons/ie.svg' })}>Help</button>
      </div>

      <div class="toolbar">
        <button onClick={back} disabled={!history.length} title="Back">
          <img src="/icons/ie-16.svg" alt="" /> Back
        </button>
        <button onClick={forward} disabled={!future.length} title="Forward">
          <img src="/icons/ie-16.svg" alt="" /> Forward
        </button>
        <button onClick={() => setLoading(false)} title="Stop">
          Stop
        </button>
        <button onClick={refresh} title="Refresh">
          Refresh
        </button>
        <button onClick={() => loadPath('/web/', 'http://www.pantsplace.net/')} title="Home">
          <img src="/icons/computer-16.svg" alt="" /> Home
        </button>
        <button onClick={() => loadPath('/web/search/', 'http://www.altavista.com/')} title="Search">
          Search
        </button>
        <button onClick={copyLink} title="Copy the current address">
          Copy Link
        </button>
        <label style={{ display: 'flex', alignItems: 'center', gap: '2px', color: '#000' }} title="The Old Net archive year">
          Old Net
          <select
            class="field"
            value={year}
            onChange={(event) => changeYear(Number((event.target as HTMLSelectElement).value))}
            style={{ height: '22px', color: '#000' }}
            aria-label="The Old Net year"
          >
            {OLDNET_YEARS.map((value) => (
              <option value={value}>{value}</option>
            ))}
          </select>
        </label>
        <button onClick={() => setFavoritesOpen((v) => !v)} title="Favorites">
          Favorites
        </button>
        <button onClick={() => void showDialog({ title: 'Print', message: 'No printer is installed. Consider saving a screenshot instead.', icon: '/icons/ie.svg' })}>
          Print
        </button>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 4px', position: 'relative' }}>
        <span>Address</span>
        <input
          class="field"
          value={input}
          onInput={(event) => setInput((event.target as HTMLInputElement).value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') go(input);
          }}
          style={{ flex: 1, height: '21px' }}
          aria-label="Address"
        />
        <button onClick={() => go(input)} style={{ minWidth: '40px', minHeight: '22px' }}>
          Go
        </button>
        {favoritesOpen ? (
          <div class="start-submenu" style={{ left: 'auto', right: '4px', top: '26px', bottom: 'auto', minWidth: '240px' }}>
            {webSites.map((site) => (
              <button
                class="start-item"
                onClick={() => {
                  setFavoritesOpen(false);
                  go(site.host);
                }}
              >
                <img src="/icons/ie-16.svg" alt="" width="16" height="16" />
                <span class="label">{site.title}</span>
              </button>
            ))}
            <div class="start-separator" />
            <div style={{ padding: '3px 6px', fontWeight: 'bold', color: '#000080' }}>The Old Net archive</div>
            {oldNetFavorites.map((site) => (
              <button
                class="start-item"
                onClick={() => {
                  setFavoritesOpen(false);
                  void loadExternal(site.url, yearRef.current, true);
                }}
              >
                <img src="/icons/ie-16.svg" alt="" width="16" height="16" />
                <span class="label">{site.title}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div style={{ flex: 1, minHeight: 0, margin: '2px 4px', position: 'relative', background: '#fff' }}>
        {loading ? (
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', zIndex: 2 }}>
            <div class="ie-progress" />
          </div>
        ) : null}
        {loading && external ? (
          <div style={{ position: 'absolute', inset: 0, zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '6px', background: '#fff', color: '#000' }}>
            <div style={{ fontWeight: 700 }}>Connecting to The Old Net...</div>
            <div style={{ fontFamily: "'Courier New',monospace", fontSize: '12px' }}>{address}</div>
            <div style={{ color: '#606060' }}>Year {year} · Internet Archive</div>
          </div>
        ) : null}
        <iframe
          key={external ? `ext-${externalMode}` : path}
          ref={frameRef}
          src={external ? (externalMode === 'iframe' ? externalSrc : undefined) : path}
          srcdoc={external && externalMode === 'srcdoc' ? externalHtml ?? '' : undefined}
          title="Internet Explorer content"
          onLoad={() => {
            setLoading(false);
            if (external) {
              wireExternalDocument();
              return;
            }
            try {
              const win = frameRef.current?.contentWindow;
              if (win) {
                const nextPath = (win.location.pathname || path) + (win.location.search || '');
                const docTitle = win.document.title;
                if (docTitle) setTitle(docTitle);
                if (nextPath.startsWith('/web/cannot/')) {
                  suppressPush.current = false;
                  return;
                }
                if (!suppressPush.current && nextPath !== path) {
                  setHistory((h) => [...h, currentEntry()]);
                  setFuture([]);
                }
                suppressPush.current = false;
                setPath(nextPath);
                const nextAddress = pathToAddress(win.location.pathname || path) + (win.location.search || '');
                setAddress(nextAddress);
                setInput(nextAddress);
              }
            } catch {
              /* cross-origin page */
            }
          }}
          style={{
            width: '100%',
            height: '100%',
            border: 0,
            display: 'block',
            background: '#fff',
          }}
        />
      </div>

      <div class="status-bar">
        <div class="status-bar-field">{loading ? 'Opening page...' : external && externalMode === 'iframe' ? 'Done (compatibility mode)' : 'Done'}</div>
        <div class="status-bar-field">{address}</div>
        <div class="status-bar-field">{external ? `The Old Net · ${year}` : 'Internet zone'}</div>
      </div>
    </div>
  );
}
