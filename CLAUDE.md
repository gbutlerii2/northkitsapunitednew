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

This is a static informational website for the North Kitsap United community project, built with **Astro 6** and **Tailwind CSS 4**, deployed to **Cloudflare Pages**.

- **No SSR** — pure static output (`output: 'static'`), no adapter needed
- **No framework islands** — vanilla JS only (mobile menu toggle, dropdown accordions)
- **No content collections** — ~14 pages with infrequent changes, all hardcoded `.astro` files

### Layout & Component Hierarchy

`BaseLayout.astro` wraps every page: `<Header />` → `<slot />` → `<Footer />`. It handles meta/OG tags, favicon, and canonical URLs. Title format: `"Page Title | North Kitsap United"` (homepage is just `"North Kitsap United"`).

### Key Components

- **Header.astro** — Sticky nav with dropdown menus. Navigation structure is defined as a hierarchical array at the top of the file. Desktop uses CSS `:hover`/`:focus-within` dropdowns; mobile uses JS toggle with accordion submenus.
- **Hero.astro** — Full-width banner with topo pattern overlay (`Topo_Repeat_Header.png`) and a `transition-bottom.png` decorative edge.
- **NewsletterSignup.astro** — Appears on most pages. Links to Google Forms for subscribe/unsubscribe.
- **VideoEmbed.astro** — Accepts full YouTube URLs, `youtu.be` short links, or plain video IDs via the `youtubeId` prop. Has a `extractVideoId()` helper that normalizes all formats.
- **FaqItem.astro** — Uses native `<details>`/`<summary>` (no JS needed).
- **DocumentCard.astro** / **MapCard.astro** — Card components for PDF links and map images.

### Styling

Tailwind CSS 4 configured as a Vite plugin (not the Astro integration). Theme tokens defined in `src/styles/global.css` via `@theme`:

- Primary: `nku-green` (#2d5016), `nku-green-light`, `nku-green-dark`
- Accent: `nku-brown`, `nku-brown-light`
- Background: `nku-cream`, `nku-cream-dark`
- Text: `nku-gray`, `nku-gray-light`
- Font: Inter Variable

Use these as Tailwind classes: `bg-nku-green`, `text-nku-cream`, etc. A `.prose` class in global.css styles long-form content blocks.

### Static Assets

- `public/images/` — Logos, maps, background patterns, transition graphics
- `public/media/` — PDF reports and meeting presentations (preserves `/media/` URL pattern from old site)
- `public/_redirects` — Cloudflare Pages redirect rules for old URL preservation

### External Integrations

- **Google Forms** — Contact form embedded via iframe on `/contact-us`; newsletter subscribe/unsubscribe linked from `NewsletterSignup` component
- **YouTube** — Meeting videos embedded via `VideoEmbed` component on `/meetings-materials/meetings`

### URL Structure

Pages mirror the original site's URL paths. The `_redirects` file maps old paths that changed. When adding pages, place them in `src/pages/` matching the desired URL path.

- **Partner pages** live at `/planning-team/` (Rotary, YMCA) — linked from the "Partners" nav dropdown
- **Supporter pages** live at `/supporters/` (Raydient) — not all supporters need individual pages; only major or special-case supporters get one
