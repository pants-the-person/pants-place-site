/**
 * Pants Place VFS worker.
 *
 * Exposes the three Explorer drives as read-through VFS layers:
 *   A: the FreeDOS/v86 boot floppy (read-only FAT12 view)
 *   C: the generated Windows 98 mock tree (read-only base)
 *   D: the read-only R2 bucket binding
 *
 * Routes:
 *   /api/vfs/drives.json
 *   /api/vfs/{a|c|d}/index.json
 *   /api/vfs/{a|c|d}/<path>
 *   /api/vfs/r2/* is kept as an alias for /api/vfs/d/*.
 */

import { Fat12Image } from './fat12';

const API_PREFIX = '/api/vfs';
const DIR_MODE = 0o40000 | 0o777;
const FILE_MODE = 0o100000 | 0o644;

type Env = {
  VFS_BUCKET?: any;
  VFS_PREFIX?: string;
  VFS_SITE_ORIGIN?: string;
  VFS_FLOPPY_URL?: string;
};

const BASE_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Range, Content-Type',
  'X-Content-Type-Options': 'nosniff',
};

const DRIVES = [
  {
    id: 'A',
    label: '3½ Floppy (A:)',
    kind: 'floppy',
    readOnly: true,
    icon: '/icons/dos.svg',
    baseUrl: '/api/vfs/a',
  },
  {
    id: 'C',
    label: 'Win98 (C:)',
    kind: 'disk',
    readOnly: false,
    icon: '/icons/computer.svg',
    baseUrl: '/api/vfs/c',
  },
  {
    id: 'D',
    label: 'PantsNet (D:)',
    kind: 'cdrom',
    readOnly: true,
    icon: '/icons/cd.svg',
    baseUrl: '/api/vfs/d',
  },
];

let floppyPromise: Promise<Fat12Image> | null = null;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: BASE_HEADERS });
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return text(405, 'Method not allowed.', { Allow: 'GET, HEAD, OPTIONS' });
    }
    if (url.pathname === `${API_PREFIX}/drives.json`) {
      return json({ drives: DRIVES });
    }
    if (!url.pathname.startsWith(`${API_PREFIX}/`)) {
      return text(404, 'Unknown VFS route.');
    }

    const rest = url.pathname.slice(API_PREFIX.length + 1);
    const [drive, ...tail] = rest.split('/');
    const suffix = tail.join('/');

    if (drive === 'a') return floppyResponse(request, env, suffix);
    if (drive === 'd' || drive === 'r2') return r2Response(request, env, suffix);
    if (drive === 'c') return cResponse(request, env, suffix);
    return text(404, 'Unknown VFS drive.');
  },
};

function text(status: number, message: string, extra: Record<string, string> = {}) {
  return new Response(message, {
    status,
    headers: {
      ...BASE_HEADERS,
      'Content-Type': 'text/plain; charset=utf-8',
      ...extra,
    },
  });
}

function json(body: unknown, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    headers: {
      ...BASE_HEADERS,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
      ...extra,
    },
  });
}

function decodePath(value: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    return null;
  }
  const clean = decoded.replace(/^\/+/, '');
  if (!clean || clean.split('/').some((part) => !part || part === '.' || part === '..')) return null;
  return clean;
}

function siteOrigin(env: Env) {
  return (env.VFS_SITE_ORIGIN || 'https://pants.place').replace(/\/+$/, '');
}

function contentType(key: string): string {
  const ext = key.slice(key.lastIndexOf('.') + 1).toLowerCase();
  const types: Record<string, string> = {
    txt: 'text/plain; charset=utf-8',
    md: 'text/markdown; charset=utf-8',
    html: 'text/html; charset=utf-8',
    css: 'text/css; charset=utf-8',
    js: 'text/javascript; charset=utf-8',
    json: 'application/json; charset=utf-8',
    ini: 'text/plain; charset=utf-8',
    bat: 'text/plain; charset=utf-8',
    sys: 'application/octet-stream',
    com: 'application/octet-stream',
    exe: 'application/octet-stream',
    mid: 'audio/midi',
    midi: 'audio/midi',
    ogg: 'audio/ogg',
    oga: 'audio/ogg',
    mp3: 'audio/mpeg',
    wav: 'audio/wav',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    zip: 'application/zip',
    iso: 'application/octet-stream',
    img: 'application/octet-stream',
  };
  return types[ext] || 'application/octet-stream';
}

