# northkitsapunitednew

New site for North Kitsap United. Seeded with the current nku-web site source; a new wireframe will replace it.

# North Kitsap United Website

The official website for [North Kitsap United](https://www.northkitsapunited.com), a community initiative exploring collaborative development opportunities in North Kitsap County, Washington. The project is led by the Kingston-North Kitsap Rotary Club and the YMCA of Pierce and Kitsap Counties, with support from Raydient Places + Properties and other community organizations.

**Live site:** https://nku-web.pages.dev/

## Tech Stack

- [Astro](https://astro.build/) — Static site generator
- [Tailwind CSS v4](https://tailwindcss.com/) — Utility-first CSS
- [Netlify](https://www.netlify.com/) — Hosting (builds from GitHub), on-request rendering, and Netlify Blobs for admin-edited content

## Getting Started

**Prerequisites:** Node.js >= 22.12.0

```bash
npm install       # Install dependencies
npm run dev       # Start dev server at localhost:4321
npm run build     # Build production site to dist/
npm run preview   # Preview production build locally
```

## Deployment

The site runs on the Netlify project `northkitsapunitednew`, which builds from this repo's `main` branch (`netlify.toml`: `npm run build`, Node 22). Pages are rendered by a Netlify Function so the admin panel can publish edits instantly; drag-and-drop deploys and Cloudflare Pages can't run this version.

Netlify environment variables (never commit these):
- `ADMIN_EMAIL` — first admin's login email
- `ADMIN_PASSWORD_HASH` — from `npm run hash-password`
- `SESSION_SECRET` — random string, 32+ characters

See [docs/ADMIN.md](docs/ADMIN.md) for the admin panel.

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
