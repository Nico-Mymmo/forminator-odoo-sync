/**
 * Odoo-controle -- van een case een taak maken in Projecten (2026-10-20).
 *
 * De taak komt bij de PERSOONLIJKE DOELEN van wie ze krijgt: het project
 * "Doelen van <voornaam>" met die persoon als eigenaar (de overgenomen
 * Odoo-doelen, id `odoo:doelen:<uid>`). Bestaat dat project nog niet, dan
 * wordt het aangemaakt. Sectie: "Nieuw", anders de eerste open sectie.
 *
 * Het verband case -> taak staat als merkteken op de link in de beschrijving
 * (`data-oc-case="<case-id>"`), zoals bij de nieuwsbrief: Projecten heeft geen
 * kolom voor een herkomst. Zo vindt de case haar taken terug.
 */

import { getSupabaseClient } from '../../../lib/database.js';
import { getCoreDb } from '../../../lib/core-db.js';
import {
  insertTask, normaliseerTaak, insertProject, normaliseerProject, listProjects, zorgVoorEindfases, PmError,
} from '../../projecten/lib/store.js';
import { ODOO_MODELLEN } from '../../projecten/lib/constants.js';
import { mensen } from '../../projecten/lib/mensen.js';
import { TABLES, ODOO_URL, MODEL_LABEL } from './constants.js';
import { ControleError, naamVan } from './store.js';

export const TAAK_LABEL = 'Odoo-controle';
const PROJECT_MODELLEN = new Set(ODOO_MODELLEN.map((m) => m.key));
const PRIO_NAAR_TAAK = { dringend: 'dringend', hoog: 'hoog' };

