// Sends the form notification emails.
//
// The sending account can be set in two places. The admin panel wins when it is filled in:
//   1. Admin panel > Forms & emails > "Sending account" (saved in site storage; the
//      password is encrypted with SESSION_SECRET and never shown again). Works on any host.
//   2. Environment variables on the host (fallback):
//      Resend:            RESEND_API_KEY, MAIL_FROM
//      Gmail (NKU):       SMTP_HOST=smtp.gmail.com, SMTP_PORT=465, SMTP_USER=nku@rotaryknk.org, SMTP_PASS=<Google App Password>
//      Any SMTP mailbox:  SMTP_HOST, SMTP_PORT (587 or 465), SMTP_USER, SMTP_PASS, MAIL_FROM (optional, defaults to SMTP_USER)
import { getSecret } from 'astro:env/server';
import { sendSmtp } from 'nku:platform';
import { sessionSecret } from './auth';
import { store } from './store';

function env(name: string): string {
  return (getSecret(name) ?? process.env[name] ?? '').toString().trim();
}

// ---------- sending account saved in the admin panel ----------

const MAIL_SETTINGS_KEY = 'settings:mail-account';
export const GMAIL_DEFAULTS = { host: 'smtp.gmail.com', port: 465 };

interface StoredMailAccount {
  host: string;
  port: number;
  user: string;
  from: string;
  /** AES-GCM, "v1:<ivB64>:<cipherB64>". Never sent to the browser. */
  passEnc: string;
  updatedAt?: string;
  updatedBy?: string;
}

/** What the admin page may see: everything except the password. */
export interface MailAccountView {
  host: string;
  port: number;
  user: string;
  from: string;
  hasPassword: boolean;
  updatedAt?: string;
  updatedBy?: string;
}

const te = new TextEncoder();
const b64 = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function cryptoKey(): Promise<CryptoKey> {
  const raw = await crypto.subtle.digest('SHA-256', te.encode('nku-mail-account:' + sessionSecret()));
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function encrypt(plain: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await cryptoKey(), te.encode(plain));
  return `v1:${b64(iv)}:${b64(ct)}`;
}

async function decrypt(enc: string): Promise<string | null> {
  const [v, iv, ct] = String(enc || '').split(':');
  if (v !== 'v1' || !iv || !ct) return null;
  try {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await cryptoKey(), unb64(ct));
    return new TextDecoder().decode(pt);
  } catch {
    return null; // SESSION_SECRET changed: the password has to be entered again.
  }
}

async function readAccount(): Promise<StoredMailAccount | null> {
  try {
    return await store('content').getJSON<StoredMailAccount>(MAIL_SETTINGS_KEY);
  } catch {
    return null;
  }
}

export async function getMailAccountView(): Promise<MailAccountView> {
  const a = await readAccount();
  return {
    host: a?.host || GMAIL_DEFAULTS.host,
    port: a?.port || GMAIL_DEFAULTS.port,
    user: a?.user || '',
    from: a?.from || '',
    hasPassword: !!a?.passEnc,
    updatedAt: a?.updatedAt,
    updatedBy: a?.updatedBy,
  };
}

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;
const oneLine = (s: string) => String(s || '').replace(/[\r\n]+/g, ' ').trim();

