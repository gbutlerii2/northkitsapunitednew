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

## Form emails

Admin panel → **Forms & emails** sets who receives a copy of each website form by email. Enter addresses separated by semicolons. One list covers all forms, and each form (Online Donation, Gift Notice, Pledge, Donation Question, In-Kind Donation, Contact, Volunteer, Updates Signup) can have its own list instead.

- Subject: `<Form name> - <person's name>` (for example `Pledge - Jane Smith`), handy for mail filters. Signups with no name use their email.
- Body: one field per line (`Label: value`), then the form name, page and time. Reply goes to the person who filled in the form.
- Forms still go to the NKU Tracker as before; the email is an extra copy sent at the same time (`public/js/nku-site.js` → `/api/forms/<kind>`). Bot submissions (hidden `website` field filled in) are dropped, and each visitor is limited to 12 submissions per 10 minutes.

Sending needs one of these on Netlify (Environment variables, mark passwords/keys secret):

| Option | Variables |
| --- | --- |
| Resend (recommended, free tier) | `RESEND_API_KEY`, `MAIL_FROM` (an address on a domain verified in Resend, e.g. `NKU Website <forms@gb2solutions.net>`) |
| Any mailbox over SMTP | `SMTP_HOST`, `SMTP_PORT` (587, or 465), `SMTP_USER`, `SMTP_PASS`, optional `MAIL_FROM`. Gmail / Google Workspace: `smtp.gmail.com`, an App Password. Microsoft 365: `smtp.office365.com` (SMTP AUTH must be enabled for the mailbox). |

Use **Send a test email** on the Form emails page to check it.

### NKU Tracker switch and Zeffy links

On **Forms & emails**:
- **Send form submissions to the NKU Tracker** (on by default). Off means forms go only to the email lists, with nothing sent to nku-tracker.com. The Home page's campaign figures still come from the Tracker.
- **Recent submissions** keeps the last 1,000 form submissions sent through the website (whether or not email worked), so nothing is lost while email is being set up.
- **Zeffy (online giving)**: the public links of the Zeffy donation forms (card and bank transfer). When set, the "Give online" form sends donors there, whether or not the Tracker is on. With the Tracker off and no links set, donors are told online giving isn't available yet. No Zeffy login is needed for this.

The switch and links are written into each page (`data-send-tracker`, `data-zeffy-card`, `data-zeffy-eft` on `<html>`), and saving them refreshes the cached pages.
