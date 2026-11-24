// Netlify host: data in Netlify Blobs, CDN cache purge by tag, email through nodemailer.
// If Blobs is not available (for example a plain local Node run), data falls back to
// files in ~/.nku-web-data so the admin can still be tried locally.
import { getStore } from '@netlify/blobs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { BlobMeta, SimpleStore, SmtpAccount, SmtpMessage } from './types';

export const HOST = 'netlify' as const;

function netlifyStore(name: string): SimpleStore {
  const store = getStore({ name, consistency: 'strong' });
  return {
    async getJSON(key) {
      return (await store.get(key, { type: 'json' })) ?? null;
    },
    async setJSON(key, value) {
      await store.setJSON(key, value);
    },
    async getBinary(key) {
      const r = await store.getWithMetadata(key, { type: 'arrayBuffer' });
      return r ? { data: r.data, metadata: r.metadata as BlobMeta } : null;
    },
    async setBinary(key, data, metadata) {
      await store.set(key, data, { metadata });
    },
    async getMetadata(key) {
      const r = await store.getMetadata(key);
      return r ? (r.metadata as BlobMeta) : null;
    },
    async delete(key) {
      await store.delete(key);
    },
    async list(prefix) {
      const keys: string[] = [];
      for await (const page of store.list({ prefix, paginate: true })) {
        for (const b of page.blobs) keys.push(b.key);
      }
      return keys;
    },
  };
}

// Kept outside the project folder so local test data is never bundled into a deploy.
const DATA_DIR = process.env.NKU_LOCAL_DATA_DIR || path.join(os.homedir(), '.nku-web-data');
const enc = (k: string) => encodeURIComponent(k);
const dec = (f: string) => decodeURIComponent(f);

function fileStore(name: string): SimpleStore {
  const dir = path.join(DATA_DIR, name);
  const file = (k: string) => path.join(dir, enc(k));
  const metaFile = (k: string) => path.join(dir, enc(k) + '.__meta');
  const ensure = () => fs.mkdir(dir, { recursive: true });
  return {
    async getJSON(key) {
      try {
        return JSON.parse(await fs.readFile(file(key), 'utf8'));
      } catch {
        return null;
      }
    },
    async setJSON(key, value) {
      await ensure();
      await fs.writeFile(file(key), JSON.stringify(value));
    },
    async getBinary(key) {
      try {
        const buf = await fs.readFile(file(key));
        const metadata = JSON.parse(await fs.readFile(metaFile(key), 'utf8').catch(() => '{}'));
        return { data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), metadata };
      } catch {
        return null;
      }
    },
    async setBinary(key, data, metadata) {
      await ensure();
      await fs.writeFile(file(key), Buffer.from(data));
      await fs.writeFile(metaFile(key), JSON.stringify(metadata));
    },
    async getMetadata(key) {
      try {
        await fs.access(file(key));
        return JSON.parse(await fs.readFile(metaFile(key), 'utf8').catch(() => '{}'));
      } catch {
        return null;
      }
    },
    async delete(key) {
      await fs.rm(file(key), { force: true });
      await fs.rm(metaFile(key), { force: true });
    },
    async list(prefix = '') {
      try {
        const files = await fs.readdir(dir);
        return files
          .filter((f) => !f.endsWith('.__meta'))
          .map(dec)
          .filter((k) => k.startsWith(prefix));
      } catch {
        return [];
      }
    },
  };
}

let useFiles: boolean | null = null;

export function openStore(name: string): SimpleStore {
  if (useFiles === null) {
    try {
      getStore(name);
      useFiles = false;
    } catch {
      useFiles = process.env.NETLIFY === 'true' ? false : true;
      if (useFiles) console.warn('[nku] Netlify Blobs not available, using local folder ' + DATA_DIR);
    }
  }
  return useFiles ? fileStore(name) : netlifyStore(name);
}

/** Empties Netlify's CDN copies of the pages after an admin edit. */
export async function purgeCache(tag: string): Promise<void> {
  if (process.env.NETLIFY !== 'true' && !process.env.NETLIFY_PURGE_API_TOKEN) return;
  try {
    const { purgeCache } = await import('@netlify/cache');
    await purgeCache({ tags: [tag] });
  } catch (err) {
    console.warn('[nku] cache purge failed', err);
  }
}

export async function sendSmtp(account: SmtpAccount, msg: SmtpMessage): Promise<void> {
  const nodemailer = (await import('nodemailer')).default;
  const transport = nodemailer.createTransport({
    host: account.host,
    port: account.port,
    secure: account.port === 465,
    auth: { user: account.user, pass: account.pass },
    // Fail fast instead of nodemailer's minutes-long defaults, so a slow mail
    // server can't run the request past Netlify's function time limit.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  });
  await transport.sendMail({ from: msg.from, to: msg.to.join(', '), subject: msg.subject, text: msg.text, replyTo: msg.replyTo });
}

/** The visitor's IP address as the host reports it. */
export function clientIp(request: Request): string | null {
  return request.headers.get('x-nf-client-connection-ip');
}
