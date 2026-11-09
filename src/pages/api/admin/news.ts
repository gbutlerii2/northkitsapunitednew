import type { APIRoute } from 'astro';
import { fail, json, readJson } from '../../../lib/api';
import { deleteNews, saveNews, type NewsPost } from '../../../lib/content';

export const POST: APIRoute = async ({ request, locals }) => {
  const body = await readJson<Partial<NewsPost>>(request);
  if (!String(body.title || '').trim()) return fail('Please give the post a title.');
  const post = await saveNews(body, locals.admin!.email);
  return json({ ok: true, post });
};

export const DELETE: APIRoute = async ({ request }) => {
  const { id } = await readJson<{ id?: string }>(request);
  if (!id) return fail('Bad post.');
  await deleteNews(id);
  return json({ ok: true });
};
