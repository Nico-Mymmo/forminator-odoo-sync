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
  heading:   { label: 'Titel boven een reeks blokken' },
  article:   { label: 'Tekstblok' },
  video:     { label: 'Video' },
  link:      { label: 'Link met voorbeeld' },
  linkedin:  { label: 'LinkedIn-post' },
  quote:     { label: 'Citaat of klantverhaal' },
  image:     { label: 'Afbeelding' },
  snippet:   { label: 'Bericht uit Nieuws & updates' },
  statement: { label: 'Stelling', interactive: true },
  question:  { label: 'Korte vraag', interactive: true },
  poll:      { label: 'Jij beslist mee', interactive: true },
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

/**
 * Waar een beeld kan staan, en het kader (breedte in px in de mail, en de
 * verhouding breedte/hoogte als het beeld het kader VULT). EEN bron: de
 * renderer schikt ermee, en het scherm snijdt er de uitsnede mee bij (via
 * /api/bootstrap). Een mailprogramma kan zelf niet bijsnijden (geen
 * object-fit in Gmail/Outlook), dus "vullen" = een eigen, bijgesneden kopie.
 *
 *   rechts / links             naast een alinea, de tekst loopt eromheen
 *   kolom-rechts / kolom-links  een tweede kolom over het hele blok, tot de rand
 *   tekst                      tussen de alinea's, over de hele breedte
 *   video / link               vaste plek in dat soort blok
 *   vol                        een blok "Afbeelding": de hele breedte, rand tot rand
 */
/**
 * EEN blok "Vraag aan de lezer", drie soorten. De soort is de `kind` van het
 * stukje (die sleutels liggen vast: ze staan in de database en bij de
 * antwoorden); wisselen kan in de brief zelf. `titel` = het labeltje boven het
 * blok zolang niemand het wijzigde.
 */
export const VRAAG_SOORTEN = [
  { kind: 'question', label: 'Korte vraag', titel: 'Korte vraag', uitleg: 'Eén vraag, lezers antwoorden met een klik.' },
  { kind: 'statement', label: 'Stelling', titel: 'Stelling', uitleg: 'Eens of oneens? Eén klik volstaat.' },
  { kind: 'poll', label: 'Jij beslist mee', titel: 'Jij beslist mee', uitleg: 'Lezers kiezen tussen een paar opties.' },
];

/** Hoe opvallend een vraag in de brief staat: van klein tot een groot vlak. */
export const VRAAG_STIJLEN = [
  { key: 'subtiel', label: 'Subtiel', uitleg: 'Klein, tussen de tekst door.' },
  { key: 'kaart', label: 'Kaart', uitleg: 'Een licht gekleurd vlak.' },
  { key: 'opvallend', label: 'Opvallend', uitleg: 'Een groot, donker vlak.' },
];

/**
 * De kleuren van een vraag: per merkkleurfamilie een licht vlak, een rand en
 * een sterke kleur (voor het opvallende vlak, de knoppen en de tekst erop).
 * `knop` = de knoppen op het opvallende vlak.
 */
export const VRAAG_KLEUREN = {
  blauw: { label: 'Blauw', licht: '#f0f9ff', rand: '#bae6fd', sterk: '#0369a1', knop: '#99f6e4', knopTekst: '#0369a1' },
  mint: { label: 'Mint', licht: '#f0fdfa', rand: '#99f6e4', sterk: '#0f766e', knop: '#ffffff', knopTekst: '#0f766e' },
  oranje: { label: 'Oranje', licht: '#fff7ed', rand: '#fed7aa', sterk: '#c2410c', knop: '#ffffff', knopTekst: '#c2410c' },
  roze: { label: 'Roze', licht: '#fdf2f8', rand: '#fbcfe8', sterk: '#be185d', knop: '#ffffff', knopTekst: '#be185d' },
  grijs: { label: 'Grijs', licht: '#f9fafb', rand: '#e5e7eb', sterk: '#1f2937', knop: '#ffffff', knopTekst: '#1f2937' },
};

/** Zo stonden de vragen er vóór je kon kiezen: een oude vraag blijft er zo uitzien. */
export const VRAAG_STANDAARD = {
  question: { stijl: 'kaart', kleur: 'oranje' },
  statement: { stijl: 'opvallend', kleur: 'blauw' },
  poll: { stijl: 'opvallend', kleur: 'blauw' },
};

