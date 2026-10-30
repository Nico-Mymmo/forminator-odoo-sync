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
  opgenomen: { soort: 'contact', label: 'Opgenomen', icoon: '✅', chatter: 'Oproep: opgenomen' },
  ingesproken: { soort: 'poging', label: 'Ingesproken', icoon: '🎙️', chatter: 'Oproep: voicemail ingesproken' },
  niets: { soort: 'poging', label: 'Niets ingesproken', icoon: '🔇', chatter: 'Oproep: geen antwoord, niets ingesproken' },
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

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
