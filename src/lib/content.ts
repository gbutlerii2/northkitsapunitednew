// Editable content: page regions, news posts and uploaded images.
import sanitizeHtml from 'sanitize-html';
import { store } from './store';

export const CACHE_TAG = 'nku-pages';

// ---------- helpers ----------

export function pagePath(pathname: string): string {
  let p = decodeURIComponent(pathname || '/').replace(/\/{2,}/g, '/');
  if (p.length > 1) p = p.replace(/\/$/, '');
  return p || '/';
}

export function slugify(s: string): string {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

export function extractScripts(html: string): string {
  return (html.match(/<script\b[\s\S]*?<\/script>/gi) || []).join('\n');
}

const IFRAME_HOSTS = ['www.youtube.com', 'youtube.com', 'www.youtube-nocookie.com', 'docs.google.com', 'www.google.com', 'player.vimeo.com'];

export function cleanHtml(html: string): string {
  return sanitizeHtml(String(html || ''), {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      'img', 'h1', 'h2', 'section', 'div', 'span', 'iframe', 'svg', 'path', 'circle', 'rect', 'g', 'polyline', 'line',
      'details', 'summary', 'figure', 'figcaption', 'u', 's', 'mark', 'small', 'sup', 'sub', 'video', 'source',
      // Forms on the site post to the NKU Tracker; they must survive an edit.
      'form', 'input', 'select', 'option', 'optgroup', 'textarea', 'label', 'button', 'fieldset', 'legend', 'output', 'progress', 'meter', 'dialog',
    ]),
    // Keep the text inside <textarea> and <option>.
    nonTextTags: ['script', 'style', 'noscript'],
    allowedAttributes: {
      '*': ['class', 'id', 'style', 'title', 'role', 'aria-*', 'data-*', 'lang', 'dir', 'hidden', 'tabindex'],
      form: ['novalidate', 'name', 'autocomplete'],
      input: ['type', 'name', 'value', 'placeholder', 'required', 'checked', 'min', 'max', 'step', 'pattern', 'autocomplete', 'inputmode', 'maxlength', 'minlength', 'size', 'disabled', 'readonly', 'multiple', 'accept'],
      select: ['name', 'required', 'multiple', 'disabled', 'autocomplete'],
      option: ['value', 'selected', 'disabled', 'label'],
      optgroup: ['label', 'disabled'],
      textarea: ['name', 'rows', 'cols', 'placeholder', 'required', 'maxlength', 'minlength', 'disabled', 'readonly', 'autocomplete'],
      label: ['for'],
      button: ['type', 'name', 'value', 'disabled'],
      fieldset: ['disabled', 'name'],
      output: ['for', 'name'],
      progress: ['value', 'max'],
      meter: ['value', 'min', 'max', 'low', 'high', 'optimum'],
      dialog: ['open'],
      a: ['href', 'target', 'rel', 'name'],
      img: ['src', 'alt', 'width', 'height', 'loading', 'decoding'],
      iframe: ['src', 'title', 'allow', 'allowfullscreen', 'loading', 'width', 'height', 'frameborder', 'marginheight', 'marginwidth', 'referrerpolicy'],
      video: ['src', 'controls', 'poster', 'width', 'height', 'preload', 'muted', 'loop', 'playsinline'],
      source: ['src', 'type'],
      svg: ['viewBox', 'viewbox', 'xmlns', 'fill', 'stroke', 'width', 'height', 'stroke-width'],
      path: ['d', 'fill', 'stroke', 'stroke-linecap', 'stroke-linejoin', 'stroke-width', 'fill-rule', 'clip-rule'],
      circle: ['cx', 'cy', 'r', 'fill', 'stroke', 'stroke-width'],
      rect: ['x', 'y', 'width', 'height', 'rx', 'ry', 'fill', 'stroke'],
      g: ['fill', 'stroke', 'transform'],
      polyline: ['points', 'fill', 'stroke', 'stroke-width'],
      line: ['x1', 'y1', 'x2', 'y2', 'stroke', 'stroke-width'],
      details: ['open'],
      td: ['colspan', 'rowspan'],
      th: ['colspan', 'rowspan', 'scope'],
      ol: ['start', 'type'],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    allowedSchemesAppliedToAttributes: ['href', 'src'],
    allowProtocolRelative: false,
    allowedIframeHostnames: IFRAME_HOSTS,
    // Editor attributes must never be saved.
    exclusiveFilter: (frame) => frame.tag === 'div' && /\bnku-ed-ui\b/.test(frame.attribs.class || ''),
    transformTags: {
      a: (tagName, attribs) => {
        if (attribs.target === '_blank') attribs.rel = 'noopener noreferrer';
        return { tagName, attribs };
      },
    },
  }).trim();
}

