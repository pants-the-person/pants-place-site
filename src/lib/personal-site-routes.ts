import fs from 'node:fs';
import path from 'node:path';
import type { PersonalSiteDeepLink } from '../kernel/autostart';
import type { PersonalSite } from '../kernel/sites';

const contentRoot = path.resolve(process.cwd(), 'public/web');

function walkHtml(dir: string, base = ''): string[] {
  if (!fs.existsSync(dir)) return [];
  const files: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    const relative = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...walkHtml(full, relative));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith('.html')) files.push(relative);
  }
  return files;
}

export interface PersonalSiteRoute {
  params: { path: string };
  props: { site: PersonalSite; deepLink: PersonalSiteDeepLink };
}

function routesForSite(site: PersonalSite): PersonalSiteRoute[] {
  const dir = path.join(contentRoot, site.kind, site.slug);
  const htmlFiles = walkHtml(dir).filter((file) => file !== '404.html' && file !== '500.html');
  const routes = new Map<string, PersonalSiteRoute>();
  const base: PersonalSiteRoute = {
    params: { path: site.launcherPath.replace(/^\//, '') },
    props: { site, deepLink: { siteId: `${site.kind}/${site.slug}`, address: site.address } },
  };
  routes.set(site.launcherPath, base);

  for (const relative of htmlFiles) {
    let routePath = site.launcherPath;
    let address = site.address;
    if (relative === 'index.html') {
      // Already covered by the site root.
    } else if (relative.endsWith('/index.html')) {
      const sub = relative.slice(0, -'/index.html'.length);
      routePath = `${site.launcherPath}/${sub}`;
      address = `${site.address}${sub}/`;
    } else {
      routePath = `${site.launcherPath}/${relative}`;
      address = `${site.address}${relative}`;
    }
    if (!routes.has(routePath)) {
      routes.set(routePath, {
        params: { path: routePath.replace(/^\//, '') },
        props: { site, deepLink: { siteId: `${site.kind}/${site.slug}`, address } },
      });
    }
  }

  return [...routes.values()];
}

export function routesForPersonalSites(sites: PersonalSite[]): PersonalSiteRoute[] {
  return sites
    .flatMap((site) => routesForSite(site))
    .sort((a, b) => a.props.deepLink.address.localeCompare(b.props.deepLink.address));
}
