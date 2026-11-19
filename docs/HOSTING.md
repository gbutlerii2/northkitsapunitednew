# Hosting: Netlify (test) and Cloudflare (production)

The same code runs on two hosts:

| | Test site | Production |
|---|---|---|
| Repo | `gbutlerii2/northkitsapunitednew` | `nku-rotaryknk/nku-web` (gets this code when we go live) |
| Host | Netlify, project `northkitsapunitednew` | Cloudflare **Workers** (not Pages), Worker `nku-web` |
| Admin data | Netlify Blobs (`nku-content`, `nku-media`, `nku-users`) | R2 bucket `nku-site-data`, bound as `NKU_DATA` (one folder per store) |
| Email | nodemailer | built-in SMTP client over Cloudflare sockets (`src/lib/platform/cloudflare.ts`) |
| Page cache | Netlify CDN, purged on every admin save | none (each page is rendered by the Worker; R2 is strongly consistent) |

## How the build picks the host

`astro.config.mjs` reads `NKU_HOST`:

- not set: `netlify`, unless the build runs in Cloudflare's build system (`WORKERS_CI` or `CF_PAGES` is set), then `cloudflare`.
- `NKU_HOST=cloudflare npm run build` forces a Cloudflare build anywhere.

The import `nku:platform` is pointed at `src/lib/platform/netlify.ts` or `src/lib/platform/cloudflare.ts`. Those two files hold everything host-specific: storage, cache purge, SMTP sending and the visitor's IP header. Everything else is shared. `wrangler.jsonc` is only used by Cloudflare; Netlify ignores it.

## Limits to keep in mind on Cloudflare

- **25 MB per file** in `public/`. A bigger file makes the Cloudflare deploy fail. (The Dec 2023 feasibility report is published as `feasibility-report-part-1.pdf` and `-part-2.pdf` for this reason; the old single-file address redirects to part 1.)
- **Passwords:** Cloudflare allows at most 100,000 PBKDF2 rounds, so `npm run hash-password` and the admin now use 100,000. Accounts saved earlier with 210,000 rounds still log in on Netlify and are re-saved at 100,000 on that login. A hash made with the old script won't work on Cloudflare: make a new one.
- Netlify-only headers (`Netlify-CDN-Cache-Control`, `Netlify-Vary`, `Netlify-Cache-Tag`) are ignored on Cloudflare. Security headers are added in `src/middleware.ts` so pages get them on both hosts.

## Setting up production on Cloudflare (at go-live)

Do this in the Cloudflare account that owns northkitsapunited.com (Nku@rotaryknk.org's account).

1. **R2 bucket:** R2 → Create bucket → name `nku-site-data`.
2. **Worker from GitHub:** Workers & Pages → Create → Import a repository → `nku-rotaryknk/nku-web`.
   - Build command: `npm run build`
   - Deploy command: `npx wrangler deploy`
   - Environment variable (build): `NODE_VERSION` = `22`
   The existing Pages project `nku-web` can't run this version (the Astro Cloudflare adapter now targets Workers). Keep it until the Worker works, then move the custom domain and delete it.
3. **Secrets** (Worker → Settings → Variables and Secrets, type *Secret*):
   - `ADMIN_EMAIL`
   - `ADMIN_PASSWORD_HASH` (a new one from `npm run hash-password`)
   - `SESSION_SECRET` (32+ random characters; use the Netlify value if form-email passwords saved in the admin should keep working)
   - Email, only if not set in the admin panel: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` (or `RESEND_API_KEY` + `MAIL_FROM`)
4. **Domain:** Worker → Settings → Domains & Routes → add `www.northkitsapunited.com` (and the bare domain), after removing it from the old Pages project.
5. **Content:** page edits, News posts, images and accounts made on the test site live in Netlify Blobs and do not move by themselves. Copy them over (or re-enter them) before switching the domain.

## Trying the Cloudflare build locally

```bash
NKU_HOST=cloudflare npm run build
npx wrangler dev          # http://localhost:8787, with a local R2 bucket
```

Put test secrets in `.dev.vars` (ignored by git), same names as above.