export async function purgePages(): Promise<void> {
  if (process.env.NETLIFY !== 'true' && !process.env.NETLIFY_PURGE_API_TOKEN) return;
  try {
    const { purgeCache } = await import('@netlify/cache');
    await purgeCache({ tags: [CACHE_TAG] });
  } catch (err) {
    console.warn('[nku] cache purge failed', err);
  }
}

// ---------- page regions ----------

export interface RegionContent {
  path: string;
  id: string;
  html: string;
  updatedAt: string;
  updatedBy: string;
  /** Fingerprint of the built page's own content when this edit was saved. */
  baseHash?: string;
}

const regionKey = (path: string, id: string) => `region:${pagePath(path)}::${id}`;
const versionPrefix = (path: string, id: string) => `version:${pagePath(path)}::${id}::`;
const MAX_VERSIONS = 15;

export async function getRegion(path: string, id: string): Promise<RegionContent | null> {
  try {
    return await store('content').getJSON<RegionContent>(regionKey(path, id));
  } catch (err) {
    // If storage is unreachable, show the page as built rather than failing.
    console.error('[nku] could not read region', path, id, err);
    return null;
  }
}

/**
 * baseHash: fingerprint of the built content the edit was made on. 'keep' carries
 * the previous fingerprint over (or marks it 'stale' if there was none), so saving
 * a page whose code changed underneath doesn't hide the warning.
 */
export async function saveRegion(path: string, id: string, html: string, by: string, baseHash?: string): Promise<RegionContent> {
  const s = store('content');
  const previous = await s.getJSON<RegionContent>(regionKey(path, id));
  if (previous) {
    await s.setJSON(versionPrefix(path, id) + Date.now().toString().padStart(15, '0'), previous);
    const versions = (await s.list(versionPrefix(path, id))).sort();
    for (const old of versions.slice(0, Math.max(0, versions.length - MAX_VERSIONS))) await s.delete(old);
  }
  const rec: RegionContent = { path: pagePath(path), id, html: cleanHtml(html), updatedAt: new Date().toISOString(), updatedBy: by };
  if (baseHash === 'keep') rec.baseHash = previous?.baseHash || 'stale';
  else if (baseHash && /^([a-f0-9]{16,64}|stale)$/.test(baseHash)) rec.baseHash = baseHash;
  await s.setJSON(regionKey(path, id), rec);
  await purgePages();
  return rec;
}

export async function resetRegion(path: string, id: string, by: string): Promise<void> {
  const s = store('content');
  const current = await s.getJSON<RegionContent>(regionKey(path, id));
  if (current) {
    await s.setJSON(versionPrefix(path, id) + Date.now().toString().padStart(15, '0'), { ...current, resetBy: by });
    await s.delete(regionKey(path, id));
  }
  await purgePages();
}

export async function listVersions(path: string, id: string): Promise<{ ts: string; updatedAt: string; updatedBy: string }[]> {
  const s = store('content');
  const keys = (await s.list(versionPrefix(path, id))).sort().reverse();
  const out = [];
  for (const k of keys) {
    const v = await s.getJSON<RegionContent>(k);
    if (v) out.push({ ts: k.slice(versionPrefix(path, id).length), updatedAt: v.updatedAt, updatedBy: v.updatedBy });
  }
  return out;
}

export async function restoreVersion(path: string, id: string, ts: string, by: string): Promise<boolean> {
  if (!/^\d{1,15}$/.test(ts)) return false;
  const v = await store('content').getJSON<RegionContent>(versionPrefix(path, id) + ts);
  if (!v) return false;
  await saveRegion(path, id, v.html, by, v.baseHash);
  return true;
}

/** All edited regions, for the admin page list. */
export async function listEditedRegions(): Promise<RegionContent[]> {
  const s = store('content');
  const keys = await s.list('region:');
  const recs = await Promise.all(keys.map((k) => s.getJSON<RegionContent>(k)));
  return recs.filter(Boolean) as RegionContent[];
}

// ---------- news ----------

export interface NewsPost {
  id: string;
  slug: string;
  title: string;
  date: string; // YYYY-MM-DD
  summary: string;
  image?: string;
  imageAlt?: string;
  body: string; // HTML
  published: boolean;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
}

