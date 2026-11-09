import type { APIRoute } from 'astro';
import { checkLogin, clearFailures, createSessionCookie, isLockedOut, recordFailure, SESSION_COOKIE } from '../../../lib/auth';
import { fail, json, readJson } from '../../../lib/api';

export const POST: APIRoute = async ({ request, cookies, clientAddress, url }) => {
  const { email = '', password = '' } = await readJson<{ email?: string; password?: string }>(request);
  let ip = 'unknown';
  try {
    ip = request.headers.get('x-nf-client-connection-ip') || clientAddress || 'unknown';
  } catch {
    /* clientAddress can throw in some environments */
  }

  if (await isLockedOut(ip, email)) {
    return fail('Too many failed attempts. Please wait 15 minutes and try again.', 429);
  }
  const user = await checkLogin(email, password);
  if (!user) {
    await recordFailure(ip, email);
    return fail('That email and password do not match.', 401);
  }
  await clearFailures(ip, email);
  const { value, maxAge } = await createSessionCookie(user.email);
  cookies.set(SESSION_COOKIE, value, {
    path: '/',
    httpOnly: true,
    secure: url.protocol === 'https:',
    sameSite: 'lax',
    maxAge,
  });
  return json({ ok: true, mustChangePassword: !!user.mustChangePassword });
};
