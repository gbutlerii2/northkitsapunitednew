# Go-live checklist: test site (Netlify) to production (Cloudflare)

Production is the GitHub repo `nku-rotaryknk/nku-web`, published by Cloudflare. All work happens in this repo (`gbutlerii2/northkitsapunitednew`) and is tested on Netlify first. How the two hosts differ is in `docs/HOSTING.md`.

Work top to bottom. Nothing before step 5 changes what visitors see on www.northkitsapunited.com.

## 1. Prepare the test site (Netlify)

- [ ] Netlify → northkitsapunitednew → Environment variables → add **`TRANSFER_TOKEN`**: 32+ random characters, marked secret. Keep the value: Cloudflare needs exactly the same one. Redeploy.
- [ ] **Everyone who edits the site logs in once on the test site.** This updates their password to the format Cloudflare can check. Accounts that skip this have to be added again on production.
- [ ] Note the Netlify value of **`SESSION_SECRET`**. Using the same value on Cloudflare keeps the saved Gmail App Password (Forms & emails → Sending account) working after the copy.

## 2. Put the new site in nku-web's `stage` branch

When Gerry says go, Claude copies this repo into `nku-rotaryknk/nku-web` on a branch called `stage`. Both histories are kept: `stage` starts from nku-web's `main`, and this repo's `main` is merged in so that `stage` matches the new site exactly. `main` (the live old site) is not touched, and gets the tag `pre-new-site` so it can always be restored.

## 3. Set up Cloudflare (Nku@rotaryknk.org's account)

- [ ] **R2** → Create bucket → `nku-site-data`.
- [ ] **Workers & Pages → Create → Import a repository** → `nku-rotaryknk/nku-web`.
  - Production branch: **`stage`** for now (it changes to `main` in step 5)
  - Build command: `npm run build`
  - Deploy command: `npx wrangler deploy`
  - Build variable: `NODE_VERSION` = `22`
  - The build detects Cloudflare by itself (it uses the R2 bucket, Cloudflare's email sender and page titles without " - New").
- [ ] Worker → Settings → **Variables and Secrets** (type Secret):
  - `ADMIN_EMAIL`: the first admin's email
  - `ADMIN_PASSWORD_HASH`: a new hash from `npm run hash-password` (hashes made before Nov 18, 2026 won't work on Cloudflare)
  - `SESSION_SECRET`: the same value as on Netlify (see step 1)
  - `TRANSFER_TOKEN`: the same value as on Netlify
  - Optional, only if the sending account isn't copied over: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`
- [ ] Redeploy once the secrets are in. Then open the Worker's `*.workers.dev` address and check that the site loads.
- [ ] **NKU Tracker:** to test the forms on the `workers.dev` address, add it to `API_ALLOWED_ORIGINS` on the nku-tracker Netlify project (comma-separated, for example `https://nku-web.example.workers.dev`). www.northkitsapunited.com is already allowed.

## 4. Copy the content and test production

- [ ] On the `workers.dev` address, log in at `/admin-panel` with `ADMIN_EMAIL`, then go to **Copy content**. Leave "Copy from" as `https://northkitsapunitednew.netlify.app` and click **Copy everything into this site**. This copies page edits and their history, News posts, images, accounts, form email settings, the sending account and recent form submissions. It only reads from Netlify.
- [ ] Read any warnings it shows (usually an account that didn't log in during step 1).
- [ ] Check these:
  - [ ] Home, Donate, Materials (both parts of the feasibility report open), FAQ, Partners
  - [ ] News lists the posts, and images show
  - [ ] Admin: log in as each person, edit a page, save it, then reset it
  - [ ] Forms & emails → send a test email (this checks Gmail from Cloudflare)
  - [ ] Send one real form, and check it reaches the Tracker inbox and the email list
  - [ ] Old addresses redirect, for example `/contact`, `/concept/context` and `/supporters/raydient`

## 5. Go live

Pick a quiet time, and stop admin edits on the test site from here on.

- [ ] **Final copy:** run Copy content again so the last edits come across.
- [ ] Claude opens a PR in nku-web from `stage` to `main`. Gerry merges it (a merge, not a force push, so the old site stays in the history).
- [ ] Cloudflare Worker → Settings → Build → set the production branch to **`main`**.
- [ ] **Domain:** remove `www.northkitsapunited.com` and `northkitsapunited.com` from the old Pages project (Custom domains), then add both to the Worker (Settings → Domains & Routes). This needs the domain's DNS to be on Cloudflare in this account. If it is still with the old registrar, move the nameservers to Cloudflare first (see docs/nku_plan.md).
- [ ] Check www.northkitsapunited.com: pages, admin login, one form.
- [ ] Ask Google Search Console to re-read `https://www.northkitsapunited.com/sitemap-index.xml` (optional).

## 6. Afterwards

- Keep the old Pages project for a week. **To roll back,** move the domain back to it. Its site is untouched.
- The Netlify site stays the test site. Make changes here first, merge them, then bring them into nku-web (Claude can do that on request). Admin content is separate on each site: edit the real content on production. To refresh the test site with production content, run Copy content on the Netlify admin with `https://www.northkitsapunited.com` as the source.
- Remove `API_ALLOWED_ORIGINS` for the `workers.dev` address from the Tracker if you don't need it.
