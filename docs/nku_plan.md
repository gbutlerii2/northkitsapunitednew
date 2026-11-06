Here’s a novice-friendly implementation plan for the **Cloudflare Pages + GitHub + Astro + Google Forms** option.

My recommendation is to do this in **two separate moves**:

1. **Build and test the new site first** on a temporary Cloudflare Pages URL.
2. **Point the real domain to it later**.
3. **Only transfer the domain registration later if you want to**.

That is safer than trying to rebuild the site and transfer domain ownership at the same time. Cloudflare Pages supports GitHub-based deployments and custom domains, and Cloudflare’s DNS setup on free/pro plans uses a full setup with Cloudflare nameservers. ([Cloudflare Docs][1])


## Best-fit stack

Use this:

* **GitHub** for your code
* **Astro** for the static website
* **Cloudflare Pages** for hosting
* **Cloudflare DNS** for the domain
* **Google Forms + Google Sheets** for contact/newsletter forms
* optional **Google Analytics later**

Astro is a good fit for fast, content-focused websites and Cloudflare has an official Astro-on-Pages guide. Google Forms can be linked or embedded, and Forms can email you for new responses. ([Cloudflare Docs][7])

---

# Step-by-step implementation plan

## Phase 1: Gather everything before you build

Ask the current owner for:

* all page text
* all images in original quality
* all PDFs and downloadable files
* all YouTube/video links
* a list of current public URLs
* legal page text you’re allowed to reuse
* confirmation that you have permission to reuse all of it

From the public site, I can already see several live URL patterns you’ll likely want to preserve, including the homepage, `/faq`, `/history`, `/contact-us`, concept pages like `/concept/context` and `/concept/process`, planning-team pages, legal pages like `/privacy-statement`, `/terms-of-use`, `/accessibility`, and materials pages like `/meetings-materials/meetings`, `/meetings-materials/materials`, and `/meetings-materials/property-maps`. ([North Kitsap United][8])

Also ask for:

* current domain registrar name
* current registrar login access or willingness to cooperate
* current DNS access
* confirmation that the registrant email on the domain is accessible by the current owner

That last part matters because registrar transfer approvals and Auth-Code workflows typically depend on the current owner’s account and contact email. ([ICANN][2])

## Phase 2: Create the site locally

Install Node.js on your computer, then create a new Astro project. Cloudflare’s Astro-on-Pages guide supports creating and deploying an Astro app to Pages. ([Cloudflare Docs][7])

A beginner-friendly structure would look like this:

```text
north-kitsap-united/
  public/
    images/
    media/
    favicon.ico
  src/
    components/
      Layout.astro
      Header.astro
      Footer.astro
      Hero.astro
      DocumentList.astro
    pages/
      index.astro
      faq.astro
      history.astro
      contact-us.astro
      privacy-statement.astro
      terms-of-use.astro
      accessibility.astro
      concept/
        context.astro
        process.astro
        plans.astro
      meetings-materials/
        meetings.astro
        materials.astro
        property-maps.astro
      planning-team/
        kingston-north-kitsap-rotary-club.astro
        ymca-of-pierce-and-kitsap-counties.astro
        raydient-places-plus-properties.astro
  package.json
```

Put PDFs and other downloadable files into `public/media/...` so they publish directly at stable URLs. Since the existing site already serves public documents from `/media/...`, mirroring that structure will make it easier to preserve old links. ([North Kitsap United][9])

## Phase 3: Recreate the content and navigation

Build the pages with:

* a shared header
* a shared footer
* a consistent hero/header image style
* a simple sidebar or top-nav
* document lists for PDFs
* embedded YouTube videos on the meetings page
* separate legal pages
* a contact page
* a newsletter signup page or section

Do not worry about making it identical. Your goal is:

* keep the same major page structure
* preserve the important URLs
* make it clean and professional

Because Astro is static-first and content-focused, this kind of site is exactly what it is good at. ([Cloudflare Docs][7])

## Phase 4: Build contact and newsletter forms

For **contact**, create a Google Form with fields like:

* name
* email
* message

For **newsletter signup**, create a separate Google Form with:

