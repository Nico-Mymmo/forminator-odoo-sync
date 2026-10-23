/**
 * Een stap een plaats omhoog of omlaag zetten in een koppeling.
 *
 * Waarom dit een eigen actie is en geen PUT op de stap: verplaatsen deed eerst
 * drie gewone PUT's (A naar een tussenplaats, B naar de plaats van A, A naar
 * die van B). Elke PUT haalt de stap door validateTargetPayload(), maar het
 * scherm stuurde enkel de volgorde mee -- een mailstap kwam dan aan zonder
 * onderwerp en werd geweigerd. Faalde de TWEEDE PUT, dan bleef A op zijn
 * tussenplaats (max + 100) staan (2026-10-23, Syndicoach - Calculator Offerte).
 *
 * En een stap wordt op zijn NUMMER aangesproken: `step.2.record_id` in een
 * veldkoppeling, `{{step.2.name}}` in een mail, pdf_res_id_source, ... Twee
 * stappen van plaats wisselen zonder die verwijzingen mee te wisselen, laat
 * elke andere stap die naar een van de twee wees stil naar de verkeerde wijzen.
 * Hier worden ze in dezelfde beweging herschreven, in ELKE stap van de
 * koppeling. Verwijzingen op LABEL (`step.<label>.x`) veranderen niet.
 *
 * Wat geweigerd wordt: een verplaatsing waardoor een stap naar een stap wijst
 * die pas NA hem draait (die waarde bestaat dan nog niet). Een fout die er al
 * stond, blokkeert niets.
 */
import { getSupabaseClient } from '../../lib/database.js';

const STAP_REF = /\bstep\.(\d+)(?=\.)/g;

// Kolommen die nooit een stapverwijzing bevatten (of zelf de volgorde zijn).
const NIET_HERSCHRIJVEN = new Set([
  'id', 'integration_id', 'created_at', 'updated_at', 'execution_order', 'order_index',
  'odoo_model', 'operation_type', 'identifier_type', 'update_policy', 'is_enabled', 'is_system', 'label',
]);

function fout(message, code = 'VALIDATION_ERROR') {
  const e = new Error(message);
  e.code = code;
  return e;
}

function volgordeVan(t) {
  if (t.execution_order != null) return Number(t.execution_order);
  if (t.order_index != null) return Number(t.order_index);
  return 0;
}

function herschrijfTekst(tekst, wissel) {
  return tekst.replace(STAP_REF, (heel, nr) => `step.${wissel(Number(nr))}`);
}

// Geeft { kolom: nieuwe waarde } voor elke kolom die verandert.
function herschrevenVelden(rij, wissel) {
  const wijzigingen = {};
  for (const [kolom, waarde] of Object.entries(rij)) {
    if (NIET_HERSCHRIJVEN.has(kolom) || waarde == null) continue;
    if (typeof waarde === 'string') {
      const nieuw = herschrijfTekst(waarde, wissel);
      if (nieuw !== waarde) wijzigingen[kolom] = nieuw;
    } else if (typeof waarde === 'object') {
      const oud = JSON.stringify(waarde);
      const nieuw = herschrijfTekst(oud, wissel);
      if (nieuw !== oud) wijzigingen[kolom] = JSON.parse(nieuw);
    }
  }
  return wijzigingen;
}

// Naar welke stapnummers verwijst deze stap (velden + veldkoppelingen)?
function verwijzingen(rij, mappings) {
  const nrs = [];
  const tekst = JSON.stringify(Object.fromEntries(
    Object.entries(rij).filter(([k]) => !NIET_HERSCHRIJVEN.has(k))
  )) + '\n' + mappings.map((m) => m.source_value || '').join('\n');
  for (const m of tekst.matchAll(STAP_REF)) nrs.push(Number(m[1]));
  return nrs;
}

// Paren "stap X wijst naar stap Y die niet eerder draait", als sleutels op id.
function fouteVolgorde(targets, mappingsPerTarget, orderVan) {
  const opNummer = new Map(targets.map((t) => [orderVan(t), t]));
  const fouten = new Map();
  for (const t of targets) {
    const eigen = orderVan(t);
    for (const nr of verwijzingen(t.rij, mappingsPerTarget.get(t.id) || [])) {
      const doel = opNummer.get(nr);
      if (doel && doel.id !== t.id && nr >= eigen) fouten.set(`${t.id}>${doel.id}`, [t, doel]);
    }
    // Een pdf als bijlage wijst op id, niet op nummer: de pdf-stap moet eerder draaien.
    const bijlagen = Array.isArray(t.rij.mail_attachments) ? t.rij.mail_attachments : [];
    for (const b of bijlagen) {
      if (!b || b.type !== 'pdf_step') continue;
      const doel = targets.find((x) => String(x.id) === String(b.targetId));
      if (doel && orderVan(doel) >= eigen) fouten.set(`${t.id}>${doel.id}`, [t, doel]);
    }
  }
  return fouten;
}

