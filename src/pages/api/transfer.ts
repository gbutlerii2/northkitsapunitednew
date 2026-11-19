// Read-only export used by Admin > Copy content on another copy of the site.
// Needs the TRANSFER_TOKEN environment variable on both sites; answers 404 when it isn't set.
import type { APIRoute } from 'astro';
import { isStore, itemResponse, listKeys, tokenOk, transferToken } from '../../lib/transfer';

const noStore = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' };

export const GET: APIRoute = async ({ request, url }) => {
  if (transferToken().length < 32) return new Response('{"error":"Not found"}', { status: 404, headers: noStore });
  if (!tokenOk(request)) return new Response('{"error":"Wrong transfer token."}', { status: 403, headers: noStore });

  const name = url.searchParams.get('store');
  if (!isStore(name)) return new Response('{"error":"Unknown store."}', { status: 400, headers: noStore });

  const op = url.searchParams.get('op');
  if (op === 'list') return new Response(JSON.stringify({ keys: await listKeys(name) }), { headers: noStore });
  if (op === 'item') {
    const key = url.searchParams.get('key') || '';
    if (!key || key.length > 500) return new Response('{"error":"Bad key."}', { status: 400, headers: noStore });
    const part = Math.max(0, Math.min(100, Number(url.searchParams.get('part') || 0) | 0));
    return itemResponse(name, key, part);
  }
  return new Response('{"error":"Unknown request."}', { status: 400, headers: noStore });
};
