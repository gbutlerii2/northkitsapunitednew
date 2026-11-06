# northkitsapunitednew

New site for North Kitsap United. Seeded with the current nku-web site source; a new wireframe will replace it.

# North Kitsap United Website

The official website for [North Kitsap United](https://www.northkitsapunited.com), a community initiative exploring collaborative development opportunities in North Kitsap County, Washington. The project is led by the Kingston-North Kitsap Rotary Club and the YMCA of Pierce and Kitsap Counties, with support from Raydient Places + Properties and other community organizations.

**Live site:** https://nku-web.pages.dev/

## Tech Stack

- [Astro](https://astro.build/) — Static site generator
- [Tailwind CSS v4](https://tailwindcss.com/) — Utility-first CSS
- [Cloudflare Pages](https://pages.cloudflare.com/) — Hosting with automatic deployments from GitHub

## Getting Started

**Prerequisites:** Node.js >= 22.12.0

```bash
npm install       # Install dependencies
npm run dev       # Start dev server at localhost:4321
npm run build     # Build production site to dist/
npm run preview   # Preview production build locally
```

## Deployment

The site is hosted on Cloudflare Pages and deploys automatically when changes are pushed to the `main` branch on GitHub. The production build output is the `dist/` directory.

Build settings on Cloudflare Pages:
- **Framework preset:** Astro
- **Build command:** `npm run build`
- **Build output directory:** `dist`
- **Environment variable:** `NODE_VERSION` = `22`

## Project Structure

```
src/
  layouts/BaseLayout.astro    # Shared HTML wrapper (meta tags, header, footer)
  components/                 # Reusable UI components (Header, Footer, Hero, etc.)
  pages/                      # File-based routing (~14 pages)
  styles/global.css           # Tailwind config and NKU theme tokens
public/
  images/                     # Logos, maps, background patterns
  media/                      # PDF reports and meeting presentations
  _redirects                  # Cloudflare Pages URL redirect rules
```

## External Integrations

- **Google Forms** — Contact form (embedded on `/contact-us`) and newsletter subscribe/unsubscribe
- **YouTube** — Meeting video recordings embedded on `/meetings-materials/meetings`
