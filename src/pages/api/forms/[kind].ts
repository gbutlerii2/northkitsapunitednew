// Public: the site's forms post here (alongside the NKU Tracker) so the
// people listed under Admin > Form emails get a copy by email.
import type { APIRoute } from 'astro';
import { fail, json, readJson } from '../../../lib/api';
import { buildFormEmail, FORM_KINDS, recipientsFor } from '../../../lib/content';
import { mailMethod, sendMail } from '../../../lib/mail';
import { store } from '../../../lib/store';

const MAX_PER_WINDOW = 12;
const WINDOW_MS = 10 * 60 * 1000;

async function tooMany(ip: string): Promise<boolean> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('form:' + ip));
  const key = 'formrate:' + Buffer.from(digest).toString('hex').slice(0, 32);
  const s = store('users');
  const rec = await s.getJSON<{ count: number; first: number }>(key);
  const fresh = !rec || Date.now() - rec.first >= WINDOW_MS;
  const next = fresh ? { count: 1, first: Date.now() } : { ...rec!, count: rec!.count + 1 };
  await s.setJSON(key, next);
  return next.count > MAX_PER_WINDOW;
}

export const POST: APIRoute = async ({ params, request, clientAddress }) => {
  const kind = String(params.kind || '');
  if (!FORM_KINDS[kind]) return fail('Unknown form.', 404);

  const body = await readJson<Record<string, unknown>>(request);
  // Hidden "website" field: only bots fill it in. Pretend it worked.
  if (String(body.website || '').trim()) return json({ ok: true });

  const raw = JSON.stringify(body);
  if (raw.length > 30_000 || Object.keys(body).length > 80) return fail('That form is too large.', 413);

  let ip = 'unknown';
  try {
    ip = request.headers.get('x-nf-client-connection-ip') || clientAddress || 'unknown';
  } catch {
    /* ignore */
  }
  if (await tooMany(ip)) return fail('Too many messages. Please try again later.', 429);

  const to = await recipientsFor(kind);
  if (!to.length || !mailMethod()) return json({ ok: true, emailed: false });

  const labels = body._labels && typeof body._labels === 'object' ? (body._labels as Record<string, string>) : {};
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (k.startsWith('_')) continue;
    data[k.slice(0, 60)] = Array.isArray(v) ? v.slice(0, 30).map((x) => String(x).slice(0, 500)) : String(v ?? '').slice(0, 5000);
  }
  try {
    await sendMail({ to, ...buildFormEmail(kind, data, labels) });
    return json({ ok: true, emailed: true });
  } catch (err) {
    console.error('[nku] form email failed', kind, err);
    return json({ ok: false, emailed: false }, 502);
  }
};