* name
* email
* optional consent checkbox

Set each Form to save responses to Google Sheets. In the Form’s Responses menu, turn on **Get email notifications for new responses**. Google documents both publishing/sharing forms and enabling email notifications for new responses. ([Google Help][10])

Then either:

* **link** to the Google Form from your site, or
* **embed** the Form on the page

For simplicity and reliability, I would embed or link to the form, not use `mailto:` as the primary path. ([Google Help][10])

## Phase 5: Put the site in GitHub

Create a GitHub repo, such as:

`nku-web`

Then commit and push your Astro project to GitHub.

This matters because Cloudflare Pages can connect directly to a GitHub repo and automatically deploy whenever you push updates. ([Cloudflare Docs][5])

## Phase 6: Deploy to Cloudflare Pages first on a temporary URL

In Cloudflare:

* create a free account
* go to **Workers & Pages**
* create a new Pages project
* connect your GitHub account
* choose your repo
* let Cloudflare build and deploy the Astro project

Cloudflare Pages supports GitHub integration for automatic deployments. It will give you a temporary URL like:

`your-project.pages.dev`

Use that temporary URL to review the entire site before touching the real domain. ([Cloudflare Docs][5])

## Phase 7: Add redirects before cutover

You said you want to preserve URLs when possible. That is one of the big reasons to use Cloudflare Pages instead of Google Sites.

Cloudflare Pages supports a `_redirects` file in the output/build folder. It also supports Bulk Redirects, and `_redirects` supports up to 2,000 static redirects and 100 dynamic redirects before you need Bulk Redirects. ([Cloudflare Docs][11])

A simple `_redirects` example:

```text
/contact /contact-us 301
/meetings /meetings-materials/meetings 301
/materials /meetings-materials/materials 301
/maps /meetings-materials/property-maps 301
```

If the old path and new path are the same, you do not need a redirect.
If you recreate the original path exactly, that is best.

## Phase 8: Make a URL inventory before cutover

Before switching the live domain, make a spreadsheet with columns like:

* Old URL
* New URL
* Status
* Notes

Example:

```text
https://www.northkitsapunited.com/                  -> /
https://www.northkitsapunited.com/faq               -> /faq
https://www.northkitsapunited.com/history           -> /history
https://www.northkitsapunited.com/contact-us        -> /contact-us
https://www.northkitsapunited.com/concept/context   -> /concept/context
https://www.northkitsapunited.com/concept/process   -> /concept/process
https://www.northkitsapunited.com/meetings-materials/meetings -> /meetings-materials/meetings
https://www.northkitsapunited.com/meetings-materials/materials -> /meetings-materials/materials
https://www.northkitsapunited.com/meetings-materials/property-maps -> /meetings-materials/property-maps
https://www.northkitsapunited.com/privacy-statement -> /privacy-statement
https://www.northkitsapunited.com/terms-of-use      -> /terms-of-use
https://www.northkitsapunited.com/accessibility     -> /accessibility
```

From the public crawl, these are clearly live routes today, so they should be high priority. ([North Kitsap United][8])

## Phase 9: Only now prepare the real domain

This is where domain/DNS work begins.

My recommendation:

* **do not transfer the registrar immediately**
* first **move DNS to Cloudflare**
* get the site live
* later decide if you also want to transfer the registrar

That keeps the website go-live separate from the ownership/billing migration.

---

# My recommended domain handoff plan

## Recommended order

### Step A: Ask for these exact things first

Send the current owner something like this:

> I need either:
>
> 1. temporary access to the current registrar so I can update nameservers, or
> 2. for you to stay on a call with me while I give you the exact nameservers to enter, or
> 3. for you to transfer/push the domain into an account I control.
>
> I also need:
>
> * the current registrar name
> * confirmation that the domain is unlocked or can be unlocked
> * confirmation that the registrant/admin contact email is accessible
> * a screenshot/export of the current DNS records before any changes

That last item is important because before transferring or changing nameservers, you want a copy of the old DNS setup. Cloudflare specifically advises noting current DNS settings before transfer, and its onboarding flow includes reviewing records before nameserver change. ([Cloudflare Docs][3])

