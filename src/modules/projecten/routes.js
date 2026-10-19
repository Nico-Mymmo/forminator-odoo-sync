/**
 * Projecten -- routes. Alleen JSON, behalve `GET /` (de pagina) en het
 * openen van een opgeladen bijlage.
 *
 * Rechten: wie de module heeft, ziet en bewerkt alle projecten en taken (het
 * is een werkinstrument voor het hele team; privéprojecten bestaan bewust
 * niet). Een project VERWIJDEREN kan enkel de eigenaar of een beheerder; een
 * opmerking weghalen enkel wie ze schreef of een beheerder.
 */

import {
  PmError,
  normaliseerProject, listProjects, getProject, insertProject, updateProject, deleteProject, orderProjects,
  listSections, getSection, insertSection, renameSection, deleteSection, orderSections,
  normaliseerTaak, listTasks, getTask, insertTask, updateTask, deleteTask, moveTasks, tellingen,
  listComments, getComment, insertComment, deleteComment,
  listAttachments, getAttachment, insertAttachment, deleteAttachment, listHistory,
} from './lib/store.js';
import {
  LOG_PREFIX, PROJECT_STATUSSEN, PRIORITEITEN, KLEUREN, ODOO_MODELLEN, MAX_BIJLAGE, BIJLAGEN_MAP,
} from './lib/constants.js';
import { mensen, naamVan } from './lib/mensen.js';
import { vandaagInBrussel } from './lib/datum.js';
import { searchRead } from '../../lib/odoo.js';
import { odooOrigin } from '../../lib/medewerkers.js';
import { teamVan, managers } from './lib/team.js';
import {
  ASSET_CATEGORY_PREFIXES, isWithinAssetNamespace, canReadAssetPrefix, listDynamicAssetCategories,
} from '../asset-manager/lib/namespace.js';

const ASSET_ORIGIN = 'https://link.openvme.be';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

function fout(err) {
  const status = err instanceof PmError ? err.status : 500;
  if (status >= 500) console.error(LOG_PREFIX, err);
  return json({ success: false, error: err?.message || 'Onbekende fout' }, status);
}

async function leesBody(request) {
  try { return await request.json(); } catch { return {}; }
}

const isAdmin = (user) => user?.role === 'admin';

async function eisTaak(env, id) {
  const t = await getTask(env, id);
  if (!t) throw new PmError('Taak niet gevonden.', 404);
  return t;
}

async function eisProject(env, id) {
  const p = await getProject(env, id);
  if (!p) throw new PmError('Project niet gevonden.', 404);
  return p;
}

/**
 * Kijkt na of project, sectie en bovenliggende taak bestaan en bij elkaar
 * horen. Een subtaak neemt het project van haar taak over en heeft geen
 * sectie; een subtaak van een subtaak bestaat niet.
 */
async function controleerPlaats(env, waarden, huidig = null) {
  const parentId = waarden.parent_id !== undefined ? waarden.parent_id : huidig?.parent_id || null;
  if (parentId) {
    if (huidig && parentId === huidig.id) throw new PmError('Een taak kan niet haar eigen subtaak zijn.');
    const ouder = await eisTaak(env, parentId);
    if (ouder.parent_id) throw new PmError('Een subtaak kan zelf geen subtaken hebben.');
    waarden.project_id = ouder.project_id;
    waarden.section_id = null;
    return;
  }
  if (waarden.project_id) await eisProject(env, waarden.project_id);
  const projectId = waarden.project_id !== undefined ? waarden.project_id : huidig?.project_id || null;
  if (waarden.section_id) {
    const s = await getSection(env, waarden.section_id);
    if (!s || s.project_id !== projectId) throw new PmError('Die sectie hoort niet bij dit project.');
  }
}

/**
 * De laatste sectie van een project is de "klaar"-kolom. Afvinken zet een
 * taak daarheen; een taak daarheen slepen vinkt ze af, en eruit slepen zet
 * ze weer open. Zo zeggen het vinkje en de kolom altijd hetzelfde.
 */
