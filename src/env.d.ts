/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    admin: { email: string } | null;
  }
}

// Host-specific code, chosen in astro.config.mjs (src/lib/platform/netlify.ts or cloudflare.ts).
declare module 'nku:platform' {
  export const HOST: 'netlify' | 'cloudflare';
  export function openStore(name: string): import('./lib/platform/types').SimpleStore;
  export function purgeCache(tag: string): Promise<void>;
  export function sendSmtp(account: import('./lib/platform/types').SmtpAccount, msg: import('./lib/platform/types').SmtpMessage): Promise<void>;
  export function clientIp(request: Request): string | null;
}
