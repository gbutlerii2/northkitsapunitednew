// Cloudflare host (production): data in an R2 bucket, email over Cloudflare's TCP sockets.
//
// Needs one binding, set in wrangler.jsonc:  NKU_DATA -> R2 bucket "nku-site-data".
// Every store ("nku-content", "nku-media", "nku-users") is a folder in that bucket.
// R2 is strongly consistent, so an admin save is visible on the next page load.
import { env } from 'cloudflare:workers';
import { connect } from 'cloudflare:sockets';
import type { BlobMeta, SimpleStore, SmtpAccount, SmtpMessage } from './types';

export const HOST = 'cloudflare' as const;

function bucket(): R2Bucket {
  const b = (env as unknown as { NKU_DATA?: R2Bucket }).NKU_DATA;
  if (!b) throw new Error('The R2 bucket binding NKU_DATA is missing (see wrangler.jsonc and docs/HOSTING.md).');
  return b;
}

const META = 'nku-meta';

export function openStore(name: string): SimpleStore {
  const k = (key: string) => `${name}/${key}`;
  const readMeta = (o: R2Object): BlobMeta => {
    try {
      return JSON.parse(o.customMetadata?.[META] || '{}');
    } catch {
      return {};
    }
  };
  return {
    async getJSON(key) {
      const o = await bucket().get(k(key));
      if (!o) return null;
      try {
        return JSON.parse(await o.text());
      } catch {
        return null;
      }
    },
    async setJSON(key, value) {
      await bucket().put(k(key), JSON.stringify(value), { httpMetadata: { contentType: 'application/json' } });
    },
    async getBinary(key) {
      const o = await bucket().get(k(key));
      return o ? { data: await o.arrayBuffer(), metadata: readMeta(o) } : null;
    },
    async setBinary(key, data, metadata) {
      const contentType = typeof metadata.contentType === 'string' ? metadata.contentType : undefined;
      await bucket().put(k(key), data, { httpMetadata: contentType ? { contentType } : undefined, customMetadata: { [META]: JSON.stringify(metadata) } });
    },
    async getMetadata(key) {
      const o = await bucket().head(k(key));
      return o ? readMeta(o) : null;
    },
    async delete(key) {
      await bucket().delete(k(key));
    },
    async list(prefix = '') {
      const keys: string[] = [];
      const start = `${name}/`;
      let cursor: string | undefined;
      do {
        const page = await bucket().list({ prefix: start + prefix, cursor, limit: 1000 });
        for (const o of page.objects) keys.push(o.key.slice(start.length));
        cursor = page.truncated ? page.cursor : undefined;
      } while (cursor);
      return keys;
    },
  };
}

/** Pages are not kept in a CDN cache on Cloudflare, so there is nothing to purge. */
export async function purgeCache(_tag: string): Promise<void> {}

export function clientIp(request: Request): string | null {
  return request.headers.get('cf-connecting-ip');
}

// ---------- email: a small SMTP client (nodemailer can't run on Workers) ----------

const te = new TextEncoder();
const td = new TextDecoder();
const b64 = (s: string) => btoa(String.fromCharCode(...te.encode(s)));
const addrOf = (s: string) => (s.match(/<([^>]+)>\s*$/)?.[1] || s).trim();

