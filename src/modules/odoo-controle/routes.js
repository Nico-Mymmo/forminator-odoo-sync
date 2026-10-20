/**
 * Odoo-controle -- routes. Alleen JSON, behalve `GET /`.
 *
 * Rechten: wie de module heeft, leest en schrijft (cases en patronen).
 * Enkel beheerders mogen een patroon verwijderen en een export importeren.
 */

import {
  PRIO, DOMEIN, SOORT, ZEKER, STATUS, MODEL_LABEL, CASE_TEKSTEN, PATROON_TEKSTEN, ODOO_URL,
} from './lib/constants.js';
import {
  ControleError, naamVan, alles, sinds, caseOp, patroonOp, allePatronen, casesVanPatroon, historiek,
  wijzigCase, maakCase, wijzigPatroon, maakPatroon, verwijderPatroon, importeer,
} from './lib/store.js';
import { beoordeelPatroon, beoordeelCase, zoekPatroon } from './lib/ai.js';
import { kijkNaInOdoo, odooDigest } from './lib/odoo-lookup.js';
import { skillMarkdown } from './lib/skill.js';
import { zetExportOm } from './lib/import.js';
import { maakTaakVoorCase, takenVanCase, personen } from './lib/taak.js';

const MAX_IMPORT_BYTES = 8 * 1024 * 1024;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function fout(err) {
  if (err instanceof ControleError) {
    return json({ success: false, error: err.message, ...(err.extra || {}) }, err.status);
  }
  if (err && typeof err.code === 'string' && err.code.startsWith('AI_')) {
    return json({ success: false, error: err.message, code: err.code, retryable: !!err.retryable }, err.httpStatus || 502);
  }
  console.error('[odoo-controle]', err);
  return json({ success: false, error: err?.message || 'Onbekende fout' }, 500);
}

async function leesBody(request, { max = 512 * 1024 } = {}) {
  const len = Number(request.headers.get('Content-Length') || 0);
  if (len > max) throw new ControleError('De aanvraag is te groot.', 413);
  try { return await request.json(); } catch { return null; }
}

const isAdmin = (user) => user && user.role === 'admin';

function mij(user) {
  return { id: user.id, naam: naamVan(user), is_admin: isAdmin(user), can_write: true };
}

const bronVan = (body) => (body && body.bron === 'claude' ? 'claude-voorstel-overgenomen' : 'gebruiker');

const constants = () => ({
  PRIO, DOMEIN, SOORT, ZEKER, STATUS, MODEL_LABEL, CASE_TEKSTEN, PATROON_TEKSTEN, ODOO_URL,
});

