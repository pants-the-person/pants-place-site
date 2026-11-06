/**
 * Pants Place — cached The Old Net API.
 *
 * This is a separate Worker from the static site. It is routed at
 * `https://pants.place/api/oldnet/*` and deployed with `wrangler.api.jsonc`.
 * The site Worker is untouched and keeps serving `dist/` as static assets.
 *
 * Cloudflare Workers Cache (enabled in `wrangler.api.jsonc`) caches these
 * responses at the edge, so repeat requests for an archived page never reach
 * The Old Net or run this script.
 */

const OLDNET_ORIGIN = 'https://theoldnet.com';
const API_PREFIX = '/api/oldnet/v2';

const DEFAULT_YEAR = 1998;
const MIN_YEAR = 1996;
const MAX_YEAR = 2012;

/** Archived pages are immutable; keep them for a year. */
const PAGE_TTL = 31_536_000;
/** Search results change, so only cache them briefly. */
const SEARCH_TTL = 300;

const MAX_HTML_BYTES = 8 * 1024 * 1024;
const MAX_URL_LENGTH = 2048;
const UPSTREAM_TIMEOUT_MS = 15_000;

/**
 * The Old Net deflects obvious bots to a "Hello World" placeholder. A normal
 * browser User-Agent gets the real archive response. Do not remove this.
 */
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

const BASE_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex, nofollow',
  'Referrer-Policy': 'no-referrer',
};

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: BASE_HEADERS });
    }

    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return errorResponse(405, 'Method not allowed. Use GET.', {
        Allow: 'GET, HEAD, OPTIONS',
      });
    }

    if (url.pathname === `${API_PREFIX}/health`) {
      return jsonResponse(
        { ok: true, upstream: OLDNET_ORIGIN, api: API_PREFIX },
        { 'Cache-Control': 'no-store' },
      );
    }

    if (url.pathname === `${API_PREFIX}/get`) {
      return handlePage(request, url);
    }

    if (url.pathname === `${API_PREFIX}/find`) {
      return handleFind(request, url);
    }

    return errorResponse(404, 'Unknown Old Net API route.');
  },
};

async function handlePage(request: Request, url: URL): Promise<Response> {
  const target = normalizeTarget(url.searchParams.get('url'));
  if (!target) {
    return errorResponse(400, 'Pass a valid http(s) url parameter.');
  }

  const year = parseYear(url.searchParams.get('year'));
  if (year === null) {
    return errorResponse(400, `year must be between ${MIN_YEAR} and ${MAX_YEAR}.`);
  }

  // Workers Cache keys on the exact path and query string. Redirect to one
  // canonical form so different parameter orders share a single entry.
  const canonical = `${API_PREFIX}/get?${new URLSearchParams({
    url: target,
    year: String(year),
  }).toString()}`;
  if (url.pathname + url.search !== canonical) {
    return redirectResponse(canonical);
  }

  const upstream = await fetchUpstream('/get', {
    year: String(year),
    scripts: 'false',
    decode: 'false',
    url: target,
  });

  if (!upstream) {
    return errorResponse(504, 'The Old Net did not respond in time.');
  }

  if (upstream.status === 429) {
    return errorResponse(
      503,
      'The Old Net is rate limiting requests. Try again in a minute.',
      { 'Retry-After': '60' },
    );
  }

  if (!upstream.ok) {
    return errorResponse(
      upstream.status === 404 ? 404 : 502,
      `The Old Net returned HTTP ${upstream.status}.`,
    );
  }

  const contentType = upstream.headers.get('content-type') || 'text/html';

  if (!isHtml(contentType)) {
    return passThrough(request, upstream, contentType, PAGE_TTL, true);
  }

  const buffer = await readLimited(upstream, MAX_HTML_BYTES);
  if (!buffer) {
    return errorResponse(502, 'The archived page is too large to proxy.');
  }

  const html = sanitizeHtml(decodeBody(buffer, contentType));
  if (isBotPlaceholder(html)) {
    return errorResponse(
      502,
      'The Old Net returned its bot placeholder. The response was not cached.',
    );
  }
  return htmlResponse(request, html, PAGE_TTL, true);
}

async function handleFind(request: Request, url: URL): Promise<Response> {
  const query = (url.searchParams.get('query') || '').trim();
  if (!query) {
    return errorResponse(400, 'Pass a query parameter.');
  }
  if (query.length > 200) {
    return errorResponse(400, 'query is too long.');
  }

  const canonical = `${API_PREFIX}/find?${new URLSearchParams({ query }).toString()}`;
  if (url.pathname + url.search !== canonical) {
    return redirectResponse(canonical);
  }

  const upstream = await fetchUpstream('/find', { query });

  if (!upstream) {
    return errorResponse(504, 'The Old Net did not respond in time.');
  }

  if (upstream.status === 429) {
    return errorResponse(
      503,
      'The Old Net is rate limiting requests. Try again in a minute.',
      { 'Retry-After': '60' },
    );
  }

  if (!upstream.ok) {
    return errorResponse(
      upstream.status === 404 ? 404 : 502,
      `The Old Net returned HTTP ${upstream.status}.`,
    );
  }

  const contentType = upstream.headers.get('content-type') || 'text/html';

  if (!isHtml(contentType)) {
    return passThrough(request, upstream, contentType, SEARCH_TTL, false);
  }

  const buffer = await readLimited(upstream, MAX_HTML_BYTES);
  if (!buffer) {
    return errorResponse(502, 'The search response is too large to proxy.');
  }

  const html = sanitizeHtml(decodeBody(buffer, contentType));
  if (isBotPlaceholder(html)) {
    return errorResponse(
      502,
      'The Old Net returned its bot placeholder. The response was not cached.',
    );
  }
  return htmlResponse(request, html, SEARCH_TTL, false);
}