/** RFC 2047 encoding for headers with non-ASCII text (names, subjects). */
function headerText(s: string): string {
  return /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`;
}

function mailbox(s: string): string {
  const m = s.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  return m && m[1] ? `${headerText(m[1])} <${m[2]}>` : addrOf(s);
}

function wrap76(s: string): string {
  return s.replace(/.{1,76}/g, '$&\r\n');
}

export function buildMessage(msg: SmtpMessage, now = new Date()): string {
  const domain = addrOf(msg.from).split('@')[1] || 'localhost';
  const id = `${now.getTime().toString(36)}.${crypto.randomUUID()}@${domain}`;
  const headers = [
    `From: ${mailbox(msg.from)}`,
    `To: ${msg.to.map(mailbox).join(', ')}`,
    `Subject: ${headerText(msg.subject)}`,
    `Date: ${now.toUTCString().replace('GMT', '+0000')}`,
    `Message-ID: <${id}>`,
    msg.replyTo ? `Reply-To: ${mailbox(msg.replyTo)}` : '',
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
    'Content-Transfer-Encoding: base64',
  ].filter(Boolean);
  // base64 lines never start with ".", so no dot-stuffing is needed.
  return headers.join('\r\n') + '\r\n\r\n' + wrap76(b64(msg.text.replace(/\r?\n/g, '\r\n')));
}

class SmtpConnection {
  private buf = '';
  private reader!: ReadableStreamDefaultReader<Uint8Array>;
  private writer!: WritableStreamDefaultWriter<Uint8Array>;
  constructor(private socket: Socket) {
    this.attach(socket);
  }
  private attach(socket: Socket) {
    this.socket = socket;
    this.reader = socket.readable.getReader();
    this.writer = socket.writable.getWriter();
  }
  async upgrade(hostname: string) {
    this.reader.releaseLock();
    this.writer.releaseLock();
    this.attach(this.socket.startTls({ expectedServerHostname: hostname }));
  }
  /** Reads one (possibly multi-line) reply and returns its code and text. */
  async reply(): Promise<{ code: number; text: string }> {
    const lines: string[] = [];
    for (;;) {
      let nl = this.buf.indexOf('\r\n');
      while (nl < 0) {
        const { value, done } = await this.reader.read();
        if (done) throw new Error('The mail server closed the connection.');
        this.buf += td.decode(value, { stream: true });
        nl = this.buf.indexOf('\r\n');
      }
      const line = this.buf.slice(0, nl);
      this.buf = this.buf.slice(nl + 2);
      lines.push(line);
      if (!/^\d{3}-/.test(line)) return { code: Number(line.slice(0, 3)), text: lines.join('\n') };
    }
  }
  async send(data: string) {
    await this.writer.write(te.encode(data));
  }
  /** Sends one command and checks the reply code. */
  async cmd(line: string, expect: number | number[], what = line.split(' ')[0]): Promise<string> {
    await this.send(line + '\r\n');
    const r = await this.reply();
    const ok = Array.isArray(expect) ? expect.includes(r.code) : r.code === expect;
    if (!ok) throw new Error(`Mail server refused ${what}: ${r.text.slice(0, 300)}`);
    return r.text;
  }
  async close() {
    try {
      await this.socket.close();
    } catch {
      /* already closed */
    }
  }
}

export async function sendSmtp(account: SmtpAccount, msg: SmtpMessage): Promise<void> {
  // 465 = TLS from the start (Gmail's default here); 587 = STARTTLS. Anything else is plain (local testing only).
  const mode = account.port === 465 ? 'on' : account.port === 587 ? 'starttls' : 'off';
  const socket = connect({ hostname: account.host, port: account.port }, { secureTransport: mode, allowHalfOpen: false });
  const c = new SmtpConnection(socket);
  const timeout = setTimeout(() => c.close(), 20_000);
  try {
    const greet = await c.reply().catch((err) => {
      throw new Error(`Couldn't connect to the mail server ${account.host}:${account.port} (${(err as Error).message || err}).`);
    });
    if (greet.code !== 220) throw new Error(`Mail server is not ready: ${greet.text.slice(0, 200)}`);
    const helo = 'EHLO nku-web';
    await c.cmd(helo, 250, 'EHLO');
    if (mode === 'starttls') {
      await c.cmd('STARTTLS', 220);
      await c.upgrade(account.host);
      await c.cmd(helo, 250, 'EHLO');
    }
    await c.cmd('AUTH PLAIN ' + b64(`\0${account.user}\0${account.pass}`), 235, 'the login');
    await c.cmd(`MAIL FROM:<${addrOf(msg.from)}>`, 250, 'the sender');
    for (const to of msg.to) await c.cmd(`RCPT TO:<${addrOf(to)}>`, [250, 251], `the recipient ${addrOf(to)}`);
    await c.cmd('DATA', 354);
    await c.send(buildMessage(msg) + '.\r\n');
    const done = await c.reply();
    if (done.code !== 250) throw new Error(`Mail server refused the message: ${done.text.slice(0, 300)}`);
    await c.cmd('QUIT', [221, 250]).catch(() => {});
  } finally {
    clearTimeout(timeout);
    await c.close();
  }
}
