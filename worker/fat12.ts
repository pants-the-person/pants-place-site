/**
 * Minimal read-only FAT12 reader for the FreeDOS 3.5" boot floppy.
 *
 * The browser's A: drive is a view of the same freedos722.img that v86 boots
 * from. Only directory listing and file reads are needed, so this stays much
 * smaller than a full FAT driver and runs happily inside a Worker.
 */

export interface Fat12Entry {
  path: string;
  kind: 'file' | 'dir';
  size: number;
  firstCluster: number;
  mtimeMs: number;
}

const DIR_MODE = 0o40000 | 0o777;
const FILE_MODE = 0o100000 | 0o644;

function dosDateTime(date: number, time: number): number {
  const year = 1980 + ((date >> 9) & 0x7f);
  const month = Math.max(1, (date >> 5) & 0x0f);
  const day = Math.max(1, date & 0x1f);
  const hour = (time >> 11) & 0x1f;
  const minute = (time >> 5) & 0x3f;
  const second = (time & 0x1f) * 2;
  return new Date(year, month - 1, day, hour, minute, second).getTime();
}

function decodeShortName(entry: Uint8Array): string | null {
  if (entry[0] === 0 || entry[0] === 0xe5) return null;
  if ((entry[11] & 0x08) !== 0) return null;
  const baseBytes = entry.subarray(0, 8);
  let base = '';
  for (const byte of baseBytes) {
    if (byte === 0x20) break;
    base += String.fromCharCode(byte === 0x05 ? 0xe5 : byte);
  }
  if (!base) return null;
  let ext = '';
  for (const byte of entry.subarray(8, 11)) {
    if (byte === 0x20) break;
    ext += String.fromCharCode(byte);
  }
  return ext ? `${base}.${ext}` : base;
}

export class Fat12Image {
  private readonly bytes: Uint8Array;
  private readonly view: DataView;
  private readonly bytesPerSector: number;
  private readonly sectorsPerCluster: number;
  private readonly reservedSectors: number;
  private readonly fatCount: number;
  private readonly rootEntries: number;
  private readonly fatSectors: number;
  private readonly firstDataSector: number;
  private readonly rootDirOffset: number;
  private readonly sectorCount: number;
  private readonly fatOffset: number;

  readonly entries = new Map<string, Fat12Entry>();

  constructor(buffer: ArrayBuffer) {
    this.bytes = new Uint8Array(buffer);
    this.view = new DataView(buffer);
    if (this.bytes.length < 512) throw new Error('Floppy image is too small.');
    this.bytesPerSector = this.view.getUint16(11, true);
    this.sectorsPerCluster = this.bytes[13];
    this.reservedSectors = this.view.getUint16(14, true);
    this.fatCount = this.bytes[16];
    this.rootEntries = this.view.getUint16(17, true);
    this.sectorCount = this.view.getUint16(19, true) || this.view.getUint32(32, true);
    this.fatSectors = this.view.getUint16(22, true);
    if (!this.bytesPerSector || !this.sectorsPerCluster || !this.fatSectors) {
      throw new Error('Unsupported floppy geometry.');
    }
    const rootDirSectors = Math.ceil((this.rootEntries * 32) / this.bytesPerSector);
    this.fatOffset = this.reservedSectors * this.bytesPerSector;
    this.rootDirOffset = (this.reservedSectors + this.fatCount * this.fatSectors) * this.bytesPerSector;
    this.firstDataSector =
      this.reservedSectors + this.fatCount * this.fatSectors + rootDirSectors;
    this.walkDirectory(this.rootDirOffset, this.rootEntries * 32, '', new Set());
  }

  private nextCluster(cluster: number): number {
    const offset = this.fatOffset + cluster + Math.floor(cluster / 2);
    if (offset + 1 >= this.bytes.length) return 0xfff;
    const pair = this.view.getUint16(offset, true);
    return cluster & 1 ? pair >> 4 : pair & 0x0fff;
  }

  private clusterOffset(cluster: number): number {
    return (this.firstDataSector + (cluster - 2) * this.sectorsPerCluster) * this.bytesPerSector;
  }

  private readClusterChain(firstCluster: number, size: number): Uint8Array {
    const clusterSize = this.sectorsPerCluster * this.bytesPerSector;
    const out = new Uint8Array(size);
    let written = 0;
    let cluster = firstCluster;
    const seen = new Set<number>();
    while (cluster >= 2 && cluster < 0xff8 && written < size) {
      if (seen.has(cluster)) break;
      seen.add(cluster);
      const offset = this.clusterOffset(cluster);
      const length = Math.min(clusterSize, size - written, this.bytes.length - offset);
      if (length <= 0) break;
      out.set(this.bytes.subarray(offset, offset + length), written);
      written += length;
      cluster = this.nextCluster(cluster);
    }
    return written === size ? out : out.subarray(0, written);
  }

