// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import netlify from '@astrojs/netlify';
import sitemap from '@astrojs/sitemap';
import { SITE_PAGES } from './src/lib/site-pages.mjs';

const SITE = 'https://www.northkitsapunited.com';

// https://astro.build/config
export default defineConfig({
  site: SITE,

  // Pages are rendered on request (and cached on Netlify's CDN) so that edits
  // made in /admin-panel show up immediately, without a rebuild.
  output: 'server',
  adapter: netlify(),

  // Origin checks are done in src/middleware.ts for the admin API.
  security: { checkOrigin: true },

  vite: {
    plugins: [tailwindcss()],
  },

  integrations: [
    sitemap({
      customPages: SITE_PAGES.map((p) => new URL(p.path, SITE).href).concat(new URL('/news', SITE).href),
      filter: (page) => !page.includes('/admin-panel') && !page.includes('/api/'),
    }),
  ],
});
