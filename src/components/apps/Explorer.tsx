import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  fileSystem,
  createFolder,
  createTextFile,
  readFileBytes,
  uploadFiles,
  renameNode,
  deleteNode,
  storageEstimate,
  refreshFileSystem,
} from '../../kernel/content';
import { findNode, type VfsFile, type VfsFolder } from '../../kernel/vfs';
import { openApp } from '../../kernel/windows';
import { openWineDrop, openWinePath, openWineApp, wineEquivalents } from '../../kernel/wine';
import { openContextMenu } from '../../kernel/menu';
import MenuBar, { type AppMenu } from '../os/MenuBar';
import { joinWindowsPath, quoteWindowsArg, splitWindowsPath } from '../../kernel/paths';
import { showDialog } from '../../kernel/dialogs';
import { playSound } from '../../kernel/audio';
import { playTrackById } from '../../kernel/player';
import type { AppProps } from '../../kernel/types';

const WINE_EXTENSIONS = /\.(exe|zip|iso|cue|bin)$/i;

const folders = ['My Documents', 'Media', 'Downloads', 'Desktop', 'Program Files', 'Windows', 'Temp'];

export default function Explorer({ appProps, api }: AppProps) {
  const initialPath = (appProps.path as string[] | undefined) ?? [];
  const network = Boolean(appProps.network);
  const recycle = Boolean(appProps.recycle);
  const [path, setPath] = useState<string[]>(initialPath);
  const [history, setHistory] = useState<string[][]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<'icons' | 'details'>('icons');
  const [dragging, setDragging] = useState(false);
  const [storageLabel, setStorageLabel] = useState('Local filesystem');
  const [addressInput, setAddressInput] = useState('C:\\');
  const [showStatus, setShowStatus] = useState(true);
  const wineInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const folder = useMemo(() => {
    const node = findNode(fileSystem.value, path);
    return node?.type === 'folder' ? node : fileSystem.value;
  }, [path, fileSystem.value]);

  const entries = folder.type === 'folder' ? folder.children : [];
  const coarse = typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches;
  const selectedEntry = entries.find((entry) => entry.name === selected) || null;
  const parentPath = joinWindowsPath(path, 'c');

  useEffect(() => {
    void updateStorageLabel();
  }, []);

  const address = joinWindowsPath(path);

  useEffect(() => {
    setAddressInput(address);
  }, [address]);

  function navigate(next: string[]) {
    setHistory((h) => [...h, path]);
    setPath(next);
    setSelected(null);
    playSound('click');
  }

  function up() {
    if (!path.length) return;
    setHistory((h) => [...h, path]);
    setPath(path.slice(0, -1));
    setSelected(null);
  }

  function back() {
    const previous = history[history.length - 1];
    if (!previous) return;
    setHistory((h) => h.slice(0, -1));
    setPath(previous);
    setSelected(null);
  }

  function runDropped(files: File[]) {
    const supported = files.filter((file) => WINE_EXTENSIONS.test(file.name));
    if (!supported.length) {
      void showDialog({
        title: 'Wine-Assembly',
        message: 'That file type is not supported.',
        detail: 'Drop a Windows .exe, a .zip containing one, an .iso disc image, or a .cue bundle.',
        kind: 'warning',
        icon: '/icons/wine.svg',
      });
      return;
    }
    openWineDrop(supported, supported[0].name);
  }

  async function importFiles(files: File[]) {
    if (!files.length) return;
    try {
      await uploadFiles(parentPath, files);
      playSound('click');
      api.notify(`${files.length} file${files.length === 1 ? '' : 's'} copied to ${address}`);
      void updateStorageLabel();
    } catch (error) {
      void showDialog({
        title: 'Copy File',
        message: 'The files could not be copied.',
        detail: error instanceof Error ? error.message : String(error),
        kind: 'error',
        icon: '/icons/folder.svg',
      });
    }
  }

  async function updateStorageLabel() {
    const estimate = await storageEstimate();
    if (!estimate?.usage) {
      setStorageLabel('IndexedDB filesystem');
      return;
    }
    const mb = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    setStorageLabel(`${mb(estimate.usage)} used${estimate.quota ? ` of ${mb(estimate.quota)}` : ''}`);
  }

  function drop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    setDragging(false);
    const files = Array.from(event.dataTransfer?.files ?? []);
    if (!files.length) return;
    if (files.some((file) => WINE_EXTENSIONS.test(file.name))) runDropped(files);
    else void importFiles(files);
  }

  function pickWineFiles(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (files.length) runDropped(files);
  }

  function pickUploadFiles(event: Event) {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (files.length) void importFiles(files);
  }

  async function promptName(title: string, label: string, value: string) {
    const result = await showDialog({
      title,
      message: label,
      icon: '/icons/folder.svg',
      input: { value, label: 'Name:' },
      buttons: [
        { id: 'ok', label: 'OK', default: true },
        { id: 'cancel', label: 'Cancel' },
      ],
    });
    if (result === 'cancel') return null;
    const name = result.trim();
    return name || null;
  }

  async function newFolder() {
    const name = await promptName('New Folder', 'Create a new folder in this location.', 'New Folder');
    if (!name) return;
    try {
      await createFolder(parentPath, name);
      playSound('click');
      void updateStorageLabel();
    } catch (error) {
      void showDialog({ title: 'New Folder', message: 'The folder could not be created.', detail: String(error), kind: 'error', icon: '/icons/folder.svg' });
    }
  }

  async function newTextFile() {
    const name = await promptName('New Text Document', 'Create a new text document in this location.', 'New Text Document.txt');
    if (!name) return;
    try {
      await createTextFile(parentPath, name, '');
      playSound('click');
      void updateStorageLabel();
    } catch (error) {
      void showDialog({ title: 'New Text Document', message: 'The file could not be created.', detail: String(error), kind: 'error', icon: '/icons/notepad.svg' });
    }
  }

  async function renameSelected() {
    if (!selectedEntry) return;
    const name = await promptName('Rename', `Rename "${selectedEntry.name}" to:`, selectedEntry.name);
    if (!name || name === selectedEntry.name) return;
    try {
      await renameNode(selectedEntry.path || `${parentPath}\\${selectedEntry.name}`, name);
      setSelected(name);
      playSound('click');
      void updateStorageLabel();
    } catch (error) {
      void showDialog({ title: 'Rename', message: 'The item could not be renamed.', detail: String(error), kind: 'error', icon: '/icons/folder.svg' });
    }
  }

  async function deleteSelected() {
    if (!selectedEntry) return;
    const result = await showDialog({
      title: 'Confirm File Delete',
      message: `Are you sure you want to delete "${selectedEntry.name}"?`,
      kind: 'warning',
      icon: '/icons/recycle-empty.svg',
      buttons: [
        { id: 'yes', label: 'Yes', default: true },
        { id: 'no', label: 'No' },
      ],
    });
    if (result !== 'yes') return;
    try {
      await deleteNode(selectedEntry.path || `${parentPath}\\${selectedEntry.name}`);
      setSelected(null);
      playSound('click');
      void updateStorageLabel();
    } catch (error) {
      void showDialog({ title: 'Delete', message: 'The item could not be deleted.', detail: String(error), kind: 'error', icon: '/icons/recycle-empty.svg' });
    }
  }

  function entryMenu(entry: VfsFolder | VfsFile, event: MouseEvent) {
    event.stopPropagation();
    setSelected(entry.name);
    const entryPath = entry.path || `${parentPath}\\${entry.name}`;
    openContextMenu(event, [
      { label: 'Open', action: () => void openEntry(entry) },
      ...(entry.type === 'file' && entry.ext === 'exe'
        ? [{ label: 'Run with Wine...', action: () => openWinePath(entryPath, entry.name) }]
        : []),
      ...(entry.type === 'file' && (entry.ext === 'zip' || entry.ext === 'iso' || entry.ext === 'cue')
        ? [{ label: 'Open with Wine...', action: () => void openEntry(entry) }]
        : []),
      ...(entry.type === 'file'
        ? [{
            label: 'Open With',
            children: [
              { label: 'Notepad (Wine)', action: () => openWineApp('notepad', { args: quoteWindowsArg(entryPath), title: `${entry.name} - Notepad` }) },
              { label: 'WordPad (Wine)', action: () => openWineApp('wordpad', { args: quoteWindowsArg(entryPath), title: `${entry.name} - WordPad` }) },
              { label: 'Paint (Wine)', action: () => openWineApp('mspaint98', { args: quoteWindowsArg(entryPath), title: `${entry.name} - Paint` }) },
            ],
          }]
        : []),
      { separator: true },
      {
        label: 'Copy Path',
        action: () => {
          void navigator.clipboard?.writeText(entryPath).then(
            () => api.notify(`Copied ${entryPath}`),
            () => api.notify('The browser denied clipboard access.'),
          );
        },
      },
      { label: 'Rename', action: () => void renameSelected() },
      { label: 'Delete', action: () => void deleteSelected() },
      { separator: true },
      {
        label: 'Properties',
        action: () => void showDialog({
          title: `${entry.name} Properties`,
          message: entry.type === 'folder' ? 'File Folder' : `${entry.ext.toUpperCase()} File`,
          detail: `${entryPath}\n${entry.type === 'file' ? sizeLabel(entry.size) : 'Folder'}\nModified: ${entry.modified}`,
          icon: iconFor(entry),
        }),
      },
    ]);
  }

  function backgroundMenu(event: MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    setSelected(null);
    openContextMenu(event, [
      {
        label: 'New',
        children: [
          { label: 'Folder', icon: '/icons/folder.svg', action: () => void newFolder() },
          { label: 'Text Document', icon: '/icons/notepad.svg', action: () => void newTextFile() },
        ],
      },
      { label: 'Upload...', icon: '/icons/folder-open.svg', action: () => uploadInputRef.current?.click() },
      { separator: true },
      { label: 'Refresh', action: () => window.dispatchEvent(new Event('pants:refresh-desktop')) },
      {
        label: 'View',
        children: [
          { label: 'Large Icons', checked: view === 'icons', action: () => setView('icons') },
          { label: 'Details', checked: view === 'details', action: () => setView('details') },
        ],
      },
      {
        label: 'Arrange By',
        children: [
          { label: 'Name', action: () => undefined },
          { label: 'Size', action: () => undefined },
          { label: 'Type', action: () => undefined },
          { label: 'Date', action: () => undefined },
        ],
      },
      { separator: true },
      { label: 'Properties', action: () => void showDialog({ title: `${address} Properties`, message: 'Local Disk (C:)', detail: storageLabel, icon: '/icons/computer.svg' }) },
    ]);
  }

  async function openEntry(entry: VfsFolder | VfsFile) {
    if (entry.type === 'folder') {
      navigate([...path, entry.name]);
      return;
    }
    const entryPath = entry.path || `${parentPath}\\${entry.name}`;
    if (entry.name.toLowerCase().endsWith('.lnk')) {
      if (entry.openWith) {
        const wineId = wineEquivalents[entry.openWith];
        if (wineId) openWineApp(wineId);
        else openApp(entry.openWith, entry.props);
      }
      return;
    }
    if (entry.openWith === 'winamp') {
      openApp('winamp');
      if (entry.props?.mediaId) playTrackById(String(entry.props.mediaId));
      return;
    }
    if (entry.ext === 'exe') {
      openWinePath(entryPath, entry.name);
      return;
    }
    if (entry.ext === 'zip' || entry.ext === 'iso' || entry.ext === 'cue') {
      try {
        const bytes = await readFileBytes(entryPath);
        openWineDrop([new File([bytes], entry.name)], entry.name);
      } catch (error) {
        void showDialog({ title: 'Wine-Assembly', message: 'The file could not be read.', detail: String(error), kind: 'error', icon: '/icons/wine.svg' });
      }
      return;
    }
    if (entry.openWith === 'notepad' || entry.ext === 'txt' || entry.ext === 'md') {
      openWineApp('notepad', {
        args: quoteWindowsArg(entryPath),
        title: `${entry.name} - Notepad`,
      });
      return;
    }
    void showDialog({
      title: 'Windows',
      message: `Windows cannot open "${entry.name}".`,
      detail: 'This file is not associated with an installed program.',
      kind: 'error',
      icon: '/icons/computer.svg',
    });
  }

  function iconFor(entry: VfsFolder | VfsFile) {
    if (entry.type === 'folder') return '/icons/folder.svg';
    if (entry.icon) return entry.icon;
    if (entry.openWith === 'winamp') return '/icons/winamp.svg';
    if (entry.openWith === 'ie') return '/icons/ie.svg';
    if (entry.openWith === 'terminal') return '/icons/dos.svg';
    if (entry.openWith === 'paint') return '/icons/paint.svg';
    if (entry.openWith === 'minesweeper') return '/icons/mine.svg';
    if (entry.openWith === 'calculator') return '/icons/calculator.svg';
    if (entry.name.endsWith('.lnk')) return '/icons/folder.svg';
    return '/icons/file-text.svg';
  }

  function sizeLabel(size: number) {
    if (size < 1024) return `${size} bytes`;
    return `${Math.ceil(size / 1024)} KB`;
  }

  const networkItems = [
    { name: 'PANTS-PC', description: 'This computer' },
    { name: 'KYLIE-PC', description: 'Kylie\\s Cyber Sanctuary' },
    { name: 'ULTIMATE-SHADES', description: 'Monkey Island gaming shrine' },
    { name: 'PANTS-NAS', description: 'Network storage (offline)' },
  ];

  const explorerMenus: AppMenu[] = [
    {
      label: 'File',
      items: [
        { label: 'New Window', action: () => openApp('computer', { path }) },
        { separator: true },
        { label: 'New Folder', icon: '/icons/folder.svg', action: () => void newFolder() },
        { label: 'New Text Document', icon: '/icons/notepad.svg', action: () => void newTextFile() },
        { label: 'Upload...', icon: '/icons/folder-open.svg', action: () => uploadInputRef.current?.click() },
        { separator: true },
        { label: 'Run with Wine...', icon: '/icons/wine.svg', action: () => wineInputRef.current?.click() },
        { separator: true },
        { label: 'Close', action: () => api.close() },
      ],
    },
    {
      label: 'Edit',
      items: [
        {
          label: 'Copy Path',
          disabled: !selectedEntry,
          action: () => {
            if (!selectedEntry) return;
            const target = selectedEntry.path || `${parentPath}\\${selectedEntry.name}`;
            void navigator.clipboard?.writeText(target).then(
              () => api.notify(`Copied ${target}`),
              () => api.notify('The browser denied clipboard access.'),
            );
          },
        },
        { label: 'Rename', disabled: !selectedEntry, action: () => void renameSelected() },
        { label: 'Delete', disabled: !selectedEntry, action: () => void deleteSelected() },
        { separator: true },
        { label: 'Select All', action: () => api.notify('Select All is not available in this view.') },
      ],
    },
    {
      label: 'View',
      items: [
        {
          label: 'View Mode',
          children: [
            { label: 'Large Icons', checked: view === 'icons', action: () => setView('icons') },
            { label: 'Details', checked: view === 'details', action: () => setView('details') },
          ],
        },
        { label: 'Status Bar', checked: showStatus, action: () => setShowStatus((value) => !value) },
        { separator: true },
        { label: 'Refresh', action: () => void refreshFileSystem() },
      ],
    },
    {
      label: 'Go',
      items: [
        { label: 'Back', disabled: !history.length, action: back },
        { label: 'Up', disabled: !path.length, action: up },
        { separator: true },
        { label: 'My Computer', action: () => navigate([]) },
        { label: 'My Documents', action: () => navigate(['My Documents']) },
      ],
    },
    {
      label: 'Favorites',
      items: folders.map((name) => ({
        label: name,
        icon: '/icons/folder.svg',
        action: () => navigate([name]),
      })),
    },
    {
      label: 'Tools',
      items: [
        { label: 'Find...', action: () => void showDialog({ title: 'Find: All Files', message: 'Use Start > Find > Files or Folders to search My Documents.', icon: '/icons/find.svg' }) },
        { label: 'Folder Options...', action: () => void showDialog({ title: 'Folder Options', message: 'Folder options are set to Web style.', icon: '/icons/folder.svg' }) },
      ],
    },
    {
      label: 'Help',
      items: [
        { label: 'Help Topics', action: () => openApp('help') },
        { separator: true },
        { label: 'About Windows Explorer', action: () => void showDialog({ title: 'About Windows Explorer', message: 'Windows Explorer', detail: 'Pants Place 98 Second Edition', icon: '/icons/computer.svg' }) },
      ],
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <MenuBar menus={explorerMenus} />

      <div class="toolbar">
        <button onClick={back} disabled={!history.length}>
          <img src="/icons/folder-open.svg" alt="" /> Back
        </button>
        <button onClick={up} disabled={!path.length}>
          <img src="/icons/folder.svg" alt="" /> Up
        </button>
        <button onClick={() => setView(view === 'icons' ? 'details' : 'icons')}>
          <img src="/icons/folder.svg" alt="" /> Views
        </button>
        <div class="toolbar-separator" />
        <button onClick={() => void newFolder()}>
          <img src="/icons/folder.svg" alt="" /> New Folder
        </button>
        <button onClick={() => void newTextFile()}>
          <img src="/icons/notepad.svg" alt="" /> New Text
        </button>
        <button onClick={() => uploadInputRef.current?.click()}>
          <img src="/icons/folder-open.svg" alt="" /> Upload
        </button>
        <button onClick={() => void renameSelected()} disabled={!selectedEntry}>
          <img src="/icons/file-text.svg" alt="" /> Rename
        </button>
        <button onClick={() => void deleteSelected()} disabled={!selectedEntry}>
          <img src="/icons/recycle-empty.svg" alt="" /> Delete
        </button>
        <div class="toolbar-separator" />
        <button onClick={() => wineInputRef.current?.click()} title="Run a Windows program, ZIP or ISO with Wine-Assembly">
          <img src="/icons/wine.svg" alt="" /> Run with Wine...
        </button>
        <input
          ref={wineInputRef}
          type="file"
          multiple
          accept=".exe,.zip,.iso,.cue,.bin"
          style={{ display: 'none' }}
          onChange={pickWineFiles}
        />
        <input
          ref={uploadInputRef}
          type="file"
          multiple
          style={{ display: 'none' }}
          onChange={pickUploadFiles}
        />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 4px', flex: '0 0 auto' }}>
        <span>Address</span>
        <input
          class="field"
          value={network ? 'My Network Places' : recycle ? 'Recycle Bin' : addressInput}
          readOnly={network || recycle}
          onInput={(event) => setAddressInput((event.target as HTMLInputElement).value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || network || recycle) return;
            const value = (event.target as HTMLInputElement).value.trim();
            if (!value) return;
            const parts = splitWindowsPath(value);
            navigate(parts);
            setAddressInput(joinWindowsPath(parts));
          }}
          style={{ flex: 1, height: '21px', color: '#000' }}
        />
      </div>

      <div style={{ display: 'flex', flex: 1, minHeight: 0, gap: '4px', padding: '2px 4px' }}>
        <div style={{ width: '150px', flex: '0 0 150px', display: 'flex', flexDirection: 'column' }}>
          <div class="field" style={{ padding: '4px', marginBottom: '4px', background: '#fff' }}>
            <div style={{ fontWeight: 700, marginBottom: '4px' }}>All Folders</div>
            <div
              style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '2px', cursor: 'default' }}
              onClick={() => navigate([])}
            >
              <img src="/icons/computer-16.svg" alt="" width="16" height="16" /> Desktop
            </div>
            <div
              style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '2px', cursor: 'default' }}
              onClick={() => navigate([])}
            >
              <img src="/icons/computer-16.svg" alt="" width="16" height="16" /> My Computer
            </div>
            {folders.map((name) => (
              <div
                key={name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '2px 2px 2px 16px',
                  cursor: 'default',
                  background: path[0] === name ? 'var(--navy)' : 'transparent',
                  color: path[0] === name ? '#fff' : '#000',
                }}
                onClick={() => navigate([name])}
              >
                <img src="/icons/folder-16.svg" alt="" width="16" height="16" /> {name}
              </div>
            ))}
          </div>
        </div>

        <div
          class="field explorer-drop-pane"
          style={{ flex: 1, minWidth: 0, overflow: 'auto', padding: '6px', position: 'relative' }}
          onDragEnter={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragOver={(event) => {
            event.preventDefault();
            if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
            setDragging(true);
          }}
          onDragLeave={(event) => {
            const next = event.relatedTarget as Node | null;
            if (!next || !event.currentTarget.contains(next)) setDragging(false);
          }}
          onDrop={drop}
        >
          {dragging ? (
            <div class="wine-drop-overlay">
              <img src="/icons/wine.svg" alt="" width="48" height="48" />
              <div class="wine-drop-title">Run with Wine-Assembly</div>
              <div>Drop a Windows .exe, .zip, .iso or .cue bundle here.</div>
              <div class="wine-drop-note">The file stays in your browser. It is not uploaded.</div>
            </div>
          ) : null}
          {network ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '8px' }}>
              {networkItems.map((item) => (
                <button
                  key={item.name}
                  class="explorer-item"
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '8px', background: 'transparent', border: 0, boxShadow: 'none' }}
                  onDblClick={() =>
                    void showDialog({
                      title: 'Network',
                      message: `\\\\${item.name} is not accessible.`,
                      detail: 'The network path was not found. Check your dial-up connection.',
                      kind: 'error',
                      icon: '/icons/network.svg',
                    })
                  }
                >
                  <img src="/icons/network.svg" alt="" width="32" height="32" />
                  <span>{item.name}</span>
                  <small>{item.description}</small>
                </button>
              ))}
            </div>
          ) : recycle ? (
            <div style={{ padding: '24px', textAlign: 'center', color: '#404040' }}>
              <img src="/icons/recycle-empty.svg" alt="" width="48" height="48" />
              <p>The Recycle Bin is empty.</p>
            </div>
          ) : path.length === 0 ? (
            <>
              <div class="explorer-section-title">Files Stored on This Computer</div>
              <div class="explorer-grid" onContextMenu={backgroundMenu}>
                {[
                  { name: '3½ Floppy (A:)', icon: '/icons/dos.svg', action: () => void showDialog({ title: '3½ Floppy (A:)', message: 'There is no disk in the drive. Please insert a disk and try again.', kind: 'error', icon: '/icons/dos.svg' }) },
                  { name: 'Win98 (C:)', icon: '/icons/computer.svg', action: () => navigate([]) },
                  { name: 'Compact Disc (D:)', icon: '/icons/cd.svg', action: () => navigate(['Media']) },
                  { name: 'Control Panel', icon: '/icons/settings.svg', action: () => openApp('control') },
                  { name: 'Printers', icon: '/icons/settings.svg', action: () => void showDialog({ title: 'Printers', message: 'No printers are installed.', icon: '/icons/settings.svg' }) },
                  { name: 'Dial-Up Networking', icon: '/icons/dial.svg', action: () => openApp('control') },
                ].map((item) => (
                  <button
                    class="explorer-item"
                    onDblClick={item.action}
                    onClick={(event) => {
                      event.stopPropagation();
                      if (coarse) item.action();
                    }}
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '3px', padding: '8px 4px', background: 'transparent', border: 0, boxShadow: 'none' }}
                  >
                    <img src={item.icon} alt="" width="32" height="32" />
                    <span>{item.name}</span>
                  </button>
                ))}
              </div>
              <div class="explorer-section-title">Folders</div>
              <FileGrid
                entries={entries}
                selected={selected}
                view={view}
                onSelect={setSelected}
                onOpen={openEntry}
                onEntryMenu={entryMenu}
                onBackgroundMenu={backgroundMenu}
                iconFor={iconFor}
                sizeLabel={sizeLabel}
              />
            </>
          ) : (
            <FileGrid
              entries={entries}
              selected={selected}
              view={view}
              onSelect={setSelected}
              onOpen={openEntry}
              onEntryMenu={entryMenu}
              onBackgroundMenu={backgroundMenu}
              iconFor={iconFor}
              sizeLabel={sizeLabel}
            />
          )}
        </div>
      </div>

      {showStatus ? (
      <div class="status-bar">
        <div class="status-bar-field">
          {network ? `${networkItems.length} object(s)` : recycle ? '0 object(s)' : `${entries.length} object(s)`}
        </div>
        <div class="status-bar-field">{selected ?? ''}</div>
        <div class="status-bar-field">{recycle ? 'Recycle Bin' : storageLabel}</div>
      </div>
      ) : null}
    </div>
  );
}