  private parseDirectory(data: Uint8Array): Fat12Entry[] {
    const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
    const entries: Fat12Entry[] = [];
    for (let offset = 0; offset + 32 <= data.length; offset += 32) {
      if (data[offset] === 0) break;
      if (data[offset] === 0xe5) continue;
      const attr = data[offset + 11];
      if ((attr & 0x0f) === 0x0f) continue;
      const name = decodeShortName(data.subarray(offset, offset + 32));
      if (!name) continue;
      const firstCluster = (data[offset + 26] | (data[offset + 27] << 8)) & 0xffff;
      const size = view.getUint32(offset + 28, true);
      entries.push({
        path: name,
        kind: attr & 0x10 ? 'dir' : 'file',
        size,
        firstCluster,
        mtimeMs: dosDateTime(
          view.getUint16(offset + 24, true),
          view.getUint16(offset + 22, true),
        ),
      });
    }
    return entries;
  }

  private walkDirectory(offset: number, byteLength: number, prefix: string, visited: Set<number>) {
    const data = this.bytes.subarray(offset, offset + byteLength);
    for (const entry of this.parseDirectory(data)) {
      if (entry.path === '.' || entry.path === '..') continue;
      const path = `${prefix}/${entry.path}`;
      const record: Fat12Entry = { ...entry, path };
      this.entries.set(path, record);
      if (entry.kind !== 'dir') continue;
      if (visited.has(entry.firstCluster)) continue;
      visited.add(entry.firstCluster);
      const clusterSize = this.sectorsPerCluster * this.bytesPerSector;
      const child = this.readClusterChain(entry.firstCluster, clusterSize * 64);
      this.walkDirectoryBytes(child, path, visited);
    }
  }

  private walkDirectoryBytes(data: Uint8Array, prefix: string, visited: Set<number>) {
    for (const entry of this.parseDirectory(data)) {
      if (entry.path === '.' || entry.path === '..') continue;
      const path = `${prefix}/${entry.path}`;
      this.entries.set(path, { ...entry, path });
      if (entry.kind !== 'dir') continue;
      if (visited.has(entry.firstCluster)) continue;
      visited.add(entry.firstCluster);
      const clusterSize = this.sectorsPerCluster * this.bytesPerSector;
      const child = this.readClusterChain(entry.firstCluster, clusterSize * 64);
      this.walkDirectoryBytes(child, path, visited);
    }
  }

  readFile(path: string): Uint8Array | null {
    const entry = this.entries.get(path);
    if (!entry || entry.kind !== 'file') return null;
    return this.readClusterChain(entry.firstCluster, entry.size);
  }

  toZenIndex() {
    const result: Record<string, Record<string, unknown>> = {
      '/': {
        ino: 0,
        data: 0,
        size: 0,
        mode: DIR_MODE,
        flags: 0,
        nlink: 1,
        uid: 0,
        gid: 0,
        atimeMs: 0,
        birthtimeMs: 0,
        mtimeMs: 0,
        ctimeMs: 0,
        version: 0,
        rdev: 0,
      },
    };
    const directories = new Set<string>();
    for (const [path, entry] of this.entries) {
      if (entry.kind === 'dir') directories.add(path);
      let parent = path;
      while (parent.lastIndexOf('/') > 0) {
        parent = parent.slice(0, parent.lastIndexOf('/'));
        directories.add(parent);
      }
    }
    let ino = 1;
    for (const directory of [...directories].sort()) {
      result[directory] = {
        ino: ino++,
        data: ino,
        size: 0,
        mode: DIR_MODE,
        flags: 0,
        nlink: 1,
        uid: 0,
        gid: 0,
        atimeMs: 0,
        birthtimeMs: 0,
        mtimeMs: 0,
        ctimeMs: 0,
        version: 0,
        rdev: 0,
      };
    }
    for (const entry of this.entries.values()) {
      result[entry.path] = {
        ino: ino++,
        data: ino,
        size: entry.kind === 'dir' ? 0 : entry.size,
        mode: entry.kind === 'dir' ? DIR_MODE : FILE_MODE,
        flags: 0,
        nlink: 1,
        uid: 0,
        gid: 0,
        atimeMs: entry.mtimeMs,
        birthtimeMs: entry.mtimeMs,
        mtimeMs: entry.mtimeMs,
        ctimeMs: entry.mtimeMs,
        version: 0,
        rdev: 0,
      };
    }
    return { version: 1, maxSize: 1024 * 1024, entries: result };
  }
}
