import { signal } from '@preact/signals';
import type { DesktopDocument } from './types';
import type { MediaEntry } from '../integrations/media-manifest';
import { buildVfs, type VfsFile, type VfsFolder } from './vfs';
import { createFileSystemLayers, layerStatus, type LayerBundle, type LayerState } from './fs-layers';

export type DriveId = 'a' | 'c' | 'd';

export interface DriveInfo {
  id: 'A' | 'C' | 'D';
  drive: DriveId;
  label: string;
  kind: 'floppy' | 'disk' | 'cdrom';
  readOnly: boolean;
  icon: string;
  status: LayerState;
  root: VfsFolder;
}

const ZEN_ROOT = '/c';
const DRIVE_ROOTS: Record<DriveId, string> = { a: '/a', c: '/c', d: '/d' };
const DRIVE_DEFS = [
  { id: 'A' as const, drive: 'a' as const, label: '3½ Floppy (A:)', kind: 'floppy' as const, readOnly: true, icon: '/icons/dos.svg' },
  { id: 'C' as const, drive: 'c' as const, label: 'Win98 (C:)', kind: 'disk' as const, readOnly: false, icon: '/icons/computer.svg' },
  { id: 'D' as const, drive: 'd' as const, label: 'PantsNet (D:)', kind: 'cdrom' as const, readOnly: true, icon: '/icons/cd.svg' },
];
const META_DIR = '/c/.pants';
const META_PATH = `${META_DIR}/meta.json`;
const SEED_PATH = `${META_DIR}/seed.json`;
const MAX_WINE_FILE_BYTES = 64 * 1024 * 1024;
const MAX_WINE_TOTAL_BYTES = 256 * 1024 * 1024;

type ZenFs = typeof import('@zenfs/core').fs;
type NodeMeta = {
  openWith?: string;
  icon?: string;
  props?: Record<string, unknown>;
  url?: string;
  mediaId?: string;
  size?: number;
};

export interface WineFsRecord {
  path: string;
  kind: 'file' | 'dir' | 'whiteout';
  name?: string;
  data?: Uint8Array;
  size?: number;
  attrs?: number;
}

let fsPromise: Promise<ZenFs> | null = null;
let layerBundle: LayerBundle | null = null;
let fsp: ZenFs['promises'] | null = null;
let metaCache: Record<string, NodeMeta> = {};
let staticMetaPromise: Promise<Record<string, NodeMeta>> | null = null;
let readyPromise: Promise<void> | null = null;
let metaWrite = Promise.resolve();

export const fileSystem = signal<VfsFolder>(buildVfs([], []));
export const fileSystemReady = signal(false);
export const fileSystemError = signal<string | null>(null);
export const drives = signal<DriveInfo[]>(
  DRIVE_DEFS.map((definition) => ({
    ...definition,
    status: 'unavailable',
    root: {
      type: 'folder',
      name: `${definition.id}:`,
      path: `${definition.drive}:\\`,
      modified: '',
      children: [],
    },
  })),
);

