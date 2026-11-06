import { signal } from '@preact/signals';
import {
  CopyOnWrite,
  Fetch,
  InMemory,
  Journal,
  resolveMountConfig,
  fs as zenfs,
  type FileSystem,
  type JournalOperation,
} from '@zenfs/core';
import { WebAccess } from '@zenfs/dom';
import { Fat12Image } from '../../worker/fat12';

export type LayerState = 'ready' | 'empty' | 'unavailable';

export interface LayerStatus {
  opfs: LayerState;
  r2: LayerState;
  static: LayerState;
  access: LayerState;
  floppy: LayerState;
}

export const layerStatus = signal<LayerStatus>({
  opfs: 'unavailable',
  r2: 'unavailable',
  static: 'unavailable',
  access: 'unavailable',
  floppy: 'unavailable',
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

async function readMounted(path: string): Promise<Uint8Array | null> {
  try {
    const data = await zenfs.promises.readFile(path);
    return data instanceof Uint8Array ? data : new Uint8Array(data);
  } catch {
    return null;
  }
}

interface LayerResult {
  fs: FileSystem;
  index: JsonIndex;
  populate?: () => Promise<void>;
}

async function fetchLayer(indexUrl: string, baseUrl: string, label: string): Promise<LayerResult | null> {
  const index = await loadIndex(new URL(indexUrl, location.origin).href);
  if (!index) return null;
  try {
    const fs = await resolveMountConfig({
      backend: Fetch,
      baseUrl: new URL(baseUrl, location.origin).href,
      index,
      disableAsyncCache: true,
    });
    return { fs, index };
  } catch (error) {
    console.warn(`${label} VFS layer unavailable:`, error);
    return null;
  }
}

async function floppyFallback(): Promise<LayerResult | null> {
  try {
    const response = await fetch('/v86/freedos722.img', { cache: 'no-cache' });
    if (!response.ok) return null;
    const image = new Fat12Image(await response.arrayBuffer());
    const fs = await emptyFileSystem('floppy-fallback');
    const directories = new Set<string>();
    for (const path of image.entries.keys()) {
      let parent = path;
      while (parent.lastIndexOf('/') > 0) {
        parent = parent.slice(0, parent.lastIndexOf('/'));
        directories.add(parent);
      }
    }
    return {
      fs,
      index: image.toZenIndex(),
      populate: async () => {
        try {
          for (const directory of [...directories].sort()) {
            await zenfs.promises.mkdir(`/a${directory}`, { recursive: true }).catch(() => {});
          }
          for (const entry of image.entries.values()) {
            if (entry.kind === 'dir') {
              await zenfs.promises.mkdir(`/a${entry.path}`, { recursive: true }).catch(() => {});
              continue;
            }
            const data = image.readFile(entry.path);
            if (data) await zenfs.promises.writeFile(`/a${entry.path}`, data);
          }
        } catch (error) {
          console.warn('A: floppy fallback could not be mounted:', error);
        }
      },
    };
  } catch (error) {
    console.warn('A: floppy fallback unavailable:', error);
    return null;
  }
}

function countFiles(index: JsonIndex | null) {
  const entries = Object.keys(index?.entries || {});
  return entries.filter((path) => {
    const entry = index?.entries[path] as { mode?: number } | undefined;
    return path !== '/' && entry && !((entry.mode || 0) & 0o40000);
  }).length;
}

export interface LayerBundle {
  fs: FileSystem;
  mounts: Record<string, FileSystem>;
  status: LayerStatus;
  prepare?: () => Promise<void>;
  readFile: (path: string) => Promise<Uint8Array>;
}

export async function createFileSystemLayers(): Promise<LayerBundle> {
  const status: LayerStatus = {
    opfs: 'unavailable',
    r2: 'unavailable',
    static: 'unavailable',
    access: 'unavailable',
    floppy: 'unavailable',
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

  // C: is the writable Windows mock tree. Prefer the worker-backed mirror and
  // fall back to the site's static layer when the worker is not running.
  let staticLayer = await fetchLayer('/api/vfs/c/index.json', '/api/vfs/c', 'C: worker');
  if (!staticLayer) {
    staticLayer = await fetchLayer('/vfs-static.index.json', '/vfs-static', 'C: static');
  }

  // D: is the read-only R2 binding exposed by the VFS worker.
  const r2Layer = await fetchLayer('/api/vfs/d/index.json', '/api/vfs/d', 'D: R2');

  // A: is the read-only FreeDOS floppy image exposed by the VFS worker.
  let floppyLayer: LayerResult | null = await fetchLayer('/api/vfs/a/index.json', '/api/vfs/a', 'A: floppy');
  if (!floppyLayer) floppyLayer = await floppyFallback();

  if (staticLayer) status.static = 'ready';
  if (r2Layer) status.r2 = countFiles(r2Layer.index) ? 'ready' : 'empty';
  if (floppyLayer) status.floppy = countFiles(floppyLayer.index) ? 'ready' : 'empty';

  const staticBase = staticLayer?.fs ?? (await emptyFileSystem('static-unavailable'));
  const r2Base = r2Layer?.fs ?? (await emptyFileSystem('r2-unavailable'));
  const floppyBase = floppyLayer?.fs ?? (await emptyFileSystem('floppy-unavailable'));

  const staticJournal = new PersistedJournal(
    journalSaver(stateDir, 'static-journal.txt'),
    await readHandleText(stateDir, 'static-journal.txt'),
  );

  const mergedC = await resolveMountConfig({
    backend: CopyOnWrite,
    readable: staticBase,
    writable: opfs,
    journal: staticJournal,
  });

  layerStatus.value = status;

  const mounts = {
    '/a': floppyBase,
    '/c': mergedC,
    '/d': r2Base,
  };

  async function readFile(path: string): Promise<Uint8Array> {
    // Read through the mounted VFS after configure(). This avoids touching the
    // backend mount objects directly, which do not expose the fs promises API.
    const data = await readMounted(path);
    if (data) return data;
    throw new Error(`File not found in the VFS drive: ${path}`);
  }

  return {
    fs: mergedC,
    mounts,
    status,
    prepare: floppyLayer?.populate,
    readFile,
  };
}
