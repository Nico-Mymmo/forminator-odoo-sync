/**
 * Merk, product en fase van een lead, voor het tabblad Targets.
 *
 * Dit zijn DEZELFDE regels als de Odoo-serveractie 1209/1210 ("Dashboard
 * Targets & Funnel: hulpvelden x_dash herberekenen"), die ze 's nachts in de
 * x_dash_*-velden schrijft. De OM past ze zelf toe op de ruwe leadgegevens, zodat
 * het dashboard niet wacht op die nachtelijke run en een lead van vanochtend al
 * meetelt. Wijzig je een regel, wijzig hem op BEIDE plekken zolang dat
 * Odoo-dashboard (spreadsheet.dashboard 19) nog gebruikt wordt -- anders zeggen
 * de twee iets anders over dezelfde lead.
 *
 * Puur: geen env, geen fetch, geen database.
 */

const SC_HERKOMST = ['syndicoach', 'syndicuskiezen'];
const SC_WOORDEN = ['syndicoach', 'syndicus kiezen', 'syndicuskiezen'];
const SC_LABELS = ['syndicoach', 'syndicoah', 'syndicuskiezen', 'syndicus kiezen'];

/**
 * De merkregel, met het SIGNAAL dat besliste: zo kan het dashboard per klant en
 * per lead tonen waarom die bij Syndicoach of OpenVME staat. OpenVME heeft geen
 * eigen signaal: het is wat overblijft als er geen Syndicoach-signaal is (`k: 'geen'`).
 *
 * @param {object} lead       rij uit D1 `leads`
 * @param {string[]} tagNames namen van de labels, in kleine letters
 * @returns {{merk: 'syndicoach'|'openvme', k: 'herkomst'|'kanaal'|'naam'|'label'|'geen', v: string}}
 */
export function leadMerkWhy(lead, tagNames) {
  const naam = String(lead.name || '').toLowerCase();
  const kanaal = String(lead.lead_channel || '');
  if (SC_HERKOMST.includes(lead.brand_origin)) return { merk: 'syndicoach', k: 'herkomst', v: lead.brand_origin };
  if (kanaal.startsWith('syndicoach')) return { merk: 'syndicoach', k: 'kanaal', v: kanaal };
  const woord = SC_WOORDEN.find((w) => naam.includes(w));
  if (woord) return { merk: 'syndicoach', k: 'naam', v: woord };
  const label = tagNames.find((t) => SC_LABELS.some((w) => t.includes(w)));
  if (label) return { merk: 'syndicoach', k: 'label', v: label };
  return { merk: 'openvme', k: 'geen', v: '' };
}

/** @returns {'syndicoach'|'openvme'} */
export function leadMerk(lead, tagNames) {
  return leadMerkWhy(lead, tagNames).merk;
}

/**
 * Productregel, in deze volgorde (ook zo in de veldbeschrijving van x_dash_product):
 * 1. Expert aangevinkt, of contact/bedrijf van type Professionele syndicus (company_type 2
 *    of contact_type 5/6) -> prof_syndicus
 * 2. Merk OpenVME -> assistant
 * 3. Merk Syndicoach + 'captain' in naam/label of pakket captain -> captain
 * 4. Merk Syndicoach + 'opstarthulp' in naam/label -> opstarthulp
 * 5. anders -> niet_toegewezen
 *
 * @param {object[]} partners de partner van de lead en zijn ouder (wat er van bekend is)
 */
export function leadProduct(lead, merk, tagNames, partners) {
  return leadProductWhy(lead, merk, tagNames, partners).prod;
}

/** De productregel hierboven, met de reden in mensentaal (voor de lijsten in het dashboard). */
export function leadProductWhy(lead, merk, tagNames, partners) {
  const naam = String(lead.name || '').toLowerCase();
  const labels = tagNames.join(' | ');
  if (lead.is_expert) return { prod: 'prof_syndicus', why: 'Expert aangevinkt op de lead' };
  for (const p of partners) {
    if (p && p.company_type_id === 2) return { prod: 'prof_syndicus', why: 'Bedrijf van de lead is een professionele syndicus (klanttype)' };
    if (p && (p.contact_type_id === 5 || p.contact_type_id === 6)) return { prod: 'prof_syndicus', why: 'Contactpersoon is een professionele syndicus (contacttype)' };
  }
  if (merk === 'openvme') return { prod: 'assistant', why: 'Merk OpenVME en geen professionele syndicus' };
  if (lead.syndicoach_pack === 'captain') return { prod: 'captain', why: 'Syndicoach, pakket Captain' };
  if (naam.includes('captain')) return { prod: 'captain', why: 'Syndicoach, "captain" in de naam' };
  if (labels.includes('captain')) return { prod: 'captain', why: 'Syndicoach, label "captain"' };
  if (naam.includes('opstarthulp')) return { prod: 'opstarthulp', why: 'Syndicoach, "opstarthulp" in de naam' };
  if (labels.includes('opstarthulp')) return { prod: 'opstarthulp', why: 'Syndicoach, label "opstarthulp"' };
  return { prod: 'niet_toegewezen', why: 'Syndicoach zonder Captain- of Opstarthulp-signaal (naam, label of pakket)' };
}

/** Wondatum in Brussel, of null: enkel een ACTIEVE lead in een gewonnen fase. */
export function leadWonDate(lead, stage, toBrusselsDate) {
  if (!lead.active || !stage || !stage.is_won) return null;
  const dt = lead.date_closed || lead.date_last_stage_update;
  return dt ? toBrusselsDate(dt) : null;
}

/** Verloren = verliesreden ingevuld of gearchiveerd (zo telt het Odoo-dashboard het ook). */
export function leadVerloren(lead) {
  return !!lead.lost_reason_id || !lead.active;
}

export const PRODUCT_LABELS = {
  assistant: 'Assistant',
  opstarthulp: 'Opstarthulp',
  captain: 'Captain',
  prof_syndicus: 'Professionele syndicus',
  niet_toegewezen: 'Niet toegewezen'
};
