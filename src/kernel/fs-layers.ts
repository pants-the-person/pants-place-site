import { signal } from '@preact/signals';
import {
  CopyOnWrite,
  Fetch,
  InMemory,
  Journal,
  resolveMountConfig,
  type FileSystem,
  type JournalOperation,
} from '@zenfs/core';
import { WebAccess } from '@zenfs/dom';

export type LayerState = 'ready' | 'empty' | 'unavailable';

export interface LayerStatus {
  opfs: LayerState;
  r2: LayerState;
  static: LayerState;
  access: LayerState;
}

export const layerStatus = signal<LayerStatus>({
  opfs: 'unavailable',
  r2: 'unavailable',
  static: 'unavailable',
  access: 'unavailable',
});

const OPFS_DIR = 'pants-place-c';
const OPFS_STATE_DIR = 'pants-place-state';
const JOURNAL_MAGIC = '#journal@v0\n';

type JsonIndex = { version: number; maxSize?: number; entries: Record<string, unknown> };

class PersistedJournal extends Journal {
  constructor(private readonly persist: (text: string) => void, initial?: string) {
    super();
    if (!initial) return;
    try {
      const parsed = JSON.parse(initial);
      if (Array.isArray(parsed)) {
        this.entries = parsed.filter(
          (entry): entry is { op: JournalOperation; path: string } =>
            entry && entry.op === 'delete' && typeof entry.path === 'string',
        );
        return;
      }
    } catch {
      /* fall through to the legacy line format */
    }
    if (initial.startsWith(JOURNAL_MAGIC)) {
      for (const line of initial.slice(JOURNAL_MAGIC.length).split('\n')) {
        const space = line.indexOf(' ');
        if (space < 0) continue;
        const op = line.slice(0, space);
        const path = line.slice(space + 1);
        if (op === 'delete' && path) this.entries.push({ op, path });
      }
    }
  }

  add(op: JournalOperation, path: string) {
    super.add(op, path);
    this.persist(JSON.stringify(this.entries));
  }

  delete(op: JournalOperation, path: string) {
    super.delete(op, path);
    this.persist(JSON.stringify(this.entries));
  }
}

async function readHandleText(dir: FileSystemDirectoryHandle | null, name: string): Promise<string | undefined> {
  try {
    if (!dir) return undefined;
    const handle = await dir.getFileHandle(name);
    return await (await handle.getFile()).text();
  } catch {
    return undefined;
  }
}

function journalSaver(dir: FileSystemDirectoryHandle | null, name: string) {
  let chain = Promise.resolve();
  return (text: string) => {
    if (!dir) return;
    chain = chain
      .then(async () => {
        const handle = await dir.getFileHandle(name, { create: true });
        const writable = await handle.createWritable();
        await writable.write(text);
        await writable.close();
      })
      .catch((error) => console.warn(`Could not save ${name}:`, error));
  };
}

async function loadIndex(url: string): Promise<JsonIndex | null> {
  try {
    const response = await fetch(url, { cache: 'no-cache' });
    if (!response.ok) return null;
    const data = (await response.json()) as JsonIndex;
    if (!data || data.version !== 1 || !data.entries) return null;
    return data;
  } catch {
    return null;
  }
}

async function emptyFileSystem(label: string): Promise<FileSystem> {
  return await resolveMountConfig({ backend: InMemory, label, maxSize: 16 * 1024 * 1024 });
}

async function readLayer(layer: FileSystem, path: string): Promise<Uint8Array | null> {
  try {
    const data = await layer.promises.readFile(path);
    return data instanceof Uint8Array ? data : new Uint8Array(data);
  } catch {
    return null;
  }
}

export interface LayerBundle {
  fs: FileSystem;
  status: LayerStatus;
  readFile: (path: string) => Promise<Uint8Array>;
}

export async function createFileSystemLayers(): Promise<LayerBundle> {
  const status: LayerStatus = {
    opfs: 'unavailable',
    r2: 'unavailable',
    static: 'unavailable',
    access: 'unavailable',
  };

  let opfsHandle: FileSystemDirectoryHandle | null = null;
  let stateDir: FileSystemDirectoryHandle | null = null;

  try {
    if (navigator.storage?.getDirectory) {
      const root = await navigator.storage.getDirectory();
      opfsHandle = await root.getDirectoryHandle(OPFS_DIR, { create: true });
      stateDir = await root.getDirectoryHandle(OPFS_STATE_DIR, { create: true });
      status.opfs = 'ready';
    }
  } catch (error) {
    console.warn('OPFS is unavailable; using session-only storage.', error);
  }

  const opfs = opfsHandle
    ? await resolveMountConfig({ backend: WebAccess, handle: opfsHandle, disableHandleCache: false })
    : await emptyFileSystem('session-fallback');

  const staticIndex = await loadIndex(new URL(`/vfs-static.index.json?v=${Date.now()}`, location.origin).href);
  const staticLayer = staticIndex
    ? await resolveMountConfig({
        backend: Fetch,
        baseUrl: new URL('/vfs-static', location.origin).href,
        index: staticIndex,
        disableAsyncCache: true,
      }).catch((error) => { console.warn('Static VFS layer unavailable:', error); return null; })
    : null;

  const r2Index = await loadIndex(new URL(`/api/vfs/r2/index.json?v=${Date.now()}`, location.origin).href);
  const r2Layer = r2Index
    ? await resolveMountConfig({
        backend: Fetch,
        baseUrl: new URL('/api/vfs/r2', location.origin).href,
        index: r2Index,
        disableAsyncCache: true,
      }).catch((error) => { console.warn('R2 VFS layer unavailable:', error); return null; })
    : null;

  if (staticLayer) status.static = 'ready';
  if (r2Layer) {
    const entries = Object.keys(r2Index?.entries || {});
    const files = entries.filter((path) => {
      const entry = r2Index?.entries[path] as { mode?: number } | undefined;
      return path !== '/' && entry && !((entry.mode || 0) & 0o40000);
    });
    status.r2 = files.length ? 'ready' : 'empty';
  }

  const staticBase = staticLayer || (await emptyFileSystem('static-unavailable'));
  const r2Base = r2Layer || (await emptyFileSystem('r2-unavailable'));

  const staticJournal = new PersistedJournal(
    journalSaver(stateDir, 'static-journal.txt'),
    await readHandleText(stateDir, 'static-journal.txt'),
  );
  const r2Journal = new PersistedJournal(
    journalSaver(stateDir, 'r2-journal.txt'),
    await readHandleText(stateDir, 'r2-journal.txt'),
  );

  const r2OverOpfs = await resolveMountConfig({
    backend: CopyOnWrite,
    readable: r2Base,
    writable: opfs,
    journal: r2Journal,
  });

  const merged = await resolveMountConfig({
    backend: CopyOnWrite,
    readable: staticBase,
    writable: r2OverOpfs,
    journal: staticJournal,
  });

  layerStatus.value = status;

  async function readFile(path: string): Promise<Uint8Array> {
    // Read through the individual layers rather than the CoW mount. Some
    // ZenFS open/read paths copy a lower-layer file up, which would silently
    // fill OPFS just from opening a Wine app.
    for (const layer of [opfs, r2Base, staticBase]) {
      const data = await readLayer(layer, path);
      if (data) return data;
    }
    throw new Error(`File not found in any VFS layer: ${path}`);
  }

  return { fs: merged, status, readFile };
}
