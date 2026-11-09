# Site admin (/admin-panel)

The admin lets approved people change the website without touching code.

## What you can do

| Task | Where |
| --- | --- |
| Change text on any page | Log in, open the page, click **Edit this page** in the green bar at the bottom |
| Bold, italic, links | Select text while editing; a small toolbar appears |
| Move a paragraph, image or list item | Hover it and drag the ⠿ handle |
| Add, duplicate or delete a block | Hover it: **+**, **⧉**, **🗑** (delete has an Undo) |
| Replace a picture | Drag a photo from your computer onto it, or click it and choose **Replace…** |
| Add a picture | Drag a photo onto a paragraph (placed after it) or onto a "Photo to come" box (fills it) |
| Change the big page title band | It's editable like any other text |
| Picture size and description | Click the picture: **S / M / L / Full**, **Description** |
| Undo saved changes | **History** in the editing bar (last 15 versions), or **Reset to original** |
| News posts | Admin panel → **News** → **New post** (title, date, summary, main image, story) |
| Upload or remove images | Admin panel → **Images** |
| Change your password, add/remove editors | Admin panel → **Users & password** |

Edits go live as soon as you click **Save**. There is no rebuild.

## What is not editable in place

- The top menu and footer (change these in `src/components/SiteHeader.astro` / `Footer.astro`).
- Background patterns and the green banner artwork (CSS backgrounds).
- Page titles and descriptions used by search engines.

Once a page has been edited in the admin, the saved version is shown instead of the text in the code. If a page is later regenerated from the design (or its `.astro` file changes), the change shows only after **Reset to original** in the admin.

## How it works (for developers)

- `output: 'server'` with `@astrojs/netlify`. Pages are rendered by one Netlify Function and cached on the CDN with the tag `nku-pages`; every save purges that tag.
- `src/components/EditableRegion.astro` wraps each page's title band (`hero`) and `<main>` content (`main`); `BaseLayout` does this automatically. Forms survive edits (they still post to the NKU Tracker), and form submits are blocked while editing. Saved HTML is cleaned with `sanitize-html` and stored in Netlify Blobs store `nku-content` under `region:<path>::<id>`. Scripts from the original page are re-attached, so interactive pieces keep working.
- Pages with live lists use `editable="regions"` and wrap only their static parts (see `src/pages/news/index.astro`).
- News posts: `news:<id>` in `nku-content`. Images: `nku-media`, served from `/uploads/...`.
- Accounts: `nku-users`. Passwords are PBKDF2-SHA256 hashes (210,000 rounds). Logins are locked for 15 minutes after 8 failures. The login cookie is HttpOnly, SameSite=Lax, signed with `SESSION_SECRET`, and lasts 8 hours. Admin API calls must come from the same site.

## Setup on Netlify

Set these environment variables on the Netlify site (Site configuration → Environment variables). Never commit them.

| Variable | Value |
| --- | --- |
| `ADMIN_EMAIL` | The first admin's email |
| `ADMIN_PASSWORD_HASH` | Output of `npm run hash-password` (type the password when asked) |
| `SESSION_SECRET` | A random string of 32+ characters, e.g. `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"` |

The first successful login with `ADMIN_EMAIL` creates that account in Netlify Blobs and asks for a new password. After that, passwords are managed in the admin, and the two `ADMIN_*` variables are only used again if every account has been removed.

Netlify Blobs needs no setup. Netlify keeps Blobs data across deploys.

## Local development

`npm run dev`. Put the same three variables in a `.env` file (ignored by git). If Netlify Blobs isn't available locally, data is kept in `~/.nku-web-data` (outside the project, so it is never deployed).

## Deploys

The Netlify site builds from this GitHub repo. Merging to `main` deploys. Admin content lives in Netlify Blobs, so deploys never overwrite it.
