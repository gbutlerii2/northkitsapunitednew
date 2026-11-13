import type { APIRoute } from 'astro';
import { fail, json, readJson } from '../../../lib/api';
import { acknowledgeRegion, listVersions, pagePath, resetRegion, restoreVersion, saveRegion } from '../../../lib/content';

const validId = (id: unknown): id is string => typeof id === 'string' && /^[a-z0-9-]{1,40}$/.test(id);
const validPath = (p: unknown): p is string => typeof p === 'string' && p.startsWith('/') && p.length < 300 && !p.includes('..');

// GET ?path=/history&id=main  -> saved versions
export const GET: APIRoute = async ({ url }) => {
  const path = url.searchParams.get('path');
  const id = url.searchParams.get('id') || 'main';
  if (!validPath(path) || !validId(id)) return fail('Bad page.');
  return json({ versions: await listVersions(pagePath(path), id) });
};

// POST { action: 'save' | 'reset' | 'restore' | 'ack', path, id, html?, ts?, baseHash? }
export const POST: APIRoute = async ({ request, locals }) => {
  const body = await readJson<{ action?: string; path?: string; id?: string; html?: string; ts?: string; baseHash?: string }>(request);
  const by = locals.admin!.email;
  if (!validPath(body.path) || !validId(body.id)) return fail('Bad page.');
  const path = pagePath(body.path);

  switch (body.action) {
    case 'save': {
      if (typeof body.html !== 'string' || body.html.length > 2_000_000) return fail('Nothing to save.');
      const rec = await saveRegion(path, body.id, body.html, by, typeof body.baseHash === 'string' ? body.baseHash : undefined);
      return json({ ok: true, updatedAt: rec.updatedAt });
    }
    case 'ack':
      // "My edits are up to date with the site": stop warning that the built page changed.
      return (await acknowledgeRegion(path, body.id, String(body.baseHash || ''))) ? json({ ok: true }) : fail('Nothing to update.');
    case 'reset':
      await resetRegion(path, body.id, by);
      return json({ ok: true });
    case 'restore':
      return (await restoreVersion(path, body.id, String(body.ts), by)) ? json({ ok: true }) : fail('That version was not found.', 404);
    default:
      return fail('Unknown action.');
  }
};
