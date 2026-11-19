// What the site needs from its host. One file per host implements this:
//   src/lib/platform/netlify.ts     (test site, northkitsapunitednew.netlify.app)
//   src/lib/platform/cloudflare.ts  (production, nku-web on Cloudflare)
// astro.config.mjs points the import `nku:platform` at the right file at build time.

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

export interface SmtpAccount {
  host: string;
  port: number;
  user: string;
  pass: string;
}

export interface SmtpMessage {
  from: string;
  to: string[];
  subject: string;
  text: string;
  replyTo?: string;
}
