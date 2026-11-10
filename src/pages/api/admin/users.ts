import type { APIRoute } from 'astro';
import { fail, json, readJson } from '../../../lib/api';
import { deleteUser, getUser, hashPassword, listUsers, normEmail, passwordProblem, saveUser, verifyPassword } from '../../../lib/auth';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const POST: APIRoute = async ({ request, locals }) => {
  const me = locals.admin!.email;
  const body = await readJson<{ action?: string; email?: string; name?: string; password?: string; currentPassword?: string }>(request);

  switch (body.action) {
    case 'password': {
      const user = await getUser(me);
      if (!user) return fail('Account not found.', 404);
      if (!(await verifyPassword(String(body.currentPassword || ''), user.hash))) return fail('Your current password is not correct.');
      const problem = passwordProblem(String(body.password || ''));
      if (problem) return fail(problem);
      user.hash = await hashPassword(String(body.password));
      user.mustChangePassword = false;
      await saveUser(user);
      return json({ ok: true });
    }
    case 'add': {
      const email = normEmail(String(body.email || ''));
      if (!EMAIL_RE.test(email)) return fail('Please enter a valid email address.');
      if (await getUser(email)) return fail('That person already has an account.');
      const problem = passwordProblem(String(body.password || ''));
      if (problem) return fail(problem);
      await saveUser({
        email,
        name: String(body.name || '').slice(0, 100),
        hash: await hashPassword(String(body.password)),
        createdAt: new Date().toISOString(),
        mustChangePassword: true,
      });
      return json({ ok: true });
    }
    case 'remove': {
      const email = normEmail(String(body.email || ''));
      if (email === me) return fail("You can't remove your own account.");
      if ((await listUsers()).length <= 1) return fail('At least one account must remain.');
      await deleteUser(email);
      return json({ ok: true });
    }
    default:
      return fail('Unknown action.');
  }
};
