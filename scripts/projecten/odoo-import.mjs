#!/usr/bin/env node
/**
 * Odoo -> Projecten (D1 om-core): de teamdoelen, de individuele doelen en
 * het Odoo-project "Koppeling Mollie" overnemen als projecten en taken.
 *
 *   node scripts/projecten/odoo-import.mjs > <map>/projecten-import.sql
 *   npx wrangler d1 execute om-core --remote --file <map>/projecten-import.sql
 *
 * Leest Odoo en Supabase met de sleutels uit .dev.vars (DB_NAME, UID,
 * API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY). Schrijft NIETS zelf:
 * de uitvoer is SQL met `INSERT OR IGNORE` en vaste ids
 * (`odoo:<model>:<id>`), dus een tweede keer draaien maakt niets dubbel en
 * overschrijft niets wat in de OM al aangepast is.
 *
 * Wat waar belandt:
 *   x_team_goal          -> een project per teamdoel (beschrijving + WHY + WHAT
 *                           + focus + teams in de beschrijving; coordinator =
 *                           eigenaar; Done = afgerond; Gearchiveerd = archief)
 *   x_individual_goal    -> (enkel de actieve: wat in Odoo gearchiveerd is, blijft daar)
 *                           een taak in het project van zijn teamdoel, anders
 *                           in "Doelen van <naam>"; sectie = de fase in Odoo;
 *                           Opgeleverd/Gearchiveerd = afgevinkt
 *   project.project 82   -> het project "Mollie release campaign": secties =
 *                           de fases, subtaken blijven subtaken, mijlpalen
 *                           worden mijlpaal-taken, Done = afgevinkt
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const env = Object.fromEntries(
  readFileSync(resolve('.dev.vars'), 'utf8').split('\n')
    .map((r) => r.trim()).filter((r) => r && !r.startsWith('#') && r.includes('='))
    .map((r) => [r.slice(0, r.indexOf('=')).trim(), r.slice(r.indexOf('=') + 1).trim().replace(/^"|"$/g, '')]),
);
for (const k of ['DB_NAME', 'UID', 'API_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
  if (!env[k]) { console.error(`Ontbreekt in .dev.vars: ${k}`); process.exit(1); }
}

const MOLLIE_PROJECT = 82;
const MOLLIE_NAAM = 'Mollie release campaign';
const NU = new Date().toISOString();

async function odoo(model, method, args = [], kwargs = {}) {
  const res = await fetch('https://mymmo.odoo.com/jsonrpc', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'call', id: 1, params: { service: 'object', method: 'execute_kw', args: [env.DB_NAME, Number(env.UID), env.API_KEY, model, method, args, kwargs] } }),
  });
  const j = await res.json();
  if (j.error) throw new Error(j.error.data?.message || JSON.stringify(j.error));
  return j.result;
}
const lees = (model, domain, fields, extra = {}) => odoo(model, 'search_read', [domain], { fields, limit: 2000, ...extra });

async function omGebruikers() {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/users?select=id,email,odoo_uid&is_active=eq.true`, {
    headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}` },
  });
  if (!res.ok) throw new Error(`Supabase: ${res.status}`);
  return res.json();
}

// ── Hulpjes ────────────────────────────────────────────────────────────────

const q = (v) => {
  if (v === null || v === undefined || v === false) return 'NULL';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return v ? '1' : '0';
  return "'" + String(v).replace(/'/g, "''") + "'";
};
const m2oId = (v) => (Array.isArray(v) ? v[0] : null);
const m2oNaam = (v) => (Array.isArray(v) ? v[1] : '');
const ts = (v) => (v ? new Date(v.replace(' ', 'T') + 'Z').toISOString() : NU);
const dag = (v) => (v ? String(v).slice(0, 10) : null);

/** Odoo-HTML naar leesbare tekst: alinea's en lijstjes blijven regels. */
function tekst(html) {
  if (!html) return '';
  return String(html)
    .replace(/<\s*br\s*\/?>/gi, '\n').replace(/<\/p>|<\/div>|<\/h\d>/gi, '\n').replace(/<li[^>]*>/gi, '- ').replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .split('\n').map((r) => r.trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

const KLEUR_PER_TEAM = { 'Marketing & Global': 'sky', Product: 'violet', Development: 'teal', 'Customer Experience': 'amber', Revenue: 'green', 'People & Culture': 'rose', Management: 'slate' };

const sql = [];
const gezien = new Set();
function insert(tabel, rij) {
  const kol = Object.keys(rij);
  sql.push(`INSERT OR IGNORE INTO ${tabel} (${kol.join(', ')}) VALUES (${kol.map((k) => q(rij[k])).join(', ')});`);
}
function project(rij) { if (gezien.has(rij.id)) return; gezien.add(rij.id); insert('pm_projects', { created_at: NU, updated_at: NU, ...rij }); }
function sectie(projectId, naam, positie) {
  const id = `${projectId}:sectie:${naam.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  if (!gezien.has(id)) { gezien.add(id); insert('pm_sections', { id, project_id: projectId, name: naam, position: positie, created_at: NU, updated_at: NU }); }
  return id;
}
function taak(rij) {
  insert('pm_tasks', { description: '', priority: 'normaal', is_milestone: 0, labels: '[]', followers: JSON.stringify([rij.assignee_id].filter(Boolean)), done: 0, position: 0, updated_at: NU, ...rij });
  insert('pm_history', { id: `${rij.id}:hist`, task_id: rij.id, project_id: rij.project_id, user_id: null, action: 'import', new_value: 'Overgenomen uit Odoo', created_at: NU });
}

// ── Lezen ──────────────────────────────────────────────────────────────────

const [gebruikers, odooUsers, departementen, focus] = await Promise.all([
  omGebruikers(),
  lees('res.users', [['share', '=', false]], ['id', 'login', 'name'], { context: { active_test: false } }),
  lees('hr.department', [], ['id', 'name']),
  lees('x_company_focus', [], ['id', 'x_name']),
]);
const perEmail = Object.fromEntries(gebruikers.map((g) => [String(g.email).toLowerCase(), g.id]));
const perUid = Object.fromEntries(gebruikers.filter((g) => g.odoo_uid).map((g) => [g.odoo_uid, g.id]));
const loginVan = Object.fromEntries(odooUsers.map((u) => [u.id, u.login]));
const naamVan = Object.fromEntries(odooUsers.map((u) => [u.id, u.name]));
const depNaam = Object.fromEntries(departementen.map((d) => [d.id, d.name]));
const focusNaam = Object.fromEntries(focus.map((f) => [f.id, f.x_name]));
/** Odoo-gebruiker -> OM-gebruiker (odoo_uid, anders de login als e-mailadres). */
const omUser = (odooUid) => (odooUid ? perUid[odooUid] || perEmail[String(loginVan[odooUid] || '').toLowerCase()] || null : null);
const onbekend = new Set();
const omUserOfMeld = (uid) => { const r = omUser(uid); if (uid && !r) onbekend.add(naamVan[uid] || uid); return r; };

// ── Teamdoelen -> projecten ────────────────────────────────────────────────

const teamGoals = await lees('x_team_goal', [['x_active', '=', true]], ['x_name', 'x_studio_user_id', 'x_studio_stage_id', 'x_studio_description', 'x_studio_team_goal_why', 'x_studio_team_goal_what', 'x_studio_team_goal_focus', 'x_studio_owned_by_teams', 'x_studio_date_stop', 'x_studio_priority', 'create_date', 'x_active'], { context: { active_test: false } });
const teamGoalProject = {};
for (const g of teamGoals) {
  const id = `odoo:x_team_goal:${g.id}`;
  teamGoalProject[g.id] = id;
  const stage = m2oNaam(g.x_studio_stage_id);
  const teams = (g.x_studio_owned_by_teams || []).map((d) => depNaam[d]).filter(Boolean);
  const delen = [tekst(g.x_studio_description)];
  if (g.x_studio_team_goal_why) delen.push('Waarom\n' + tekst(g.x_studio_team_goal_why));
  if (g.x_studio_team_goal_what) delen.push('Wat\n' + tekst(g.x_studio_team_goal_what));
  const fo = (g.x_studio_team_goal_focus || []).map((f) => focusNaam[f]).filter(Boolean);
  if (fo.length) delen.push('Focus: ' + fo.join(', '));
  if (teams.length) delen.push('Teams: ' + teams.join(', '));
  delen.push('Overgenomen uit Odoo (teamdoel), fase daar: ' + stage + '.');
  project({
    id, name: g.x_name, description: delen.filter(Boolean).join('\n\n'),
    color: KLEUR_PER_TEAM[teams[0]] || 'slate', icon: 'target',
    owner_id: omUserOfMeld(m2oId(g.x_studio_user_id)),
    status: stage === 'Done' || stage === 'Gearchiveerd' ? 'afgerond' : 'op_schema',
    due_date: dag(g.x_studio_date_stop),
    archived: stage === 'Gearchiveerd' || g.x_active === false ? 1 : 0,
    position: 1000 + g.id,
    odoo_model: 'x_team_goal', odoo_id: g.id, odoo_name: g.x_name,
    created_at: ts(g.create_date),
  });
}

// ── Individuele doelen -> taken ────────────────────────────────────────────

const FASE_POS = { Nieuw: 10, 'Te bespreken': 20, 'In behandeling': 30, Opgeleverd: 40, Gearchiveerd: 50 };
const goals = await lees('x_individual_goal', [['x_active', '=', true]], ['x_name', 'x_studio_user_id', 'x_studio_stage_id', 'x_studio_date', 'x_studio_priority', 'x_studio_parent_team_goal_id', 'x_studio_kanban_state', 'x_studio_description', 'x_studio_sequence', 'create_date', 'x_active'], { context: { active_test: false } });
const KLEUR_PERSOON = ['orange', 'rose', 'violet', 'teal', 'green', 'amber'];
let k = 0;
for (const g of goals) {
  const uid = m2oId(g.x_studio_user_id);
  const owner = omUserOfMeld(uid);
  let projectId = g.x_studio_parent_team_goal_id ? teamGoalProject[m2oId(g.x_studio_parent_team_goal_id)] : null;
  if (!projectId) {
    projectId = `odoo:doelen:${uid || 0}`;
    const naam = uid ? naamVan[uid] || m2oNaam(g.x_studio_user_id) : 'niemand';
    project({
      id: projectId, name: 'Doelen van ' + naam.split(' ')[0], description: 'De individuele doelen uit Odoo van ' + naam + ' die niet onder een teamdoel vallen.',
      color: KLEUR_PERSOON[(uid || k++) % KLEUR_PERSOON.length], icon: 'target', owner_id: owner, status: 'op_schema', archived: 0, position: 2000 + (uid || 0),
      odoo_model: null, odoo_id: null, odoo_name: null,
    });
  }
  const fase = m2oNaam(g.x_studio_stage_id) || 'Nieuw';
  const sectieId = sectie(projectId, fase, FASE_POS[fase] || 60);
  const af = fase === 'Opgeleverd' || fase === 'Gearchiveerd';
  const labels = [];
  if (fase === 'Gearchiveerd') labels.push('Gearchiveerd in Odoo');
  if (g.x_studio_kanban_state === 'blocked') labels.push('Geblokkeerd');
  taak({
    id: `odoo:x_individual_goal:${g.id}`, project_id: projectId, section_id: sectieId, parent_id: null,
    title: g.x_name, description: tekst(g.x_studio_description),
    assignee_id: owner, due_date: dag(g.x_studio_date),
    priority: g.x_studio_priority ? 'hoog' : 'normaal', labels: JSON.stringify(labels),
    done: af ? 1 : 0, done_at: af ? NU : null, position: (g.x_studio_sequence || 0) * 10 + g.id,
    odoo_model: 'x_individual_goal', odoo_id: g.id, odoo_name: g.x_name,
    created_by: owner, created_at: ts(g.create_date),
  });
}

// ── Koppeling Mollie -> Mollie release campaign ───────────────────────────

const [mollie] = await lees('project.project', [['id', '=', MOLLIE_PROJECT]], ['name', 'user_id', 'description', 'create_date']);
const mollieId = `odoo:project.project:${MOLLIE_PROJECT}`;
project({
  id: mollieId, name: MOLLIE_NAAM, description: tekst(mollie.description) || 'Overgenomen uit het Odoo-project "' + mollie.name + '".',
  color: 'sky', icon: 'rocket', owner_id: omUserOfMeld(m2oId(mollie.user_id)), status: 'op_schema', archived: 0, position: 10,
  odoo_model: 'project.project', odoo_id: MOLLIE_PROJECT, odoo_name: mollie.name, created_at: ts(mollie.create_date),
});
const stages = await lees('project.task.type', [['project_ids', 'in', [MOLLIE_PROJECT]]], ['name', 'sequence'], { order: 'sequence' });
const stageSectie = {};
stages.forEach((s, i) => { stageSectie[s.id] = sectie(mollieId, s.name, (i + 1) * 10); });
const mijlpaalSectie = sectie(mollieId, 'Mijlpalen', (stages.length + 1) * 10);
const milestones = await lees('project.milestone', [['project_id', '=', MOLLIE_PROJECT]], ['name', 'deadline', 'is_reached', 'create_date']);
for (const m of milestones) {
  taak({
    id: `odoo:project.milestone:${m.id}`, project_id: mollieId, section_id: mijlpaalSectie, parent_id: null,
    title: m.name, is_milestone: 1, due_date: dag(m.deadline), done: m.is_reached ? 1 : 0, done_at: m.is_reached ? NU : null,
    position: m.id, odoo_model: 'project.milestone', odoo_id: m.id, odoo_name: m.name, created_by: null, created_at: ts(m.create_date), assignee_id: null,
  });
}
const taken = await lees('project.task', [['project_id', '=', MOLLIE_PROJECT], ['active', '=', true]], ['name', 'stage_id', 'user_ids', 'date_deadline', 'priority', 'description', 'parent_id', 'milestone_id', 'tag_ids', 'sequence', 'create_date', 'active'], { context: { active_test: false }, order: 'sequence' });
const taakIds = new Set(taken.map((t) => t.id));
for (const t of taken) {
  const parent = t.parent_id && taakIds.has(m2oId(t.parent_id)) ? `odoo:project.task:${m2oId(t.parent_id)}` : null;
  const af = m2oNaam(t.stage_id) === 'Done';
  const labels = t.milestone_id ? [m2oNaam(t.milestone_id)] : [];
  const owner = omUserOfMeld((t.user_ids || [])[0]);
  taak({
    id: `odoo:project.task:${t.id}`, project_id: mollieId, section_id: parent ? null : stageSectie[m2oId(t.stage_id)] || null, parent_id: parent,
    title: t.name, description: tekst(t.description), assignee_id: owner, due_date: dag(t.date_deadline),
    priority: t.priority === '1' ? 'hoog' : 'normaal', labels: JSON.stringify(labels),
    done: af ? 1 : 0, done_at: af ? NU : null, position: (t.sequence || 0) * 10,
    odoo_model: 'project.task', odoo_id: t.id, odoo_name: t.name, created_by: owner, created_at: ts(t.create_date),
  });
}

console.log('-- Projecten: overname uit Odoo, gemaakt op ' + NU);
console.log(`-- teamdoelen: ${teamGoals.length}, individuele doelen: ${goals.length}, Mollie: ${taken.length} taken + ${milestones.length} mijlpalen`);
if (onbekend.size) console.log('-- Odoo-gebruikers zonder OM-account (taak zonder verantwoordelijke): ' + [...onbekend].join(', '));
console.log(sql.join('\n'));
console.error(`klaar: ${sql.length} statements` + (onbekend.size ? `; geen OM-account voor: ${[...onbekend].join(', ')}` : ''));