async function laatsteSectie(env, projectId) {
  if (!projectId) return null;
  const [project, secties] = await Promise.all([getProject(env, projectId), listSections(env, projectId)]);
  // Een eigen keuze op het project wint (Instellingen / Overzicht); anders de laatste.
  if (project?.done_section_id && secties.some((s) => s.id === project.done_section_id)) return project.done_section_id;
  return secties.length ? secties[secties.length - 1].id : null;
}

/** Van een id een leesbare waarde maken, voor de historiek. */
function leesbaarVoor(env) {
  const secties = new Map();
  const projecten = new Map();
  return async (veld, waarde) => {
    if (waarde === null || waarde === undefined || waarde === '') return null;
    if (veld === 'assignee_id') return naamVan(env, waarde);
    if (veld === 'section_id') {
      if (!secties.has(waarde)) secties.set(waarde, (await getSection(env, waarde))?.name || 'weggehaalde sectie');
      return secties.get(waarde);
    }
    if (veld === 'project_id') {
      if (!projecten.has(waarde)) projecten.set(waarde, (await getProject(env, waarde))?.name || 'weggehaald project');
      return projecten.get(waarde);
    }
    if (veld === 'done' || veld === 'is_milestone') return waarde ? 'ja' : 'nee';
    if (Array.isArray(waarde)) return waarde.join(', ');
    return waarde;
  };
}

function bijlageVoorScherm(a) {
  return {
    ...a,
    url: a.kind === 'upload' ? `/projecten/api/attachments/${a.id}` : a.url,
  };
}

