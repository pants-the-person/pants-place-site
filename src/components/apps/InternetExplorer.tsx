import { useEffect, useRef, useState } from 'preact/hooks';
import {
  addressToPath,
  pathToAddress,
  webSites,
  oldNetFavorites,
  oldNetOriginalUrl,
  oldNetProxyUrl,
  oldNetDirectUrl,
  normalizeExternalUrl,
  isOldNetHost,
  OLDNET_DEFAULT_YEAR,
  OLDNET_YEARS,
  WEB_ORIGIN,
} from '../../kernel/web';
import { showDialog } from '../../kernel/dialogs';
import { playSound } from '../../kernel/audio';
import { openApp, toggleMaximizeWindow } from '../../kernel/windows';
import {
  addressForLauncherPath,
  contentPathForLauncherPath,
  isPersonalContentPath,
  siteForLauncherPath,
} from '../../kernel/sites';
import { writeTextFile } from '../../kernel/content';
import MenuBar, { type AppMenu, type AppMenuItem } from '../os/MenuBar';
import { playTrackById } from '../../kernel/player';
import type { AppProps } from '../../kernel/types';

interface HistoryEntry {
  address: string;
  path?: string;
  external: boolean;
  year: number;
}

type ExternalMode = 'srcdoc' | 'iframe';

interface SavedFavorite {
  title: string;
  address: string;
}

const FAVORITES_KEY = 'pp98:ie:favorites';
const WEB_HOME = 'http://www.pants.place/';

function loadFavorites(): SavedFavorite[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(FAVORITES_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((entry) => entry && entry.address) : [];
  } catch {
    return [];
  }
}

function saveFavorites(entries: SavedFavorite[]) {
  try {
    localStorage.setItem(FAVORITES_KEY, JSON.stringify(entries));
  } catch {
    /* private mode */
  }
}

