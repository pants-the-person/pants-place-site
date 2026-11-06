import fs from 'node:fs';
import path from 'node:path';
import type { PersonalSiteDeepLink } from '../kernel/autostart';
import { launcherPathsForSite, type PersonalSite } from '../kernel/sites';

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
  const launcherPaths = launcherPathsForSite(site);

  const addRoute = (routePath: string, address: string) => {
    if (routes.has(routePath)) return;
    routes.set(routePath, {
      params: { path: routePath.replace(/^\//, '') },
      props: { site, deepLink: { siteId: `${site.kind}/${site.slug}`, address } },
    });
  };

  for (const launcherPath of launcherPaths) {
    addRoute(launcherPath, site.address);
    for (const relative of htmlFiles) {
      if (relative === 'index.html') continue;
      if (relative.endsWith('/index.html')) {
        const sub = relative.slice(0, -'/index.html'.length);
        addRoute(`${launcherPath}/${sub}`, `${site.address}${sub}/`);
      } else {
        addRoute(`${launcherPath}/${relative}`, `${site.address}${relative}`);
      }
    }
  }

  return [...routes.values()];
}

export function routesForPersonalSites(sites: PersonalSite[]): PersonalSiteRoute[] {
  return sites
    .flatMap((site) => routesForSite(site))
    .sort((a, b) => a.props.deepLink.address.localeCompare(b.props.deepLink.address));
}
