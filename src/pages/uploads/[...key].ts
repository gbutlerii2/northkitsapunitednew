import type { APIRoute } from 'astro';
import { store } from '../../lib/store';
import { validUploadKey } from '../../lib/content';

export const GET: APIRoute = async ({ params }) => {
  const key = params.key || '';
  if (!validUploadKey(key)) return new Response('Not found', { status: 404 });
  const blob = await store('media').getBinary(key);
  if (!blob) return new Response('Not found', { status: 404 });
  return new Response(blob.data, {
    headers: {
      'Content-Type': String(blob.metadata.contentType || 'application/octet-stream'),
      // File names are unique, so they can be cached for a long time.
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
};
