// Admin > Copy content: pulls the admin content from another copy of the site into this one.
import type { APIRoute } from 'astro';
import { fail, json, readJson } from '../../../lib/api';
import { purgePages } from '../../../lib/content';
import { cleanSource, copyKeys, isStore, readSourceKeys, transferToken } from '../../../lib/transfer';

const MAX_BATCH = 15;

export const POST: APIRoute = async ({ request, url }) => {
  if (transferToken().length < 32) return fail('Set the TRANSFER_TOKEN environment variable (32+ characters, the same on both sites) first.');
  const body = await readJson<{ action?: string; source?: string; store?: string; keys?: unknown }>(request);
  let source: string;
  try {
    source = cleanSource(body.source);
  } catch (err) {
    return fail((err as Error).message);
  }
  if (source === url.origin) return fail('That is this site. Enter the address of the other copy.');

  try {
    if (body.action === 'list') return json({ ok: true, source, ...(await readSourceKeys(source)) });

    if (body.action === 'copy') {
      if (!isStore(body.store)) return fail('Unknown store.');
      const keys = Array.isArray(body.keys) ? body.keys.filter((k): k is string => typeof k === 'string').slice(0, MAX_BATCH) : [];
      const result = await copyKeys(source, body.store, keys);
      return json({ ok: true, ...result });
    }

    if (body.action === 'done') {
      await purgePages();
      return json({ ok: true });
    }
  } catch (err) {
    return fail((err as Error).message, 502);
  }
  return fail('Unknown action.');
};
