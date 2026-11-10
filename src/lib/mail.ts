// Sends the form notification emails.
//
// Two ways to send, picked by which Netlify environment variables are set:
//   Resend (recommended):  RESEND_API_KEY, MAIL_FROM
//   Any SMTP mailbox:      SMTP_HOST, SMTP_PORT (587 or 465), SMTP_USER, SMTP_PASS, MAIL_FROM (optional, defaults to SMTP_USER)
import { getSecret } from 'astro:env/server';

function env(name: string): string {
  return (getSecret(name) ?? process.env[name] ?? '').toString().trim();
}

export function mailMethod(): 'resend' | 'smtp' | null {
  if (env('RESEND_API_KEY') && env('MAIL_FROM')) return 'resend';
  if (env('SMTP_HOST') && env('SMTP_USER') && env('SMTP_PASS')) return 'smtp';
  return null;
}

export function mailFrom(): string {
  return env('MAIL_FROM') || env('SMTP_USER');
}

export interface Mail {
  to: string[];
  subject: string;
  text: string;
  replyTo?: string;
}

const oneLine = (s: string) => String(s || '').replace(/[\r\n]+/g, ' ').trim();

export async function sendMail(mail: Mail): Promise<void> {
  const method = mailMethod();
  if (!method) throw new Error('Email sending is not set up yet (see Form emails in the admin panel).');
  const subject = oneLine(mail.subject).slice(0, 250);
  const replyTo = mail.replyTo && /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(mail.replyTo) ? mail.replyTo : undefined;

  if (method === 'resend') {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env('RESEND_API_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: mailFrom(), to: mail.to, subject, text: mail.text, reply_to: replyTo }),
    });
    if (!res.ok) throw new Error(`Resend refused the email (${res.status}): ${(await res.text()).slice(0, 300)}`);
    return;
  }

  const nodemailer = (await import('nodemailer')).default;
  const port = Number(env('SMTP_PORT') || 587);
  const transport = nodemailer.createTransport({
    host: env('SMTP_HOST'),
    port,
    secure: port === 465,
    auth: { user: env('SMTP_USER'), pass: env('SMTP_PASS') },
  });
  await transport.sendMail({ from: mailFrom(), to: mail.to.join(', '), subject, text: mail.text, replyTo });
}
