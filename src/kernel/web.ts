import { contentPathForLauncherPath, personalSites, siteForContentPath, siteForLauncherPath } from './sites';

export interface WebSite {
  host: string;
  path: string;
  title: string;
  description: string;
  favorite?: boolean;
  /** Period-correct hostnames that still resolve to this route. */
  aliases?: string[];
}

export interface OldNetSite {
  title: string;
  url: string;
  description: string;
}

export const OLDNET_ORIGIN = 'https://theoldnet.com';
/** Same-origin caching API, deployed from `worker/oldnet.ts`. */
export const OLDNET_API_PREFIX = '/api/oldnet/v2';
export const OLDNET_DEFAULT_YEAR = 1998;
export const OLDNET_YEARS = [1996, 1997, 1998, 1999, 2000, 2001, 2002, 2003, 2004, 2005, 2006];

export const WEB_ORIGIN = 'http://www.pants.place';
const WEB_HOSTS = ['pants.place', 'www.pants.place'];

/** Direct (uncached) The Old Net URL. Kept as a fallback if the API is down. */
export function oldNetDirectUrl(url: string, year = OLDNET_DEFAULT_YEAR): string {
  const query = new URLSearchParams({
    year: String(year),
    scripts: 'false',
    decode: 'false',
    url,
  });
  return `${OLDNET_ORIGIN}/get?${query.toString()}`;
}

/**
 * Same-origin URL for the cached archive API. The Worker at
 * `/api/oldnet/*` fetches The Old Net once and caches the sanitized result.
 */
export function oldNetProxyUrl(url: string, year = OLDNET_DEFAULT_YEAR): string {
  if (url.startsWith(OLDNET_API_PREFIX)) return url;
  const original = oldNetOriginalUrl(url) ?? url;
  let target = original;
  // Normalize absolute URLs so the browser and the Worker agree on the
  // canonical cache key (e.g. a missing trailing slash).
  if (/^https?:\/\//i.test(original)) {
    try {
      const parsed = new URL(original);
      parsed.hash = '';
      target = parsed.href;
    } catch {
      // Keep the original string.
    }
  }
  const query = new URLSearchParams({
    url: target,
    year: String(year),
  });
  return `${OLDNET_API_PREFIX}/get?${query.toString()}`;
}

export function oldNetOriginalUrl(href: string): string | null {
  try {
    const parsed = new URL(href, OLDNET_ORIGIN);
    if (parsed.hostname !== 'theoldnet.com' || parsed.pathname !== '/get') return null;
    const original = parsed.searchParams.get('url');
    if (!original) return null;
    return /^https?:\/\//i.test(original) ? original : `http://${original}`;
  } catch {
    return null;
  }
}