export const routes = {
  'GET /': async (context) =>
    context.env.ASSETS.fetch(new Request(new URL('/odoo-controle.html', context.request.url))),

  'GET /api/bootstrap': async ({ env, user }) => {
    try {
      const data = await alles(env);
      return json({ success: true, data: { ...data, constants: constants(), me: mij(user), now: new Date().toISOString() } });
    } catch (err) { return fout(err); }
  },

  /** Wat er veranderde sinds `since` (het scherm kijkt elke halve minuut). */
  'GET /api/changes': async ({ env, request }) => {
    try {
      const since = new URL(request.url).searchParams.get('since');
      if (!since || !Number.isFinite(Date.parse(since))) throw new ControleError('since ontbreekt of is geen tijdstip.');
      const now = new Date().toISOString();
      const data = await sinds(env, since);
      return json({ success: true, data: { ...data, now } });
    } catch (err) { return fout(err); }
  },

  // ─── Cases ────────────────────────────────────────────────────────────────

  'POST /api/cases': async ({ env, user, request }) => {
    try {
      const body = (await leesBody(request)) || {};
      return json({ success: true, data: await maakCase(env, user, body) }, 201);
    } catch (err) { return fout(err); }
  },

  'PATCH /api/cases/:id': async ({ env, user, params, request }) => {
    try {
      const body = (await leesBody(request)) || {};
      const data = await wijzigCase(env, user, params.id, { patch: body.patch || {}, basis: body.basis || null, expected: body.expected ?? null, bron: bronVan(body) });
      return json({ success: true, data });
    } catch (err) { return fout(err); }
  },

  'GET /api/cases/:id/history': async ({ env, params }) => {
    try {
      return json({ success: true, data: await historiek(env, 'case', params.id) });
    } catch (err) { return fout(err); }
  },

  /** Live nakijken in Odoo: de records uit de refs, met chatter en activiteiten. Alleen lezen. */
  'GET /api/cases/:id/odoo': async ({ env, params }) => {
    try {
      const c = await caseOp(env, params.id);
      if (!c) throw new ControleError('Deze case bestaat niet (meer).', 404);
      if (!env.API_KEY || !env.UID) throw new ControleError('De Odoo-koppeling van de OM is niet ingesteld (UID en API_KEY).', 503);
      return json({ success: true, data: await kijkNaInOdoo(env, c) });
    } catch (err) { return fout(err); }
  },

  /**
   * Claude verifieert de vier teksten en herschrijft waar nodig. `waarden` zijn
   * de teksten zoals ze nu in het scherm staan (ook wat nog niet bewaard is);
   * met `met_odoo: true` krijgt Claude ook de live chatter mee. Bewaart niets.
   */
  'POST /api/cases/:id/review': async ({ env, user, params, request }) => {
    try {
      const body = (await leesBody(request)) || {};
      const c = await caseOp(env, params.id);
      if (!c) throw new ControleError('Deze case bestaat niet (meer).', 404);
      const waarden = {};
      for (const [veld] of CASE_TEKSTEN) waarden[veld] = String((body.waarden && body.waarden[veld]) ?? c[veld] ?? '');
      const patronen = c.patterns.length ? (await allePatronen(env)).filter((p) => c.patterns.includes(p.id)) : [];
      let odooTekst = '';
      let odoo = null;
      if (body.met_odoo === true && env.API_KEY && env.UID) {
        odoo = await kijkNaInOdoo(env, c);
        odooTekst = odooDigest(odoo);
      }
      const voorstel = await beoordeelCase(env, user, { c, waarden, patronen, odooTekst });
      return json({ success: true, data: { voorstel, snapshot: waarden, versie: c.versie, met_odoo: !!odoo } });
    } catch (err) { return fout(err); }
  },

  /** Claude zoekt een bestaand patroon voor de case, of stelt een nieuw voor. Bewaart niets. */
  'POST /api/cases/:id/pattern-search': async ({ env, user, params, request }) => {
    try {
      const body = (await leesBody(request)) || {};
      const c = await caseOp(env, params.id);
      if (!c) throw new ControleError('Deze case bestaat niet (meer).', 404);
      const patronen = await allePatronen(env);
      const voorstel = await zoekPatroon(env, user, { c, patronen, hint: String(body.hint || '').slice(0, 2000), forceNew: body.force_new === true });
      return json({ success: true, data: voorstel });
    } catch (err) { return fout(err); }
  },

  // ─── Taken in Projecten ───────────────────────────────────────────────────

  /** Wie een taak kan krijgen (dezelfde lijst als in Projecten). */
  'GET /api/mensen': async ({ env }) => {
    try {
      return json({ success: true, data: await personen(env) });
    } catch (err) { return fout(err); }
  },

  'GET /api/cases/:id/taken': async ({ env, params }) => {
    try {
      return json({ success: true, data: await takenVanCase(env, params.id) });
    } catch (err) { return fout(err); }
  },

  /** Van een case een taak maken, bij de persoonlijke doelen van wie ze krijgt. */
  'POST /api/cases/:id/taken': async ({ env, user, params, request }) => {
    try {
      const body = (await leesBody(request)) || {};
      const c = await caseOp(env, params.id);
      if (!c) throw new ControleError('Deze case bestaat niet (meer).', 404);
      return json({ success: true, data: await maakTaakVoorCase(env, user, c, body) }, 201);
    } catch (err) { return fout(err); }
  },

  // ─── Patronen ─────────────────────────────────────────────────────────────

  /**
   * Een nieuw patroon, eventueel meteen aan een case gehangen (`case_id`;
   * `replace: true` zet het in de plaats van de huidige patronen van die case).
   */
  'POST /api/patterns': async ({ env, user, request }) => {
    try {
      const body = (await leesBody(request)) || {};
      const patroon = await maakPatroon(env, user, { ...body, bron: body.case_id ? 'claude-voorstel-overgenomen' : 'gebruiker' });
      let c = null;
      if (body.case_id) {
        const huidig = await caseOp(env, body.case_id);
        if (huidig) {
          const lijst = body.replace === true ? [patroon.id] : [...huidig.patterns, patroon.id];
          c = await wijzigCase(env, user, huidig.id, { patch: { patterns: lijst }, bron: 'gebruiker' });
        }
      }
      return json({ success: true, data: { pattern: patroon, case: c } }, 201);
    } catch (err) { return fout(err); }
  },

  'PATCH /api/patterns/:id': async ({ env, user, params, request }) => {
    try {
      const body = (await leesBody(request)) || {};
      const data = await wijzigPatroon(env, user, params.id, { patch: body.patch || {}, basis: body.basis || null, expected: body.expected ?? null, bron: bronVan(body) });
      return json({ success: true, data });
    } catch (err) { return fout(err); }
  },

  'DELETE /api/patterns/:id': async ({ env, user, params }) => {
    try {
      if (!isAdmin(user)) throw new ControleError('Enkel een beheerder kan een patroon verwijderen.', 403);
      await verwijderPatroon(env, user, params.id);
      return json({ success: true });
    } catch (err) { return fout(err); }
  },

  'GET /api/patterns/:id/history': async ({ env, params }) => {
    try {
      return json({ success: true, data: await historiek(env, 'pattern', params.id) });
    } catch (err) { return fout(err); }
  },

  /** Claude stelt de regel en de controle op, of verifieert en herschrijft ze, uit alle cases van het patroon. Bewaart niets. */
  'POST /api/patterns/:id/review': async ({ env, user, params, request }) => {
    try {
      const body = (await leesBody(request)) || {};
      const opgeslagen = await patroonOp(env, params.id);
      if (!opgeslagen) throw new ControleError('Dit patroon bestaat niet (meer).', 404);
      // De teksten zoals ze nu in het scherm staan, ook wat nog niet bewaard is.
      const patroon = { ...opgeslagen };
      for (const [veld] of PATROON_TEKSTEN) if (body.waarden && veld in body.waarden) patroon[veld] = String(body.waarden[veld] ?? '');
      const [cases, andere] = await Promise.all([casesVanPatroon(env, patroon.id), allePatronen(env)]);
      const voorstel = await beoordeelPatroon(env, user, { patroon, cases, andere });
      const snapshot = {};
      for (const [veld] of PATROON_TEKSTEN) snapshot[veld] = patroon[veld] || '';
      return json({ success: true, data: { voorstel, snapshot, versie: opgeslagen.versie } });
    } catch (err) { return fout(err); }
  },

  // ─── Skill-concept en import ──────────────────────────────────────────────

  'GET /api/skill': async ({ env }) => {
    try {
      const data = await alles(env);
      return json({ success: true, data: { filename: 'SKILL.md', markdown: skillMarkdown(data) } });
    } catch (err) { return fout(err); }
  },

  /** De export van de claude.ai-pagina (data.json) inladen. Overschrijft: de export is het recentste werk. */
  'POST /api/import': async ({ env, user, request }) => {
    try {
      if (!isAdmin(user)) throw new ControleError('Enkel een beheerder kan een export importeren.', 403);
      const body = await leesBody(request, { max: MAX_IMPORT_BYTES });
      if (!body) throw new ControleError('Geen geldige JSON ontvangen.');
      let rijen;
      try { rijen = zetExportOm(body); } catch (err) { throw new ControleError(err.message); }
      await importeer(env, user, rijen);
      return json({ success: true, data: { cases: rijen.cases.length, patterns: rijen.patterns.length, links: rijen.links.length } });
    } catch (err) { return fout(err); }
  },
};