/**
 * Hoe een bericht uit Nieuws & updates in de brief staat. Meerdere vormen,
 * zodat drie artikels na elkaar niet drie keer hetzelfde blok zijn. EEN bron:
 * de renderer kiest ermee, het scherm toont ze (via /api/bootstrap) en de
 * server aanvaardt enkel deze sleutels.
 */
export const BERICHT_VORMEN = [
  { key: 'klassiek', label: 'Klassiek', uitleg: 'Label, titel, tekst en het beeld waar je het zet.' },
  { key: 'kaart', label: 'Kaart', uitleg: 'Een kader met het beeld bovenaan en de bron.' },
  { key: 'uitgelicht', label: 'Uitgelicht', uitleg: 'Een gekleurd vlak met een grote titel en een knop.' },
  { key: 'compact', label: 'Compact', uitleg: 'Een klein beeld naast een korte tekst.' },
  { key: 'citaat', label: 'Citaat', uitleg: 'Een zin uit het artikel in het groot, dan de link.' },
];

/**
 * Kort nieuws: twee of drie kleinere berichten uit Nieuws & updates in één
 * blok. EEN bron voor renderer, scherm en server.
 */
export const NIEUWS_VORMEN = [
  { key: 'kolommen', label: 'Naast elkaar', uitleg: 'Kleine kaartjes met beeld, naast elkaar.' },
  { key: 'lijst', label: 'Lijstje', uitleg: 'Onder elkaar, met een klein beeld.' },
  { key: 'tekst', label: 'Enkel tekst', uitleg: 'Kaders zonder beeld, twee per rij.' },
];
export const NIEUWS_MAX = 3;

export const BEELD_KADERS = {
  rechts: { breedte: 180, verhouding: 1 },
  links: { breedte: 180, verhouding: 1 },
  'kolom-rechts': { breedte: 280, verhouding: 0.8 },
  'kolom-links': { breedte: 280, verhouding: 0.8 },
  tekst: { breedte: 560, verhouding: 16 / 9 },
  video: { breedte: 560, verhouding: 16 / 9 },
  link: { breedte: 558, verhouding: 1.91 },
  compact: { breedte: 150, verhouding: 1 },
  vol: { breedte: 640, verhouding: 16 / 9 },
};

/**
 * De merkkleuren (palet van de huisstijl, aangeleverd door marketing op
 * 2026-10-13), per kleurfamilie van licht naar donker. EEN bron: de
 * kleurkiezer in het scherm krijgt ze via /api/bootstrap, en de server
 * aanvaardt enkel deze kleuren als achtergrond van een blok of van de mail.
 */
export const MERKKLEUREN = [
  { familie: 'Grijs', kleuren: ['#FFFFFF', '#F9FAFB', '#F3F4F6', '#E5E7EB', '#4B5563', '#1F2937'] },
  { familie: 'Blauw', kleuren: ['#F0F9FF', '#E0F2FE', '#BAE6FD', '#0EA5E9', '#0369A1'] },
  { familie: 'Mint', kleuren: ['#F0FDFA', '#99F6E4', '#14B8A6'] },
  { familie: 'Oranje', kleuren: ['#FFF7ED', '#FED7AA', '#F97316'] },
  { familie: 'Roze', kleuren: ['#FDF2F8', '#FBCFE8', '#EC4899'] },
];

const ALLE_MERKKLEUREN = new Set(MERKKLEUREN.flatMap((f) => f.kleuren.map((k) => k.toLowerCase())));

/** Een merkkleur (kleine letters), of '' als het er geen is. */
export function merkkleur(waarde) {
  const k = String(waarde || '').trim().toLowerCase();
  return ALLE_MERKKLEUREN.has(k) ? k : '';
}

/** Donker genoeg om er witte tekst op te zetten? (relatieve helderheid) */
export function isDonker(hex) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(String(hex || ''));
  if (!m) return false;
  const lin = (v) => { const c = parseInt(v, 16) / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(m[1]) + 0.7152 * lin(m[2]) + 0.0722 * lin(m[3]) < 0.3;
}

/** De plekken die je zelf kiest (video en link hebben een vaste plek). */
export const BEELD_PLAATSEN = ['rechts', 'links', 'kolom-rechts', 'kolom-links', 'tekst'];

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
