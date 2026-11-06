import { personalSites, type GeneratedPersonalSite } from '../generated/personal-sites';

export type PersonalSite = GeneratedPersonalSite;

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

/** Find a personal site from its desktop launcher path, e.g. /member/pants. */
export function siteForLauncherPath(pathname: string): PersonalSite | null {
  const normalized = normalizeSitePath(pathname);
  return (
    [...personalSites]
      .sort((a, b) => b.launcherPath.length - a.launcherPath.length)
      .find((site) => pathMatches(normalized, site.launcherPath)) ?? null
  );
}

/** Find a personal site from its raw content path, e.g. /web/member/pants/. */
export function siteForContentPath(pathname: string): PersonalSite | null {
  const normalized = normalizeSitePath(pathname);
  return (
    [...personalSites]
      .sort((a, b) => b.contentPath.length - a.contentPath.length)
      .find((site) => pathMatches(`${normalized}/`, site.contentPath)) ?? null
  );
}

export function isPersonalContentPath(pathname: string): boolean {
  return siteForContentPath(pathname) !== null;
}

/** The part of a launcher path after the site root, with no leading slash. */
export function siteRelativePath(pathname: string, site: PersonalSite): string {
  const normalized = normalizeSitePath(pathname);
  if (!pathMatches(normalized, site.launcherPath)) return '';
  return normalized.slice(site.launcherPath.length).replace(/^\/+/, '');
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
