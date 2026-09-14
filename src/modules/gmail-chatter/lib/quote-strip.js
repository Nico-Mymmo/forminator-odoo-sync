/**
 * Gmail → chatter — de geciteerde staart eruit halen.
 *
 * Zonder dit staat er onder élk antwoord de volledige voorgeschiedenis: de
 * vorige mail, de mail daarvoor, en bij Outlook een blok met From/Sent/To/
 * Subject erboven. In een chatter die al chronologisch is, is dat pure ruis —
 * je leest hetzelfde gesprek dan vijf keer.
 *
 * TWEE LAGEN, EN DAT IS BEWUST:
 *
 * 1. Een STRING-KNIP op markers waarna alles citaat is. Dat is de enige manier
 *    om Outlook aan te pakken: die zet de voorgeschiedenis niet in een element
 *    maar als BROERTJES ná een scheidingsteken, en "alles na dit punt" kan je
 *    met een elementfilter niet uitdrukken.
 *
 * 2. HTMLRewriter voor de bekende citaat-ELEMENTEN (Gmail's `.gmail_quote`,
 *    Apple/Thunderbird's `<blockquote type="cite">`). Dat is Cloudflare's eigen
 *    HTML-parser; veiliger dan een reguliere expressie op genest HTML, want
 *    een blockquote in een blockquote laat zich niet met een regex matchen.
 *
 * WAT ER BLIJFT STAAN: de handtekening van de afzender. Die hoort bij het
 * bericht zoals de ontvanger het kreeg, en wegknippen op `-- ` haalt ook
 * gewone tekst weg die toevallig zo begint.
 */

/**
 * Markers waarna ALLES citaat is. Hoofdletterongevoelig toegepast.
 *
 * De datumregels staan er in de talen die hier langskomen; een Franstalige
 * klant van OpenACP zou `Le … a écrit :` sturen, vandaar die er ook bij staat.
 */
const KNIP_MARKERS = [
  // Outlook (web en desktop)
  '<div id="appendonsend">',
  '<div id="divrplyfwdmsg"',
  '<hr tabindex="-1"',
  '-----original message-----',
  '-----oorspronkelijk bericht-----',
  '________________________________',
  // Thunderbird
  '<div class="moz-cite-prefix">',
  // Gmail-containers (vangnet naast HTMLRewriter)
  '<div class="gmail_quote',
  '<blockquote class="gmail_quote'
];

/** Regels als "Op 14 september 2026 om 10:12 schreef Jan <jan@x.be>:" */
const CITAATREGELS = [
  /op\s+.{0,80}?\s+schreef\s+.{0,120}?:/i,
  /on\s+.{0,80}?\s+wrote:/i,
  /le\s+.{0,80}?\s+a\s+écrit\s*:/i,
  /am\s+.{0,80}?\s+schrieb\s+.{0,120}?:/i
];

/**
 * Alles vanaf de eerste marker weghalen.
 *
 * Er wordt op een KLEINGESCHREVEN kopie gezocht maar op het ORIGINEEL geknipt,
 * zodat de tekst zelf onaangeroerd blijft.
 */
function knipOpMarkers(html) {
  const laag = html.toLowerCase();
  let knip = -1;

  for (const marker of KNIP_MARKERS) {
    const i = laag.indexOf(marker);
    if (i !== -1 && (knip === -1 || i < knip)) knip = i;
  }
  for (const patroon of CITAATREGELS) {
    const m = patroon.exec(html);
    if (m && (knip === -1 || m.index < knip)) knip = m.index;
  }

  return knip === -1 ? html : html.slice(0, knip);
}

/**
 * De citaat-elementen verwijderen met HTMLRewriter.
 *
 * Draait alleen in een Worker-omgeving. Is HTMLRewriter er niet (bv. bij een
 * los scriptje), dan geven we de invoer ongewijzigd terug in plaats van te
 * gooien — de string-knip hierboven heeft het grootste deel dan al gedaan.
 */
async function verwijderCitaatElementen(html) {
  if (typeof HTMLRewriter === 'undefined') return html;

  const selectors = [
    'blockquote[type="cite"]',
    '.gmail_quote',
    '.gmail_quote_container',
    '.moz-cite-prefix',
    '#appendonsend',
    '#divRplyFwdMsg'
  ];

  let rewriter = new HTMLRewriter();
  for (const sel of selectors) {
    rewriter = rewriter.on(sel, { element(el) { el.remove(); } });
  }
  return rewriter.transform(new Response(html)).text();
}

/**
 * De HTML van een ontvangen mail terugbrengen tot wat er écht nieuw in staat.
 *
 * @param {string} html
 * @returns {Promise<string>}
 */
export async function stripQuotedHtml(html) {
  if (!html) return '';
  const geknipt = knipOpMarkers(String(html));
  const opgekuist = await verwijderCitaatElementen(geknipt);
  return opgekuist.trim();
}

/**
 * Dezelfde behandeling voor platte tekst, als er geen HTML-versie is.
 *
 * Hier komt er één regel bij die in HTML niet bestaat: `>`-citaatregels. Die
 * worden pas weggehaald vanaf het punt waar ze aaneengesloten beginnen, zodat
 * een losse `>` middenin een zin niet de rest van het bericht opeet.
 */
export function stripQuotedText(text) {
  if (!text) return '';
  let uit = knipOpMarkers(String(text));

  const regels = uit.split(/\r?\n/);
  let eerste = -1;
  for (let i = 0; i < regels.length; i++) {
    if (/^\s*>/.test(regels[i])) {
      if (eerste === -1) eerste = i;
    } else if (regels[i].trim() !== '') {
      eerste = -1; // gewone tekst erna: het was geen citaatblok
    }
  }
  if (eerste !== -1) uit = regels.slice(0, eerste).join('\n');

  return uit.trim();
}

/**
 * Platte tekst naar eenvoudige HTML, voor mails zonder HTML-versie.
 * Bewust minimaal: escapen en regeleindes omzetten, verder niets.
 */
export function textToHtml(text) {
  const veilig = String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return veilig
    .split(/\n{2,}/)
    .map(blok => `<p>${blok.replace(/\n/g, '<br>')}</p>`)
    .join('');
}
