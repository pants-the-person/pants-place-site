export interface WebSite {
  host: string;
  path: string;
  title: string;
  description: string;
  favorite?: boolean;
}

export const webSites: WebSite[] = [
  {
    host: 'http://www.pantsplace.net/',
    path: '/web/',
    title: 'PANTS PLACE 98',
    description: 'The official homepage of pants_the_person. 486 tuning, MIDI, webrings.',
    favorite: true,
  },
  {
    host: 'http://www.pantsplace.net/news/',
    path: '/web/news/',
    title: 'Pants News',
    description: 'Site updates, Y2K prep, and other important transmissions.',
    favorite: true,
  },
  {
    host: 'http://www.pantsplace.net/blog/',
    path: '/web/blog/',
    title: 'The Pants Log',
    description: 'A devlog from a bedroom in 1998.',
    favorite: true,
  },
  {
    host: 'http://members.tripod.com/~kylie_log/',
    path: '/web/~kylie/',
    title: "Kylie's Cyber Sanctuary",
    description: 'Friend site. Best viewed in Netscape 4.0.',
    favorite: true,
  },
  {
    host: 'http://www.geocities.com/SiliconValley/Byte/1998/',
    path: '/web/~pants/',
    title: 'pants_the_person // GeoCities',
    description: 'The older, louder, more animated homepage.',
  },
  {
    host: 'http://www.pantsplace.net/downloads/',
    path: '/web/downloads/',
    title: 'Downloads',
    description: 'Wallpapers, MIDI files, and 88x31 buttons.',
  },
  {
    host: 'http://www.pantsplace.net/guestbook/',
    path: '/web/guestbook/',
    title: 'Guestbook',
    description: 'Sign the guestbook. Please.',
  },
  {
    host: 'http://www.webring.org/pantsring/',
    path: '/web/webring/',
    title: 'The Cool Webring',
    description: 'A ring of extremely cool websites.',
  },
  {
    host: 'http://www.altavista.com/',
    path: '/web/search/',
    title: 'AltaVista Search',
    description: 'Search the world wide web.',
    favorite: true,
  },
];

export function pathToAddress(path: string): string {
  const clean = path.replace(/\/index\.html$/, '/');
  const site = webSites.find((s) => s.path === clean);
  if (site) return site.host;
  const withSlash = clean.endsWith('/') ? clean : `${clean}/`;
  const nested = webSites.find((s) => withSlash.startsWith(s.path));
  if (nested) return `${nested.host}${withSlash.slice(nested.path.length)}`;
  return `http://www.pantsplace.net${clean}`;
}

export function addressToPath(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  const normalized = raw.replace(/^https?:\/\//i, '').replace(/\/+$/, '') + '/';
  for (const site of webSites) {
    const host = site.host.replace(/^https?:\/\//i, '').replace(/\/+$/, '') + '/';
    if (normalized === host) return site.path;
    if (normalized.startsWith(host)) {
      return `${site.path}${normalized.slice(host.length)}`;
    }
  }
  // Friendly shortcuts: "news", "blog", "kylie"
  const short = normalized.replace(/\/+$/, '').toLowerCase();
  const match = webSites.find((s) => {
    const parts = s.path.split('/').filter(Boolean);
    return parts[parts.length - 1]?.toLowerCase() === short;
  });
  if (match) return match.path;
  return null;
}

export function resolveWebPath(path: string): string {
  // Only allow our own static web routes inside the browser frame.
  if (path.startsWith('/web/') || path === '/web') return path;
  return '/web/cannot/';
}
