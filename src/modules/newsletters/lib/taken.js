/**
 * Nieuwsbrieven -- een persoonlijke taak in Projecten (2026-10-20).
 *
 * Wie een blok toegewezen krijgt, of in een opmerking met @ vermeld wordt,
 * krijgt meteen een taak in "Mijn taken" (een losse to-do zonder project),
 * met de inleverdatum van de editie als vervaldatum en een link naar het blok.
 *
 * Nooit fataal: een taak die niet lukt, mag het toewijzen of de opmerking niet
 * tegenhouden (en Projecten staat in D1, de nieuwsbrief nog in Supabase).
 */

import { insertTask, normaliseerTaak } from '../../projecten/lib/store.js';

/** De dag in Europe/Brussels (YYYY-MM-DD), zoals Projecten een vervaldatum bewaart. */
function dagInBrussel(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/** De inleverdatum; is die al voorbij, dan de verzenddag. */
export function vervaldag(edition) {
  if (!edition) return null;
  const nu = Date.now();
  const deadline = edition.deadline_at && Date.parse(edition.deadline_at);
  if (deadline && deadline > nu) return dagInBrussel(edition.deadline_at);
  return edition.send_at ? dagInBrussel(edition.send_at) : null;
}

function esc(t) {
  return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function blokNaam(item) {
  const c = item?.content || {};
  return String(c.title || item?.title || 'een blok').trim();
}

/**
 * @param {object} o
 * @param {string} o.assigneeId  wie de taak krijgt
 * @param {string} o.titel
 * @param {string} [o.tekst]     extra uitleg (platte tekst)
 * @param {object} o.item        het blok (voor de link)
 * @param {object} [o.edition]
 * @param {object} [o.series]
 * @param {string|null} o.userId wie het veroorzaakte
 */
export async function maakTaak(env, { assigneeId, titel, tekst = '', item, edition, series, userId }) {
  if (!assigneeId || !item) return null;
  try {
    const waar = [series?.name, edition?.title].filter(Boolean).map(esc).join(' · ');
    const beschrijving = `${waar ? `<p>${waar}</p>` : ''}${tekst ? `<p>${esc(tekst).replace(/\n/g, '<br>')}</p>` : ''}`
      + `<p><a href="/nieuwsbrieven#/stukje/${esc(item.id)}">Open het blok in de nieuwsbrief</a></p>`;
    return await insertTask(env, normaliseerTaak({
      title: String(titel).slice(0, 200),
      description: beschrijving,
      assignee_id: assigneeId,
      due_date: vervaldag(edition),
      priority: 'normaal',
      labels: ['Nieuwsbrief'],
      project_id: null,
      section_id: null,
      parent_id: null,
      done: false,
    }, { nieuw: true }), userId || null);
  } catch (err) {
    console.error('[newsletters] taak in Projecten mislukt:', err?.message || err);
    return null;
  }
}

/** Een blok toegewezen: de nieuwe schrijver krijgt een taak (niet wie zichzelf toewijst). */
export function taakVoorToewijzing(env, { item, edition, series, ownerId, userId }) {
  if (!ownerId || ownerId === userId) return null;
  return maakTaak(env, {
    assigneeId: ownerId, item, edition, series, userId,
    titel: `Nieuwsbrief: schrijf "${blokNaam(item)}"`,
    tekst: 'Je kreeg dit blok toegewezen.',
  });
}

/**
 * Wie in een opmerking met @ vermeld wordt: "@Volledige Naam", of "@Voornaam"
 * als die voornaam maar bij één collega hoort. Hoofdletters tellen niet.
 */
export function vermeldeGebruikers(tekst, users) {
  const t = String(tekst || '').toLowerCase();
  if (!t.includes('@')) return [];
  const gevonden = new Map();
  const voornamen = new Map();
  for (const u of users) {
    const naam = String(u.full_name || '').trim();
    if (!naam) continue;
    if (t.includes('@' + naam.toLowerCase())) gevonden.set(u.id, u);
    const vn = naam.split(/\s+/)[0].toLowerCase();
    voornamen.set(vn, voornamen.has(vn) ? null : u);
  }
  for (const [vn, u] of voornamen) {
    if (!u || gevonden.has(u.id)) continue;
    if (new RegExp('@' + vn.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\p{L}\\p{N}])', 'u').test(t)) gevonden.set(u.id, u);
  }
  return [...gevonden.values()];
}

export async function takenVoorVermeldingen(env, { tekst, users, item, edition, series, userId, auteur }) {
  const wie = vermeldeGebruikers(tekst, users).filter((u) => u.id !== userId);
  await Promise.all(wie.map((u) => maakTaak(env, {
    assigneeId: u.id, item, edition, series, userId,
    titel: `Nieuwsbrief: opmerking bij "${blokNaam(item)}"`,
    tekst: `${auteur || 'Een collega'} schreef: ${tekst}`,
  })));
  return wie.map((u) => u.id);
}
