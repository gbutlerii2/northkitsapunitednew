// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import netlify from '@astrojs/netlify';
import cloudflare from '@astrojs/cloudflare';
import { fileURLToPath } from 'node:url';
import sitemap from '@astrojs/sitemap';
import { SITE_PAGES } from './src/lib/site-pages.mjs';

const SITE = 'https://www.northkitsapunited.com';

// Which host this build is for (see docs/HOSTING.md):
//   netlify    - test site (northkitsapunitednew on Netlify). The default.
//   cloudflare - production (nku-web on Cloudflare Workers). Picked automatically in
//                Cloudflare's build system, or set NKU_HOST=cloudflare.
const HOST =
  process.env.NKU_HOST || (process.env.WORKERS_CI || process.env.CF_PAGES ? 'cloudflare' : 'netlify');
if (!['netlify', 'cloudflare'].includes(HOST)) throw new Error(`Unknown NKU_HOST "${HOST}" (use netlify or cloudflare).`);
console.log(`[nku] Building for ${HOST}`);

// https://astro.build/config
export default defineConfig({
  site: SITE,

  // Pages are rendered on request (and cached on Netlify's CDN) so that edits
  // made in /admin-panel show up immediately, without a rebuild.
  output: 'server',
  adapter:
    HOST === 'cloudflare'
      ? cloudflare({ imageService: 'passthrough', imagesBindingName: false })
      : netlify(),
  // Astro sessions aren't used (the admin login has its own signed cookie).
  ...(HOST === 'cloudflare' ? { session: false } : {}),

  // Origin checks are done in src/middleware.ts for the admin API.
  security: { checkOrigin: true },

  vite: {
    plugins: [tailwindcss()],
    // Host-specific storage, cache and email code.
    resolve: {
      alias: { 'nku:platform': fileURLToPath(new URL(`./src/lib/platform/${HOST}.ts`, import.meta.url)) },
    },
    // When this version of the site was built. Used to warn editors when a page
    // they edited earlier has since been changed in the code.
    define: { __NKU_BUILD_TIME__: JSON.stringify(new Date().toISOString()) },
  },

  integrations: [
    sitemap({
      customPages: SITE_PAGES.map((p) => new URL(p.path, SITE).href),
      filter: (page) => !page.includes('/admin-panel') && !page.includes('/api/'),
    }),
  ],
});
