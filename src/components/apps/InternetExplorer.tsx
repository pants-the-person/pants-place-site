import { useEffect, useRef, useState } from 'preact/hooks';
import { addressToPath, pathToAddress, webSites } from '../../kernel/web';
import { showDialog } from '../../kernel/dialogs';
import { playSound } from '../../kernel/audio';
import { openApp } from '../../kernel/windows';
import { playTrackById } from '../../kernel/player';
import type { AppProps } from '../../kernel/types';

interface HistoryEntry {
  path: string;
  address: string;
}

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
  const frameRef = useRef<HTMLIFrameElement>(null);
  const suppressPush = useRef(false);

  useEffect(() => {
    api.setTitle(`${title} - Microsoft Internet Explorer`);
  }, [title]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (frameRef.current?.contentWindow && event.source !== frameRef.current.contentWindow) return;
      if (event.data?.type === 'pants:play' && typeof event.data.id === 'string') {
        openApp('winamp');
        playTrackById(event.data.id);
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  function loadPath(nextPath: string, nextAddress = pathToAddress(nextPath), push = true) {
    if (push) {
      setHistory((h) => [...h, { path, address }]);
      setFuture([]);
    }
    suppressPush.current = true;
    setPath(nextPath);
    setAddress(nextAddress);
    setInput(nextAddress);
    setLoading(true);
    playSound('click');
  }

  function go(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed) return;
    const nextPath = trimmed.startsWith('/web') ? trimmed : addressToPath(trimmed);
    if (!nextPath) {
      setHistory((h) => [...h, { path, address }]);
      setFuture([]);
      setAddress(trimmed);
      setInput(trimmed);
      setPath(`/web/cannot/?url=${encodeURIComponent(trimmed)}`);
      setLoading(true);
      return;
    }
    loadPath(nextPath, trimmed.startsWith('/web') ? pathToAddress(nextPath) : trimmed);
  }

  function back() {
    const previous = history[history.length - 1];
    if (!previous) return;
    setFuture((f) => [{ path, address }, ...f]);
    setHistory((h) => h.slice(0, -1));
    setPath(previous.path);
    setAddress(previous.address);
    setInput(previous.address);
    setLoading(true);
  }

  function forward() {
    const next = future[0];
    if (!next) return;
    setHistory((h) => [...h, { path, address }]);
    setFuture((f) => f.slice(1));
    setPath(next.path);
    setAddress(next.address);
    setInput(next.address);
    setLoading(true);
  }

  function refresh() {
    setLoading(true);
    try {
      frameRef.current?.contentWindow?.location.reload();
    } catch {
      if (frameRef.current) frameRef.current.src = path;
    }
  }

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
          <div class="start-submenu" style={{ left: 'auto', right: '4px', top: '26px', bottom: 'auto', minWidth: '220px' }}>
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
          </div>
        ) : null}
      </div>

      <div style={{ flex: 1, minHeight: 0, margin: '2px 4px', position: 'relative', background: '#fff' }}>
        {loading ? (
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '3px', zIndex: 2 }}>
            <div class="ie-progress" />
          </div>
        ) : null}
        <iframe
          ref={frameRef}
          src={path}
          title="Internet Explorer content"
          onLoad={() => {
            setLoading(false);
            try {
              const win = frameRef.current?.contentWindow;
              if (win) {
                const nextPath = win.location.pathname || path;
                const docTitle = win.document.title;
                if (docTitle) setTitle(docTitle);
                if (nextPath === '/web/cannot/') {
                  suppressPush.current = false;
                  return;
                }
                if (!suppressPush.current && nextPath !== path) {
                  setHistory((h) => [...h, { path, address }]);
                  setFuture([]);
                }
                suppressPush.current = false;
                setPath(nextPath);
                const nextAddress = pathToAddress(nextPath);
                setAddress(nextAddress);
                setInput(nextAddress);
              }
            } catch {
              /* cross-origin, should not happen */
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
        <div class="status-bar-field">{loading ? 'Opening page...' : 'Done'}</div>
        <div class="status-bar-field">{address}</div>
        <div class="status-bar-field">Internet zone</div>
      </div>
    </div>
  );
}