export function normalizeWinPath(input: string): string {
  let path = String(input || '').replace(/\//g, '\\').replace(/\\+/g, '\\').trim();
  if (!/^[a-z]:/i.test(path)) path = 'c:\\' + path.replace(/^\\+/, '');
  const parts = path.split('\\');
  const drive = `${parts.shift()?.slice(0, 2).toLowerCase()}\\`;
  const out: string[] = [];
  for (const part of parts) {
    if (!part || part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return out.length ? `${drive}${out.join('\\')}` : drive;
}

export function winKey(path: string): string {
  return normalizeWinPath(path).toLowerCase();
}

export function driveOfWin(path: string): DriveId {
  const normalized = normalizeWinPath(path);
  const drive = normalized[0]?.toLowerCase();
  return drive === 'a' || drive === 'd' ? drive : 'c';
}

export function winToZen(path: string): string {
  const normalized = normalizeWinPath(path);
  const drive = driveOfWin(normalized);
  const root = DRIVE_ROOTS[drive];
  if (normalized === `${drive}:\\`) return root;
  return `${root}/${normalized.slice(3).split('\\').join('/')}`;
}

export function zenToWin(path: string): string {
  const clean = String(path || '').replace(/\\/g, '/').replace(/\/+$/, '');
  for (const drive of ['a', 'c', 'd'] as DriveId[]) {
    const root = DRIVE_ROOTS[drive];
    if (clean === root) return `${drive}:\\`;
    if (clean.startsWith(`${root}/`)) {
      return `${drive}:\\${clean.slice(root.length + 1).split('/').join('\\')}`;
    }
  }
  const rest = clean.replace(/^\/+/, '');
  return rest ? `c:\\${rest.split('/').join('\\')}` : 'c:\\';
}

async function ensureFs(): Promise<ZenFs> {
  if (fsPromise) return fsPromise;
  fsPromise = (async () => {
    const { configure, fs } = await import('@zenfs/core');
    const layers = await createFileSystemLayers();
    layerBundle = layers;
    await configure({
      mounts: layers.mounts as never,
    });
    await layers.prepare?.();
    return fs;
  })();
  return fsPromise;
}

async function zen(): Promise<ZenFs> {
  const fs = await ensureFs();
  fsp = fs.promises;
  return fs;
}

async function ensureC() {
  await zen();
  if (!fsp) throw new Error('ZenFS promises API is unavailable');
  await fsp.mkdir(ZEN_ROOT, { recursive: true }).catch(() => {});
}

async function exists(path: string): Promise<boolean> {
  if (!fsp) return false;
  try {
    await fsp.stat(path);
    return true;
  } catch {
    return false;
  }
}

async function resolveZen(path: string): Promise<string | null> {
  if (!fsp) return null;
  const normalized = normalizeWinPath(path);
  const drive = driveOfWin(normalized);
  const root = DRIVE_ROOTS[drive];
  if (normalized === `${drive}:\\`) return root;
  const parts = normalized.slice(3).split('\\').filter(Boolean);
  let current = root;
  for (const part of parts) {
    let entries: string[] = [];
    try {
      entries = await fsp.readdir(current);
    } catch {
      return null;
    }
    const hit = entries.find((entry) => entry.toLowerCase() === part.toLowerCase());
    if (!hit) return null;
    current = `${current}/${hit}`;
  }
  return current;
}

async function loadStaticMeta(): Promise<Record<string, NodeMeta>> {
  if (!staticMetaPromise) {
    staticMetaPromise = fetch('/vfs-static.meta.json', { cache: 'no-cache' })
      .then(async (response) => (response.ok ? await response.json() : {}))
      .catch(() => ({}));
  }
  const parsed = await staticMetaPromise;
  return parsed && typeof parsed === 'object' ? parsed : {};
}

async function loadMeta() {
  if (!fsp) return;
  const base = await loadStaticMeta();
  try {
    const text = await fsp.readFile(META_PATH, 'utf8');
    const parsed = JSON.parse(text);
    metaCache = { ...base, ...(parsed && typeof parsed === 'object' ? parsed : {}) };
  } catch {
    metaCache = { ...base };
  }
}

async function saveMeta() {
  if (!fsp) return;
  metaWrite = metaWrite.then(async () => {
    await fsp!.mkdir(META_DIR, { recursive: true }).catch(() => {});
    await fsp!.writeFile(META_PATH, JSON.stringify(metaCache, null, 2));
  });
  await metaWrite;
}

function metaFor(path: string): NodeMeta | undefined {
  return metaCache[winKey(path)];
}

function setMeta(path: string, meta: NodeMeta) {
  metaCache[winKey(path)] = meta;
}

function removeMetaPrefix(path: string) {
  const key = winKey(path);
  for (const existing of Object.keys(metaCache)) {
    if (existing === key || existing.startsWith(`${key}\\`)) delete metaCache[existing];
  }
}

async function writeSeedTree(zenDir: string, folder: VfsFolder) {
  if (!fsp) return;
  await fsp.mkdir(zenDir, { recursive: true }).catch(() => {});
  for (const child of folder.children) {
    const childZen = `${zenDir}/${child.name}`;
    const winPath = zenToWin(childZen);
    if (child.type === 'folder') {
      await writeSeedTree(childZen, child);
      continue;
    }
    let data: string | Uint8Array = '';
    if (child.url) {
      data = `[InternetShortcut]\nURL=${child.url}\nX-Pants-Media-Id=${String(child.props?.mediaId ?? '')}\n`;
    } else if (child.ext === 'lnk') {
      data = JSON.stringify({
        appId: child.openWith || null,
        icon: child.icon || null,
        props: child.props || {},
      });
    } else if (child.content !== undefined) {
      data = child.content;
    }
    await fsp.writeFile(childZen, data);
    const meta: NodeMeta = {};
    if (child.openWith) meta.openWith = child.openWith;
    if (child.icon) meta.icon = child.icon;
    if (child.props) meta.props = child.props;
    if (child.url) meta.url = child.url;
    if (child.props?.mediaId) meta.mediaId = String(child.props.mediaId);
    if (child.url) meta.size = child.size;
    setMeta(winPath, meta);
  }
}

async function seed(documents: DesktopDocument[], media: MediaEntry[]) {
  if (!fsp) return;
  await fsp.mkdir(META_DIR, { recursive: true }).catch(() => {});
  const seeded = await exists(SEED_PATH);
  if (!seeded) {
    // The base tree is hosted as the read-only static layer. Only fall back
    // to copying it into OPFS when that layer could not be loaded.
    if (layerStatus.value.static === 'unavailable') {
      const root = buildVfs(documents, media);
      await writeSeedTree(ZEN_ROOT, root);
    }
    await fsp.writeFile(SEED_PATH, JSON.stringify({ version: 2, layers: true }, null, 2));
    await saveMeta();
  }
  await migrateNotes();
}

async function migrateNotes() {
  if (!fsp || typeof localStorage === 'undefined') return;
  const keys: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('pp98:note:')) keys.push(key);
    }
  } catch {
    return;
  }
  for (const key of keys) {
    const filename = key.slice('pp98:note:'.length);
    if (!filename || /[\\/:*?"<>|]/.test(filename)) continue;
    const winPath = `c:\\My Documents\\${filename}`;
    const target = await resolveZen(winPath);
    if (target) continue;
    const text = localStorage.getItem(key);
    if (text == null) continue;
    const parent = await resolveZen('c:\\My Documents');
    if (!parent) continue;
    await fsp.writeFile(`${parent}/${filename}`, text);
    setMeta(winPath, { openWith: 'notepad' });
    try {
      localStorage.removeItem(key);
    } catch {
      /* leave the old note if storage is read-only */
    }
  }
  if (keys.length) await saveMeta();
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot < 0 ? '' : name.slice(dot + 1).toLowerCase();
}

function defaultOpenWith(name: string): string | undefined {
  const ext = extensionOf(name);
  if (!ext || ['txt', 'md', 'ini', 'log', 'bat', 'cfg', 'sys', 'asm'].includes(ext)) return 'notepad';
  if (ext === 'exe') return 'wine';
  if (ext === 'zip' || ext === 'iso' || ext === 'cue') return 'wine';
  if (
    ['mid', 'midi', 'ogg', 'oga', 'opus', 'mp3', 'wav', 'flac', 'm4a', 'aac', 'url'].includes(ext)
  ) {
    return 'winamp';
  }
  return undefined;
}

async function buildTree(zenDir: string, winDir: string): Promise<VfsFolder> {
  if (!fsp) throw new Error('ZenFS is not ready');
  const names = await fsp.readdir(zenDir);
  const children: Array<VfsFile | VfsFolder> = [];
  for (const name of names) {
    if (name === '.pants') continue;
    const childZen = `${zenDir}/${name}`;
    const winPath = zenToWin(childZen);
    const stat = await fsp.stat(childZen);
    if (stat.isDirectory()) {
      children.push(await buildTree(childZen, winPath));
      continue;
    }
    let meta = metaFor(winPath);
    const ext = extensionOf(name);
    const drive = driveOfWin(winPath);
    // Static/R2 layers cannot carry Pants metadata. Media names use the same
    // slugged id as the build-time playlist, so derive the player id here.
    if (!meta && ['mid', 'midi', 'ogg', 'oga', 'opus', 'mp3', 'wav', 'flac', 'm4a', 'aac'].includes(ext)) {
      if (drive === 'c' && /^c:\\media\\/i.test(winPath)) {
        const relative = winPath.replace(/^c:\\media\\/i, '').replace(/\\/g, '/');
        const mediaId = relative.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
        meta = { openWith: 'winamp', props: { mediaId } };
      } else {
        meta = { openWith: 'winamp' };
      }
    }
    children.push({
      type: 'file',
      name,
      path: winKey(winPath),
      ext,
      size: typeof meta?.size === 'number' ? meta.size : Number(stat.size) || 0,
      modified: new Date(Number(stat.mtimeMs) || Date.now()).toLocaleString(),
      url: meta?.url,
      icon: meta?.icon,
      openWith: meta?.openWith || defaultOpenWith(name),
      props: meta?.props,
    });
  }
  children.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
  return {
    type: 'folder',
    name:
      winDir === 'c:\\' || winDir === 'a:\\' || winDir === 'd:\\'
        ? `${driveOfWin(winDir).toUpperCase()}:`
        : winDir.split('\\').pop() || winDir,
    path: winKey(winDir),
    modified: new Date().toLocaleString(),
    children,
  };
}

async function tryBuildTree(zenDir: string, winDir: string): Promise<VfsFolder> {
  try {
    if (!fsp) throw new Error('ZenFS is not ready');
    await fsp.readdir(zenDir);
    return await buildTree(zenDir, winDir);
  } catch {
    return {
      type: 'folder',
      name: `${driveOfWin(winDir).toUpperCase()}:`,
      path: winKey(winDir),
      modified: '',
      children: [],
    };
  }
}

export async function refreshFileSystem() {
  await ensureC();
  if (!fsp) return;
  await loadMeta();
  const [cRoot, aRoot, dRoot] = await Promise.all([
    tryBuildTree('/c', 'c:\\'),
    tryBuildTree('/a', 'a:\\'),
    tryBuildTree('/d', 'd:\\'),
  ]);
  fileSystem.value = cRoot;
  drives.value = DRIVE_DEFS.map((definition) => ({
    ...definition,
    status:
      definition.drive === 'a'
        ? layerStatus.value.floppy
        : definition.drive === 'd'
          ? layerStatus.value.r2
          : layerStatus.value.static,
    root:
      definition.drive === 'a' ? aRoot : definition.drive === 'd' ? dRoot : cRoot,
  }));
  fileSystemReady.value = true;
}

export async function initFileSystem(documents: DesktopDocument[], media: MediaEntry[]) {
  if (readyPromise) return readyPromise;
  readyPromise = (async () => {
    try {
      await ensureC();
      await loadMeta();
      await seed(documents, media);
      await refreshFileSystem();
    } catch (error) {
      fileSystemError.value = error instanceof Error ? error.message : String(error);
      fileSystemReady.value = true;
      throw error;
    }
  })();
  return readyPromise;
}

function validName(name: string): string | null {
  const clean = name.trim();
  if (!clean || clean === '.' || clean === '..') return null;
  if (/[\\/:*?"<>|]/.test(clean)) return null;
  return clean;
}

function assertWritable(path: string) {
  if (driveOfWin(path) !== 'c') throw new Error('That drive is read-only.');
}

export async function createFolder(parentPath: string, name: string) {
  const clean = validName(name);
  if (!clean) throw new Error('Invalid folder name.');
  assertWritable(parentPath);
  await ensureC();
  const parent = await resolveZen(parentPath);
  if (!parent) throw new Error('The folder no longer exists.');
  if (await resolveZen(`${parentPath}\\${clean}`)) throw new Error('That name already exists.');
  await fsp!.mkdir(`${parent}/${clean}`);
  await refreshFileSystem();
  return `${parentPath}\\${clean}`;
}

export async function createTextFile(parentPath: string, name: string, content = '') {
  const clean = validName(name);
  if (!clean) throw new Error('Invalid file name.');
  assertWritable(parentPath);
  await ensureC();
  const parent = await resolveZen(parentPath);
  if (!parent) throw new Error('The folder no longer exists.');
  if (await resolveZen(`${parentPath}\\${clean}`)) throw new Error('That name already exists.');
  await fsp!.writeFile(`${parent}/${clean}`, content);
  setMeta(`${parentPath}\\${clean}`, { openWith: 'notepad' });
  await saveMeta();
  await refreshFileSystem();
  return `${parentPath}\\${clean}`;
}

export async function readTextFile(path: string): Promise<string> {
  await ensureC();
  const target = await resolveZen(path);
  if (!target) throw new Error(`Cannot find ${path}.`);
  const data = layerBundle
    ? await layerBundle.readFile(target)
    : new Uint8Array(await fsp!.readFile(target));
  return new TextDecoder().decode(data);
}

export async function readFileBytes(path: string): Promise<Uint8Array> {
  await ensureC();
  const target = await resolveZen(path);
  if (!target) throw new Error(`Cannot find ${path}.`);
  return layerBundle
    ? layerBundle.readFile(target)
    : new Uint8Array(await fsp!.readFile(target));
}

export async function writeTextFile(path: string, content: string) {
  assertWritable(path);
  await ensureC();
  const target = await resolveZen(path);
  if (!target) {
    const parent = await resolveZen(normalizeWinPath(path).replace(/\\[^\\]*$/, ''));
    if (!parent) throw new Error('The folder no longer exists.');
    await fsp!.writeFile(`${parent}/${normalizeWinPath(path).split('\\').pop()}`, content);
  } else {
    await fsp!.writeFile(target, content);
  }
  if (!metaFor(path)?.openWith) {
    setMeta(path, { openWith: 'notepad' });
    await saveMeta();
  }
  await refreshFileSystem();
}

export async function writeBinaryFile(path: string, data: Uint8Array) {
  assertWritable(path);
  await ensureC();
  const normalized = normalizeWinPath(path);
  const parentPath = normalized.replace(/\\[^\\]*$/, '');
  const parent = await resolveZen(parentPath);
  if (!parent) throw new Error('The folder no longer exists.');
  const name = normalized.split('\\').pop() || 'file.bin';
  await fsp!.writeFile(`${parent}/${name}`, data);
  await refreshFileSystem();
}

export async function uploadFiles(parentPath: string, files: File[]) {
  assertWritable(parentPath);
  await ensureC();
  const parent = await resolveZen(parentPath);
  if (!parent) throw new Error('The folder no longer exists.');
  for (const file of files) {
    const name = validName(file.name) || `file-${Date.now()}`;
    const data = new Uint8Array(await file.arrayBuffer());
    await fsp!.writeFile(`${parent}/${name}`, data);
  }
  await refreshFileSystem();
}

export async function renameNode(path: string, newName: string) {
  const clean = validName(newName);
  if (!clean) throw new Error('Invalid name.');
  assertWritable(path);
  await ensureC();
  const source = await resolveZen(path);
  if (!source) throw new Error('The file no longer exists.');
  const normalized = normalizeWinPath(path);
  const parentWin = normalized.replace(/\\[^\\]*$/, '');
  const parentZen = await resolveZen(parentWin);
  if (!parentZen) throw new Error('The folder no longer exists.');
  if (source === `${parentZen}/${clean}`) return;
  if (await resolveZen(`${parentWin}\\${clean}`)) throw new Error('That name already exists.');
  await fsp!.rename(source, `${parentZen}/${clean}`);

  const oldKey = winKey(path);
  const newWin = `${parentWin}\\${clean}`;
  const newKey = winKey(newWin);
  const next: Record<string, NodeMeta> = {};
  for (const [key, value] of Object.entries(metaCache)) {
    if (key === oldKey) next[newKey] = value;
    else if (key.startsWith(`${oldKey}\\`)) next[`${newKey}${key.slice(oldKey.length)}`] = value;
    else next[key] = value;
  }
  metaCache = next;
  await saveMeta();
  await refreshFileSystem();
}

export async function deleteNode(path: string) {
  assertWritable(path);
  await ensureC();
  const target = await resolveZen(path);
  if (!target) return;
  await fsp!.rm(target, { recursive: true, force: true });
  removeMetaPrefix(path);
  await saveMeta();
  await refreshFileSystem();
}

export async function snapshotForWine(): Promise<{ records: WineFsRecord[]; warnings: string[] }> {
  await ensureC();
  if (!fsp) return { records: [], warnings: ['ZenFS is not ready'] };
  await loadMeta();
  const records: WineFsRecord[] = [];
  const warnings: string[] = [];
  let total = 0;

  async function walk(zenDir: string) {
    const names = await fsp!.readdir(zenDir);
    for (const name of names) {
      if (name === '.pants') continue;
      const childZen = `${zenDir}/${name}`;
      const winPath = zenToWin(childZen);
      const stat = await fsp!.stat(childZen);
      if (stat.isDirectory()) {
        records.push({ path: winPath.toLowerCase(), kind: 'dir', name });
        await walk(childZen);
        continue;
      }
      const meta = metaFor(winPath);
      if (meta?.url || extensionOf(name) === 'url') continue;
      if (stat.size > MAX_WINE_FILE_BYTES || total + stat.size > MAX_WINE_TOTAL_BYTES) {
        warnings.push(`${winPath} is too large to mount into Wine.`);
        continue;
      }
      const data = layerBundle
        ? await layerBundle.readFile(childZen)
        : new Uint8Array(await fsp!.readFile(childZen));
      total += data.length;
      records.push({
        path: winPath.toLowerCase(),
        kind: 'file',
        name,
        data,
        size: data.length,
        attrs: 0x20,
      });
    }
  }

  await walk(ZEN_ROOT);
  return { records, warnings };
}

export async function readFileRange(path: string, offset: number, length: number): Promise<Uint8Array> {
  const data = await readFileBytes(path);
  return data.slice(offset, offset + length);
}

export async function applyWineRecords(records: WineFsRecord[]): Promise<{ written: number; removed: number }> {
  await ensureC();
  if (!fsp) return { written: 0, removed: 0 };
  let written = 0;
  let removed = 0;
  for (const record of records || []) {
    const rawPath = String(record.path || '');
    if (!/^[a-z]:\\/i.test(rawPath)) continue;
    const path = normalizeWinPath(rawPath);
    const key = winKey(path);
    if (!key.startsWith('c:\\')) continue;
    if (
      key === 'c:\\windows\\temp' ||
      key.startsWith('c:\\windows\\temp\\') ||
      key === 'c:\\temp' ||
      key.startsWith('c:\\temp\\') ||
      key === 'c:\\windows\\recent' ||
      key.startsWith('c:\\windows\\recent\\')
    ) {
      continue;
    }
    const parentWin = path.replace(/\\[^\\]*$/, '');
    const parent = await resolveZen(parentWin);
    if (!parent) continue;
    if (record.kind === 'whiteout') {
      const target = await resolveZen(path);
      if (target) {
        await fsp.rm(target, { recursive: true, force: true });
        removeMetaPrefix(path);
        removed++;
      }
      continue;
    }
    if (record.kind === 'dir') {
      const target = await resolveZen(path);
      if (!target) await fsp.mkdir(`${parent}/${path.split('\\').pop()}`, { recursive: true });
      written++;
      continue;
    }
    if (record.kind === 'file' && record.data) {
      const name = path.split('\\').pop() || 'file.bin';
      await fsp.writeFile(`${parent}/${name}`, new Uint8Array(record.data));
      written++;
    }
  }
  await saveMeta();
  await refreshFileSystem();
  return { written, removed };
}

export async function storageEstimate() {
  try {
    const estimate = await navigator.storage?.estimate?.();
    return estimate || null;
  } catch {
    return null;
  }
}
