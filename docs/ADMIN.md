# Site admin (/admin-panel)

The admin lets approved people change the website without touching code.

## What you can do

| Task | Where |
| --- | --- |
| Change text on any page | Log in, open the page, click **Edit this page** in the green bar at the bottom |
| Bold, italic, links | Select text while editing; a small toolbar appears |
| Move a paragraph, image or list item | Hover it and drag the ⠿ handle |
| Add, duplicate or delete a block | Hover it: **+**, **⧉**, **🗑** (delete has an Undo). The handle stays put while you move the mouse over to it |
| Add a new section | Hover a block, click **+** and pick Paragraph, Heading, Text card, Logo card, Image or Button. It goes below that block |
| Duplicate or delete a whole card | Hover anything inside a card: the **Card** buttons under the handle act on the whole card |
| Add a logo to a card | Click the **[Logo]** box (or drop an image on it) |
| Change the header banner | Edit any page, click the banner, choose **Replace…**. The header and footer are shared, so a change shows on every page |
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

- The top menu buttons (change these in `src/components/SiteHeader.astro`). The banner above the menu and the footer are editable.
- Background patterns and the green banner artwork (CSS backgrounds).
- Page titles and descriptions used by search engines.

Once a page has been edited in the admin, the saved version is shown instead of the text in the code. If a page is later regenerated from the design (or its `.astro` file changes), the change shows only after **Reset to original** in the admin. Editors see a yellow warning on such a page, with links to see the built version (`?original=1`), open History / Reset, or mark the page as up to date.

## How it works (for developers)

- `output: 'server'` with `@astrojs/netlify`. Pages are rendered by one Netlify Function and cached on the CDN with the tag `nku-pages`; every save purges that tag.
- `src/components/EditableRegion.astro` wraps each page's title band (`hero`) and `<main>` content (`main`); `BaseLayout` does this automatically. Forms survive edits (they still post to the NKU Tracker), and form submits are blocked while editing. Saved HTML is cleaned with `sanitize-html` and stored in Netlify Blobs store `nku-content` under `region:<path>::<id>`. Scripts from the original page are re-attached, so interactive pieces keep working.
- The header banner and footer are shared regions with path `/_site` (ids `header`, `footer`), shown on every page.
- Stale warning: each save stores `baseHash`, a hash of the region's built HTML. If the current build's hash differs, admins see the warning. Older saves without a hash are flagged as "maybe" when saved before the build time (`__NKU_BUILD_TIME__`). The `ack` action on `/api/admin/region` marks a region as up to date.
- Pages with live lists use `editable="regions"` and wrap only their static parts (see `src/pages/materials.astro`, whose News tab lists the posts).
- News posts: `news:<id>` in `nku-content`. Images: `nku-media`, served from `/uploads/...`.
- Accounts: `nku-users`. Passwords are PBKDF2-SHA256 hashes (210,000 rounds). Logins are locked for 15 minutes after 8 failures. The login cookie is HttpOnly, SameSite=Lax, signed with `SESSION_SECRET`, and lasts 8 hours. Admin API calls must come from the same site.

> Production runs on Cloudflare, where data is in the R2 bucket `nku-site-data` instead of Netlify Blobs. See `docs/HOSTING.md`. Admin → Copy content moves the admin content between the two sites (`docs/GO-LIVE.md`).

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

## Form emails

Admin panel → **Forms & emails** sets who receives a copy of each website form by email. Enter addresses separated by semicolons. If no list is filled in, forms go to the project mailbox, `nku@rotaryknk.org`. One list covers all forms, and each form (Online Donation, Gift Notice, Pledge, Donation Question, In-Kind Donation, Contact, Volunteer, Updates Signup) can have its own list instead.

- Subject: `<Form name> - <person's name>` (for example `Pledge - Jane Smith`), handy for mail filters. Signups with no name use their email.
- Body: one field per line (`Label: value`), then the form name, page and time. Reply goes to the person who filled in the form.
- Forms still go to the NKU Tracker as before; the email is an extra copy sent at the same time (`public/js/nku-site.js` → `/api/forms/<kind>`). Bot submissions (hidden `website` field filled in) are dropped, and each visitor is limited to 12 submissions per 10 minutes.

**Sending account (recommended).** Admin panel → **Forms & emails** → **Sending account**. For NKU: account email `nku@rotaryknk.org` and a Google **App Password** (sign in as that account, turn on 2-Step Verification, create one at myaccount.google.com/apppasswords; never the normal Google password). Server `smtp.gmail.com`, port `465` are filled in already. This works on any host (Netlify or Cloudflare) because it is saved in the site's own storage, not in host settings.

- The password is encrypted (AES-GCM, key derived from `SESSION_SECRET`) and is never sent back to the browser. If `SESSION_SECRET` is ever changed, the page says so and the App Password must be entered again.
- Any admin can change or remove it, so only give admin logins to people you trust. If it may have leaked, delete the App Password in the Google account and make a new one.
- Gmail allows about 500 emails a day, far more than the forms need.

**Fallback: host environment variables.** Used only when no sending account is saved in the admin panel (mark passwords/keys secret):

| Option | Variables |
| --- | --- |
| Gmail | `SMTP_HOST` = `smtp.gmail.com`, `SMTP_PORT` = `465`, `SMTP_USER` = `nku@rotaryknk.org`, `SMTP_PASS` = the App Password, `MAIL_FROM` = `North Kitsap United <nku@rotaryknk.org>` |
| Resend | `RESEND_API_KEY`, `MAIL_FROM` (an address on a domain verified in Resend) |
| Any other mailbox over SMTP | `SMTP_HOST`, `SMTP_PORT` (587, or 465), `SMTP_USER`, `SMTP_PASS`, optional `MAIL_FROM`. Microsoft 365: `smtp.office365.com` (SMTP AUTH must be enabled for the mailbox). |

Use **Send a test email** on the Form emails page to check it.

### NKU Tracker switch and Zeffy links

On **Forms & emails**:
- **Send form submissions to the NKU Tracker** (on by default). Off means forms go only to the email lists, with nothing sent to nku-tracker.com. The Home page's campaign figures still come from the Tracker.
- **Recent submissions** keeps the last 1,000 form submissions sent through the website (whether or not email worked), so nothing is lost while email is being set up.
- **Zeffy (online giving)**: the public links of the Zeffy donation forms (card and bank transfer). When set, the "Give online" form sends donors there, whether or not the Tracker is on. With the Tracker off and no links set, donors are told online giving isn't available yet. No Zeffy login is needed for this.

The switch and links are written into each page (`data-send-tracker`, `data-zeffy-card`, `data-zeffy-eft` on `<html>`), and saving them refreshes the cached pages.
