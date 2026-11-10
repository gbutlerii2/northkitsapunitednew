#!/usr/bin/env node
// Prints a PBKDF2 hash to use as ADMIN_PASSWORD_HASH. The password is read from
// the terminal (or stdin) so it never ends up in shell history or in the repo.
//   npm run hash-password
import { webcrypto as crypto } from 'node:crypto';
import readline from 'node:readline';

const ITERATIONS = 210_000;

async function hash(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS }, key, 256);
  return `pbkdf2:${ITERATIONS}:${Buffer.from(salt).toString('base64')}:${Buffer.from(bits).toString('base64')}`;
}

const rl = readline.createInterface({ input: process.stdin, output: process.stderr, terminal: false });
if (process.stdin.isTTY) process.stderr.write('Password: ');
rl.once('line', async (line) => {
  rl.close();
  const pw = line.replace(/\r$/, '');
  if (!pw) {
    console.error('No password given.');
    process.exit(1);
  }
  console.log(await hash(pw));
});