/** Saves the sending account. An empty password keeps the saved one; clear=true removes everything. */
export async function saveMailAccount(
  input: { host?: string; port?: number | string; user?: string; from?: string; password?: string; clear?: boolean },
  by: string,
): Promise<MailAccountView> {
  const s = store('content');
  if (input.clear) {
    await s.delete(MAIL_SETTINGS_KEY);
    return getMailAccountView();
  }
  const before = await readAccount();
  const host = oneLine(input.host || GMAIL_DEFAULTS.host).toLowerCase();
  const port = Number(input.port || GMAIL_DEFAULTS.port);
  const user = oneLine(input.user || '').toLowerCase();
  const from = oneLine(input.from || '');
  const password = String(input.password || '').replace(/\s+/g, ''); // Google shows App Passwords in groups of 4
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host)) throw new Error('The mail server name doesn\'t look right (for Gmail it is smtp.gmail.com).');
  if (![465, 587].includes(port)) throw new Error('The port must be 465 or 587.');
  if (!EMAIL_RE.test(user)) throw new Error('Enter the email address of the sending account.');
  if (from && !EMAIL_RE.test(from.replace(/^.*<([^>]+)>\s*$/, '$1'))) throw new Error('The "From" line should be an address, or Name <address>.');
  const passEnc = password ? await encrypt(password) : before?.passEnc || '';
  if (!passEnc) throw new Error('Enter the App Password.');
  const rec: StoredMailAccount = { host, port, user, from, passEnc, updatedAt: new Date().toISOString(), updatedBy: by };
  await s.setJSON(MAIL_SETTINGS_KEY, rec);
  return getMailAccountView();
}

// ---------- which account is used ----------

type MailConfig =
  | { method: 'resend'; from: string; source: 'env' }
  | { method: 'smtp'; from: string; source: 'admin' | 'env'; host: string; port: number; user: string; pass: string };

export interface MailStatus {
  method: 'resend' | 'smtp' | null;
  from: string;
  source: 'admin' | 'env' | null;
  /** Set when a password was saved but can no longer be read (SESSION_SECRET changed). */
  problem?: string;
}

async function resolveConfig(): Promise<{ config: MailConfig | null; problem?: string }> {
  const a = await readAccount();
  let problem: string | undefined;
  if (a?.passEnc && a.user && a.host) {
    const pass = await decrypt(a.passEnc);
    if (pass) return { config: { method: 'smtp', source: 'admin', host: a.host, port: a.port || 465, user: a.user, pass, from: a.from || a.user } };
    problem = 'The saved App Password can no longer be read (the site\'s SESSION_SECRET changed). Enter it again under "Sending account".';
  }
  if (env('RESEND_API_KEY') && env('MAIL_FROM')) return { config: { method: 'resend', source: 'env', from: env('MAIL_FROM') }, problem };
  if (env('SMTP_HOST') && env('SMTP_USER') && env('SMTP_PASS')) {
    return {
      config: { method: 'smtp', source: 'env', host: env('SMTP_HOST'), port: Number(env('SMTP_PORT') || 587), user: env('SMTP_USER'), pass: env('SMTP_PASS'), from: env('MAIL_FROM') || env('SMTP_USER') },
      problem,
    };
  }
  return { config: null, problem };
}

export async function mailStatus(): Promise<MailStatus> {
  const { config, problem } = await resolveConfig();
  return { method: config?.method ?? null, from: config?.from ?? '', source: config?.source ?? null, problem };
}

export interface Mail {
  to: string[];
  subject: string;
  text: string;
  replyTo?: string;
}

export async function sendMail(mail: Mail): Promise<void> {
  const { config, problem } = await resolveConfig();
  if (!config) throw new Error(problem || 'Email sending is not set up yet (see "Sending account" on Forms & emails in the admin panel).');
  const subject = oneLine(mail.subject).slice(0, 250);
  const replyTo = mail.replyTo && EMAIL_RE.test(mail.replyTo) ? mail.replyTo : undefined;

  if (config.method === 'resend') {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: config.from, to: mail.to, subject, text: mail.text, reply_to: replyTo }),
    });
    if (!res.ok) throw new Error(`Resend refused the email (${res.status}): ${(await res.text()).slice(0, 300)}`);
    return;
  }

  try {
    await sendSmtp(
      { host: config.host, port: config.port, user: config.user, pass: config.pass },
      { from: config.from, to: mail.to, subject, text: mail.text, replyTo },
    );
  } catch (err) {
    const msg = String((err as Error).message || err);
    if (/535|Username and Password not accepted|BadCredentials/i.test(msg)) {
      throw new Error('The mail server rejected the login. For Gmail, use an App Password (not the normal password) and check the address.');
    }
    throw err;
  }
}