export default function InternetExplorer({ appProps, api, windowId }: AppProps) {
  const startAddress = String(appProps.address ?? 'http://www.pants.place/');
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
  const [showStandard, setShowStandard] = useState(true);
  const [showAddress, setShowAddress] = useState(true);
  const [showStatus, setShowStatus] = useState(true);
  const [showLinks, setShowLinks] = useState(true);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [textSize, setTextSize] = useState(100);
  const [userFavorites, setUserFavorites] = useState<SavedFavorite[]>(loadFavorites);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
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
      // The cached API failed. Fall back to The Old Net's own cross-origin
      // page so the archive is still usable. Links clicked inside it will not
      // update our URL bar, but the page still renders.
      setExternalMode('iframe');
      setExternalHtml(null);
      setExternalSrc(oldNetDirectUrl(url, requestedYear));
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
      const nextAddress = pathToAddress(internalPathOnly) + query;
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
    const absolute = new URL(href, addressRef.current || 'https://theoldnet.com/').href;
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

  function wireInternalDocument() {
    const frame = frameRef.current;
    if (external || !frame) return;
    const doc = frame.contentDocument;
    if (!doc) return;
    if ((doc as Document & { __pantsInternalWired?: boolean }).__pantsInternalWired) return;
    (doc as Document & { __pantsInternalWired?: boolean }).__pantsInternalWired = true;
    doc.addEventListener(
      'click',
      (event) => {
        if (event.defaultPrevented || event.button !== 0) return;
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        const target = event.target as Element | null;
        const anchor = target?.closest?.('a') as HTMLAnchorElement | null;
        if (!anchor) return;
        const href = anchor.getAttribute('href');
        if (!href || href.startsWith('#') || /^javascript:/i.test(href)) return;
        if (/^mailto:/i.test(href)) return;
        let absolute: URL;
        try {
          absolute = new URL(href, frame.contentWindow?.location.href || window.location.href);
        } catch {
          return;
        }
        if (absolute.origin !== window.location.origin) {
          event.preventDefault();
          void loadExternal(absolute.href, yearRef.current, true);
          return;
        }
        const site = siteForLauncherPath(absolute.pathname);
        if (site) {
          event.preventDefault();
          const nextPath = `${contentPathForLauncherPath(absolute.pathname, site)}${absolute.search}${absolute.hash}`;
          const nextAddress = `${addressForLauncherPath(absolute.pathname, site)}${absolute.search}${absolute.hash}`;
          loadPath(nextPath, nextAddress);
        }
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

  function currentHtml(): string | null {
    const frame = frameRef.current;
    if (!external && frame?.contentDocument) {
      return `<!doctype html>\n${frame.contentDocument.documentElement.outerHTML}`;
    }
    if (external && externalMode === 'srcdoc') return externalHtml || '';
    return null;
  }

  function safeFilename(value: string) {
    return value.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, ' ').trim() || 'page';
  }

  async function savePage() {
    const html = currentHtml();
    const name = safeFilename(title || 'page');
    const path = `C:\\Downloads\\${name}.${html ? 'html' : 'url'}`;
    const body = html || `[InternetShortcut]\nURL=${address}\n`;
    try {
      await writeTextFile(path, body);
      api.notify(`Saved ${path}`);
    } catch (error) {
      void showDialog({
        title: 'Save Page',
        message: 'The page could not be saved.',
        detail: error instanceof Error ? error.message : String(error),
        kind: 'error',
        icon: '/icons/ie.svg',
      });
    }
  }

  function viewSource() {
    const html = currentHtml();
    const body = html || `[InternetShortcut]\nURL=${address}\n\nSource is not available for this cross-origin archive page.`;
    openApp('notepad', {
      title: `Source - ${title}`,
      filename: `${safeFilename(title)}.html`,
      body,
    });
  }

  async function findOnPage() {
    const query = await showDialog({
      title: 'Find',
      message: 'Find text on this page:',
      icon: '/icons/ie.svg',
      input: { value: '', label: 'Find what:' },
      buttons: [
        { id: 'ok', label: 'Find Next', default: true },
        { id: 'cancel', label: 'Cancel' },
      ],
    });
    if (query === 'cancel' || !query.trim()) return;
    const frame = frameRef.current;
    try {
      const found = (frame?.contentWindow as (Window & { find?: (text: string) => boolean }) | null)
        ?.find?.(query);
      api.notify(found ? `Found "${query}".` : `No matches for "${query}".`);
    } catch {
      api.notify('Find is not available for this archive page.');
    }
  }

  async function copySelection() {
    let text = '';
    try {
      text = frameRef.current?.contentWindow?.getSelection()?.toString() || '';
    } catch {
      /* cross-origin */
    }
    if (!text) text = address;
    try {
      await navigator.clipboard.writeText(text);
      api.notify(text === address ? 'Address copied.' : 'Selection copied.');
    } catch {
      api.notify('The browser denied clipboard access.');
    }
  }

  async function pasteIntoPage() {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return;
      if (document.activeElement === inputRef.current) {
        const start = inputRef.current?.selectionStart ?? input.length;
        const end = inputRef.current?.selectionEnd ?? input.length;
        setInput(`${input.slice(0, start)}${text}${input.slice(end)}`);
        return;
      }
      const doc = frameRef.current?.contentDocument;
      doc?.execCommand('insertText', false, text);
    } catch {
      api.notify('Clipboard access was denied.');
    }
  }

  function selectAll() {
    try {
      frameRef.current?.contentWindow?.document.execCommand('selectAll');
    } catch {
      api.notify('Select All is not available for this archive page.');
    }
  }

  function printPage() {
    try {
      frameRef.current?.contentWindow?.print();
    } catch {
      api.notify('This page cannot be printed from the archive view.');
    }
  }

  function applyTextSize(size: number) {
    setTextSize(size);
    try {
      const doc = frameRef.current?.contentDocument;
      if (doc) doc.documentElement.style.fontSize = `${size}%`;
    } catch {
      /* cross-origin */
    }
  }

  function addFavorite() {
    if (userFavorites.some((entry) => entry.address === address)) {
      api.notify('This page is already in Favorites.');
      return;
    }
    const next = [...userFavorites, { title: title || address, address }];
    setUserFavorites(next);
    saveFavorites(next);
    api.notify('Added to Favorites.');
  }

  async function organizeFavorites() {
    const result = await showDialog({
      title: 'Organize Favorites',
      message: userFavorites.length
        ? userFavorites.map((entry, index) => `${index + 1}. ${entry.title}\n   ${entry.address}`).join('\n')
        : 'You have not added any favorites yet.',
      icon: '/icons/ie.svg',
      buttons: [
        { id: 'clear', label: 'Clear All' },
        { id: 'ok', label: 'OK', default: true },
      ],
    });
    if (result === 'clear') {
      setUserFavorites([]);
      saveFavorites([]);
      api.notify('Favorites cleared.');
    }
  }

  function openInternetOptions() {
    void showDialog({
      title: 'Internet Options',
      message: `Home page: ${WEB_HOME}\nConnection: Dial-up (56k)\nArchive year: ${year}\nSearch: AltaVista`,
      detail: 'The fake web is normalized to www.pants.place. Legacy hostnames are redirected automatically.',
      icon: '/icons/ie.svg',
    });
  }

  const favoriteItems: AppMenuItem[] = [
    { label: 'Add to Favorites...', action: addFavorite },
    { label: 'Organize Favorites...', action: () => void organizeFavorites() },
    { separator: true },
    ...webSites.filter((site) => site.favorite).map((site) => ({
      label: site.title,
      action: () => go(site.host),
    })),
    ...(userFavorites.length ? [{ separator: true }] : []),
    ...userFavorites.map((entry) => ({
      label: entry.title,
      action: () => go(entry.address),
    })),
    { separator: true },
    {
      label: 'The Old Net',
      children: oldNetFavorites.map((site) => ({
        label: site.title,
        action: () => void loadExternal(site.url, yearRef.current, true),
      })),
    },
  ];

  const menus: AppMenu[] = [
    {
      label: 'File',
      items: [
        { label: 'New Window', action: () => openApp('ie', { address }) },
        { label: 'Open Location...', action: () => inputRef.current?.focus() },
        { separator: true },
        { label: 'Save Page As...', action: () => void savePage() },
        { label: 'Print...', action: printPage },
        { separator: true },
        { label: 'Close', action: () => api.close() },
      ],
    },
    {
      label: 'Edit',
      items: [
        { label: 'Copy', shortcut: 'Ctrl+C', action: () => void copySelection() },
        { label: 'Paste', shortcut: 'Ctrl+V', action: () => void pasteIntoPage() },
        { label: 'Select All', shortcut: 'Ctrl+A', action: selectAll },
        { separator: true },
        { label: 'Find (on This Page)...', shortcut: 'Ctrl+F', action: () => void findOnPage() },
        { label: 'Copy Link', action: copyLink },
      ],
    },
    {
      label: 'View',
      items: [
        {
          label: 'Toolbars',
          children: [
            { label: 'Standard Buttons', checked: showStandard, action: () => setShowStandard((v) => !v) },
            { label: 'Address Bar', checked: showAddress, action: () => setShowAddress((v) => !v) },
            { label: 'Links', checked: showLinks, action: () => setShowLinks((v) => !v) },
            { label: 'Status Bar', checked: showStatus, action: () => setShowStatus((v) => !v) },
          ],
        },
        { separator: true },
        { label: 'Stop', action: () => setLoading(false) },
        { label: 'Refresh', action: refresh },
        { separator: true },
        {
          label: 'Text Size',
          children: [
            { label: 'Largest', checked: textSize === 150, action: () => applyTextSize(150) },
            { label: 'Larger', checked: textSize === 125, action: () => applyTextSize(125) },
            { label: 'Medium', checked: textSize === 100, action: () => applyTextSize(100) },
            { label: 'Smaller', checked: textSize === 85, action: () => applyTextSize(85) },
            { label: 'Smallest', checked: textSize === 70, action: () => applyTextSize(70) },
          ],
        },
        { separator: true },
        { label: 'Source', action: viewSource },
        { label: 'Full Screen', action: () => toggleMaximizeWindow(windowId) },
      ],
    },
    {
      label: 'Go',
      items: [
        { label: 'Back', disabled: !history.length, action: back },
        { label: 'Forward', disabled: !future.length, action: forward },
        { separator: true },
        { label: 'Home', action: () => loadPath('/web/', WEB_HOME) },
        { label: 'Search', action: () => loadPath('/web/search/', `${WEB_ORIGIN}/search/`) },
        { separator: true },
        { label: 'History', action: () => setHistoryOpen((value) => !value) },
      ],
    },
    { label: 'Favorites', items: favoriteItems },
    {
      label: 'Tools',
      items: [
        { label: 'Internet Options...', action: openInternetOptions },
        { label: 'Clear History', action: () => { setHistory([]); setFuture([]); api.notify('History cleared.'); } },
      ],
    },
    {
      label: 'Help',
      items: [
        {
          label: 'About Internet Explorer',
          action: () => void showDialog({
            title: 'About Internet Explorer',
            message: 'Microsoft Internet Explorer 5.0\n\nThis is a loving re-creation for Pants Place 98.',
            detail: 'Not affiliated with Microsoft.',
            icon: '/icons/ie.svg',
          }),
        },
      ],
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <MenuBar menus={menus} />

      {showStandard ? (
      <div class="toolbar ie-toolbar">
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
        <div class="toolbar-separator" />
        <button onClick={() => loadPath('/web/', WEB_HOME)} title="Home">
          <img src="/icons/computer-16.svg" alt="" /> Home
        </button>
        <button onClick={() => loadPath('/web/search/', `${WEB_ORIGIN}/search/`)} title="Search">
          Search
        </button>
        <button onClick={() => { setFavoritesOpen((value) => !value); setHistoryOpen(false); }} title="Favorites">
          Favorites
        </button>
        <button onClick={() => { setHistoryOpen((value) => !value); setFavoritesOpen(false); }} title="History">
          History
        </button>
        <button onClick={() => void showDialog({ title: 'Mail', message: 'Outlook Express is not installed.', detail: 'This build has no mail client, but the button is here for authenticity.', icon: '/icons/ie.svg' })} title="Mail">
          Mail
        </button>
        <button onClick={printPage} title="Print">
          Print
        </button>
        <button onClick={viewSource} title="Edit">
          Edit
        </button>
        <div class="toolbar-separator" />
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
      </div>
      ) : null}

      {showAddress ? (
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 4px', position: 'relative' }}>
        <span>Address</span>
        <input
          class="field"
          ref={inputRef}
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
        {historyOpen ? (
          <div class="start-submenu" style={{ left: 'auto', right: '4px', top: '26px', bottom: 'auto', minWidth: '300px', maxHeight: '300px', overflowY: 'auto' }}>
            {history.length ? history.slice().reverse().map((entry) => (
              <button
                class="start-item"
                onClick={() => {
                  setHistoryOpen(false);
                  restore(entry);
                }}
              >
                <img src="/icons/ie-16.svg" alt="" width="16" height="16" />
                <span class="label">{entry.address}</span>
              </button>
            )) : <div style={{ padding: '4px 6px' }}>No history yet.</div>}
            <div class="start-separator" />
            <button class="start-item" onClick={() => { setHistory([]); setFuture([]); setHistoryOpen(false); }}>
              <img src="/icons/ie-16.svg" alt="" width="16" height="16" />
              <span class="label">Clear History</span>
            </button>
          </div>
        ) : null}
      </div>
      ) : null}

      {showLinks ? (
        <div class="ie-links-bar">
          <span>Links</span>
          {webSites.filter((site) => site.favorite).map((site) => (
            <button onClick={() => go(site.host)}>{site.title}</button>
          ))}
          <button onClick={() => go('http://www.pants.place/downloads/')}>Downloads</button>
        </div>
      ) : null}

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
            applyTextSize(textSize);
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
            wireInternalDocument();
          }}
          sandbox={
            !external && isPersonalContentPath(path)
              ? 'allow-same-origin allow-forms'
              : undefined
          }
          style={{
            width: '100%',
            height: '100%',
            border: 0,
            display: 'block',
            background: '#fff',
          }}
        />
      </div>

      {showStatus ? (
      <div class="status-bar">
        <div class="status-bar-field">{loading ? 'Opening page...' : external && externalMode === 'iframe' ? 'Done (compatibility mode)' : 'Done'}</div>
        <div class="status-bar-field">{address}</div>
        <div class="status-bar-field">{external ? `The Old Net · ${year}` : 'Internet zone'}</div>
      </div>
      ) : null}
    </div>
  );
}
