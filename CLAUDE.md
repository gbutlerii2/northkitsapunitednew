# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
npm run dev       # Start dev server (localhost:4321)
npm run build     # Build static site to dist/
npm run preview   # Preview production build locally
```

Requires Node.js >= 22.12.0. No test framework is configured.

## Architecture

This is an informational website for the North Kitsap United community project, built with **Astro** and **Tailwind CSS 4**, tested on **Netlify** (project `northkitsapunitednew`) and published from the `nku-rotaryknk/nku-web` repo on **Cloudflare Workers**. See `docs/HOSTING.md`.

**The pages are generated from the "NKU Website" Design canvas** (claude.ai artifact UQenrFEvnNf9sGLw3BHRJX). Each page in `src/pages/` (except the three legal pages) holds its markup in a `html` string built from that design; the classes it uses are defined in `src/styles/site.css`. Edit the design and regenerate rather than hand-editing a page, or the two will drift apart.

- **Server output, two hosts** — `output: 'server'`, so `/admin-panel` edits go live without a rebuild. `astro.config.mjs` picks `@astrojs/netlify` or `@astrojs/cloudflare` (env `NKU_HOST`, auto-detected in Cloudflare's builds) and points the import `nku:platform` at `src/lib/platform/netlify.ts` or `cloudflare.ts`. Keep all host-specific code (storage, cache purge, email sending, client IP) in those two files. Admin → Copy content (`src/lib/transfer.ts`, `TRANSFER_TOKEN` on both sites) copies admin content between the two; go-live steps are in `docs/GO-LIVE.md`. On Netlify pages are cached on the CDN (cache tag `nku-pages`), purged on every admin save. Cloudflare limits: 25 MB per file in `public/`, PBKDF2 at most 100,000 rounds. Drag-and-drop deploys and Cloudflare Pages won't run it.
- **Admin panel** at `/admin-panel` — email/password login, on-page editing, News, image uploads, users. Data lives in Netlify Blobs on Netlify and in the R2 bucket `nku-site-data` (binding `NKU_DATA`) on Cloudflare. See `docs/ADMIN.md`. Admin edits to a page override that page's generated `html` until "Reset to original" is used, so regenerating a page from the design won't show on an edited page until it's reset.
- **No framework islands** — vanilla JS only (mobile menu toggle, dropdown accordions)
- **No content collections** — ~14 pages with infrequent changes, all hardcoded `.astro` files

### Layout

`BaseLayout.astro` wraps every page: `<SiteHeader current=…>` (one banner image `public/images/site/header-banner.jpg`, editable as shared region `header` at path `/_site`; main menu: Home, About ▾ (History, Materials, FAQ, News), Partners ▾, Get Involved, Contact, Donate button; Round 2 sheet, Nov 2026) → title band (`eyebrow`, `heroTitle`, `heroSub` props; editable region `hero`; `heroHidden` keeps it for screen readers only, used on Home) → `<main class="main"><slot /></main>` (editable region `main`) → `<Footer />` (editable shared region `footer` at `/_site`). Pass `editable="regions"` for pages with live lists (News) or `"none"` to switch editing off. Title format: `"Page Title | North Kitsap United - New"` on Netlify (the test site) and without " - New" on Cloudflare (production).

### Styling

`src/styles/site.css` holds the site's classes (cards, buttons, forms, stats). Colors follow the NKU tokens in `src/styles/global.css` (`nku-green` #2d5016, `nku-brown-light` #b8922e, `nku-cream` #f5f0e8). Tailwind is still loaded; the legal pages use its utilities and the `.prose` class.

### NKU Tracker connection

`public/js/nku-site.js` talks to the NKU Tracker API (default `https://nku-tracker.com`; override with the `PUBLIC_TRACKER_API` build variable):
- Every `<form data-nku-form="KIND">` posts JSON to `/api/submit/KIND` (contact, donation-question, gift, zeffy, pledge, inkind, volunteer, updates). Submissions land in the Tracker's website inbox (nku-tracker.com/inbox.html).
- The Zeffy form records the gift in the Tracker first, then sends the donor on to Zeffy (links set as `ZEFFY_CARD_URL` / `ZEFFY_EFT_URL` on the nku-tracker Netlify project).
- The Home page's Overview (`[data-nku-campaign]`) fills Pledged, Received to date, Estimated cost and the progress bar from `/api/public/campaign`.

### Static Assets

- `public/images/` — Logos, maps, background patterns, transition graphics
- `public/media/` — PDF reports and meeting presentations (preserves `/media/` URL pattern from old site)
- `public/images/site/` — images and logos used by the new pages
- `public/_redirects` — redirects from the old site's addresses

### URL Structure

Pages mirror the original site's URL paths. The `_redirects` file maps old paths that changed. When adding pages, place them in `src/pages/` matching the desired URL path.

- **Partner pages** live at `/planning-team/` (Rotary, YMCA); other partners and supporters are on `/partners`
- **Donate** is `/donate` (cash, pledges, gift notices) and `/donate/in-kind`

### News

Articles come from two places, merged newest first by `listNews()`: built-in articles in `src/data/news.ts` and posts written in Admin > News (Netlify Blobs). `/news` lists every article in full; the Home page shows the newest two (`src/lib/news-html.ts` renders both). Admin region saves made before `REGION_CUTOFF` in `src/lib/content.ts` (2026-11-17) are ignored, because their content was copied into the page code.