function FileGrid({
  entries,
  selected,
  view,
  onSelect,
  onOpen,
  onEntryMenu,
  onBackgroundMenu,
  iconFor,
  sizeLabel,
}: {
  entries: (VfsFolder | VfsFile)[];
  selected: string | null;
  view: 'icons' | 'details';
  onSelect: (name: string | null) => void;
  onOpen: (entry: VfsFolder | VfsFile) => void;
  onEntryMenu: (entry: VfsFolder | VfsFile, event: MouseEvent) => void;
  onBackgroundMenu: (event: MouseEvent) => void;
  iconFor: (entry: VfsFolder | VfsFile) => string;
  sizeLabel: (size: number) => string;
}) {
  if (view === 'details') {
    return (
      <table style={{ width: '100%', marginTop: '4px' }} onContextMenu={onBackgroundMenu}>
        <thead>
          <tr>
            <th>Name</th>
            <th>Size</th>
            <th>Type</th>
            <th>Modified</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr
              key={entry.name}
              class={selected === entry.name ? 'highlighted' : ''}
              onClick={() => onSelect(entry.name)}
              onDblClick={() => onOpen(entry)}
              onContextMenu={(event) => onEntryMenu(entry, event)}
              style={{ cursor: 'default' }}
            >
              <td style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <img src={iconFor(entry)} alt="" width="16" height="16" /> {entry.name}
              </td>
              <td>{entry.type === 'file' ? sizeLabel(entry.size) : ''}</td>
              <td>{entry.type === 'folder' ? 'File Folder' : entry.ext.toUpperCase() + ' File'}</td>
              <td>{entry.modified}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  return (
    <div class="explorer-grid" onContextMenu={onBackgroundMenu}>
      {entries.map((entry) => (
        <button
          key={entry.name}
          class={`explorer-item ${selected === entry.name ? 'selected' : ''}`}
          onClick={(event) => {
            event.stopPropagation();
            onSelect(entry.name);
            if (typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches) {
              onOpen(entry);
            }
          }}
          onDblClick={() => onOpen(entry)}
          onContextMenu={(event) => onEntryMenu(entry, event)}
          title={entry.name}
        >
          <img src={iconFor(entry)} alt="" width="32" height="32" />
          <span>{entry.name}</span>
        </button>
      ))}
    </div>
  );
}
