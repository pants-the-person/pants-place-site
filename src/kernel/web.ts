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
export const OLDNET_DEFAULT_YEAR = 1998;
export const OLDNET_YEARS = [1996, 1997, 1998, 1999, 2000, 2001, 2002, 2003, 2004, 2005, 2006];

export const WEB_ORIGIN = 'http://www.pants.place';
const WEB_HOSTS = ['pants.place', 'www.pants.place'];

export function oldNetProxyUrl(url: string, year = OLDNET_DEFAULT_YEAR): string {
  if (/^https?:\/\/theoldnet\.com\/get/i.test(url)) return url;
  const query = new URLSearchParams({
    year: String(year),
    scripts: 'false',
    decode: 'false',
    url,
  });
  return `${OLDNET_ORIGIN}/get?${query.toString()}`;
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

export const webSites: WebSite[] = [
  {
    host: `${WEB_ORIGIN}/`,
    path: '/web/',
    title: 'PANTS PLACE 98',
    description: 'The official homepage of pants_the_person. 486 tuning, MIDI, webrings.',
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
    host: `${WEB_ORIGIN}/~kylie/`,
    path: '/web/~kylie/',
    title: "Kylie's Cyber Sanctuary",
    description: 'Final Fantasy, Gundam Wing and warehouse raves, updated from a bedroom in 1998.',
    favorite: true,
    aliases: [
      'http://members.tripod.com/~kylie_log/',
      'http://www.tripod.com/~kylie_log/',
    ],
  },
  {
    host: `${WEB_ORIGIN}/~pants/`,
    path: '/web/~pants/',
    title: 'pants_the_person // GeoCities',
    description: 'The older, louder, more animated homepage.',
    aliases: ['http://www.geocities.com/SiliconValley/Byte/1998/'],
  },
  {
    host: `${WEB_ORIGIN}/~ultimateshades/`,
    path: '/web/~ultimateshades/',
    title: 'UltimateShades',
    description: 'A 1998 gaming shrine: Monkey Island, LucasArts adventures, reviews and high scores.',
    favorite: true,
    aliases: [
      'http://www.geocities.com/SiliconValley/Byte/1998/ultimateshades/',
      'http://geocities.com/SiliconValley/Byte/1998/ultimateshades/',
    ],
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

function hostKey(value: string): string {
  return value
    .trim()
    .replace(/^https?:\/\//i, '')
    .replace(/\/index\.html?$/i, '/')
    .replace(/\/+$/, '')
    .toLowerCase();
}

function pathFromHostPath(hostPath: string): string {
  const clean = hostPath.replace(/^\/+/, '').replace(/\/+$/, '');
  if (!clean) return '/web/';
  return `/web/${clean}/`;
}

function normalizedPath(raw: string): string {
  let clean = raw.split(/[?#]/, 1)[0].replace(/\/index\.html?$/i, '/');
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
  // Only allow our own static web routes inside the browser frame.
  if (path.startsWith('/web/') || path === '/web') return path;
  return '/web/cannot/';
}