function parseRange(header: string | null): { offset?: number; length?: number; suffix?: number } | undefined {
  if (!header) return undefined;
  const match = /^bytes=(\d*)-(\d*)$/i.exec(header.trim());
  if (!match) return undefined;
  const [, start, end] = match;
  if (!start && end) return { suffix: Number(end) };
  if (!start) return undefined;
  const offset = Number(start);
  if (!Number.isSafeInteger(offset) || offset < 0) return undefined;
  if (!end) return { offset };
  const last = Number(end);
  if (!Number.isSafeInteger(last) || last < offset) return undefined;
  return { offset, length: last - offset + 1 };
}

function bucketPrefix(env: Env): string {
  return (env.VFS_PREFIX || '').replace(/^\/+|\/+$/g, '');
}

function vfsPath(key: string, env: Env): string | null {
  const prefix = bucketPrefix(env);
  if (prefix) {
    if (!key.startsWith(`${prefix}/`)) return null;
    key = key.slice(prefix.length + 1);
  }
  if (!key || key.endsWith('/')) return null;
  const parts = key.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) return null;
  return `/${parts.join('/')}`;
}

async function r2Response(request: Request, env: Env, suffix: string) {
  if (!env.VFS_BUCKET) return text(503, 'The VFS R2 binding is not configured.');
  const url = new URL(request.url);
  if (suffix === 'index.json') return r2Index(env, url);
  const keyPath = decodePath(suffix);
  if (keyPath === null) return text(400, 'Invalid object path.');
  return r2Object(request, env, keyPath);
}

