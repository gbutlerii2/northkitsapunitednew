import { defineMiddleware } from 'astro:middleware';
import { readSession, SESSION_COOKIE } from './lib/auth';
import { CACHE_TAG } from './lib/content';

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

function setHeader(res: Response, name: string, value: string) {
  try {
    res.headers.set(name, value);
  } catch {
    /* some responses (e.g. redirects) have read-only headers */
  }
}

export const onRequest = defineMiddleware(async (ctx, next) => {
  const { pathname } = ctx.url;
  const method = ctx.request.method.toUpperCase();
  const isAdminApi = pathname.startsWith('/api/admin/');
  const isAdminPage = pathname === '/admin-panel' || pathname.startsWith('/admin-panel/');
  const isUpload = pathname.startsWith('/uploads/');

  const cookie = ctx.cookies.get(SESSION_COOKIE)?.value;
  const session = cookie && !isUpload ? await readSession(cookie) : null;
  ctx.locals.admin = session ? { email: session.email } : null;

  if (isAdminApi) {
    // Block cross-site requests to the admin API.
    if (method !== 'GET' && method !== 'HEAD') {
      const origin = ctx.request.headers.get('origin');
      let sameHost = false;
      try {
        sameHost = !!origin && new URL(origin).host === ctx.url.host;
      } catch {
        sameHost = false;
      }
      if (!sameHost) return json(403, { error: 'Cross-site request blocked.' });
    }
    if (!session && pathname !== '/api/admin/login') return json(401, { error: 'Please log in again.' });
  }

  if (isAdminPage && !session && pathname !== '/admin-panel' && pathname !== '/admin-panel/') {
    return ctx.redirect('/admin-panel?next=' + encodeURIComponent(pathname + ctx.url.search), 302);
  }

  const res = await next();

  if (isAdminApi || isAdminPage) {
    setHeader(res, 'Cache-Control', 'private, no-store');
    setHeader(res, 'X-Robots-Tag', 'noindex, nofollow');
    return res;
  }

  const type = res.headers.get('content-type') || '';
  if (type.includes('text/html')) {
    // Logged-in editors and visitors get separate cache entries.
    setHeader(res, 'Netlify-Vary', `cookie=${SESSION_COOKIE}`);
    if (session) {
      setHeader(res, 'Cache-Control', 'private, no-store');
    } else if (method === 'GET' && res.status === 200 && !res.headers.has('Netlify-CDN-Cache-Control')) {
      // Browsers always re-check; Netlify's CDN keeps a copy until an edit purges it.
      setHeader(res, 'Cache-Control', 'public, max-age=0, must-revalidate');
      setHeader(res, 'Netlify-CDN-Cache-Control', 'public, durable, s-maxage=3600, stale-while-revalidate=86400');
      setHeader(res, 'Netlify-Cache-Tag', CACHE_TAG);
    }
  }
  return res;
});