export async function moveTarget(env, integrationId, targetId, direction) {
  const richting = Number(direction);
  if (richting !== 1 && richting !== -1) throw fout('direction moet 1 of -1 zijn.');

  const supabase = getSupabaseClient(env);
  const { data: rijen, error } = await supabase
    .from('fs_v2_targets').select('*').eq('integration_id', integrationId);
  if (error) throw new Error(`Failed to list targets: ${error.message}`);

  const gesorteerd = (rijen || []).slice().sort((a, b) => volgordeVan(a) - volgordeVan(b));
  const idx = gesorteerd.findIndex((t) => String(t.id) === String(targetId));
  if (idx < 0) throw fout('Stap niet gevonden in deze koppeling.', 'NOT_FOUND');
  const wisselIdx = idx + richting;
  if (wisselIdx < 0 || wisselIdx >= gesorteerd.length) return { moved: false };

  const a = gesorteerd[idx];
  const b = gesorteerd[wisselIdx];
  if (a.is_system === true || b.is_system === true) {
    throw fout('Een vaste stap van een Calendly-koppeling kan niet van plaats wisselen.');
  }
  const oA = volgordeVan(a);
  const oB = volgordeVan(b);
  if (oA === oB) throw fout('Twee stappen hebben hetzelfde nummer; sla een van beide eerst opnieuw op.');
  const wissel = (n) => (n === oA ? oB : n === oB ? oA : n);

  const ids = gesorteerd.map((t) => t.id);
  const { data: mapRijen, error: mapFout } = await supabase
    .from('fs_v2_mappings').select('id, target_id, source_value').in('target_id', ids);
  if (mapFout) throw new Error(`Failed to list mappings: ${mapFout.message}`);

  const mappingsVoor = new Map();
  for (const m of mapRijen || []) {
    if (!mappingsVoor.has(m.target_id)) mappingsVoor.set(m.target_id, []);
    mappingsVoor.get(m.target_id).push(m);
  }

  // De toestand erna, volledig in het geheugen, zodat we eerst kunnen nakijken.
  const veldWijzigingen = new Map();
  const mappingsNa = new Map();
  const mappingWijzigingen = [];
  for (const t of gesorteerd) {
    veldWijzigingen.set(t.id, herschrevenVelden(t, wissel));
    const lijst = (mappingsVoor.get(t.id) || []).map((m) => {
      const nieuw = m.source_value ? herschrijfTekst(m.source_value, wissel) : m.source_value;
      if (nieuw !== m.source_value) mappingWijzigingen.push({ id: m.id, source_value: nieuw });
      return { ...m, source_value: nieuw };
    });
    mappingsNa.set(t.id, lijst);
  }

  const voor = gesorteerd.map((t) => ({ id: t.id, rij: t }));
  const na = gesorteerd.map((t) => ({ id: t.id, rij: { ...t, ...veldWijzigingen.get(t.id) } }));
  const foutVoor = fouteVolgorde(voor, mappingsVoor, (t) => volgordeVan(t.rij));
  const foutNa = fouteVolgorde(na, mappingsNa, (t) => wissel(volgordeVan(t.rij)));
  for (const [sleutel, [stap, doel]] of foutNa) {
    if (foutVoor.has(sleutel)) continue;
    const naam = (t) => t.rij.label || t.rij.odoo_model || 'stap';
    throw fout(`Dat kan niet: de stap "${naam(stap)}" gebruikt het resultaat van "${naam(doel)}", en die moet dus eerder komen.`);
  }

  // Schrijven. Eerst A naar een vrije plaats (unieke index op integratie + volgorde).
  const tijdelijk = Math.max(...gesorteerd.map(volgordeVan)) + 1000;
  const schrijf = async (id, waarden) => {
    const { error: e } = await supabase.from('fs_v2_targets').update(waarden).eq('id', id);
    if (e) throw new Error(`Failed to update target: ${e.message}`);
  };
  await schrijf(a.id, { execution_order: tijdelijk });
  await schrijf(b.id, { execution_order: oA, ...veldWijzigingen.get(b.id) });
  await schrijf(a.id, { execution_order: oB, ...veldWijzigingen.get(a.id) });
  for (const t of gesorteerd) {
    if (t.id === a.id || t.id === b.id) continue;
    const w = veldWijzigingen.get(t.id);
    if (Object.keys(w).length) await schrijf(t.id, w);
  }
  for (const m of mappingWijzigingen) {
    const { error: e } = await supabase.from('fs_v2_mappings').update({ source_value: m.source_value }).eq('id', m.id);
    if (e) throw new Error(`Failed to update mapping: ${e.message}`);
  }

  return { moved: true, from: oA, to: oB, rewritten: mappingWijzigingen.length };
}
