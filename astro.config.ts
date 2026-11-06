import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';
import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';
import sitemap from '@astrojs/sitemap';
import mediaManifest from './src/integrations/media-manifest';

/**
 * Vite's public middleware serves exact files only. Astro's production asset
 * handling resolves directory indexes, so add the same behaviour in dev for
 * the submodule sites copied into public/web/.
 */
function publicDirectoryIndexes(): Plugin {
  return {
    name: 'pants-public-directory-indexes',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (!req.url) return next();
        const url = new URL(req.url, 'http://localhost');
        if (!url.pathname.startsWith('/web/') || /\.[^/]+$/.test(url.pathname)) return next();
        const publicDir = path.resolve(server.config.publicDir);
        const relative = decodeURIComponent(url.pathname).replace(/^\/+/, '');
        const candidates = url.pathname.endsWith('/')
          ? [path.join(publicDir, relative, 'index.html')]
          : [path.join(publicDir, relative, 'index.html'), path.join(publicDir, `${relative}.html`)];
        const match = candidates.find((file) => file.startsWith(publicDir) && fs.existsSync(file));
        if (match) {
          req.url = `${url.pathname}${url.pathname.endsWith('/') ? '' : '/'}index.html${url.search}`;
          if (match.endsWith('.html') && !match.endsWith('index.html')) {
            req.url = `${url.pathname}.html${url.search}`;
          }
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
    plugins: [publicDirectoryIndexes()],
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