async function r2Index(env: Env, url: URL): Promise<Response> {
  const entries: Record<string, Record<string, unknown>> = {
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
  const objects: Array<{ path: string; size: number; uploaded: number }> = [];
  let cursor: string | undefined;

  while (true) {
    const page = await env.VFS_BUCKET.list({
      cursor,
      ...(bucketPrefix(env) ? { prefix: `${bucketPrefix(env)}/` } : {}),
    });
    for (const object of page.objects || []) {
      if (object.key.endsWith('/')) continue;
      const path = vfsPath(object.key, env);
      if (!path) continue;
      objects.push({
        path,
        size: Number(object.size) || 0,
        uploaded: new Date(object.uploaded || Date.now()).getTime(),
      });
    }
    if (!page.truncated) break;
    cursor = page.cursor;
  }

  for (const object of objects) {
    let parent = object.path;
    while (parent.lastIndexOf('/') > 0) {
      parent = parent.slice(0, parent.lastIndexOf('/'));
      directories.add(parent);
    }
  }

  let ino = 1;
  for (const dir of [...directories].sort()) {
    entries[dir] = makeEntry(ino++, ino, 0, DIR_MODE, 0);
  }
  for (const object of objects) {
    entries[object.path] = makeEntry(ino++, ino, object.size, FILE_MODE, object.uploaded);
  }

  return json(
    { version: 1, maxSize: 1024 * 1024 * 1024, entries },
    {
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
      'X-VFS-Objects': String(objects.length),
      'X-VFS-Path': url.pathname,
    },
  );
}

function makeEntry(ino: number, data: number, size: number, mode: number, mtimeMs: number) {
  return {
    ino,
    data,
    size,
    mode,
    flags: 0,
    nlink: 1,
    uid: 0,
    gid: 0,
    atimeMs: mtimeMs,
    birthtimeMs: mtimeMs,
    mtimeMs,
    ctimeMs: mtimeMs,
    version: 0,
    rdev: 0,
  };
}

async function r2Object(request: Request, env: Env, keyPath: string): Promise<Response> {
  const prefix = bucketPrefix(env);
  const key = prefix ? `${prefix}/${keyPath}` : keyPath;
  const range = parseRange(request.headers.get('range'));
  const headers = new Headers(BASE_HEADERS);
  headers.set('Content-Type', contentType(keyPath));
  headers.set('Cache-Control', 'public, max-age=300');
  headers.set('Accept-Ranges', 'bytes');

  if (request.method === 'HEAD') {
    const object = await env.VFS_BUCKET.head(key);
    if (!object) return text(404, 'Not found.');
    headers.set('Content-Length', String(object.size));
    if (object.httpEtag) headers.set('ETag', object.httpEtag);
    return new Response(null, { headers });
  }

  const object = await env.VFS_BUCKET.get(key, range ? { range } : undefined);
  if (!object) return text(404, 'Not found.');
  if (object.writeHttpMetadata) object.writeHttpMetadata(headers);
  if (object.httpEtag) headers.set('ETag', object.httpEtag);
  const total = object.size;
  if (range) {
    const offset = range.offset ?? Math.max(0, total - (range.suffix || 0));
    const length = range.length ?? Math.max(0, total - offset);
    headers.set('Content-Range', `bytes ${offset}-${offset + Math.max(0, length - 1)}/${total}`);
    headers.set('Content-Length', String(length));
    return new Response(object.body, { status: 206, headers });
  }
  headers.set('Content-Length', String(total));
  return new Response(object.body, { headers });
}

async function cResponse(request: Request, env: Env, suffix: string) {
  const origin = siteOrigin(env);
  if (suffix === 'index.json') {
    const response = await fetch(`${origin}/vfs-static.index.json`, {
      headers: { Accept: 'application/json' },
      cf: { cacheTtl: 60 },
    });
    if (!response.ok) return text(response.status, 'The C: mock index is unavailable.');
    return new Response(response.body, {
      headers: {
        ...BASE_HEADERS,
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
      },
    });
  }
  const keyPath = decodePath(suffix);
  if (keyPath === null) return text(400, 'Invalid C: path.');
  return proxyStatic(request, `${origin}/vfs-static/${keyPath.split('/').map(encodeURIComponent).join('/')}`);
}

async function proxyStatic(request: Request, target: string): Promise<Response> {
  const headers: Record<string, string> = {};
  const range = request.headers.get('range');
  if (range) headers.Range = range;
  let response: Response;
  try {
    response = await fetch(target, { headers, cf: { cacheTtl: 300 } });
  } catch {
    return text(502, 'The C: static layer is unavailable.');
  }
  if (!response.ok) return text(response.status, 'C: file not found.');
  const out = new Headers(BASE_HEADERS);
  out.set('Content-Type', response.headers.get('content-type') || 'application/octet-stream');
  out.set('Cache-Control', 'public, max-age=300');
  if (response.headers.has('content-length')) out.set('Content-Length', response.headers.get('content-length')!);
  if (response.headers.has('content-range')) out.set('Content-Range', response.headers.get('content-range')!);
  if (response.headers.has('accept-ranges')) out.set('Accept-Ranges', response.headers.get('accept-ranges')!);
  return new Response(request.method === 'HEAD' ? null : response.body, {
    status: response.status,
    headers: out,
  });
}

async function loadFloppy(env: Env): Promise<Fat12Image> {
  if (!floppyPromise) {
    const url = env.VFS_FLOPPY_URL || `${siteOrigin(env)}/v86/freedos722.img`;
    floppyPromise = fetch(url, { cf: { cacheTtl: 86400 } })
      .then((response) => {
        if (!response.ok) throw new Error(`Floppy image returned ${response.status}.`);
        return response.arrayBuffer();
      })
      .then((buffer) => new Fat12Image(buffer))
      .catch((error) => {
        floppyPromise = null;
        throw error;
      });
  }
  return floppyPromise;
}

async function floppyResponse(request: Request, env: Env, suffix: string) {
  if (!suffix || suffix === 'index.json') {
    try {
      const image = await loadFloppy(env);
      return json(image.toZenIndex(), {
        'Cache-Control': 'public, max-age=300, stale-while-revalidate=600',
      });
    } catch (error) {
      return text(503, `The A: floppy image is unavailable: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const keyPath = decodePath(suffix);
  if (keyPath === null) return text(400, 'Invalid A: path.');
  try {
    const image = await loadFloppy(env);
    const data = image.readFile(`/${keyPath}`);
    if (!data) return text(404, 'File not found on the A: floppy.');
    const headers = new Headers(BASE_HEADERS);
    headers.set('Content-Type', contentType(keyPath));
    headers.set('Cache-Control', 'public, max-age=300');
    headers.set('Content-Length', String(data.length));
    return new Response(request.method === 'HEAD' ? null : data, { headers });
  } catch (error) {
    return text(503, `The A: floppy image is unavailable: ${error instanceof Error ? error.message : String(error)}`);
  }
}
