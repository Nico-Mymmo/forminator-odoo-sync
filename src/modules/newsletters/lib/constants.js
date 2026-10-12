/**
 * Nieuwsbrieven -- vaste waarden. Puur: geen env-toegang behalve in de
 * kleine helpers onderaan die een env-variabele lezen.
 *
 * Ontwerp: docs/ontwerp-om-nieuwsbrieven.md.
 */

export const LOG_PREFIX = '[newsletters]';

export const TABLES = {
  series: 'newsletter_series',
  editions: 'newsletter_editions',
  contributions: 'newsletter_contributions',
  comments: 'newsletter_comments',
  activity: 'newsletter_activity',
  answers: 'newsletter_answers',
};

export const EDITION_STATUS = {
  COLLECTING: 'collecting',
  REVIEW: 'review',
  SCHEDULED: 'scheduled',
  SENT: 'sent',
  CANCELLED: 'cancelled',
};

export const CONTRIBUTION_STATUS = {
  OPEN: 'open',
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  APPROVED: 'approved',
};

/**
 * De soorten stukjes. `auto` = de OM vult het zelf (agenda, inhoudstafel,
 * afsluiting); `interactive` = de lezer kan antwoorden met een klik.
 *
 * De SLEUTELS liggen vast zodra er bijdragen bestaan: ze staan in
 * newsletter_contributions.kind.
 */
export const KINDS = {
  intro:     { label: 'Woordje vooraf' },
  article:   { label: 'Tekst en foto' },
  video:     { label: 'Video' },
  link:      { label: 'Link met voorbeeld' },
  linkedin:  { label: 'LinkedIn-post' },
  quote:     { label: 'Citaat of klantverhaal' },
  statement: { label: 'Stelling', interactive: true },
  question:  { label: 'Korte vraag', interactive: true },
  poll:      { label: 'Peiling', interactive: true },
  events:    { label: 'Agenda (uit Eventbeheer)', auto: true },
  news:      { label: 'Uit het nieuws (Nieuws & updates)' },
  toc:       { label: 'In deze editie', auto: true },
  closing:   { label: 'Afsluiting', auto: true },
};

export const KIND_KEYS = Object.keys(KINDS);

export function isKind(kind) {
  return Object.prototype.hasOwnProperty.call(KINDS, kind);
}

/** Standaardopties per vraagsoort, zodat een nieuwe vraag meteen werkt. */
export const DEFAULT_OPTIONS = {
  statement: [
    { value: 'eens', label: 'Eens' },
    { value: 'twijfel', label: 'Twijfel' },
    { value: 'oneens', label: 'Oneens' },
  ],
  question: [
    { value: 'ja', label: 'Ja' },
    { value: 'nee', label: 'Nee' },
  ],
  poll: [
    { value: 'a', label: 'Optie A' },
    { value: 'b', label: 'Optie B' },
    { value: 'c', label: 'Optie C' },
  ],
};

/**
 * De huisstijl, gemeten op openvme.be en syndicoach.be (2026-10-09). De twee
 * liggen bijna helemaal gelijk; per merk verschillen enkel de omgevingstint,
 * het logo en het linkdomein. Een reeks kan logo en tint overschrijven.
 */
export const BRAND = {
  syndicoach: {
    name: 'Syndicoach',
    site: 'https://syndicoach.be',
    linkHost: 'https://link.syndicoach.be',
    logo: 'https://syndicoach.be/wp-content/uploads/2026/04/syndicoach-logo.png',
    logoWidth: 146,
    logoHeight: 28,
    tint: '#fdf2f8',
  },
  openvme: {
    name: 'OpenVME',
    site: 'https://openvme.be',
    linkHost: 'https://link.openvme.be',
    logo: 'https://openvme.be/wp-content/uploads/2024/05/OpenVME-peppol-ready-1.png',
    logoWidth: 129,
    logoHeight: 34,
    tint: '#f0f9ff',
  },
};

export const STYLE = {
  primary: '#0369a1',
  primaryDark: '#075985',
  mint: '#99f6e4',
  heading: '#030712',
  headingSoft: '#1f2937',
  text: '#4b5563',
  muted: '#6b7280',
  line: '#f3f4f6',
  border: '#e5e7eb',
  sky50: '#f0f9ff',
  sky100: '#e0f2fe',
  sky200: '#bae6fd',
  teal50: '#f0fdfa',
  teal100: '#ccfbf1',
  teal700: '#0f766e',
  pink50: '#fdf2f8',
  pink100: '#fce7f3',
  pink700: '#be185d',
  orange50: '#fff7ed',
  orange200: '#fed7aa',
  orange700: '#c2410c',
  orange800: '#9a3412',
  fontBody: "'Rethink Sans', Helvetica, Arial, sans-serif",
  fontHead: "Gelica, Georgia, 'Times New Roman', serif",
  // Gelica en Rethink Sans komen van de eigen sites. Apple Mail, iOS en
  // Outlook voor Mac tonen ze; Gmail en Outlook voor Windows vallen terug op
  // Georgia / Helvetica. Licentie van Gelica voor mail: nog na te gaan.
  gelicaUrl: 'https://openvme.be/wp-content/uploads/fonts/Gelica-Regular.otf',
  rethinkCss: 'https://fonts.googleapis.com/css2?family=Rethink+Sans:wght@400;600;700&display=swap',
};

/** De merktekeningen ("thingies") in R2, via het publieke /assets/-pad. */
export const ASSET_ORIGIN = 'https://link.openvme.be';

/** Het Studio-veld op mailing.contact met het token voor de antwoordlinks. */
export const TOKEN_FIELD = 'x_studio_om_token';

/** Odoo ir.mail_server 4 = Postmark broadcast (PM-B-newsletter). */
export const BROADCAST_MAIL_SERVER_ID = 4;

/** De Odoo-lijst waar testmails naartoe gaan. Bevat ENKEL de testadressen. */
export const TEST_LIST_NAME = 'OM nieuwsbrief - testadressen';

/** Hoe lang een antwoord rijpt voor het naar de koppeling gaat. */
export const ANSWER_SETTLE_MS = 10 * 60 * 1000;

const EMAIL_RE = /^[^\s@<>"']+@[^\s@<>"']+\.[a-z]{2,}$/i;

/**
 * 'live' enkel als NEWSLETTER_SEND_MODE exact 'live' is. Alles anders -- ook
 * een ontbrekende variabele -- is 'test': dan kan de OM uitsluitend naar de
 * testadressen versturen. Een deploy op zich kan dus nooit een nieuwsbrief
 * naar klanten sturen.
 */
export function sendMode(env) {
  return String(env?.NEWSLETTER_SEND_MODE || '').trim() === 'live' ? 'live' : 'test';
}

/** De testadressen uit NEWSLETTER_TEST_EMAILS (kommagescheiden). */
export function testEmails(env) {
  return String(env?.NEWSLETTER_TEST_EMAILS || '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => EMAIL_RE.test(s));
}

export function isEmail(value) {
  return EMAIL_RE.test(String(value || '').trim());
}

/** Waar de OM zelf bereikbaar is, voor links in meldingen. */
export function appOrigin(env) {
  return String(env?.APP_BASE_URL || '').replace(/\/+$/, '');
}