const newsKey = (id: string) => `news:${id}`;

export async function listNews(opts: { includeDrafts?: boolean } = {}): Promise<NewsPost[]> {
  try {
    const s = store('content');
    const keys = await s.list('news:');
    const posts = (await Promise.all(keys.map((k) => s.getJSON<NewsPost>(k)))).filter(Boolean) as NewsPost[];
    return posts
      .filter((p) => opts.includeDrafts || p.published)
      .sort((a, b) => (b.date || '').localeCompare(a.date || '') || b.createdAt.localeCompare(a.createdAt));
  } catch (err) {
    console.error('[nku] could not list news', err);
    return [];
  }
}

export async function getNews(id: string): Promise<NewsPost | null> {
  if (!/^[a-z0-9-]{4,40}$/.test(id)) return null;
  return store('content').getJSON<NewsPost>(newsKey(id));
}

export async function getNewsBySlug(slug: string): Promise<NewsPost | null> {
  const all = await listNews({ includeDrafts: true });
  return all.find((p) => p.slug === slug) ?? null;
}

export async function saveNews(input: Partial<NewsPost>, by: string): Promise<NewsPost> {
  const s = store('content');
  const now = new Date().toISOString();
  const existing = input.id ? await getNews(input.id) : null;
  const id = existing?.id ?? crypto.randomUUID().slice(0, 13).replace(/[^a-z0-9-]/g, '');
  const title = String(input.title || '').trim().slice(0, 200) || 'Untitled';

  // Unique slug.
  let slug = slugify(input.slug || title) || id;
  const others = (await listNews({ includeDrafts: true })).filter((p) => p.id !== id);
  let n = 2;
  const base = slug;
  while (others.some((p) => p.slug === slug)) slug = `${base}-${n++}`;

  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(input.date)) ? String(input.date) : now.slice(0, 10);
  const image = typeof input.image === 'string' && /^(\/|https:\/\/)/.test(input.image) ? input.image : '';

  const post: NewsPost = {
    id,
    slug,
    title,
    date,
    summary: String(input.summary || '').trim().slice(0, 600),
    image,
    imageAlt: String(input.imageAlt || '').slice(0, 300),
    body: cleanHtml(String(input.body || '')),
    published: !!input.published,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    updatedBy: by,
  };
  await s.setJSON(newsKey(id), post);
  await purgePages();
  return post;
}

export async function deleteNews(id: string): Promise<void> {
  if (!/^[a-z0-9-]{4,40}$/.test(id)) return;
  await store('content').delete(newsKey(id));
  await purgePages();
}

// ---------- uploaded images ----------

export const IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
};
export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export interface MediaItem {
  key: string;
  url: string;
  name: string;
  contentType: string;
  size: number;
  uploadedAt: string;
  uploadedBy: string;
}

// Sniff the first bytes so a renamed file can't pretend to be an image.
function looksLikeImage(buf: Uint8Array, type: string): boolean {
  const hex = Array.from(buf.slice(0, 12), (b) => b.toString(16).padStart(2, '0')).join('');
  switch (type) {
    case 'image/jpeg': return hex.startsWith('ffd8ff');
    case 'image/png': return hex.startsWith('89504e47');
    case 'image/gif': return hex.startsWith('47494638');
    case 'image/webp': return hex.startsWith('52494646') && hex.slice(16, 24) === '57454250';
    case 'image/avif': return hex.slice(8, 16) === '66747970';
    default: return false;
  }
}

