// Login, passwords and sessions for /admin-panel.
//
// Passwords are never stored in plain text. They are hashed with PBKDF2-SHA256
// (Web Crypto) and stored as "pbkdf2:<iterations>:<saltB64>:<hashB64>".
//
// The very first admin comes from two Netlify environment variables:
//   ADMIN_EMAIL           e.g. the site owner's email
//   ADMIN_PASSWORD_HASH   output of `npm run hash-password`
// After that first login the account is copied into Netlify Blobs, and passwords
// are changed from the admin panel. SESSION_SECRET (a long random string) signs
// the login cookie.
import { getSecret } from 'astro:env/server';
import { store } from './store';

export const SESSION_COOKIE = 'nku_session';
const SESSION_HOURS = 8;
const ITERATIONS = 210_000;

export interface AdminUser {
  email: string;
  name?: string;
  hash: string;
  createdAt: string;
  mustChangePassword?: boolean;
}

export interface Session {
  email: string;
  exp: number;
}

const te = new TextEncoder();

function b64(buf: ArrayBuffer | Uint8Array): string {
  return Buffer.from(buf instanceof Uint8Array ? buf : new Uint8Array(buf)).toString('base64');
}
function b64url(buf: ArrayBuffer | Uint8Array): string {
  return b64(buf).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function fromB64(s: string): Uint8Array {
  return new Uint8Array(Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64'));
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', te.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, ITERATIONS);
  return `pbkdf2:${ITERATIONS}:${b64(salt)}:${b64(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = (stored || '').trim().split(/[:$]/);
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iterations = Number(parts[1]);
  if (!Number.isFinite(iterations) || iterations < 10_000) return false;
  const hash = await pbkdf2(password, fromB64(parts[2]), iterations);
  return timingSafeEqual(hash, fromB64(parts[3]));
}

export function passwordProblem(pw: string): string | null {
  if (typeof pw !== 'string' || pw.length < 10) return 'Use at least 10 characters.';
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return 'Use at least one letter and one number.';
  return null;
}

// ---------- users ----------

export const normEmail = (e: string) => String(e || '').trim().toLowerCase();
const userKey = (email: string) => `user:${normEmail(email)}`;

export async function getUser(email: string): Promise<AdminUser | null> {
  return store('users').getJSON<AdminUser>(userKey(email));
}

export async function saveUser(user: AdminUser): Promise<void> {
  user.email = normEmail(user.email);
  await store('users').setJSON(userKey(user.email), user);
}

export async function deleteUser(email: string): Promise<void> {
  await store('users').delete(userKey(email));
}

export async function listUsers(): Promise<AdminUser[]> {
  const keys = await store('users').list('user:');
  const users = await Promise.all(keys.map((k) => store('users').getJSON<AdminUser>(k)));
  return (users.filter(Boolean) as AdminUser[]).sort((a, b) => a.email.localeCompare(b.email));
}

/** Checks an email + password. Creates the first admin from env vars on first use. */
export async function checkLogin(emailIn: string, password: string): Promise<AdminUser | null> {
  const email = normEmail(emailIn);
  if (!email || !password) return null;
  const existing = await getUser(email);
  if (existing) return (await verifyPassword(password, existing.hash)) ? existing : null;

  const bootEmail = normEmail(env('ADMIN_EMAIL'));
  const bootHash = env('ADMIN_PASSWORD_HASH');
  if (bootEmail && bootHash && email === bootEmail && (await verifyPassword(password, bootHash))) {
    // Only bootstrap while there are no accounts yet, so a stale env var
    // can't bring back a removed account.
    if ((await listUsers()).length > 0) return null;
    const user: AdminUser = {
      email,
      name: 'Site owner',
      hash: bootHash,
      createdAt: new Date().toISOString(),
      mustChangePassword: true,
    };
    await saveUser(user);
    return user;
  }
  return null;
}

// ---------- brute-force protection ----------

const MAX_FAILS = 8;
const WINDOW_MS = 15 * 60 * 1000;

interface FailRecord {
  count: number;
  first: number;
}

async function hashKey(s: string): Promise<string> {
  return b64url(await crypto.subtle.digest('SHA-256', te.encode(s))).slice(0, 32);
}

export async function isLockedOut(ip: string, email: string): Promise<boolean> {
  for (const id of [`ip:${ip}`, `email:${normEmail(email)}`]) {
    const rec = await store('users').getJSON<FailRecord>(`fail:${await hashKey(id)}`);
    if (rec && Date.now() - rec.first < WINDOW_MS && rec.count >= MAX_FAILS) return true;
  }
  return false;
}

export async function recordFailure(ip: string, email: string): Promise<void> {
  for (const id of [`ip:${ip}`, `email:${normEmail(email)}`]) {
    const key = `fail:${await hashKey(id)}`;
    const rec = await store('users').getJSON<FailRecord>(key);
    const fresh = !rec || Date.now() - rec.first >= WINDOW_MS;
    await store('users').setJSON(key, fresh ? { count: 1, first: Date.now() } : { ...rec, count: rec!.count + 1 });
  }
}

export async function clearFailures(ip: string, email: string): Promise<void> {
  for (const id of [`ip:${ip}`, `email:${normEmail(email)}`]) {
    await store('users').delete(`fail:${await hashKey(id)}`);
  }
}

// ---------- sessions ----------

function env(name: string): string {
  // getSecret reads Netlify environment variables at runtime (and .env in local dev).
  return (getSecret(name) ?? process.env[name] ?? '').toString();
}

let devSecret: string | null = null;
function sessionSecret(): string {
  const s = env('SESSION_SECRET');
  if (s && s.length >= 32) return s;
  if (process.env.NETLIFY === 'true' || import.meta.env.PROD) {
    throw new Error('SESSION_SECRET is missing or shorter than 32 characters.');
  }
  // Local development only: a throwaway secret, so logins reset when the dev server restarts.
  devSecret ??= b64url(crypto.getRandomValues(new Uint8Array(32)));
  return devSecret;
}

async function hmac(data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', te.encode(sessionSecret()), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, te.encode(data)));
}

export async function createSessionCookie(email: string): Promise<{ value: string; maxAge: number }> {
  const payload: Session = { email: normEmail(email), exp: Date.now() + SESSION_HOURS * 3600 * 1000 };
  const body = b64url(te.encode(JSON.stringify(payload)));
  return { value: `${body}.${await hmac(body)}`, maxAge: SESSION_HOURS * 3600 };
}

export async function readSession(cookie: string | undefined): Promise<Session | null> {
  if (!cookie || !cookie.includes('.')) return null;
  const [body, sig] = cookie.split('.');
  try {
    const expected = await hmac(body);
    if (!timingSafeEqual(te.encode(sig), te.encode(expected))) return null;
    const payload = JSON.parse(Buffer.from(fromB64(body)).toString('utf8')) as Session;
    if (!payload.exp || payload.exp < Date.now()) return null;
    // The account must still exist (removing a user logs them out).
    if (!(await getUser(payload.email))) return null;
    return payload;
  } catch {
    return null;
  }
}