export const routes = {
  'GET /': async (context) =>
    context.env.ASSETS.fetch(new Request(new URL('/projecten.html', context.request.url))),

  'GET /api/bootstrap': async ({ env, user }) => {
    try {
      let lijst = [];
      try { lijst = await mensen(env); } catch (err) { console.error(LOG_PREFIX, err); }
      return json({
        success: true,
        data: {
          me: { id: user.id, role: user.role, is_admin: isAdmin(user) },
          mensen: lijst,
          statussen: PROJECT_STATUSSEN,
          prioriteiten: PRIORITEITEN,
          kleuren: KLEUREN,
          odoo_modellen: ODOO_MODELLEN.map(({ key, label, icon }) => ({ key, label, icon })),
          odoo_origin: odooOrigin(env),
          vandaag: vandaagInBrussel(),
          has_team: await teamVan(env, user.id).then((l) => l.length > 0).catch(() => false),
          is_manager_admin: isAdmin(user),
        },
      });
    } catch (err) { return fout(err); }
  },

  // ── Projecten ─────────────────────────────────────────────────────────────

  'GET /api/projects': async ({ env }) => {
    try {
      const [lijst, telling] = await Promise.all([listProjects(env), tellingen(env)]);
      const vandaag = vandaagInBrussel();
      const teLaat = {};
      for (const t of telling.rijen) {
        if (t.project_id && !t.done && t.due_date && t.due_date < vandaag) teLaat[t.project_id] = (teLaat[t.project_id] || 0) + 1;
      }
      return json({
        success: true,
        data: lijst.map((p) => ({
          ...p,
          open: telling.perProject[p.id]?.open || 0,
          af: telling.perProject[p.id]?.af || 0,
          te_laat: teLaat[p.id] || 0,
        })),
      });
    } catch (err) { return fout(err); }
  },

  'POST /api/projects': async ({ env, user, request }) => {
    try {
      const waarden = normaliseerProject(await leesBody(request), { nieuw: true });
      return json({ success: true, data: await insertProject(env, waarden, user.id) }, 201);
    } catch (err) { return fout(err); }
  },

  'POST /api/projects/order': async ({ env, request }) => {
    try {
      const b = await leesBody(request);
      await orderProjects(env, (Array.isArray(b.ids) ? b.ids : []).map(String));
      return json({ success: true });
    } catch (err) { return fout(err); }
  },

  /** Een project met zijn secties en ALLE taken (ook subtaken en afgewerkte). */
  'GET /api/projects/:id': async ({ env, params }) => {
    try {
      const project = await eisProject(env, params.id);
      const [secties, taken] = await Promise.all([listSections(env, project.id), listTasks(env, { projectId: project.id })]);
      return json({ success: true, data: { project, sections: secties, tasks: taken } });
    } catch (err) { return fout(err); }
  },

  'PUT /api/projects/:id': async ({ env, user, params, request }) => {
    try {
      await eisProject(env, params.id);
      const waarden = normaliseerProject(await leesBody(request));
      if (waarden.done_section_id) {
        const s = await getSection(env, waarden.done_section_id);
        if (!s || s.project_id !== params.id) throw new PmError('Die sectie hoort niet bij dit project.');
      }
      return json({ success: true, data: await updateProject(env, params.id, waarden, user.id) });
    } catch (err) { return fout(err); }
  },

  'DELETE /api/projects/:id': async ({ env, user, params }) => {
    try {
      const p = await eisProject(env, params.id);
      if (!isAdmin(user) && p.owner_id !== user.id) {
        throw new PmError('Enkel de eigenaar van het project of een beheerder kan het verwijderen. Archiveren kan iedereen.', 403);
      }
      // Opgeladen bijlagen in R2 eerst weg: anders blijven ze er voor altijd.
      const taken = await listTasks(env, { projectId: p.id });
      for (const t of taken) {
        for (const a of await listAttachments(env, t.id)) {
          if (a.kind === 'upload' && a.r2_key) await env.R2_ASSETS.delete(a.r2_key).catch(() => {});
        }
      }
      await deleteProject(env, p.id);
      return json({ success: true });
    } catch (err) { return fout(err); }
  },

  // ── Secties ───────────────────────────────────────────────────────────────

  'POST /api/projects/:id/sections': async ({ env, params, request }) => {
    try {
      await eisProject(env, params.id);
      const b = await leesBody(request);
      return json({ success: true, data: await insertSection(env, { project_id: params.id, name: b.name }) }, 201);
    } catch (err) { return fout(err); }
  },

  'POST /api/projects/:id/sections/order': async ({ env, params, request }) => {
    try {
      const b = await leesBody(request);
      const eigen = new Set((await listSections(env, params.id)).map((s) => s.id));
      await orderSections(env, (Array.isArray(b.ids) ? b.ids : []).map(String).filter((id) => eigen.has(id)));
      return json({ success: true });
    } catch (err) { return fout(err); }
  },

  'PUT /api/sections/:id': async ({ env, params, request }) => {
    try {
      const b = await leesBody(request);
      return json({ success: true, data: await renameSection(env, params.id, b.name) });
    } catch (err) { return fout(err); }
  },

  'DELETE /api/sections/:id': async ({ env, params }) => {
    try {
      await deleteSection(env, params.id);
      return json({ success: true });
    } catch (err) { return fout(err); }
  },

  // ── Taken ─────────────────────────────────────────────────────────────────

  /**
   * Mijn taken: alles wat aan mij toegewezen is (ook subtaken), plus mijn
   * losse to-do's zonder verantwoordelijke. Afgewerkte enkel van de laatste
   * 14 dagen, zodat je kan terugzien wat je deed.
   */
  /**
   * Het team voor de teamweekly: wie in Odoo onder mij staat (hr.employee
   * parent_id), met hun open taken en de projecten die ze bezitten. Een
   * beheerder kan met ?manager=<id> het team van een andere manager zien.
   */
  'GET /api/team': async ({ env, user, request }) => {
    try {
      const u = new URL(request.url);
      let manager = user.id;
      const gevraagd = u.searchParams.get('manager');
      if (gevraagd && gevraagd !== user.id) {
        if (!isAdmin(user)) throw new PmError('Enkel een beheerder kan het team van iemand anders bekijken.', 403);
        manager = gevraagd;
      }
      const [leden, alleManagers, projecten] = await Promise.all([teamVan(env, manager), isAdmin(user) ? managers(env) : [], listProjects(env)]);
      const ids = [manager, ...leden];
      const grens = new Date(Date.now() - 14 * 86400000).toISOString();
      const perPersoon = await Promise.all(ids.map(async (id) => {
        const taken = (await listTasks(env, { assigneeId: id })).filter((t) => !t.done || (t.done_at && t.done_at >= grens));
        return { user_id: id, tasks: taken, projects: projecten.filter((p) => p.owner_id === id && !p.archived).map((p) => ({ id: p.id, name: p.name, color: p.color, status: p.status, due_date: p.due_date })) };
      }));
      return json({
        success: true,
        data: {
          manager,
          members: perPersoon,
          managers: alleManagers,
          projects: projecten.map((p) => ({ id: p.id, name: p.name, color: p.color, archived: p.archived })),
          vandaag: vandaagInBrussel(),
        },
      });
    } catch (err) { return fout(err); }
  },

  'GET /api/my-tasks': async ({ env, user }) => {
    try {
      const [mijn, los, projecten] = await Promise.all([
        listTasks(env, { assigneeId: user.id }),
        listTasks(env, { projectId: null }),
        listProjects(env),
      ]);
      const grens = new Date(Date.now() - 14 * 86400000).toISOString();
      const gezien = new Set();
      const taken = [...mijn, ...los.filter((t) => !t.assignee_id && t.created_by === user.id)]
        .filter((t) => (gezien.has(t.id) ? false : gezien.add(t.id)))
        .filter((t) => !t.done || (t.done_at && t.done_at >= grens));
      const bovenliggend = taken.filter((t) => t.parent_id).map((t) => t.parent_id);
      const ouders = bovenliggend.length ? await listTasks(env, { ids: [...new Set(bovenliggend)] }) : [];
      return json({
        success: true,
        data: {
          tasks: taken,
          parents: ouders.map((o) => ({ id: o.id, title: o.title })),
          projects: projecten.map((p) => ({ id: p.id, name: p.name, color: p.color, archived: p.archived })),
        },
      });
    } catch (err) { return fout(err); }
  },

  /**
   * Voor de tegel op de homepage: wat vandaag af moet of te laat is (hoogstens
   * vijf), en hoeveel er in totaal open staat.
   */
  'GET /api/home': async ({ env, user }) => {
    try {
      const [mijn, projecten] = await Promise.all([listTasks(env, { assigneeId: user.id }), listProjects(env)]);
      const vandaag = vandaagInBrussel();
      const open = mijn.filter((t) => !t.done);
      const nu = open.filter((t) => t.due_date && t.due_date <= vandaag)
        .sort((a, b) => a.due_date.localeCompare(b.due_date));
      const naam = Object.fromEntries(projecten.map((p) => [p.id, p.name]));
      return json({
        success: true,
        data: {
          vandaag,
          totaal: nu.length,
          open: open.length,
          items: nu.slice(0, 5).map((t) => ({ id: t.id, title: t.title, due_date: t.due_date, project: naam[t.project_id] || '' })),
        },
      });
    } catch (err) { return fout(err); }
  },

  'POST /api/tasks': async ({ env, user, request }) => {
    try {
      const waarden = normaliseerTaak(await leesBody(request), { nieuw: true });
      await controleerPlaats(env, waarden);
      return json({ success: true, data: await insertTask(env, waarden, user.id) }, 201);
    } catch (err) { return fout(err); }
  },

  /** Verslepen: `items` = [{ id, section_id }] in de nieuwe volgorde. */
  'POST /api/tasks/move': async ({ env, user, request }) => {
    try {
      const b = await leesBody(request);
      const items = (Array.isArray(b.items) ? b.items : []).slice(0, 500)
        .map((it) => ({ id: String(it.id || ''), section_id: it.section_id === undefined ? undefined : (it.section_id || null) }))
        .filter((it) => it.id);
      await moveTasks(env, items, user.id, leesbaarVoor(env));
      // In of uit de laatste kolom gesleept: het vinkje volgt.
      const eerste = items[0] ? await getTask(env, items[0].id) : null;
      if (eerste && eerste.project_id) {
        const laatste = await laatsteSectie(env, eerste.project_id);
        if (laatste) {
          for (const it of items) {
            const t = await getTask(env, it.id);
            if (!t || t.parent_id) continue;
            const hoortAf = t.section_id === laatste;
            if (hoortAf !== !!t.done) await updateTask(env, t.id, { done: hoortAf }, user.id, leesbaarVoor(env));
          }
        }
      }
      return json({ success: true });
    } catch (err) { return fout(err); }
  },

  /** Alles van één taak: subtaken, opmerkingen, bijlagen, historiek. */
  'GET /api/tasks/:id': async ({ env, params }) => {
    try {
      const taak = await eisTaak(env, params.id);
      const [sub, opm, bijl, hist, ouder, project] = await Promise.all([
        listTasks(env, { parentId: taak.id }),
        listComments(env, taak.id),
        listAttachments(env, taak.id),
        listHistory(env, taak.id),
        taak.parent_id ? getTask(env, taak.parent_id) : null,
        taak.project_id ? getProject(env, taak.project_id) : null,
      ]);
      return json({
        success: true,
        data: {
          task: taak,
          subtasks: sub,
          comments: opm,
          attachments: bijl.map(bijlageVoorScherm),
          history: hist,
          parent: ouder ? { id: ouder.id, title: ouder.title } : null,
          project: project ? { id: project.id, name: project.name, color: project.color } : null,
          sections: project ? await listSections(env, project.id) : [],
        },
      });
    } catch (err) { return fout(err); }
  },

  'PUT /api/tasks/:id': async ({ env, user, params, request }) => {
    try {
      const huidig = await eisTaak(env, params.id);
      const waarden = normaliseerTaak(await leesBody(request));
      if (waarden.project_id !== undefined || waarden.section_id !== undefined || waarden.parent_id !== undefined) {
        await controleerPlaats(env, waarden, huidig);
      }
      if (waarden.done === true && !huidig.done && !huidig.parent_id && waarden.section_id === undefined) {
        const laatste = await laatsteSectie(env, waarden.project_id !== undefined ? waarden.project_id : huidig.project_id);
        if (laatste && laatste !== huidig.section_id) waarden.section_id = laatste;
      }
      return json({ success: true, data: await updateTask(env, huidig.id, waarden, user.id, leesbaarVoor(env)) });
    } catch (err) { return fout(err); }
  },

  'DELETE /api/tasks/:id': async ({ env, params }) => {
    try {
      const taak = await eisTaak(env, params.id);
      const subs = await listTasks(env, { parentId: taak.id });
      for (const t of [taak, ...subs]) {
        for (const a of await listAttachments(env, t.id)) {
          if (a.kind === 'upload' && a.r2_key) await env.R2_ASSETS.delete(a.r2_key).catch(() => {});
        }
      }
      await deleteTask(env, taak.id);
      return json({ success: true });
    } catch (err) { return fout(err); }
  },

  // ── Opmerkingen ───────────────────────────────────────────────────────────

  /** Wie vermeld wordt, volgt de taak voortaan mee. */
  'POST /api/tasks/:id/comments': async ({ env, user, params, request }) => {
    try {
      const taak = await eisTaak(env, params.id);
      const b = await leesBody(request);
      const bekend = new Set((await mensen(env)).map((m) => m.id));
      const vermeld = (Array.isArray(b.mentions) ? b.mentions : []).map(String).filter((id) => bekend.has(id));
      const opm = await insertComment(env, { task_id: taak.id, body: b.body, mentions: vermeld }, user.id);
      const volgers = new Set([...(taak.followers || []), user.id, ...vermeld]);
      if (volgers.size !== (taak.followers || []).length) {
        await updateTask(env, taak.id, { followers: [...volgers] }, user.id);
      }
      return json({ success: true, data: opm }, 201);
    } catch (err) { return fout(err); }
  },

  'DELETE /api/comments/:id': async ({ env, user, params }) => {
    try {
      const opm = await getComment(env, params.id);
      if (!opm) throw new PmError('Opmerking niet gevonden.', 404);
      if (opm.author_id !== user.id && !isAdmin(user)) throw new PmError('Je kan enkel je eigen opmerkingen weghalen.', 403);
      await deleteComment(env, opm.id);
      return json({ success: true });
    } catch (err) { return fout(err); }
  },

  // ── Bijlagen ──────────────────────────────────────────────────────────────

  /**
   * Een bestand opladen. Het komt in R2 onder projecten/ en is ENKEL via
   * GET /api/attachments/:id te openen (met aanmelding): /assets/projecten/
   * wordt in public-routes.js niet publiek geserveerd.
   */
  'POST /api/tasks/:id/attachments': async ({ env, user, params, request }) => {
    try {
      const taak = await eisTaak(env, params.id);
      const type = String(request.headers.get('Content-Type') || 'application/octet-stream').split(';')[0].trim().toLowerCase();
      const bytes = await request.arrayBuffer();
      if (!bytes.byteLength) throw new PmError('Het bestand is leeg.');
      if (bytes.byteLength > MAX_BIJLAGE) throw new PmError('Het bestand is groter dan 15 MB. Zet het in Assetbeheer en koppel het van daar.');
      const naam = String(new URL(request.url).searchParams.get('naam') || 'bestand').replace(/[\\/]/g, '-').slice(0, 200);
      const key = `${BIJLAGEN_MAP}${taak.id}/${crypto.randomUUID()}`;
      await env.R2_ASSETS.put(key, bytes, {
        httpMetadata: { contentType: type, contentDisposition: `inline; filename*=UTF-8''${encodeURIComponent(naam)}` },
        customMetadata: { uploadedBy: user.id, module: 'projecten' },
      });
      const rij = await insertAttachment(env, { task_id: taak.id, kind: 'upload', name: naam, r2_key: key, content_type: type, size: bytes.byteLength }, user.id);
      return json({ success: true, data: bijlageVoorScherm(rij) }, 201);
    } catch (err) { return fout(err); }
  },

  /** Een bestand uit Assetbeheer, of een gewone link, aan een taak hangen. */
  'POST /api/tasks/:id/attachments/link': async ({ env, user, params, request }) => {
    try {
      const taak = await eisTaak(env, params.id);
      const b = await leesBody(request);
      if (b.kind === 'asset') {
        const key = String(b.r2_key || '');
        if (!isWithinAssetNamespace(key) || !canReadAssetPrefix(user, key)) throw new PmError('Geen toegang tot dat bestand in Assetbeheer.', 403);
        const naam = key.split('/').pop();
        const rij = await insertAttachment(env, { task_id: taak.id, kind: 'asset', name: naam, r2_key: key, url: `${ASSET_ORIGIN}/assets/${key}` }, user.id);
        return json({ success: true, data: bijlageVoorScherm(rij) }, 201);
      }
      const url = String(b.url || '').trim();
      if (!/^https?:\/\/\S+$/i.test(url)) throw new PmError('Dat is geen geldige link (begin met https://).');
      const naam = String(b.name || '').trim().slice(0, 200) || url.replace(/^https?:\/\//, '').slice(0, 80);
      const rij = await insertAttachment(env, { task_id: taak.id, kind: 'link', name: naam, url: url.slice(0, 2000) }, user.id);
      return json({ success: true, data: bijlageVoorScherm(rij) }, 201);
    } catch (err) { return fout(err); }
  },

  'GET /api/attachments/:id': async ({ env, params }) => {
    try {
      const a = await getAttachment(env, params.id);
      if (!a || a.kind !== 'upload') throw new PmError('Bijlage niet gevonden.', 404);
      const obj = await env.R2_ASSETS.get(a.r2_key);
      if (!obj) throw new PmError('Het bestand staat niet meer in de opslag.', 404);
      return new Response(obj.body, {
        headers: {
          'Content-Type': a.content_type || 'application/octet-stream',
          'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(a.name)}`,
          'Cache-Control': 'private, no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    } catch (err) { return fout(err); }
  },

  'DELETE /api/attachments/:id': async ({ env, params }) => {
    try {
      const a = await getAttachment(env, params.id);
      if (!a) throw new PmError('Bijlage niet gevonden.', 404);
      if (a.kind === 'upload' && a.r2_key) await env.R2_ASSETS.delete(a.r2_key).catch(() => {});
      await deleteAttachment(env, a.id);
      return json({ success: true });
    } catch (err) { return fout(err); }
  },

  /** Bladeren in Assetbeheer, met dezelfde rechten als Assetbeheer zelf. */
  'GET /api/assets': async ({ env, user, request }) => {
    try {
      const prefix = new URL(request.url).searchParams.get('prefix') || '';
      if (!prefix) {
        const dynamisch = await listDynamicAssetCategories(env);
        const mappen = [
          ...ASSET_CATEGORY_PREFIXES.map((p) => ({ prefix: p, name: p === 'public/' ? 'Publiek' : p.replace(/\/$/, '') })),
          ...dynamisch.map((c) => ({ prefix: c.prefix, name: c.label || c.prefix.replace(/\/$/, '') })),
          { prefix: `users/${user.id}/`, name: 'Mijn bestanden' },
        ].filter((f) => canReadAssetPrefix(user, f.prefix));
        return json({ success: true, data: { prefix: '', folders: mappen, files: [] } });
      }
      if (!isWithinAssetNamespace(prefix) || !canReadAssetPrefix(user, prefix)) {
        throw new PmError('Geen toegang tot deze map in Assetbeheer.', 403);
      }
      const lijst = await env.R2_ASSETS.list({ prefix, delimiter: '/', limit: 500 });
      const files = (lijst.objects || [])
        .sort((a, b) => String(b.uploaded || '').localeCompare(String(a.uploaded || '')))
        .map((o) => ({ key: o.key, name: o.key.split('/').pop(), size: o.size }));
      const folders = (lijst.delimitedPrefixes || []).map((p) => ({ prefix: p, name: p.slice(prefix.length).replace(/\/$/, '') }));
      return json({ success: true, data: { prefix, folders, files } });
    } catch (err) { return fout(err); }
  },

  // ── Odoo ──────────────────────────────────────────────────────────────────

  /** Zoeken in Odoo om een taak aan een record te koppelen. Enkel lezen. */
  'GET /api/odoo/zoek': async ({ env, request }) => {
    try {
      const u = new URL(request.url);
      const model = ODOO_MODELLEN.find((m) => m.key === u.searchParams.get('model'));
      if (!model) throw new PmError('Onbekend soort record.');
      const q = String(u.searchParams.get('q') || '').trim().slice(0, 100);
      if (q.length < 2) return json({ success: true, data: [] });
      const delen = model.search.map((f) => [f, 'ilike', q]);
      const domain = [];
      for (let i = 1; i < delen.length; i++) domain.push('|');
      domain.push(...delen);
      const rijen = await searchRead(env, {
        model: model.key, domain, fields: model.fields, limit: 15, order: 'write_date desc', context: model.context,
      });
      const naamVanRij = (r) => {
        if (model.key === 'crm.lead') return [r.name, r.partner_name].filter(Boolean).join(' · ');
        if (model.key === 'sale.order') return [r.name, Array.isArray(r.partner_id) ? r.partner_id[1] : ''].filter(Boolean).join(' · ');
        return r.display_name || r.name || `#${r.id}`;
      };
      return json({
        success: true,
        data: (rijen || []).map((r) => ({ id: r.id, name: naamVanRij(r), sub: r.email_from || r.email || '' })),
      });
    } catch (err) { return fout(err); }
  },
};
