import type { APIRoute } from 'astro';
import { fail, json, readJson } from '../../../lib/api';
import { deleteUpload, listUploads, validUploadKey } from '../../../lib/content';

export const GET: APIRoute = async () => json({ items: await listUploads() });

export const DELETE: APIRoute = async ({ request }) => {
  const { key } = await readJson<{ key?: string }>(request);
  if (!key || !validUploadKey(key)) return fail('Bad image.');
  await deleteUpload(key);
  return json({ ok: true });
};