export function normalizeExternalUrl(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  const candidate = /^https?:\/\//i.test(value)
    ? value
    : /^[\w.-]+\.[a-z]{2,}(?:[/:?#]|$)/i.test(value)
      ? `http://${value}`
      : null;
  if (!candidate) return null;
  try {
    return new URL(candidate).href;
  } catch {
    return null;
  }
}

export function isOldNetHost(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === 'theoldnet.com' || host.endsWith('.theoldnet.com');
  } catch {
    return false;
  }
}

export const oldNetFavorites: OldNetSite[] = [
  {
    title: 'The Old Net',
    url: 'http://theoldnet.com/',
    description: 'Archived versions of the 1990s web.',
  },
  {
    title: "Old'aVista",
    url: 'http://www.oldavista.com/',
    description: 'A search engine for old personal homepages.',
  },
  {
    title: 'Winamp',
    url: 'http://www.winamp.com/',
    description: 'Skins, plugins and the llama.',
  },
  {
    title: 'GeoCities',
    url: 'http://www.geocities.com/',
    description: 'The lost city of personal homepages.',
  },
  {
    title: 'Yahoo!',
    url: 'http://www.yahoo.com/',
    description: 'The 1998 directory of everything.',
  },
  {
    title: 'AltaVista',
    url: 'http://www.altavista.com/',
    description: 'The search engine of the old web.',
  },
];

const baseWebSites: WebSite[] = [
  {
    host: `${WEB_ORIGIN}/`,
    path: '/web/',
    title: 'PantsNet Start Page',
    description: 'How to use the PantsNet browser, plus the local and Old Net webrings.',
    favorite: true,
    aliases: [
      'http://www.pantsplace.net/',
      'http://pantsplace.net/',
    ],
  },
  {
    host: `${WEB_ORIGIN}/news/`,
    path: '/web/news/',
    title: 'Pants News',
    description: 'Site updates, Y2K prep, and other important transmissions.',
    favorite: true,
    aliases: ['http://www.pantsplace.net/news/', 'http://pantsplace.net/news/'],
  },
  {
    host: `${WEB_ORIGIN}/blog/`,
    path: '/web/blog/',
    title: 'The Pants Log',
    description: 'A devlog from a bedroom in 1998.',
    favorite: true,
    aliases: ['http://www.pantsplace.net/blog/', 'http://pantsplace.net/blog/'],
  },
  {
    host: `${WEB_ORIGIN}/downloads/`,
    path: '/web/downloads/',
    title: 'Downloads',
    description: 'Wallpapers, MIDI files, and 88x31 buttons.',
    aliases: ['http://www.pantsplace.net/downloads/', 'http://pantsplace.net/downloads/'],
  },
  {
    host: `${WEB_ORIGIN}/guestbook/`,
    path: '/web/guestbook/',
    title: 'Guestbook',
    description: 'Sign the guestbook. Please.',
    aliases: ['http://www.pantsplace.net/guestbook/', 'http://pantsplace.net/guestbook/'],
  },
  {
    host: `${WEB_ORIGIN}/webring/`,
    path: '/web/webring/',
    title: 'The Cool Webring',
    description: 'A ring of extremely cool websites.',
    aliases: ['http://www.webring.org/pantsring/', 'http://webring.org/pantsring/'],
  },
  {
    host: `${WEB_ORIGIN}/search/`,
    path: '/web/search/',
    title: 'AltaVista Search',
    description: 'Search the world wide web.',
    favorite: true,
    aliases: ['http://www.altavista.com/', 'http://altavista.com/'],
  },
];

/** Period-correct aliases retained when the old ~ pages were replaced. */
const LEGACY_SITE_ALIASES: Record<string, string[]> = {
  'member/pants': [
    'http://www.geocities.com/SiliconValley/Byte/1998/',
    'http://geocities.com/SiliconValley/Byte/1998/',
  ],
  'member/kylie': [
    'http://members.tripod.com/~kylie_log/',
    'http://www.tripod.com/~kylie_log/',
  ],
  'member/shades': [
    'http://www.geocities.com/SiliconValley/Byte/1998/ultimateshades/',
    'http://geocities.com/SiliconValley/Byte/1998/ultimateshades/',
  ],
};

const personalWebSites: WebSite[] = personalSites.map((site) => ({
  host: site.address,
  path: site.contentPath,
  title: site.title,
  description: site.description,
  favorite: site.favorite,
  aliases: [
    // Sites used to be mirrored from GitHub Pages. Treat those URLs as local
    // so links in already-published subsite pages keep working inside IE.
    `https://pants-the-person.github.io/${site.repo}/`,
    `http://pants-the-person.github.io/${site.repo}/`,
    ...(LEGACY_SITE_ALIASES[`${site.kind}/${site.slug}`] || []),
  ],
}));

export const webSites: WebSite[] = [...baseWebSites, ...personalWebSites];

function hostKey(value: string): string {
  return value
    .trim()
    .replace(/^https?:\/\//i, '')
    .split(/[?#]/, 1)[0]
    .replace(/\/index\.html?$/i, '/')
    .replace(/\/+$/, '')
    .toLowerCase();
}

function personalHostPath(hostPath: string): string | null {
  // Accept the aliases that used to point at the fake-web mirror as well as
  // the plural form some links use.
  const canonical = hostPath
    .replace(/^members\//, 'member/')
    .replace(/^users\//, 'member/');
  const site = personalSites.find(
    (entry) => canonical === `${entry.kind}/${entry.slug}` || canonical.startsWith(`${entry.kind}/${entry.slug}/`),
  );
  if (!site) return null;
  const relative = canonical.slice(`${site.kind}/${site.slug}`.length).replace(/^\/+/, '');
  return relative ? `${site.contentPath}${relative}/` : site.contentPath;
}

function pathFromHostPath(hostPath: string): string {
  const clean = hostPath.replace(/^\/+/, '').replace(/\/+$/, '');
  if (!clean) return '/web/';
  const personal = personalHostPath(clean);
  if (personal) return personal;
  if (clean.startsWith('sites/')) {
    const internal = `/${clean}/`;
    if (siteForContentPath(internal)) return internal;
  }
  return `/web/${clean}/`;
}

function normalizedPath(raw: string): string {
  let clean = raw.split(/[?#]/, 1)[0].replace(/\/index\.html?$/i, '/');
  // The original personal-site scheme used /users/<name>; canonicalize it to
  // /member/<name> so old fake-web and browser addresses keep working.
  if (/^\/web\/users(?:\/|$)/.test(clean)) {
    clean = `/web/member${clean.slice('/web/users'.length)}`;
  }
  if (/^\/web\/members(?:\/|$)/.test(clean)) {
    clean = `/web/member${clean.slice('/web/members'.length)}`;
  }
  // Keep the removed ~pages inside the current sites.
  clean = clean
    .replace(/^\/web\/~pants(?=\/|$)/, '/web/member/pants')
    .replace(/^\/web\/~kylie(?=\/|$)/, '/web/member/kylie')
    .replace(/^\/web\/~ultimateshades(?=\/|$)/, '/web/member/shades');
  // Personal sites used to be mirrored under /web/. They are now served by
  // their own Workers under /sites/, so resolve the old path directly.
  if (/^\/web\/(?:member|char)(?:\/|$)/.test(clean)) {
    clean = `/sites${clean.slice('/web'.length)}`;
  }
  if (!clean.endsWith('/')) clean += '/';
  return clean;
}

export function pathToAddress(path: string): string {
  const clean = normalizedPath(path);

  // Longest route first so /web/blog/... wins over /web/.
  const byLength = [...webSites].sort((a, b) => b.path.length - a.path.length);
  const exact = byLength.find((site) => site.path === clean);
  if (exact) return exact.host;
  const nested = byLength.find((site) => clean.startsWith(site.path));
  if (nested) {
    return `${nested.host.replace(/\/$/, '')}/${clean.slice(nested.path.length)}`;
  }
  return `${WEB_ORIGIN}${clean}`;
}

export function addressToPath(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  if (raw.startsWith('/web') || raw === '/web') {
    return normalizedPath(raw);
  }

  // Desktop launcher paths such as /member/pants, /members/pants,
  // /users/pants or /char/chogi point at the desktop deep link.
  const launcherCandidate = raw.startsWith('/') ? raw : `/${raw}`;
  if (/^\/(?:member|members|users|char)\//.test(launcherCandidate)) {
    const site = siteForLauncherPath(launcherCandidate);
    if (site) return contentPathForLauncherPath(launcherCandidate, site);
  }

  // Internal routes used by the IE iframe. Accepting them makes the address
  // bar resilient if a link points directly at the content origin.
  if (launcherCandidate.startsWith('/sites/') && siteForContentPath(launcherCandidate)) {
    return normalizedPath(launcherCandidate);
  }

  // Friendly shortcuts: "news", "blog", "kylie", etc.
  const shortcut = raw.replace(/^\/+|\/+$/g, '').toLowerCase();
  const shortcutSite = webSites.find((site) => {
    const parts = site.path.split('/').filter(Boolean);
    return parts[parts.length - 1]?.toLowerCase() === shortcut;
  });
  if (shortcutSite) return shortcutSite.path;

  const hostPath = hostKey(raw);

  // Every path on the canonical domain belongs to the fake web.
  for (const host of WEB_HOSTS) {
    if (hostPath === host) return '/web/';
    if (hostPath.startsWith(`${host}/`)) {
      return normalizedPath(pathFromHostPath(hostPath.slice(host.length + 1)));
    }
  }

  // Legacy hosts and period-correct aliases. Longest base first so a
  // GeoCities subdirectory alias wins over its parent neighbourhood.
  const aliases = webSites
    .flatMap((site) => [site.host, ...(site.aliases || [])].map((candidate) => ({
      base: hostKey(candidate),
      site,
    })))
    .sort((a, b) => b.base.length - a.base.length);

  for (const { base, site } of aliases) {
    if (hostPath === base) return site.path;
    if (hostPath.startsWith(`${base}/`)) {
      return normalizedPath(`${site.path}${hostPath.slice(base.length + 1)}/`);
    }
  }

  return null;
}

export function resolveWebPath(path: string): string {
  // Only allow our own static web routes and personal-site Workers inside the
  // browser frame.
  if (path.startsWith('/web/') || path === '/web') return path;
  if (siteForLauncherPath(path) || siteForContentPath(path)) return path;
  return '/web/cannot/';
}
