/**
 * Admin — de verhuis van Supabase naar D1 om-core (tabblad Verhuis).
 *
 * Logica in src/lib/verhuis.js; scherm in public/admin-verhuis.js.
 * Plan: docs/plan-supabase-uitfaseren.md.
 */

import { overzicht, kopieer, schakelOver, zetTerug, VerhuisFout } from '../../lib/verhuis.js';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

function forbidden(user) {
  return user?.role !== 'admin' ? json({ success: false, error: 'Forbidden' }, 403) : null;
}

async function antwoord(fn) {
  try {
    return json({ success: true, data: await fn() });
  } catch (e) {
    const status = e instanceof VerhuisFout ? e.status : 500;
    return json({ success: false, error: e.message || String(e) }, status);
  }
}

/** GET /admin/api/verhuis */
export async function handleGetVerhuis({ env, user }) {
  const deny = forbidden(user); if (deny) return deny;
  return antwoord(() => overzicht(env));
}

/** POST /admin/api/verhuis/:tabel/kopieer */
export async function handleVerhuisKopieer({ env, user, params }) {
  const deny = forbidden(user); if (deny) return deny;
  return antwoord(() => kopieer(env, params?.tabel));
}

/** POST /admin/api/verhuis/:tabel/overschakelen */
export async function handleVerhuisOverschakelen({ env, user, params }) {
  const deny = forbidden(user); if (deny) return deny;
  return antwoord(() => schakelOver(env, params?.tabel));
}

/** POST /admin/api/verhuis/:tabel/terugzetten */
export async function handleVerhuisTerugzetten({ env, user, params }) {
  const deny = forbidden(user); if (deny) return deny;
  return antwoord(() => zetTerug(env, params?.tabel));
}