export async function saveUpload(file: File, by: string): Promise<MediaItem> {
  const ext = IMAGE_TYPES[file.type];
  if (!ext) throw new Error('Only JPG, PNG, GIF, WebP or AVIF images can be uploaded.');
  if (file.size > MAX_UPLOAD_BYTES) throw new Error('That image is larger than 8 MB.');
  const data = await file.arrayBuffer();
  if (!looksLikeImage(new Uint8Array(data), file.type)) throw new Error('That file does not look like a valid image.');

  const now = new Date();
  const base = slugify(file.name.replace(/\.[^.]+$/, '')) || 'image';
  const rand = crypto.randomUUID().slice(0, 8);
  const key = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${base}-${rand}.${ext}`;
  const meta = { contentType: file.type, name: file.name.slice(0, 200), size: file.size, uploadedAt: now.toISOString(), uploadedBy: by };
  await store('media').setBinary(key, data, meta);
  return { key, url: `/uploads/${key}`, ...meta };
}

export async function listUploads(): Promise<MediaItem[]> {
  const s = store('media');
  const keys = await s.list();
  const items = await Promise.all(
    keys.map(async (key) => {
      const m = (await s.getMetadata(key)) || {};
      return {
        key,
        url: `/uploads/${key}`,
        name: String(m.name || key),
        contentType: String(m.contentType || ''),
        size: Number(m.size || 0),
        uploadedAt: String(m.uploadedAt || ''),
        uploadedBy: String(m.uploadedBy || ''),
      };
    }),
  );
  return items.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
}

export function validUploadKey(key: string): boolean {
  return /^\d{4}\/\d{2}\/[a-z0-9-]+\.(jpg|png|gif|webp|avif)$/.test(key);
}

export async function deleteUpload(key: string): Promise<void> {
  if (!validUploadKey(key)) return;
  await store('media').delete(key);
}

// ---------- form notification emails ----------

/** The site's forms (data-nku-form="…") and the name used in email subjects. */
export const FORM_KINDS: Record<string, string> = {
  zeffy: 'Online Donation',
  gift: 'Gift Notice',
  pledge: 'Pledge',
  'donation-question': 'Donation Question',
  inkind: 'In-Kind Donation',
  contact: 'Contact',
  volunteer: 'Volunteer',
  updates: 'Updates Signup',
};

export interface FormEmailSettings {
  /** Everyone listed here gets every form, unless a form has its own list. */
  defaultTo: string;
  /** Optional list per form kind; when filled in, it replaces defaultTo for that form. */
  perForm: Record<string, string>;
  /** Also send each form to the NKU Tracker (nku-tracker.com). */
  sendToTracker: boolean;
  /** Zeffy links used when the Tracker is off (it normally supplies them). */
  zeffyCardUrl: string;
  zeffyEftUrl: string;
  updatedAt?: string;
  updatedBy?: string;
}

const FORM_SETTINGS_KEY = 'settings:form-emails';
const EMAIL_RE = /^[^\s@<>;,]+@[^\s@<>;,]+\.[^\s@<>;,]+$/;

/** Splits "a@x.org; b@y.org" (semicolons, commas or new lines) into valid addresses. */
export function parseEmailList(s: string): { valid: string[]; invalid: string[] } {
  const parts = String(s || '').split(/[;,\n]+/).map((p) => p.trim()).filter(Boolean);
  const valid = [...new Set(parts.filter((p) => EMAIL_RE.test(p)).map((p) => p.toLowerCase()))];
  return { valid, invalid: parts.filter((p) => !EMAIL_RE.test(p)) };
}

export async function getFormEmailSettings(): Promise<FormEmailSettings> {
  const saved = await store('content').getJSON<FormEmailSettings>(FORM_SETTINGS_KEY);
  return {
    defaultTo: saved?.defaultTo ?? '',
    perForm: saved?.perForm ?? {},
    sendToTracker: saved?.sendToTracker ?? true,
    zeffyCardUrl: saved?.zeffyCardUrl ?? '',
    zeffyEftUrl: saved?.zeffyEftUrl ?? '',
    updatedAt: saved?.updatedAt,
    updatedBy: saved?.updatedBy,
  };
}

/** Whether forms go to the NKU Tracker. Defaults to on if storage can't be read. */
export async function sendsToTracker(): Promise<boolean> {
  try {
    return (await getFormEmailSettings()).sendToTracker;
  } catch {
    return true;
  }
}

const httpsUrl = (s: unknown) => {
  const v = String(s || '').trim();
  return /^https:\/\/[^\s"'<>]+$/.test(v) ? v : '';
};

export async function saveFormEmailSettings(
  input: { defaultTo?: string; perForm?: Record<string, string>; sendToTracker?: boolean; zeffyCardUrl?: string; zeffyEftUrl?: string },
  by: string,
): Promise<FormEmailSettings> {
  const before = await getFormEmailSettings();
  const norm = (s: unknown) => parseEmailList(String(s || '')).valid.join('; ');
  const perForm: Record<string, string> = {};
  for (const kind of Object.keys(FORM_KINDS)) {
    const v = norm(input.perForm?.[kind]);
    if (v) perForm[kind] = v;
  }
  const rec: FormEmailSettings = {
    defaultTo: norm(input.defaultTo),
    perForm,
    sendToTracker: typeof input.sendToTracker === 'boolean' ? input.sendToTracker : before.sendToTracker,
    zeffyCardUrl: input.zeffyCardUrl === undefined ? before.zeffyCardUrl : httpsUrl(input.zeffyCardUrl),
    zeffyEftUrl: input.zeffyEftUrl === undefined ? before.zeffyEftUrl : httpsUrl(input.zeffyEftUrl),
    updatedAt: new Date().toISOString(),
    updatedBy: by,
  };
  await store('content').setJSON(FORM_SETTINGS_KEY, rec);
  // Pages carry the Tracker on/off switch, so refresh the cached copies.
  if (rec.sendToTracker !== before.sendToTracker || rec.zeffyCardUrl !== before.zeffyCardUrl || rec.zeffyEftUrl !== before.zeffyEftUrl) await purgePages();
  return rec;
}

export async function recipientsFor(kind: string): Promise<string[]> {
  const s = await getFormEmailSettings();
  return parseEmailList(s.perForm[kind] || s.defaultTo).valid;
}

/** "firstName" / "first_name" -> "First name" */
export function humanize(key: string): string {
  const s = key.replace(/[_-]+/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').trim().toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Builds the notification: subject "<Form> - <Name>", one field per line. */
export function buildFormEmail(kind: string, data: Record<string, unknown>, labels: Record<string, string> = {}) {
  const formName = FORM_KINDS[kind] || humanize(kind);
  const str = (v: unknown) => (Array.isArray(v) ? v.map(String).join(', ') : String(v ?? '')).trim();
  const who = str(data.name) || str(data.email) || 'No name given';
  const lines: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (key === 'website' || key === 'page' || key.startsWith('_')) continue;
    const v = str(value);
    if (!v) continue;
    const label = String(labels[key] || humanize(key)).replace(/\s*\*\s*$/, '').replace(/\s+/g, ' ').trim().slice(0, 120);
    lines.push(`${label}: ${v.replace(/\r\n/g, '\n')}`);
  }
  lines.push('');
  lines.push(`Form: ${formName}`);
  if (data.page) lines.push(`Page: ${str(data.page)}`);
  lines.push(`Sent: ${new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles', dateStyle: 'medium', timeStyle: 'short' })} (Pacific)`);
  return { subject: `${formName} - ${who}`.replace(/[\r\n]+/g, ' '), text: lines.join('\n'), replyTo: str(data.email) };
}

// ---------- submissions log ----------
// Every form sent to the website is kept here too, so nothing is lost if
// email isn't set up or the Tracker is switched off.

export interface Submission {
  id: string;
  kind: string;
  at: string;
  data: Record<string, unknown>;
  labels: Record<string, string>;
  emailedTo: string[];
  emailError?: string;
}

const MAX_SUBMISSIONS = 1000;

export async function saveSubmission(sub: Omit<Submission, 'id' | 'at'>): Promise<Submission> {
  const s = store('content');
  const at = new Date().toISOString();
  const id = `${Date.now().toString().padStart(15, '0')}-${crypto.randomUUID().slice(0, 6)}`;
  const rec: Submission = { id, at, ...sub };
  await s.setJSON(`submission:${id}`, rec);
  const keys = (await s.list('submission:')).sort();
  for (const old of keys.slice(0, Math.max(0, keys.length - MAX_SUBMISSIONS))) await s.delete(old);
  return rec;
}

export async function updateSubmission(rec: Submission): Promise<void> {
  await store('content').setJSON(`submission:${rec.id}`, rec);
}

export async function listSubmissions(limit = 100): Promise<Submission[]> {
  const s = store('content');
  const keys = (await s.list('submission:')).sort().reverse().slice(0, limit);
  return (await Promise.all(keys.map((k) => s.getJSON<Submission>(k)))).filter(Boolean) as Submission[];
}

/** Fingerprint of a region's built content (scripts and spacing ignored). */
export async function contentHash(html: string): Promise<string> {
  const norm = html.replace(/<script\b[\s\S]*?<\/script>/gi, '').replace(/\s+/g, ' ').trim();
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(norm));
  return Array.from(new Uint8Array(buf).slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Mark an edited region as checked against the current built content. */
export async function acknowledgeRegion(path: string, id: string, baseHash: string): Promise<boolean> {
  if (!/^[a-f0-9]{16,64}$/.test(baseHash)) return false;
  const s = store('content');
  const rec = await s.getJSON<RegionContent>(regionKey(path, id));
  if (!rec) return false;
  await s.setJSON(regionKey(path, id), { ...rec, baseHash });
  await purgePages();
  return true;
}
