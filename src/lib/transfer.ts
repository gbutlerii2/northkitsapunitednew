// Copies the admin content (page edits, News posts, images, accounts, settings,
// form submissions) from one copy of the site to another, for example from the
// Netlify test site to production on Cloudflare.
//
// Both sites need the same TRANSFER_TOKEN environment variable (32+ characters).
// The site being copied FROM answers GET /api/transfer (read-only, token required).
// The site being copied TO runs the copy from Admin > Copy content, in small batches
// so each request stays well inside Cloudflare's limits.
import { getSecret } from 'astro:env/server';
import { store, type BlobMeta } from './store';

export const STORES = ['content', 'media', 'users'] as const;
export type StoreName = (typeof STORES)[number];

/** Short-lived records that should not be copied (login lockouts, form rate limits). */
const SKIP: Record<StoreName, string[]> = { content: [], media: [], users: ['fail:', 'formrate:'] };

export const isStore = (s: unknown): s is StoreName => typeof s === 'string' && (STORES as readonly string[]).includes(s);

export function transferToken(): string {
  return (getSecret('TRANSFER_TOKEN') ?? process.env.TRANSFER_TOKEN ?? '').toString().trim();
}

const te = new TextEncoder();
function sameText(a: string, b: string): boolean {
  const x = te.encode(a);
  const y = te.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/** True when the request carries this site's TRANSFER_TOKEN. Off unless the token is set. */
export function tokenOk(request: Request): boolean {
  const token = transferToken();
  if (token.length < 32) return false;
  const given = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  return sameText(given, token);
}

export async function listKeys(name: StoreName): Promise<string[]> {
  const keys = await store(name).list();
  return keys.filter((k) => !SKIP[name].some((p) => k.startsWith(p))).sort();
}

// Metadata travels in a header, base64-encoded JSON (headers must be plain ASCII).
const encMeta = (m: BlobMeta) => btoa(String.fromCharCode(...te.encode(JSON.stringify(m || {}))));
const decMeta = (s: string | null): BlobMeta => {
  if (!s) return {};
  try {
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0))));
  } catch {
    return {};
  }
};
export const META_HEADER = 'X-NKU-Meta';

// Big items are sent in 4 MB parts: Netlify functions can't answer with more than 6 MB at once.
export const PART_BYTES = 4 * 1024 * 1024;
export const SIZE_HEADER = 'X-NKU-Size';

/** The source side: one part of a stored item as raw bytes, plus its metadata and total size. */
export async function itemResponse(name: StoreName, key: string, part = 0): Promise<Response> {
  const item = await store(name).getBinary(key);
  if (!item) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  const total = item.data.byteLength;
  const start = part * PART_BYTES;
  if (start > 0 && start >= total) return new Response('No such part', { status: 416, headers: { 'Cache-Control': 'no-store' } });
  return new Response(item.data.slice(start, start + PART_BYTES), {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Cache-Control': 'no-store',
      [META_HEADER]: encMeta(item.metadata),
      [SIZE_HEADER]: String(total),
    },
  });
}

// ---------- the receiving side ----------

export function cleanSource(input: unknown): string {
  let u: URL;
  try {
    u = new URL(String(input || '').trim());
  } catch {
    throw new Error('Enter the address of the site to copy from, starting with https://');
  }
  if (u.protocol !== 'https:' && u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') throw new Error('The address must start with https://');
  return u.origin;
}

async function fromSource(source: string, params: Record<string, string>): Promise<Response> {
  const url = `${source}/api/transfer?${new URLSearchParams(params)}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { Authorization: `Bearer ${transferToken()}` }, redirect: 'manual' });
  } catch (err) {
    throw new Error(`Couldn't reach ${source} (${(err as Error).message || err}).`);
  }
  if (res.status >= 300 && res.status < 400) throw new Error(`${source} redirected the request. Use the site's main address (for example https://northkitsapunitednew.netlify.app).`);
  if (res.status === 404 && params.op !== 'item') throw new Error(`${source} doesn't have the copy feature yet, or TRANSFER_TOKEN isn't set there.`);
  if (res.status === 403) throw new Error(`${source} refused the copy: TRANSFER_TOKEN must be the same on both sites.`);
  return res;
}

export interface SourceSummary {
  keys: Record<StoreName, string[]>;
}

export async function readSourceKeys(source: string): Promise<SourceSummary> {
  const keys = {} as Record<StoreName, string[]>;
  for (const name of STORES) {
    const res = await fromSource(source, { op: 'list', store: name });
    if (!res.ok) throw new Error(`${source} answered ${res.status} when listing ${name}.`);
    const data = (await res.json()) as { keys?: unknown };
    keys[name] = Array.isArray(data.keys) ? data.keys.filter((k): k is string => typeof k === 'string') : [];
  }
  return { keys };
}

/** Copies a batch of keys from the source into this site's storage. */
export async function copyKeys(source: string, name: StoreName, keys: string[]): Promise<{ copied: number; missing: string[]; warnings: string[] }> {
  let copied = 0;
  const missing: string[] = [];
  const warnings: string[] = [];
  for (const key of keys) {
    if (SKIP[name].some((p) => key.startsWith(p))) continue;
    const res = await fromSource(source, { op: 'item', store: name, key });
    if (res.status === 404) {
      missing.push(key);
      continue;
    }
    if (!res.ok) throw new Error(`${source} answered ${res.status} for ${name}/${key}.`);
    const metadata = decMeta(res.headers.get(META_HEADER));
    const total = Number(res.headers.get(SIZE_HEADER) || 0);
    const parts: Uint8Array[] = [new Uint8Array(await res.arrayBuffer())];
    let got = parts[0].byteLength;
    for (let part = 1; got < total; part++) {
      const r = await fromSource(source, { op: 'item', store: name, key, part: String(part) });
      if (!r.ok) throw new Error(`${source} answered ${r.status} for part ${part + 1} of ${name}/${key}.`);
      const chunk = new Uint8Array(await r.arrayBuffer());
      if (!chunk.byteLength) throw new Error(`${name}/${key} came back incomplete.`);
      parts.push(chunk);
      got += chunk.byteLength;
    }
    const all = new Uint8Array(got);
    let at = 0;
    for (const c of parts) {
      all.set(c, at);
      at += c.byteLength;
    }
    const data = all.buffer;
    if (name === 'users' && key.startsWith('user:')) {
      let rounds = 0;
      let email = key.slice(5);
      try {
        const u = JSON.parse(new TextDecoder().decode(data)) as { email?: string; hash?: string };
        rounds = Number(String(u.hash || '').split(/[:$]/)[1]) || 0;
        email = u.email || email;
      } catch {
        /* not a user record */
      }
      if (rounds > 100_000) {
        // That password can't be checked on Cloudflare. Don't replace a working account here with it.
        if (await store(name).getJSON(key)) {
          warnings.push(`${email}: kept this site's account and password, because the other site still has an older password format. Log in once on the other site, then copy again to bring its password over.`);
          continue;
        }
        warnings.push(`${email}: copied, but this password won't work on Cloudflare yet. Log in once on the test site (that updates it) and copy again, or remove them under Users and add them again with a new starting password.`);
      }
    }
    await store(name).setBinary(key, data, metadata);
    copied++;
  }
  return { copied, missing, warnings };
}