async function fetchUpstream(
  pathname: string,
  params: Record<string, string>,
): Promise<Response | null> {
  const target = new URL(pathname, OLDNET_ORIGIN);
  target.search = new URLSearchParams(params).toString();

  try {
    return await fetch(target.toString(), {
      headers: {
        'User-Agent': BROWSER_UA,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        // Let the Worker sanitize and re-encode text itself.
        'Accept-Encoding': 'identity',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch {
    return null;
  }
}

function normalizeTarget(raw: string | null): string | null {
  if (!raw) return null;

  let value = raw.trim();
  if (!value || value.length > MAX_URL_LENGTH) return null;

  if (!/^https?:\/\//i.test(value)) value = `http://${value}`;

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (parsed.username || parsed.password) return null;
    parsed.hash = '';
    return parsed.href;
  } catch {
    return null;
  }
}

function parseYear(value: string | null): number | null {
  if (value === null || value === '') return DEFAULT_YEAR;
  const year = Number(value);
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) return null;
  return year;
}

async function readLimited(
  response: Response,
  limit: number,
): Promise<ArrayBuffer | null> {
  if (!response.body) return new ArrayBuffer(0);

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out.buffer;
}

function decodeBody(buffer: ArrayBuffer, contentType: string): string {
  const match = /charset\s*=\s*("?)([^";]+)\1/i.exec(contentType);
  const requested = (match?.[2] || 'windows-1252').trim().toLowerCase();

  for (const label of [requested, 'utf-8', 'windows-1252', 'iso-8859-1']) {
    try {
      return new TextDecoder(label).decode(buffer);
    } catch {
      // Try the next label.
    }
  }

  // Last resort: treat the bytes as Latin-1.
  const bytes = new Uint8Array(buffer);
  let text = '';
  for (let i = 0; i < bytes.length; i += 8192) {
    text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return text;
}

/**
 * Archived HTML is third-party content. Strip active code before it is
 * injected into the pants.place origin, then cache the sanitized result.
 */
function sanitizeHtml(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<script\b[^>]*\/?>/gi, '')
    .replace(/<base\b[^>]*>/gi, '')
    .replace(/<meta\b[^>]*http-equiv\s*=\s*("?)refresh\1[^>]*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')
    .replace(/\son[a-z]+\s*=\s*[^\s>"']+/gi, '')
    .replace(/javascript\s*:/gi, '');
}

function isHtml(contentType: string): boolean {
  const type = contentType.split(';', 1)[0].trim().toLowerCase();
  return type === 'text/html' || type === 'application/xhtml+xml';
}

/**
 * The Old Net serves a tiny "Hello World" page when it thinks the caller is a
 * bot. Treat it as an error so a bad User-Agent can never poison the cache.
 */
function isBotPlaceholder(html: string): boolean {
  const text = html.trim();
  return text.length <= 32 && /^hello world$/i.test(text);
}

function htmlResponse(
  request: Request,
  html: string,
  maxAge: number,
  immutable: boolean,
): Response {
  const headers = new Headers(BASE_HEADERS);
  headers.set('Content-Type', 'text/html; charset=utf-8');
  // no-transform stops Cloudflare's zone-level JavaScript detections from
  // injecting a challenge script into the archived HTML after this Worker runs.
  headers.set(
    'Cache-Control',
    `public, max-age=${maxAge}${immutable ? ', immutable' : ''}, no-transform`,
  );
  // Only applies when the response is loaded as a document or iframe. It has
  // no effect when the client injects the HTML into srcdoc.
  headers.set(
    'Content-Security-Policy',
    "script-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self' https://www.pants.place",
  );

  return new Response(request.method === 'HEAD' ? null : html, {
    status: 200,
    headers,
  });
}

function passThrough(
  request: Request,
  upstream: Response,
  contentType: string,
  maxAge: number,
  immutable: boolean,
): Response {
  const headers = new Headers(BASE_HEADERS);
  headers.set('Content-Type', contentType);
  headers.set(
    'Cache-Control',
    `public, max-age=${maxAge}${immutable ? ', immutable' : ''}, no-transform`,
  );

  // Deliberately do not copy Set-Cookie, Content-Encoding or Content-Length.
  // Set-Cookie would silently disable caching, and the body has already been
  // decoded by the runtime.
  return new Response(request.method === 'HEAD' ? null : upstream.body, {
    status: upstream.status,
    headers,
  });
}

function redirectResponse(location: string): Response {
  const headers = new Headers(BASE_HEADERS);
  headers.set('Location', location);
  headers.set('Cache-Control', 'public, max-age=86400');
  return new Response(null, { status: 308, headers });
}

function jsonResponse(
  value: unknown,
  extraHeaders: Record<string, string> = {},
): Response {
  const headers = new Headers(BASE_HEADERS);
  headers.set('Content-Type', 'application/json; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  for (const [name, headerValue] of Object.entries(extraHeaders)) {
    headers.set(name, headerValue);
  }
  return new Response(JSON.stringify(value), { status: 200, headers });
}

function errorResponse(
  status: number,
  message: string,
  extraHeaders: Record<string, string> = {},
): Response {
  const headers = new Headers(BASE_HEADERS);
  headers.set('Content-Type', 'text/plain; charset=utf-8');
  headers.set('Cache-Control', 'no-store');
  for (const [name, headerValue] of Object.entries(extraHeaders)) {
    headers.set(name, headerValue);
  }
  return new Response(`${message}\n`, { status, headers });
}
