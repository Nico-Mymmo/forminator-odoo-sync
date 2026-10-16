/**
 * Odoo-controle -- de export van de claude.ai-pagina ("Factuur-, abonnement-
 * en CRM-controle") omzetten naar rijen voor onze tabellen.
 *
 * Puur: geen database. Gebruikt door POST /odoo-controle/api/import (de
 * laatste export op de dag van de overschakeling) en door
 * scripts/odoo-controle/export-naar-sql.mjs (de eerste lading, als migratie).
 *
 * De export: { cases: [{id, data}], patterns: [{id, data}], meta: [{id, data}] }.
 * Verschillen met de oude opslag:
 * - de les van een case heette daar `regel`; hier `les` (de regel hoort bij het patroon);
 * - het technische patroon 'andere' (= nog geen patroon) wordt niet overgenomen:
 *   een case zonder koppelingen is een case zonder patroon;
 * - `oorzaken` (lijst) gaat voor op `oorzaak`/`patroon` (één);
 * - de gebruikers-id's van claude.ai (u_...) zeggen hier niets: `door_naam` blijft leeg.
 */

import { PRIO, REF_MODELS } from './constants.js';

const str = (v) => (v === null || v === undefined ? null : String(v));
const tekst = (v) => (v === null || v === undefined ? '' : String(v));
const iso = (v) => {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};
const datum = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);

export function patronenVanCase(c) {
  const lijst = Array.isArray(c.oorzaken) && c.oorzaken.length ? c.oorzaken : [c.oorzaak || c.patroon];
  return lijst.map((x) => (x ? String(x) : '')).filter((x, i, a) => x && x !== 'andere' && a.indexOf(x) === i);
}

export function zetExportOm(data, { tijd = new Date().toISOString() } = {}) {
  if (!data || !Array.isArray(data.cases) || !Array.isArray(data.patterns)) {
    throw new Error('Dit is geen export van de controle-pagina: cases en patterns ontbreken.');
  }
  const patterns = [];
  const patroonIds = new Set();
  for (const { id, data: p } of data.patterns) {
    if (!id || id === 'andere') continue;
    patroonIds.add(id);
    patterns.push({
      id,
      nr: Number.isFinite(Number(p.nr)) ? Number(p.nr) : 99,
      titel: tekst(p.titel) || id,
      uitleg: tekst(p.uitleg),
      regel: tekst(p.regel),
      controle: tekst(p.controle),
      bron_case: str(p.bronCase),
      aangemaakt: iso(p.aangemaakt),
      bijgewerkt: iso(p.bijgewerkt),
      geverifieerd: iso(p.geverifieerd),
      door_user_id: null,
      door_naam: null,
      versie: 0,
      rij_bijgewerkt: tijd,
    });
  }

  const cases = [];
  const links = [];
  for (const { id, data: c } of data.cases) {
    if (!id) continue;
    const s = c.stappen || {};
    const prio = PRIO.find((p) => p.id === c.prio) || PRIO[PRIO.length - 1];
    const refs = (Array.isArray(c.refs) ? c.refs : [])
      .map((r) => ({ id: Number(r && r.id), label: tekst(r && r.label), model: tekst(r && r.model) }))
      .filter((r) => Number.isInteger(r.id) && r.label && REF_MODELS.includes(r.model));
    cases.push({
      id,
      nr: Number(c.nr) || 0,
      klant: tekst(c.klant) || '(onbekend)',
      klanttype: str(c.klanttype) || null,
      titel: str(c.titel),
      bedrag: str(c.bedrag),
      categorie: str(c.categorie),
      domein: str(c.domein),
      prio: prio.id,
      prio_rang: Number.isFinite(Number(c.prioRang)) ? Number(c.prioRang) : prio.rang,
      zekerheid: str(c.zekerheid),
      soort: tekst(c.soort) || 'onbekend',
      deadline: datum(c.deadline),
      vervaldag: datum(c.vervaldag),
      bevinding: str(c.bevinding),
      voorstel: str(c.voorstel),
      refs,
      onderzocht: !!s.onderzocht,
      rechtgezet: !!s.rechtgezet,
      geen_fout: !!c.geenFout,
      in_openvme: !!c.inOpenvme,
      vasthouden: !!c.vasthouden,
      wat_gebeurde: tekst(c.watGebeurde),
      actie: tekst(c.actie),
      complicaties: tekst(c.complicaties),
      les: tekst(c.regel),
      bijgewerkt: iso(c.bijgewerkt),
      tekst_bijgewerkt: iso(c.tekstBijgewerkt),
      geverifieerd: iso(c.geverifieerd),
      door_user_id: null,
      door_naam: null,
      aangemaakt: iso(c.bijgewerkt) || tijd,
      versie: 0,
      rij_bijgewerkt: tijd,
    });
    patronenVanCase(c).forEach((pid, pos) => {
      if (patroonIds.has(pid)) links.push({ case_id: id, pattern_id: pid, pos });
    });
  }

  const meta = [];
  for (const { id, data: m } of Array.isArray(data.meta) ? data.meta : []) {
    for (const [k, v] of Object.entries(m || {})) {
      meta.push({ key: `${id}.${k}`, value: typeof v === 'string' ? v : JSON.stringify(v) });
    }
  }
  meta.push({ key: 'import.laatste', value: tijd });

  return { patterns, cases, links, meta };
}
