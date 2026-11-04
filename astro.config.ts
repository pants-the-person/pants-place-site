import { defineConfig } from 'astro/config';
import preact from '@astrojs/preact';
import sitemap from '@astrojs/sitemap';
import mediaManifest from './src/integrations/media-manifest';

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
