/**
 * Opvolging -- vaste waarden en kleine hulpjes (puur, geen env/fetch/db).
 */

export const LOG_PREFIX = '[opvolging]';

export class OpvolgingError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

/**
 * De drie uitkomsten van een gesprek. De teksten in de chatter zijn EXACT die
 * van de oproepknoppen die Thomas in Odoo maakte (serveracties 1205, 1206, 1207):
 * zo leest het controlepaneel oude en nieuwe gesprekken op dezelfde manier.
 */
export const UITKOMSTEN = {
  // `label` gaat over het GESPREK ("de klant nam op"), nooit over de lead.
  opgenomen: { soort: 'contact', label: 'Gebeld, nam op', icoon: '✅', chatter: 'Oproep: opgenomen' },
  ingesproken: { soort: 'poging', label: 'Gebeld, voicemail ingesproken', icoon: '🎙️', chatter: 'Oproep: voicemail ingesproken' },
  niets: { soort: 'poging', label: 'Gebeld, nam niet op', icoon: '🔇', chatter: 'Oproep: geen antwoord, niets ingesproken' },
};

/** Een chatterbericht terug naar een uitkomst. De volgorde telt: 'niets' bevat ook 'ingesproken'. */
export function uitkomstUitTekst(tekst) {
  const t = String(tekst || '');
  if (!t.includes('Oproep:')) return null;
  if (t.includes(UITKOMSTEN.niets.chatter)) return 'niets';
  if (t.includes(UITKOMSTEN.ingesproken.chatter)) return 'ingesproken';
  if (t.includes(UITKOMSTEN.opgenomen.chatter)) return 'opgenomen';
  return null;
}

/** Activiteitstypes in Odoo met categorie 'phonecall' (Call, Syndicoach - Nieuwe aanvraag, ...). */
export const BEL_CATEGORIE = 'phonecall';

// ── Datums, in Europe/Brussels ────────────────────────────────────────────

const TZ = 'Europe/Brussels';

/** 'YYYY-MM-DD' van vandaag in Brussel. */
export function vandaag(nu = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(nu);
}

/** Een Odoo-datetime (UTC, 'YYYY-MM-DD HH:MM:SS') als Date. */
export function odooDatum(s) {
  if (!s) return null;
  const d = new Date(String(s).replace(' ', 'T') + 'Z');
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Dagen tussen twee 'YYYY-MM-DD' (b - a). */
export function dagenTussen(a, b) {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
}

/** 'YYYY-MM-DD' + n werkdagen (zaterdag en zondag tellen niet). */
export function plusWerkdagen(datum, n) {
  const d = new Date(datum + 'T12:00:00Z');
  let over = n;
  while (over > 0) {
    d.setUTCDate(d.getUTCDate() + 1);
    const w = d.getUTCDay();
    if (w !== 0 && w !== 6) over--;
  }
  return d.toISOString().slice(0, 10);
}

/** "vandaag", "gisteren", "3 dagen geleden". */
export function geleden(datum, nu = vandaag()) {
  const n = dagenTussen(datum, nu);
  if (n <= 0) return 'vandaag';
  if (n === 1) return 'gisteren';
  return `${n} dagen geleden`;
}

const MAANDEN = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

/** '2026-11-04' -> '4 nov'. */
export function korteDatum(datum) {
  const [, m, d] = String(datum || '').split('-').map(Number);
  return m && d ? `${d} ${MAANDEN[m - 1]}` : '';
}

/** Tijdstip in Brussel: '30/10/2026', '10:12'. */
export function brusselsStempel(nu = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('nl-BE', {
    timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(nu).map(x => [x.type, x.value]));
  return { datum: `${p.day}/${p.month}/${p.year}`, uur: `${p.hour}:${p.minute}` };
}

const DAGEN = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];

/** '2026-11-03' -> 'dinsdag 3 nov'. */
export function dagEnDatum(datum) {
  const d = new Date(String(datum || '') + 'T12:00:00Z');
  return Number.isNaN(d.getTime()) ? '' : `${DAGEN[d.getUTCDay()]} ${korteDatum(datum)}`;
}

/** Kleur van de kaart per uitkomst (rand, vlak). */
const KAART_KLEUR = {
  opgenomen: ['#16a34a', '#f0fdf4'],
  ingesproken: ['#0369a1', '#f0f9ff'],
  niets: ['#d97706', '#fffbeb'],
};

/**
 * Het bericht in de chatter: een gekleurde kaart, zodat een oproep opvalt
 * tussen de rest. De zin `UITKOMSTEN[..].chatter` staat er letterlijk en
 * aaneen in: het controlepaneel leest gesprekken op die zin. Dezelfde kaart
 * maakt serveractie 1207 in Odoo (scratch: odoo_ik_heb_gebeld.mjs); wijzig ze samen.
 */
export function chatterKaart({ uitkomst, naam, notitie, volgende }) {
  const u = UITKOMSTEN[uitkomst];
  const [rand, vlak] = KAART_KLEUR[uitkomst];
  const s = brusselsStempel();
  let h = `<div style="border-left:4px solid ${rand};background-color:${vlak};padding:8px 12px;border-radius:6px;">`
    + `<p style="margin:0;"><b>${u.icoon} ${esc(u.chatter)}</b></p>`
    + `<p style="margin:2px 0 0;font-size:12px;color:#6b7280;">${s.datum} om ${s.uur} · ${esc(naam)}</p>`;
  if (notitie) {
    const kop = uitkomst === 'opgenomen' ? 'Besproken' : 'Ingesproken';
    h += `<p style="margin:6px 0 0;"><b>${kop}:</b> ${esc(notitie).replace(/\n/g, '<br>')}</p>`;
  }
  if (volgende) h += `<p style="margin:6px 0 0;font-size:12px;">Opnieuw bellen: ${dagEnDatum(volgende)}</p>`;
  return h + '</div>';
}

/** De notitie bij een nieuwe beltaak: waarom er opnieuw gebeld moet worden. */
export function beltaakNotitie({ uitkomst, naam, notitie }) {
  const u = UITKOMSTEN[uitkomst];
  if (!u) return '';
  const s = brusselsStempel();
  let h = `<p>Vorige poging: ${esc(u.label.toLowerCase())} op ${s.datum} om ${s.uur} (${esc(naam)}).</p>`;
  if (notitie) h += `<p>Ingesproken: ${esc(notitie)}</p>`;
  return h;
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
