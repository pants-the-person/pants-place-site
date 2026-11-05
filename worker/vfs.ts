/**
 * Pants Place VFS read-only R2 worker.
 *
 * The browser mounts this as a ZenFS Fetch layer. It never writes to R2.
 * Route: https://pants.place/api/vfs/r2/*
 */

const API_PREFIX = '/api/vfs/r2';
const ROOT_PATH = '/';
const DIR_MODE = 0o40000 | 0o777;
const FILE_MODE = 0o100000 | 0o644;

type Env = {
  VFS_BUCKET?: any;
  VFS_PREFIX?: string;
  VFS_ACCESS_BUCKET?: any;
};

const BASE_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Range, Content-Type',
  'X-Content-Type-Options': 'nosniff',
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: BASE_HEADERS });
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return text(405, 'Method not allowed.', { Allow: 'GET, HEAD, OPTIONS' });
    }
    if (!url.pathname.startsWith(API_PREFIX)) {
      return text(404, 'Unknown VFS route.');
    }
    if (!env.VFS_BUCKET) {
      return text(503, 'The VFS R2 binding is not configured.');
    }

    if (url.pathname === `${API_PREFIX}/index.json`) {
      return indexResponse(env, url);
    }

    const keyPath = decodePath(url.pathname.slice(API_PREFIX.length + 1));
    if (keyPath === null) return text(400, 'Invalid object path.');
    return objectResponse(request, env, keyPath);
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

async function indexResponse(env: Env, url: URL): Promise<Response> {
  const entries: Record<string, Record<string, unknown>> = {
    [ROOT_PATH]: {
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
    entries[dir] = {
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

  for (const object of objects) {
    entries[object.path] = {
      ino: ino++,
      data: ino,
      size: object.size,
      mode: FILE_MODE,
      flags: 0,
      nlink: 1,
      uid: 0,
      gid: 0,
      atimeMs: object.uploaded,
      birthtimeMs: object.uploaded,
      mtimeMs: object.uploaded,
      ctimeMs: object.uploaded,
      version: 0,
      rdev: 0,
    };
  }

  const body = JSON.stringify({
    version: 1,
    maxSize: 1024 * 1024 * 1024,
    entries,
  });
  return new Response(body, {
    headers: {
      ...BASE_HEADERS,
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
      'X-VFS-Objects': String(objects.length),
      'X-VFS-Path': url.pathname,
    },
  });
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

function contentType(key: string): string {
  const ext = key.slice(key.lastIndexOf('.') + 1).toLowerCase();
  const types: Record<string, string> = {
    txt: 'text/plain; charset=utf-8',
    md: 'text/markdown; charset=utf-8',
    html: 'text/html; charset=utf-8',
    css: 'text/css; charset=utf-8',
    js: 'text/javascript; charset=utf-8',
    json: 'application/json; charset=utf-8',
    mid: 'audio/midi',
    midi: 'audio/midi',
    ogg: 'audio/ogg',
    oga: 'audio/ogg',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    svg: 'image/svg+xml',
    exe: 'application/octet-stream',
    zip: 'application/zip',
    iso: 'application/octet-stream',
  };
  return types[ext] || 'application/octet-stream';
}

async function objectResponse(request: Request, env: Env, keyPath: string): Promise<Response> {
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