### Step B: Do not start with a registrar transfer

Just get enough cooperation to point DNS to Cloudflare.

That means one of these is enough for launch:

* they give you registrar access temporarily, or
* they make the nameserver change for you while you watch

### Step C: Launch the site first

After the site is live and stable, then decide whether to:

* leave the domain where it is, or
* move it to your own registrar account, or
* transfer it to Cloudflare Registrar later

---

# Exact DNS cutover checklist

## Part 1: Set up Cloudflare before touching the domain

1. Create a Cloudflare account.
2. In Cloudflare, choose **Onboard a domain** and add `northkitsapunited.com`.
3. Let Cloudflare scan/import the current DNS records if possible.
4. Review imported records carefully.
5. Save the two Cloudflare nameservers it gives you. Cloudflare’s onboarding docs explicitly walk through add domain, review DNS, then change nameservers. ([Cloudflare Docs][3])

You will be given two nameservers that look something like this:

```text
alex.ns.cloudflare.com
zoe.ns.cloudflare.com
```

Those are examples only. Yours will be different.

## Part 2: Set up the Pages project domain inside Cloudflare

In Cloudflare Pages:

1. open your Pages project
2. go to **Custom domains**
3. click **Set up a domain**
4. add `northkitsapunited.com`
5. add `www.northkitsapunited.com`

Cloudflare documents custom-domain setup directly in Pages. ([Cloudflare Docs][1])

## Part 3: Change the nameservers at the current registrar

This is the critical handoff step.

At the current registrar:

1. log in
2. find the domain
3. find the **Nameservers** section
4. choose **Custom nameservers** or **Use these nameservers**
5. replace the current nameservers with the two Cloudflare nameservers
6. save changes

That is the moment control of DNS moves to Cloudflare once the change propagates. Cloudflare’s nameserver-change instructions specifically cover getting the nameservers, updating them at the registrar, and then verifying. ([Cloudflare Docs][4])

## Part 4: Wait for propagation and verify

After saving the nameserver change:

* the internet needs time to notice
* once Cloudflare sees the nameserver update, the zone becomes active
* the Pages custom domain should validate

Cloudflare notes that nameserver and DNS changes take time to propagate. ([Cloudflare Docs][13])

## Part 5: Confirm the site works

Check all of these:

* `https://northkitsapunited.com`
* `https://www.northkitsapunited.com`
* homepage
* FAQ
* contact
* meetings/materials pages
* PDFs
* YouTube embeds
* Google Forms
* redirects
* mobile layout

If one version should redirect to the other, set that behavior intentionally.

Cloudflare also documents redirecting the default `pages.dev` hostname to your custom domain after domain setup. ([Cloudflare Docs][14])

---

# Example DNS records you will likely end up with

When Cloudflare is your DNS host, the exact records depend on your final setup, but conceptually it may look like this inside Cloudflare DNS:

```text
Type   Name   Content/Target
CNAME  www    your-project.pages.dev
CNAME  @      your-project.pages.dev   (or Cloudflare-managed Pages target)
```

The exact records may be auto-created by Pages when you attach the custom domain. Cloudflare’s Pages custom-domain flow and DNS record management docs cover this process. ([Cloudflare Docs][1])

If you ever add email later, that would require separate MX/TXT records and should be handled carefully so website changes do not break mail. Since you said you do not need email hosting, that can stay out of scope for now.

---

# If the current owner wants to hand over full ownership too

There are two paths.

## Option 1: Same-registrar handoff

Example:

* domain is at GoDaddy
* you make a GoDaddy account
* they push the domain to your account

This can be convenient, but it is registrar-specific. Also, be careful: a registrant change can create a 60-day transfer lock, which can prevent moving it to a different registrar right away. ([ICANN][12])

## Option 2: Inter-registrar transfer later

Example:

* leave registrar where it is during launch
* later transfer to Cloudflare Registrar

That later transfer requires:

* unlocked domain
* Auth-Code/EPP code
* starting transfer at the gaining registrar
* approval
* waiting for completion

