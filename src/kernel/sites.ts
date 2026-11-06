import { personalSites, type PersonalSite } from '../data/personal-sites';

export type { PersonalSite };
export { personalSites };
export const personalSiteList = personalSites;

/** Normalize a URL path for route comparisons. */
export function normalizeSitePath(value: string): string {
  const raw = String(value || '/').split(/[?#]/, 1)[0] || '/';
  const withLeading = raw.startsWith('/') ? raw : `/${raw}`;
  if (withLeading === '/') return '/';
  return withLeading.replace(/\/+$/, '');
}

function pathMatches(pathname: string, base: string): boolean {
  return pathname === base || pathname.startsWith(`${base}/`);
}

/**
 * Canonical launcher plus legacy aliases.
 *
 * `launcherPath` is the public desktop deep link. The site itself is served from
 * `contentPath` by its own Worker. The `/users/<name>` and `/members/<name>`
 * forms are kept as aliases because they appeared in the original fake-web
 * address scheme.
 */
export function launcherPathsForSite(site: PersonalSite): string[] {
  const paths = [site.launcherPath];
  if (site.kind === 'member') {
    paths.push(`/members/${site.slug}`, `/users/${site.slug}`);
  }
  return [...new Set(paths)];
}

/** Find a personal site from a public path, e.g. /member/pants. */
export function siteForLauncherPath(pathname: string): PersonalSite | null {
  const normalized = normalizeSitePath(pathname);
  const candidates = personalSites
    .flatMap((site) => launcherPathsForSite(site).map((base) => ({ site, base })))
    .sort((a, b) => b.base.length - a.base.length);
  return candidates.find(({ base }) => pathMatches(normalized, base))?.site ?? null;
}

/** Find a personal site from its internal content path, e.g. /sites/member/pants/. */
export function siteForContentPath(pathname: string): PersonalSite | null {
  const normalized = normalizeSitePath(pathname);
  return (
    [...personalSites]
      .sort((a, b) => b.contentPath.length - a.contentPath.length)
      .find((site) => pathMatches(normalized, normalizeSitePath(site.contentPath))) ?? null
  );
}

export function isPersonalContentPath(pathname: string): boolean {
  // Treat public launcher paths as personal too. The IE frame should never
  // recursively boot another desktop if a link slips through.
  return siteForContentPath(pathname) !== null || siteForLauncherPath(pathname) !== null;
}

/** The part of a launcher path after the site root, with no leading slash. */
export function siteRelativePath(pathname: string, site: PersonalSite): string {
  const normalized = normalizeSitePath(pathname);
  const base = launcherPathsForSite(site)
    .sort((a, b) => b.length - a.length)
    .find((candidate) => pathMatches(normalized, candidate));
  if (!base) return '';
  return normalized.slice(base.length).replace(/^\/+/, '');
}

/** The part of an internal content path after the site root. */
export function contentRelativePath(pathname: string, site: PersonalSite): string {
  const normalized = normalizeSitePath(pathname);
  const base = normalizeSitePath(site.contentPath);
  if (!pathMatches(normalized, base)) return '';
  return normalized.slice(base.length).replace(/^\/+/, '');
}

/** Translate an internal content path back to its public desktop path. */
export function launcherPathForContentPath(pathname: string, site: PersonalSite): string {
  const relative = contentRelativePath(pathname, site);
  return relative ? `${site.launcherPath}/${relative}` : site.launcherPath;
}

/** Build the fake-browser address for any launcher path. */
export function addressForLauncherPath(pathname: string, site = siteForLauncherPath(pathname)): string {
  if (!site) return '';
  const relative = siteRelativePath(pathname, site);
  if (!relative) return site.address;
  if (/\.html?$/i.test(relative)) return `${site.address}${relative}`;
  return `${site.address}${relative}/`;
}

/** Build the internal content path for any launcher path. */
export function contentPathForLauncherPath(pathname: string, site = siteForLauncherPath(pathname)): string {
  if (!site) return '';
  const relative = siteRelativePath(pathname, site);
  if (!relative) return site.contentPath;
  if (/\.html?$/i.test(relative)) return `${site.contentPath}${relative}`;
  return `${site.contentPath}${relative}/`;
}
