// Small wrapper around Netlify Blobs.
// On Netlify (and in `astro dev` with the Netlify adapter) data lives in Netlify Blobs.
// If Blobs is not available (for example a plain local Node run), it falls back to
// files in ~/.nku-web-data so the admin can still be tried locally.
import { getStore } from '@netlify/blobs';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export interface BlobMeta {
  [key: string]: unknown;
}

export interface SimpleStore {
  getJSON<T = unknown>(key: string): Promise<T | null>;
  setJSON(key: string, value: unknown): Promise<void>;
  getBinary(key: string): Promise<{ data: ArrayBuffer; metadata: BlobMeta } | null>;
  setBinary(key: string, data: ArrayBuffer, metadata: BlobMeta): Promise<void>;
  getMetadata(key: string): Promise<BlobMeta | null>;
  delete(key: string): Promise<void>;
  list(prefix?: string): Promise<string[]>;
}

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
const cache = new Map<string, SimpleStore>();

export function store(name: 'content' | 'media' | 'users'): SimpleStore {
  const full = `nku-${name}`;
  if (cache.has(full)) return cache.get(full)!;
  if (useFiles === null) {
    try {
      getStore(full);
      useFiles = false;
    } catch {
      useFiles = process.env.NETLIFY === 'true' ? false : true;
      if (useFiles) console.warn('[nku] Netlify Blobs not available, using local folder ' + DATA_DIR + '');
    }
  }
  const s = useFiles ? fileStore(full) : netlifyStore(full);
  cache.set(full, s);
  return s;
}
