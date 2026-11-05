import { applyWineRecords, snapshotForWine, type WineFsRecord } from './fs-store';

const SECTOR = 512;
const IMAGE_BYTES = 64 * 1024 * 1024;
const PARTITION_START = 2048; // 1 MiB alignment
const MAX_FILE_BYTES = 8 * 1024 * 1024;

type FatFile = {
  isDirectory(): boolean;
  isRegularFile(): boolean;
  getAbsolutePath(): string;
  getName(): string;
  length(): number;
  getLastModified(): Date | null;
  listFiles(): FatFile[] | null;
  open(): { readData(): Uint8Array; writeData(data: Uint8Array): number } | null;
};

type FatFs = {
  getRoot(): FatFile;
};

type FatPartition = {
  active: boolean;
  type: number;
  relativeSectors: number;
  totalSectors: number;
};

export interface DosDrive {
  image: Uint8Array;
  partition: FatPartition;
  mounted: number;
  skipped: number;
  sync: () => Promise<{ written: number; removed: number }>;
}

function safeRelative(path: string): string | null {
  const normalized = path.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized) return null;
  if (normalized.split('/').some((part) => !part || part === '.' || part === '..')) return null;
  return normalized;
}

function winRelative(path: string): string | null {
  const match = /^c:\\(.*)$/i.exec(path);
  if (!match) return null;
  return safeRelative(match[1]);
}

function offsetSectors(sectors: { zeroRegions: Array<{ i: number; count: number }>; dataSectors: Array<{ i: number; data: Uint8Array }> }, delta: number) {
  return {
    ...sectors,
    zeroRegions: sectors.zeroRegions.map((region) => ({ ...region, i: region.i + delta })),
    dataSectors: sectors.dataSectors.map((sector) => ({ ...sector, i: sector.i + delta })),
  };
}

function openFs(image: Uint8Array, partition: FatPartition): FatFs {
  const lib = (window as unknown as { __libmount?: typeof import('libmount') }).__libmount;
  if (!lib) throw new Error('The FAT library is not loaded.');
  const disk = lib.mount(image, { partition });
  const fs = disk.getFileSystem() as FatFs | null;
  if (!fs) throw new Error('The DOS disk image has no FAT filesystem.');
  return fs;
}

function loadLibmount() {
  return import('libmount');
}

function ensureDir(root: FatFile, relative: string): FatFile | null {
  try {
    return root.makeDir(relative);
  } catch {
    return root.getFile(relative);
  }
}

function writeFile(root: FatFile, relative: string, data: Uint8Array) {
  const file = root.makeFile(relative);
  if (!file) return false;
  const io = file.open();
  if (!io) return false;
  io.writeData(data);
  return true;
}

function walk(fs: FatFs, visit: (file: FatFile, relative: string) => void) {
  const root = fs.getRoot();

  function recurse(node: FatFile, prefix: string) {
    for (const child of node.listFiles() || []) {
      const relative = prefix ? `${prefix}/${child.getName()}` : child.getName();
      visit(child, relative);
      if (child.isDirectory()) recurse(child, relative);
    }
  }

  recurse(root, '');
}

export async function createDosDrive(): Promise<DosDrive> {
  const lib = await loadLibmount();
  (window as unknown as { __libmount?: typeof lib }).__libmount = lib;

  const image = new Uint8Array(IMAGE_BYTES);
  const totalSectors = Math.floor(IMAGE_BYTES / SECTOR) - PARTITION_START;
  const partition: FatPartition = {
    active: true,
    type: 0x06,
    relativeSectors: PARTITION_START,
    totalSectors,
  };

  const empty = lib.mount(image);
  empty.write(lib.fdisk([partition]));

  const fsResult = lib.mkfsvfat(totalSectors * SECTOR, { type: 'FAT16' });
  if (!fsResult) throw new Error('Could not format the DOS disk image.');
  empty.write(offsetSectors(fsResult.sectors, PARTITION_START));

  const fs = openFs(image, partition);
  const root = fs.getRoot();
  const snapshot = await snapshotForWine();
  let mounted = 0;
  let skipped = 0;

  for (const record of snapshot.records) {
    const relative = winRelative(record.path);
    if (!relative) continue;
    if (record.kind === 'dir') {
      ensureDir(root, relative);
      continue;
    }
    if (record.kind !== 'file' || !record.data) continue;
    if (record.data.length > MAX_FILE_BYTES) {
      skipped++;
      continue;
    }
    const parent = relative.includes('/') ? relative.slice(0, relative.lastIndexOf('/')) : '';
    if (parent) ensureDir(root, parent);
    if (writeFile(root, relative, record.data)) {
      mounted++;
    } else {
      skipped++;
    }
  }

  let manifest = new Map<string, { size: number; modified: number }>();
  walk(fs, (file, relative) => {
    if (file.isRegularFile()) {
      manifest.set(relative, {
        size: file.length(),
        modified: file.getLastModified()?.getTime() || 0,
      });
    } else if (file.isDirectory()) {
      manifest.set(relative, { size: 0, modified: file.getLastModified()?.getTime() || 0 });
    }
  });

  async function sync() {
    const fs = openFs(image, partition);
    const records: WineFsRecord[] = [];
    const next = new Map<string, { size: number; modified: number }>();

    walk(fs, (file, relative) => {
      const winPath = `c:\\${relative.replace(/\//g, '\\')}`;
      if (file.isDirectory()) {
        next.set(relative, { size: 0, modified: file.getLastModified()?.getTime() || 0 });
        if (!manifest.has(relative)) records.push({ path: winPath, kind: 'dir', name: file.getName() });
        return;
      }
      if (!file.isRegularFile()) return;
      const data = file.open()?.readData();
      if (!data) return;
      if (data.length > MAX_FILE_BYTES) return;
      const modified = file.getLastModified()?.getTime() || 0;
      next.set(relative, { size: data.length, modified });
      const before = manifest.get(relative);
      if (!before || before.size !== data.length || before.modified !== modified) {
        records.push({
          path: winPath,
          kind: 'file',
          name: file.getName(),
          data: new Uint8Array(data),
          size: data.length,
          attrs: 0x20,
        });
      }
    });

    for (const relative of manifest.keys()) {
      if (next.has(relative)) continue;
      records.push({ path: `c:\\${relative.replace(/\//g, '\\')}`, kind: 'whiteout' });
    }

    const result = records.length ? await applyWineRecords(records) : { written: 0, removed: 0 };
    manifest = next;
    return result;
  }

  return { image, partition, mounted, skipped, sync };
}

export async function syncDosDrive(drive: DosDrive | null | undefined) {
  if (!drive) return { written: 0, removed: 0 };
  return drive.sync();
}
