import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { loadWineApps, desktopAppIds, loadHelpers } from './apps.mjs';
import {
  liveBase,
  wineRoot,
  publicWineRoot,
  assetCacheRoot,
  lockPath,
  excludedApps,
} from './config.mjs';

const PART_SIZE = 10 * 1024 * 1024;
const SPLIT_OVER = 20 * 1024 * 1024;
const CONCURRENCY = 8;
const force = process.argv.includes('--force');

// Upstream holds these back for redistribution terms. Never mirror them even
// if an app names the path.
const NEVER_PUBLISH = new Set([
  'binaries/dlls/mfc30.dll',
  'binaries/dlls/msvcrt20.dll',
]);
const NEVER_PUBLISH_PREFIXES = [
  'test/binaries/candidates/morrowind/',
  'binaries/candidates/morrowind/',
  'test/binaries/candidates/myth-the-fallen-lords/',
  'binaries/candidates/myth-the-fallen-lords/',
  'test/binaries/winme-cht/',
  'binaries/winme-cht/',
];

const mod = loadWineApps();
const ids = desktopAppIds(mod);
const helpers = loadHelpers();

function isPublishable(rel) {
  const norm = String(rel || '').replace(/\\/g, '/').replace(/^\.\//, '');
  if (NEVER_PUBLISH.has(norm)) return false;
  if (NEVER_PUBLISH_PREFIXES.some((prefix) => norm.startsWith(prefix))) return false;
  return true;
}

function encodePath(rel) {
  return rel.split('/').map((part) => encodeURIComponent(part)).join('/');
}

function localCandidate(rel) {
  const candidates = [rel];
  if (rel.startsWith('binaries/')) candidates.push('test/binaries/' + rel.slice('binaries/'.length));
  if (rel.startsWith('test/binaries/')) candidates.push(rel);
  return candidates;
}

function cachePaths(rel) {
  const safe = rel.replace(/\\/g, '/');
  const file = path.join(assetCacheRoot, safe);
  return { file, meta: file + '.meta.json' };
}

function readCache(rel) {
  if (force) return null;
  const { file, meta } = cachePaths(rel);
  if (!fs.existsSync(file) || !fs.existsSync(meta)) return null;
  try {
    const info = JSON.parse(fs.readFileSync(meta, 'utf8'));
    const stat = fs.statSync(file);
    if (info.size !== stat.size) return null;
    return fs.readFileSync(file);
  } catch {
    return null;
  }
}

function writeCache(rel, bytes) {
  const { file, meta } = cachePaths(rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, bytes);
  fs.writeFileSync(
    meta,
    JSON.stringify({
      size: bytes.length,
      sha256: crypto.createHash('sha256').update(bytes).digest('hex'),
    }),
  );
}

async function fetchBytes(url, timeoutMs = 120000) {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) return { status: response.status, bytes: null };
  return { status: response.status, bytes: Buffer.from(await response.arrayBuffer()) };
}

async function fetchParts(baseUrl) {
  const chunks = [];
  for (let index = 0; index < 500; index++) {
    const name = `${baseUrl}.part${String(index).padStart(3, '0')}`;
    const result = await fetchBytes(name, 180000);
    if (result.status !== 200) {
      if (index === 0) return { status: result.status, bytes: null };
      return { status: 200, bytes: Buffer.concat(chunks) };
    }
    chunks.push(result.bytes);
    if (result.bytes.length < PART_SIZE) break;
  }
  return { status: 200, bytes: Buffer.concat(chunks) };
}

async function fetchRemote(rel) {
  const encoded = encodePath(rel);
  const direct = await fetchBytes(liveBase + encoded);
  if (direct.status === 200) return direct;
  if (direct.status !== 404) return direct;

  // Upstream's deploy publishes spaces as underscores.
  const underscored = rel.replace(/ /g, '_');
  if (underscored !== rel) {
    const alt = await fetchBytes(liveBase + encodePath(underscored));
    if (alt.status === 200) return alt;
    if (alt.status !== 404) return alt;
    const parts = await fetchParts(liveBase + encodePath(underscored));
    if (parts.status === 200) return parts;
  }

  const parts = await fetchParts(liveBase + encoded);
  if (parts.status === 200) return parts;
  return { status: 404, bytes: null };
}

function readLocal(rel) {
  for (const candidate of localCandidate(rel)) {
    const full = path.join(wineRoot, candidate);
    if (fs.existsSync(full) && fs.statSync(full).isFile()) {
      return fs.readFileSync(full);
    }
  }
  return null;
}

async function getAssetBytes(rel) {
  const cached = readCache(rel);
  if (cached) return { bytes: cached, source: 'cache' };
  let bytes = null;
  let source = 'network';
  try {
    const remote = await fetchRemote(rel);
    if (remote.bytes) bytes = remote.bytes;
  } catch (error) {
    // A network failure falls back to the local submodule copy when possible.
    source = `network:${error && error.message ? error.message : error}`;
  }
  if (!bytes) {
    bytes = readLocal(rel);
    source = bytes ? 'submodule' : 'missing';
  }
  if (bytes) writeCache(rel, bytes);
  return { bytes, source };
}

function appPaths(id) {
  const app = mod.APPS[id];
  const paths = new Set();
  if (!app) return { app: null, paths, manifest: null };
  if (app.exe) paths.add(app.exe);
  for (const dll of app.dlls || []) {
    if (String(dll).includes('/')) paths.add(dll);
  }
  for (const item of app.files || []) {
    const url = typeof item === 'string' ? item : item && item.url;
    if (url) paths.add(url);
  }
  for (const dll of Object.values(helpers.dlls.DLL_PATHS || {})) {
    if (isPublishable(dll)) paths.add(dll);
  }
  for (const rel of [...paths]) {
    if (!isPublishable(rel)) paths.delete(rel);
  }
  return { app, paths, manifest: app.localFileManifest || null };
}

