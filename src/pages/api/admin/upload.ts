import type { APIRoute } from 'astro';
import { fail, json } from '../../../lib/api';
import { saveUpload } from '../../../lib/content';

export const POST: APIRoute = async ({ request, locals }) => {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail('No file received.');
  }
  const file = form.get('file');
  if (!(file instanceof File)) return fail('No file received.');
  try {
    const item = await saveUpload(file, locals.admin!.email);
    return json({ ok: true, ...item });
  } catch (err) {
    return fail((err as Error).message);
  }
};