function esc(t) {
  return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
const alinea = (t) => `<p>${esc(t).replace(/\n/g, '<br>')}</p>`;
const merkVan = (caseId) => `data-oc-case="${esc(caseId)}"`;

/** Het project "Doelen van ..." van deze persoon; maakt het aan als het er niet is. */
async function doelenProject(env, persoon, userId) {
  const projecten = (await listProjects(env)).filter((p) => p.owner_id === persoon.id && !p.archived);
  let project = projecten.find((p) => String(p.id).startsWith('odoo:doelen:'))
    || projecten.find((p) => /^doelen van /i.test(p.name || ''));
  if (!project) {
    project = await insertProject(env, normaliseerProject({
      name: `Doelen van ${persoon.voornaam || persoon.naam}`,
      description: `De persoonlijke doelen van ${persoon.naam}.`,
      color: 'orange', icon: 'target', owner_id: persoon.id, status: 'op_schema',
    }, { nieuw: true }), userId);
  }
  const secties = (await zorgVoorEindfases(env, project.id)).filter((s) => s.kind === 'open')
    .sort((a, b) => (a.position || 0) - (b.position || 0));
  const sectie = secties.find((s) => /^nieuw$/i.test(s.name)) || secties[0] || null;
  return { project, sectie };
}

function beschrijving(c, notitie) {
  const delen = [];
  if (notitie) delen.push(alinea(notitie));
  delen.push(`<h3>Case #${esc(c.nr)}: ${esc(c.klant)}${c.titel ? ` – ${esc(c.titel)}` : ''}</h3>`);
  if (c.bevinding) delen.push(`<p><strong>Bevinding</strong></p>${alinea(c.bevinding)}`);
  if (c.voorstel) delen.push(`<p><strong>Voorstel</strong></p>${alinea(c.voorstel)}`);
  const refs = Array.isArray(c.refs) ? c.refs : [];
  if (refs.length) {
    delen.push('<p><strong>In Odoo</strong></p><ul>' + refs.map((r) => {
      const url = `${ODOO_URL}/web?debug=1#id=${encodeURIComponent(r.id)}&model=${encodeURIComponent(r.model)}&view_type=form`;
      return `<li><a href="${esc(url)}" target="_blank" rel="noopener">${esc(r.label)}</a> (${esc(MODEL_LABEL[r.model] || r.model)})</li>`;
    }).join('') + '</ul>');
  }
  delen.push(`<p><a href="/odoo-controle#case/${esc(c.id)}" ${merkVan(c.id)}>Open case #${esc(c.nr)} in Odoo-controle</a></p>`);
  return delen.join('');
}

/**
 * @param {object} c       de case (caseOp)
 * @param {object} invoer  { assignee_id, due_date, notitie, titel }
 */
export async function maakTaakVoorCase(env, user, c, invoer = {}) {
  const persoon = (await mensen(env)).find((m) => m.id === invoer.assignee_id);
  if (!persoon) throw new ControleError('Kies voor wie de taak is.');
  const titel = String(invoer.titel || '').trim()
    || `Odoo-controle #${c.nr}: ${c.klant}${c.titel ? ` – ${c.titel}` : ''}`;
  const notitie = String(invoer.notitie || '').trim().slice(0, 10000);
  // Verwijzing naar Odoo op de taak: het eerste record dat Projecten kent.
  const ref = (c.refs || []).find((r) => PROJECT_MODELLEN.has(r.model));

  let taak;
  try {
    const { project, sectie } = await doelenProject(env, persoon, user.id);
    taak = await insertTask(env, normaliseerTaak({
      title: titel,
      description: beschrijving(c, notitie),
      assignee_id: persoon.id,
      due_date: invoer.due_date || null,
      priority: PRIO_NAAR_TAAK[c.prio] || 'normaal',
      labels: [TAAK_LABEL],
      project_id: project.id,
      section_id: sectie ? sectie.id : null,
      parent_id: null,
      done: false,
      ...(ref ? { odoo_model: ref.model, odoo_id: ref.id, odoo_name: ref.label } : {}),
    }, { nieuw: true }), user.id);
    taak = { ...taak, project_name: project.name };
  } catch (err) {
    if (err instanceof PmError) throw new ControleError(err.message, err.status);
    throw err;
  }

  // In de historiek van de case. Mislukt dat, dan staat de taak er toch.
  try {
    await getSupabaseClient(env).from(TABLES.history).insert({
      entity: 'case', entity_id: c.id, veld: 'taak', oud: null,
      nieuw: `${persoon.naam}${taak.due_date ? `, tegen ${taak.due_date}` : ''}: ${taak.title}`,
      door_user_id: user.id, door_naam: naamVan(user), bron: 'gebruiker', tijd: new Date().toISOString(),
    });
  } catch (err) { console.error('[odoo-controle] historiek taak', err); }

  return alsDto(taak, persoon.naam);
}

function alsDto(t, naam) {
  return {
    id: t.id, title: t.title, done: !!t.done, due_date: t.due_date || null,
    assignee_naam: naam || null, project_id: t.project_id, project_name: t.project_name || null,
    url: t.project_id ? `/projecten#/project/${encodeURIComponent(t.project_id)}?taak=${encodeURIComponent(t.id)}` : `/projecten#/mijn?taak=${encodeURIComponent(t.id)}`,
  };
}

/** De taken die vanuit deze case gemaakt zijn (op het merkteken in de beschrijving). */
export async function takenVanCase(env, caseId) {
  const { data, error } = await getCoreDb(env).from('pm_tasks')
    .select('id, title, done, due_date, assignee_id, project_id')
    .like('description', `%${merkVan(caseId)}%`)
    .order('created_at');
  if (error) throw new ControleError(`Taken lezen: ${error.message}`, 500);
  if (!(data || []).length) return [];
  const [lijst, projecten] = await Promise.all([mensen(env), listProjects(env)]);
  const naam = Object.fromEntries(lijst.map((m) => [m.id, m.naam]));
  const pnaam = Object.fromEntries(projecten.map((p) => [p.id, p.name]));
  return data.map((t) => alsDto({ ...t, project_name: pnaam[t.project_id] }, naam[t.assignee_id]));
}

/** Wie een taak kan krijgen (dezelfde lijst als in Projecten). */
export async function personen(env) {
  return (await mensen(env)).map((m) => ({ id: m.id, naam: m.naam, functie: m.functie }));
}
