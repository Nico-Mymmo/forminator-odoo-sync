/**
 * Regio's -- een bestand inlezen en uitrekenen wat er zou veranderen.
 *
 * Puur (geen env, geen databank): het voorbeeld en de echte import roepen
 * dezelfde bouwPlan() aan, zodat wat je in het voorbeeld ziet exact is wat er
 * daarna gebeurt.
 *
 * Wat het aanneemt: een CSV (puntkomma, komma of tab), of tekst geplakt uit
 * Excel. Met een kopregel worden de kolommen "postcode" en "syndicoach"
 * gezocht -- het overzicht dat de module zelf exporteert, gaat dus zo terug
 * naar binnen. Zonder kopregel: eerste kolom = postcode, laatste = syndicoach.
 *
 * Twee standen:
 *  - 'aanvullen': enkel wat in het bestand staat, verandert. Een lege
 *    syndicoach laat die postcode met rust.
 *  - 'vervangen': het bestand is de volledige waarheid. Een lege syndicoach
 *    of een postcode die niet in het bestand staat, wordt vrij.
 */

import { normaliseerPostcode, MAX_NAAM } from './constants.js';

const MAX_REGELS = 20000;

function scheidingsteken(regel) {
  const tel = (t) => regel.split(t).length - 1;
  const kandidaten = [['\t', tel('\t')], [';', tel(';')], [',', tel(',')]];
  kandidaten.sort((a, b) => b[1] - a[1]);
  return kandidaten[0][1] > 0 ? kandidaten[0][0] : ';';
}

/** Een CSV-regel in cellen, met "aanhalingstekens" en "" erin. */
function splitsRegel(regel, sep) {
  const cellen = [];
  let huidig = '';
  let inQuote = false;
  for (let i = 0; i < regel.length; i++) {
    const c = regel[i];
    if (inQuote) {
      if (c === '"' && regel[i + 1] === '"') { huidig += '"'; i++; }
      else if (c === '"') inQuote = false;
      else huidig += c;
    } else if (c === '"') inQuote = true;
    else if (c === sep) { cellen.push(huidig.trim()); huidig = ''; }
    else huidig += c;
  }
  cellen.push(huidig.trim());
  return cellen;
}

export function leesTabel(tekst) {
  const regels = String(tekst || '').replace(/^﻿/, '').split(/\r\n|\r|\n/)
    .map((r, i) => ({ nr: i + 1, r })).filter((x) => x.r.trim() !== '');
  if (regels.length > MAX_REGELS) throw new Error(`Het bestand heeft meer dan ${MAX_REGELS} regels.`);
  if (!regels.length) return { kop: null, rijen: [] };
  const sep = scheidingsteken(regels[0].r);
  const rijen = regels.map((x) => ({ nr: x.nr, cellen: splitsRegel(x.r, sep) }));
  return { sep, rijen };
}

function kolommen(rijen) {
  const eerste = (rijen[0]?.cellen || []).map((c) => c.toLowerCase());
  const pcIdx = eerste.findIndex((c) => /postcode|postnummer|^zip|^pc$/.test(c));
  if (pcIdx !== -1) {
    let synIdx = eerste.findIndex((c) => /syndicoach/.test(c));
    if (synIdx === -1) synIdx = eerste.findIndex((c, i) => i !== pcIdx && /coach|eigenaar|verantwoordelijk|medewerker/.test(c));
    return { kop: true, pcIdx, synIdx };
  }
  const breedte = Math.max(...rijen.map((r) => r.cellen.length));
  return { kop: false, pcIdx: 0, synIdx: breedte > 1 ? breedte - 1 : -1 };
}

/**
 * @param {object} p
 * @param {string} p.tekst           de inhoud van het bestand
 * @param {'aanvullen'|'vervangen'} p.modus
 * @param {Array<{id,naam}>} p.syndicoaches   de huidige
 * @param {Object<string,string>} p.toewijzingen  postcode -> syndicoach-id (huidig)
 */
export function bouwPlan({ tekst, modus, syndicoaches, toewijzingen }) {
  const vervangen = modus === 'vervangen';
  const { rijen } = leesTabel(tekst);
  if (!rijen.length) throw new Error('Het bestand is leeg.');
  const k = kolommen(rijen);
  if (k.synIdx === -1) throw new Error('Geen kolom met de syndicoach gevonden. Zet een kolom "syndicoach" naast de kolom "postcode".');
  const data = k.kop ? rijen.slice(1) : rijen;

  const opNaam = new Map(syndicoaches.map((s) => [s.naam.toLowerCase(), s]));
  const naamVanId = new Map(syndicoaches.map((s) => [s.id, s.naam]));
  const gewenst = new Map(); // postcode -> naam ('' = vrij)
  const ongeldig = [];
  const dubbel = [];

  data.forEach((rij) => {
    const ruwPc = rij.cellen[k.pcIdx] ?? '';
    const pc = normaliseerPostcode(ruwPc);
    if (!pc) {
      if (ruwPc || rij.cellen.some(Boolean)) ongeldig.push({ regel: rij.nr, waarde: ruwPc || '(leeg)' });
      return;
    }
    const naam = String(rij.cellen[k.synIdx] ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAAM);
    if (gewenst.has(pc) && gewenst.get(pc).toLowerCase() !== naam.toLowerCase()) {
      dubbel.push({ regel: rij.nr, postcode: pc, eerder: gewenst.get(pc) || '(vrij)', nu: naam || '(vrij)' });
    }
    gewenst.set(pc, naam);
  });

  const nieuweNamen = new Map(); // lowercase -> naam zoals in het bestand
  const toewijzen = [];  // {postcode, naam}
  const vrijgeven = [];  // postcode
  let nieuw = 0, verplaatst = 0, ongewijzigd = 0;

  gewenst.forEach((naam, pc) => {
    const nu = toewijzingen[pc] ? naamVanId.get(toewijzingen[pc]) : null;
    if (!naam) {
      if (vervangen && nu) vrijgeven.push(pc);
      return;
    }
    const bestaande = opNaam.get(naam.toLowerCase());
    const doelNaam = bestaande ? bestaande.naam : naam;
    if (!bestaande && !nieuweNamen.has(naam.toLowerCase())) nieuweNamen.set(naam.toLowerCase(), naam);
    if (nu && nu.toLowerCase() === doelNaam.toLowerCase()) { ongewijzigd++; return; }
    if (nu) verplaatst++; else nieuw++;
    toewijzen.push({ postcode: pc, naam: doelNaam, van: nu || null });
  });

  if (vervangen) {
    Object.keys(toewijzingen).forEach((pc) => { if (!gewenst.has(pc)) vrijgeven.push(pc); });
  }

  return {
    modus: vervangen ? 'vervangen' : 'aanvullen',
    met_kop: k.kop,
    regels: data.length,
    nieuwe_syndicoaches: [...nieuweNamen.values()],
    toewijzen,
    vrijgeven: vrijgeven.sort(),
    tellingen: { nieuw, verplaatst, ongewijzigd, vrijgeven: vrijgeven.length },
    ongeldig: ongeldig.slice(0, 200),
    ongeldig_aantal: ongeldig.length,
    dubbel: dubbel.slice(0, 200),
  };
}
