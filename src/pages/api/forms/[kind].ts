// Public: the site's forms post here (alongside the NKU Tracker) so the
// people listed under Admin > Form emails get a copy by email.
import type { APIRoute } from 'astro';
import { fail, json, readJson } from '../../../lib/api';
import { buildFormEmail, FORM_KINDS, getFormEmailSettings, recipientsFor, saveSubmission, updateSubmission } from '../../../lib/content';
import { mailStatus, sendMail } from '../../../lib/mail';
import { store } from '../../../lib/store';
import { clientIp } from 'nku:platform';

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

// Never let the email hold up the visitor for long: the form is already saved
// (Admin > Forms & emails > Recent) before the email is tried.
const EMAIL_WAIT_MS = 15_000;
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`The mail server didn't answer within ${ms / 1000} seconds.`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

export const POST: APIRoute = async (ctx) => {
  try {
    return await handle(ctx);
  } catch (err) {
    // Always answer in JSON so the visitor sees a clear message (and the log says why).
    console.error('[nku] form failed', ctx.params.kind, err);
    return fail("Sorry, that didn't send because of a problem on our side. Please try again in a moment, or email nku@rotaryknk.org.", 500);
  }
};

const handle: APIRoute = async ({ params, request, clientAddress }) => {
  const kind = String(params.kind || '');
  if (!FORM_KINDS[kind]) return fail('Unknown form.', 404);

  const body = await readJson<Record<string, unknown>>(request);
  // Hidden "website" field: only bots fill it in. Pretend it worked.
  if (String(body.website || '').trim()) return json({ ok: true });

  const raw = JSON.stringify(body);
  if (raw.length > 30_000 || Object.keys(body).length > 80) return fail('That form is too large.', 413);

  let ip = 'unknown';
  try {
    ip = clientIp(request) || clientAddress || 'unknown';
  } catch {
    /* ignore */
  }
  if (await tooMany(ip)) return fail('Too many messages. Please try again later.', 429);

  const labels: Record<string, string> = {};
  if (body._labels && typeof body._labels === 'object') {
    for (const [k, v] of Object.entries(body._labels as Record<string, unknown>).slice(0, 80)) labels[k.slice(0, 60)] = String(v).slice(0, 200);
  }
  const data: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) {
    if (k.startsWith('_') || k === 'website') continue;
    data[k.slice(0, 60)] = Array.isArray(v) ? v.slice(0, 30).map((x) => String(x).slice(0, 500)) : String(v ?? '').slice(0, 5000);
  }

  const settings = await getFormEmailSettings();
  const to = await recipientsFor(kind);
  const rec = await saveSubmission({ kind, data, labels, emailedTo: [] });

  if (to.length && (await mailStatus().catch(() => ({ method: null }))).method) {
    try {
      await withTimeout(sendMail({ to, ...buildFormEmail(kind, data, labels) }), EMAIL_WAIT_MS);
      rec.emailedTo = to;
    } catch (err) {
      console.error('[nku] form email failed', kind, err);
      rec.emailError = String((err as Error).message || err).slice(0, 300);
    }
    await updateSubmission(rec).catch((err) => console.error('[nku] could not update the form log', err));
  }

  // With the Tracker off, this is what the visitor's browser waits on.
  // The Zeffy form then needs to send the donor on to Zeffy itself.
  // With Zeffy switched off, Donate Now is a plain form: NKU contacts the donor about payment.
  const zeffyOn = settings.zeffyEnabled !== false;
  let redirect: string | undefined;
  if (kind === 'zeffy' && zeffyOn && !settings.sendToTracker) {
    redirect = (data.via === 'eft' ? settings.zeffyEftUrl : settings.zeffyCardUrl) || settings.zeffyCardUrl || settings.zeffyEftUrl || undefined;
    if (!redirect) return fail('Online giving is not available right now. Please contact us and we will help you give.', 503);
  }
  return json({
    ok: true,
    emailed: rec.emailedTo.length > 0,
    redirect,
    message: kind !== 'zeffy' ? undefined : zeffyOn ? 'Thank you. Taking you to Zeffy to complete your gift…' : 'Thank you. Your gift details have been sent to the North Kitsap United team, and we’ll contact you about payment.',
  });
};