Cloudflare says you must first add the domain to Cloudflare before transferring it to Cloudflare Registrar, and that the full process is usually around 5 business days total. Cloudflare Registrar also keeps domains on Cloudflare nameservers. ([Cloudflare Docs][13])

---

# What access you actually need from the old owner

For launch, the minimum you need is:

**Enough access to change nameservers.**

That can happen in one of three ways:

1. **They give you temporary login** to the registrar
2. **They screen-share and make the change** while you tell them the nameservers
3. **They transfer/push the domain to an account you control first**

For a novice, option 2 is often the least stressful.

---

# Your practical launch plan

Here is the order I would personally use:

## Week 1: Build

* collect files
* create Astro site
* recreate pages
* upload images and PDFs
* connect Google Forms
* deploy to Pages temporary URL
* test everything

## Week 2: Prepare cutover

* create URL spreadsheet
* add redirects
* onboard domain in Cloudflare
* get nameservers ready
* schedule a 30-minute handoff call with current owner

## Cutover day

* current owner logs into registrar
* changes nameservers to Cloudflare’s
* you verify Cloudflare activation
* you verify Pages custom domain
* test the main pages and PDFs
* done

## After launch

* fix any missed redirects
* optionally add Google Analytics
* later decide whether to transfer registrar ownership too

---

# My strongest advice

Do **not** start with a registrar transfer unless the current owner is very organized and you are comfortable waiting through the transfer process.

For you, the lowest-risk approach is:

**build first → Cloudflare Pages preview → change nameservers → launch → transfer registrar later if desired**

That keeps the project simple, cheap, and beginner-friendly. Cloudflare’s setup flow, Pages custom domains, GitHub integration, and redirects all support that approach well. ([Cloudflare Docs][1])

Next, I can turn this into a **literal clickable checklist** with:

* what to do in GitHub,
* what to click in Cloudflare,
* what to ask the domain owner,
* and a starter Astro folder/file template.

[1]: https://developers.cloudflare.com/pages/configuration/custom-domains/?utm_source=chatgpt.com "Custom domains · Cloudflare Pages docs"
[2]: https://www.icann.org/resources/pages/auth-2013-05-03-en?utm_source=chatgpt.com "About Auth-Code"
[3]: https://developers.cloudflare.com/fundamentals/manage-domains/add-site/?utm_source=chatgpt.com "Onboard a domain · Cloudflare Fundamentals docs"
[4]: https://developers.cloudflare.com/dns/zone-setups/full-setup/setup/?utm_source=chatgpt.com "Change your nameservers (Full setup) · Cloudflare DNS docs"
[5]: https://developers.cloudflare.com/pages/configuration/git-integration/github-integration/?utm_source=chatgpt.com "GitHub integration · Cloudflare Pages docs"
[6]: https://knowledge.workspace.google.com/admin/domains/add-a-user-alias-domain-or-secondary-domain?utm_source=chatgpt.com "Add a user alias domain or secondary domain"
[7]: https://developers.cloudflare.com/pages/framework-guides/deploy-an-astro-site/?utm_source=chatgpt.com "Astro · Cloudflare Pages docs"
[8]: https://www.northkitsapunited.com/concept/context?utm_source=chatgpt.com "Context"
[9]: https://www.northkitsapunited.com/meetings-materials/materials?utm_source=chatgpt.com "Materials"
[10]: https://support.google.com/docs/answer/2839588?hl=en&utm_source=chatgpt.com "Publish & share your form with responders"
[11]: https://developers.cloudflare.com/pages/configuration/redirects/?utm_source=chatgpt.com "Redirects · Cloudflare Pages docs"
[12]: https://www.icann.org/resources/pages/about-icann-faqs-2019-02-25-en?utm_source=chatgpt.com "FAQs for Registrants: About ICANN"
[13]: https://developers.cloudflare.com/registrar/get-started/transfer-domain-to-cloudflare/?utm_source=chatgpt.com "Transfer your domain to Cloudflare - Registrar"
[14]: https://developers.cloudflare.com/pages/how-to/redirect-to-custom-domain/?utm_source=chatgpt.com "Redirecting *.pages.dev to a Custom Domain"