async function addManifest(paths, manifestRel) {
  if (!manifestRel || !isPublishable(manifestRel)) return;
  paths.add(manifestRel);
  const result = await getAssetBytes(manifestRel);
  if (!result.bytes) {
    console.warn(`  missing manifest ${manifestRel}`);
    return;
  }
  let json;
  try {
    json = JSON.parse(result.bytes.toString('utf8'));
  } catch {
    console.warn(`  unreadable manifest ${manifestRel}`);
    return;
  }
  const dir = manifestRel.replace(/[^/]*$/, '');
  for (const file of json.files || []) {
    if (!file || !file.url) continue;
    const url = file.url.startsWith('/') ? file.url.slice(1) : dir + file.url;
    const normalized = path.posix.normalize(url);
    if (isPublishable(normalized)) paths.add(normalized);
  }
}

function isNE(bytes) {
  if (!bytes || bytes.length < 0x40 || bytes[0] !== 0x4d || bytes[1] !== 0x5a) return false;
  const offset = bytes.readUInt32LE(0x3c);
  return offset + 2 <= bytes.length && bytes[offset] === 0x4e && bytes[offset + 1] === 0x45;
}

async function addWin16Modules(paths, app) {
  if (!app || !app.exe || !isNE(await getAssetBytes(app.exe).then((r) => r.bytes))) return;
  let modules = [];
  try {
    modules = helpers.dllLoader.win16StageableModules((await getAssetBytes(app.exe)).bytes) || [];
  } catch {
    modules = [];
  }
  modules = [...new Set([...modules, ...(app.win16Modules || [])])];
  const dir = path.posix.dirname(app.exe) + '/';
  for (const module of modules) {
    const candidates = helpers.vfsSeed.win16FileCandidates(module) || [];
    for (const candidate of candidates) {
      const rel = path.posix.join(dir, candidate);
      if (!isPublishable(rel)) continue;
      if (paths.has(rel)) break;
      const result = await getAssetBytes(rel);
      if (result.bytes) {
        paths.add(rel);
        break;
      }
    }
  }
}

async function mapLimit(items, limit, worker) {
  const queue = [...items];
  const out = new Map();
  await Promise.all(
    Array.from({ length: Math.min(limit, queue.length) }, async () => {
      while (queue.length) {
        const item = queue.shift();
        out.set(item, await worker(item));
      }
    }),
  );
  return out;
}

function safeWrite(rel, bytes) {
  const full = path.join(publicWineRoot, rel.replace(/\\/g, '/'));
  fs.mkdirSync(path.dirname(full), { recursive: true });

  const existing = [];
  for (const entry of fs.readdirSync(path.dirname(full))) {
    if (entry.startsWith(path.basename(full) + '.part')) existing.push(path.join(path.dirname(full), entry));
  }
  for (const file of existing) fs.rmSync(file, { force: true });

  if (bytes.length > SPLIT_OVER) {
    fs.rmSync(full, { force: true });
    for (let offset = 0, index = 0; offset < bytes.length; offset += PART_SIZE, index++) {
      const part = bytes.subarray(offset, Math.min(bytes.length, offset + PART_SIZE));
      fs.writeFileSync(`${full}.part${String(index).padStart(3, '0')}`, part);
    }
    if (bytes.length % PART_SIZE === 0) {
      fs.writeFileSync(`${full}.part${String(bytes.length / PART_SIZE).padStart(3, '0')}`, Buffer.alloc(0));
    }
    return;
  }
  fs.writeFileSync(full, bytes);
}

export async function syncAssets() {
  fs.mkdirSync(assetCacheRoot, { recursive: true });
  fs.mkdirSync(publicWineRoot, { recursive: true });

  const apps = {};
  const allPaths = new Set();

  for (const id of ids) {
    const { app, paths } = appPaths(id);
    if (!app) continue;
    if (app.localFileManifest) await addManifest(paths, app.localFileManifest);
    await addWin16Modules(paths, app);
    apps[id] = { paths: [...paths].sort(), missing: [] };
    for (const rel of paths) allPaths.add(rel);
  }

  const files = {};
  let downloaded = 0;
  let missing = 0;
  const ordered = [...allPaths].sort();
  const results = await mapLimit(ordered, CONCURRENCY, async (rel) => {
    const result = await getAssetBytes(rel);
    if (result.bytes) {
      safeWrite(rel, result.bytes);
      files[rel] = {
        size: result.bytes.length,
        sha256: crypto.createHash('sha256').update(result.bytes).digest('hex'),
      };
      downloaded++;
    } else {
      missing++;
      console.warn(`  missing ${rel}`);
    }
    return result.bytes ? true : false;
  });

  for (const id of Object.keys(apps)) {
    apps[id].missing = apps[id].paths.filter((rel) => !results.get(rel));
  }

  const lock = {
    generatedAt: new Date().toISOString(),
    upstream: liveBase,
    upstreamCommit: (() => {
      try {
        return fs.readFileSync(path.join(publicWineRoot, 'version.json'), 'utf8').match(/"commit":\s*"([^"]+)"/)?.[1] || null;
      } catch {
        return null;
      }
    })(),
    excludedApps: [...excludedApps].sort(),
    files,
    apps,
  };
  fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');

  console.log(
    `Wine assets: ${downloaded} files, ${missing} missing, ` +
    `${(Object.values(files).reduce((sum, file) => sum + file.size, 0) / 1048576).toFixed(1)} MiB`,
  );
  return lock;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  syncAssets().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
