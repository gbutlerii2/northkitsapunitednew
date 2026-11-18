// Site storage: page edits, News posts, uploaded images, users and settings.
// Where it lives depends on the host the site was built for (see src/lib/platform/):
//   Netlify (test site):     Netlify Blobs
//   Cloudflare (production): the R2 bucket bound as NKU_DATA
import { openStore } from 'nku:platform';
import type { SimpleStore } from './platform/types';

export type { BlobMeta, SimpleStore } from './platform/types';

const cache = new Map<string, SimpleStore>();

export function store(name: 'content' | 'media' | 'users'): SimpleStore {
  const full = `nku-${name}`;
  if (!cache.has(full)) cache.set(full, openStore(full));
  return cache.get(full)!;
}
