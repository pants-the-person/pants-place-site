import type { Plugin } from 'vite';
import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';
import sitemap from '@astrojs/sitemap';
import mediaManifest from './src/integrations/media-manifest';
import { personalSites } from './src/data/personal-sites';

const personalSiteLaunchers = personalSites
  .flatMap((site) => {
    const aliases =
      site.kind === 'member'
        ? [`/members/${site.slug}`, `/users/${site.slug}`]
        : [];
    return [site.launcherPath, ...aliases].map((base) => ({ base, canonical: site.launcherPath }));
  })
  .sort((a, b) => b.base.length - a.base.length);

/**
 * Production proxies `/member/<slug>/*` and `/char/<slug>/*` to the site's
 * launcher page (see public/_redirects). Vite does not read _redirects, so do
 * the same rewrite in dev while leaving the browser URL untouched.
 */
function personalSiteDeepLinks(): Plugin {
  return {
    name: 'pants-personal-site-deep-links',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (!req.url) return next();
        let url: URL;
        try {
          url = new URL(req.url, 'http://localhost');
        } catch {
          return next();
        }
        const match = personalSiteLaunchers.find(
          ({ base }) => url.pathname === base || url.pathname.startsWith(`${base}/`),
        );
        if (match && url.pathname !== match.canonical && url.pathname !== `${match.canonical}/`) {
          req.url = `${match.canonical}/${url.search}`;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  site: 'https://pants.place',
  trailingSlash: 'ignore',
  devToolbar: { enabled: false },
  integrations: [
    preact(),
    mediaManifest(),
    sitemap({
      filter: (page) => !page.includes('/web/cannot') && !page.includes('/web/guestbook'),
    }),
  ],
  vite: {
    plugins: [personalSiteDeepLinks()],
    // ZenFS/memium registers struct types by class name at runtime. Minified
    // class names make that registry miss and break the IndexedDB backend.
    esbuild: { keepNames: true },
    build: {
      target: 'es2022',
      rolldownOptions: {
        output: { keepNames: true },
      },
      // 98.css contains a legacy `@media (not(hover))` block that Lightning CSS rejects.
      // Keeping CSS unminified is cheaper than forking the stylesheet for a few KB.
      cssMinify: false,
      chunkSizeWarningLimit: 1200,
    },
  },
});
