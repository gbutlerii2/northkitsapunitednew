import type { APIRoute } from 'astro';
import { fail, json, readJson } from '../../../lib/api';
import { buildFormEmail, parseEmailList, saveFormEmailSettings } from '../../../lib/content';
import { sendMail } from '../../../lib/mail';

// POST { action: 'save', defaultTo, perForm }  |  { action: 'test', to }
export const POST: APIRoute = async ({ request, locals }) => {
  const body = await readJson<{ action?: string; defaultTo?: string; perForm?: Record<string, string>; to?: string; sendToTracker?: boolean; zeffyCardUrl?: string; zeffyEftUrl?: string }>(request);
  const by = locals.admin!.email;

  if (body.action === 'save') {
    const lists = [body.defaultTo || '', ...Object.values(body.perForm || {})];
    const invalid = lists.flatMap((l) => parseEmailList(l).invalid);
    if (invalid.length) return fail(`These don't look like email addresses: ${invalid.slice(0, 5).join(', ')}`);
    for (const u of [body.zeffyCardUrl, body.zeffyEftUrl]) {
      if (u && !/^https:\/\/\S+$/.test(u.trim())) return fail('Zeffy links must start with https://');
    }
    const saved = await saveFormEmailSettings(
      { defaultTo: body.defaultTo, perForm: body.perForm, sendToTracker: body.sendToTracker, zeffyCardUrl: body.zeffyCardUrl, zeffyEftUrl: body.zeffyEftUrl },
      by,
    );
    return json({ ok: true, settings: saved });
  }

  if (body.action === 'test') {
    const { valid } = parseEmailList(body.to || '');
    if (!valid.length) return fail('Enter at least one email address to send the test to.');
    const sample = buildFormEmail('pledge', {
      name: 'Test Donor',
      email: by,
      phone: '360-555-0100',
      amount: '$1,000',
      frequency: 'Monthly',
      page: '/donate',
    });
    try {
      await sendMail({ to: valid, subject: sample.subject + ' (test)', text: 'This is a test from the NKU admin panel.\n\n' + sample.text, replyTo: by });
      return json({ ok: true });
    } catch (err) {
      return fail((err as Error).message, 502);
    }
  }
  return fail('Unknown action.');
};
