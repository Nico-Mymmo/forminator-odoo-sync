/**
 * Platte tekstmail → HTML.
 *
 * Pure module: geen I/O, geen env.
 *
 * WAAROM DIT NAAST render-blocks.js STAAT
 * ---------------------------------------
 * `render-blocks.js` maakt een OPGEMAAKTE mail: lichtblauwe achtergrond,
 * witte kaarten van 720px, een full-bleed hero, knoppen in de huisstijl. Dat
 * is de juiste vorm voor een eventbevestiging of een nieuwsbrief.
 *
 * Het is de verkeerde vorm voor een mail die persoonlijk moet lezen. Iemand
 * die net een aanvraag deed en een antwoord krijgt met een hero-banner en een
 * gestileerde knop, ziet een mailing -- ongeacht welke woorden erin staan, en
 * ongeacht via welke stream hij verstuurd is. Vandaar deze tweede renderer,
 * en vandaar dat `mail_layout` op `plain` STAAT als standaard.
 *
 * WAT HIER BEWUST NIET IN ZIT
 * ---------------------------
 * Geen tabellen, geen achtergrondkleur, geen kaart, geen `max-width`, geen
 * hero, geen logo, geen knoppen, geen voettekst, geen preheader. Er is één
 * omhullende `<div>` met een lettertype, en daarbinnen alinea's. Dat
 * omhulsel is de enige toegeving: zonder font-family rendert Outlook op
 * Windows onopgemaakte HTML in Times New Roman, wat er niet plat uitziet maar
 * verwaarloosd.
 *
 * Voeg hier NOOIT layout aan toe "omdat het net iets mooier kan". De hele
 * bestaansreden van dit bestand is dat het niets doet. Wie opmaak wil, zet
 * `mail_layout` op `blocks`.
 *
 * ÉÉN ONVERMIJDELIJKE AFBEELDING. Open tracking van Postmark werkt met een
 * onzichtbare 1x1-pixel, die Postmark zelf bij het verzenden toevoegt. Dat
 * staat los van deze renderer, maar het is de reden dat "helemaal geen
 * afbeeldingen" niet samengaat met "ik wil open rates zien".
 */

import { fillPlaceholders, tokenizeToChips, esc } from './render-blocks.js';

/**
 * Het enige opmaak-besluit in dit bestand.
 *
 * Arial/Helvetica in plaats van een systeem-stack: die laatste geeft per
 * platform een ander lettertype, en bij een mail die van een persoon lijkt te
 * komen is voorspelbaarheid meer waard dan finesse. 14px met regelafstand
 * 1.6 is wat een gewone mailclient zelf ongeveer doet.
 */
const PLAIN_STYLE =
  'font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#222222;';

/** Bevat de tekst al blok-HTML, of is het kale tekst met witregels? */
function heeftBlokHtml(tekst) {
  return /<(p|div|br|ul|ol|blockquote|h[1-6])\b/i.test(tekst);
}

/**
 * De marge van een alinea: NUL.
 *
 * DE COPY GAAT EXACT MEE, DE LAYOUT NIET. In de editor is elke Enter een
 * nieuwe `<p>` en staat die regel direct onder de vorige; een witregel is een
 * lege `<p><br></p>`. Gaf elke alinea een marge (dat was `margin:0 0 1em`),
 * dan kreeg elke Enter in de mail een witregel die niemand typte, en waren
 * een Enter en een witregel niet meer van elkaar te onderscheiden. Met marge
 * nul is een `<p>` een regel en een lege `<p>` een witregel -- precies wat je
 * typte. De stijl staat er expliciet, want zonder zet elke mailclient zijn
 * eigen marge rond een `<p>`.
 */
const ALINEA_STIJL = 'margin:0;';

/**
 * Hoe een link eruitziet.
 *
 * Expliciet, niet overgelaten aan de mailclient. Outlook op Windows geeft een
 * `<a>` zonder stijl gewoon de tekstkleur, en dan staat er midden in je mail
 * een zin waarvan niemand ziet dat je erop kan klikken. Blauw met een
 * onderstreping is bovendien wat mensen als link herkennen -- een knop zou
 * hier verkeerd zijn, want dit is geen mailing.
 */
const LINK_STIJL = 'color:#2563eb;text-decoration:underline;';

/**
 * De tekst van de editor omzetten naar HTML die in ELKE mailclient hetzelfde
 * leest als in de editor. Er wordt NIETS weggelaten of samengevoegd: geen
 * lege regels eruit, geen reeksen enters ingekort, geen spaties samengetrokken.
 *
 * - LEGE ALINEA'S blijven staan; ze zijn een witregel. Een helemaal lege
 *   `<p></p>` krijgt een `<br>`, anders heeft ze geen hoogte en verdwijnt de
 *   witregel alsnog.
 * - REGELEINDES IN DE TEKST worden `<br>`. De editor toont ze als nieuwe regel
 *   (Quill bewaart geplakte tekst soms met echte regeleindes binnen een `<p>`),
 *   een mailclient maakt er een spatie van: "Hoi , Bedankt voor je aanvraag".
 *   Alleen witruimte TUSSEN twee blokken (`</p>\n<p>`) is opmaak van de bron
 *   en valt weg.
 * - MEERDERE SPATIES blijven meerdere spaties (`&nbsp;`); HTML trekt ze
 *   anders samen tot een.
 *
 * Tags en attributen worden niet aangeraakt: enkel de TEKST tussen tags.
 *
 * @param {string} html @returns {string}
 */
function normaliseerWitruimte(html) {
  const delen = String(html).replace(/\r\n?/g, '\n').split(/(<[^>]*>)/);
  const isTag = (s) => typeof s === 'string' && s.charAt(0) === '<';
  const isSluitBlok = (s) => /^<\/(p|div|ul|ol|li|blockquote|h[1-6])\b/i.test(s || '');
  const isOpenBlok = (s) => /^<(p|div|ul|ol|li|blockquote|h[1-6])\b/i.test(s || '');

  const uit = delen.map((deel, i) => {
    if (deel === '' || isTag(deel)) return deel;
    const vorige = delen[i - 1];
    const volgende = delen[i + 1];
    if (/^\s*$/.test(deel) && (isSluitBlok(vorige) || isOpenBlok(volgende) && !isOpenBlok(vorige))) {
      return '';
    }
    return deel
      .replace(/\n/g, '<br>')
      .replace(/ {2,}/g, (reeks) => ' ' + '&nbsp;'.repeat(reeks.length - 1));
  }).join('');

  return uit
    // Een ECHT lege alinea (ook met enkel spaties of &nbsp;) krijgt een <br>.
    .replace(/<(p|div)(\b[^>]*)>(?:\s|&nbsp;)*<\/\1>/gi, '<$1$2><br></$1>')
    // Een <p> of <div> zonder eigen style krijgt de onze.
    .replace(/<(p|div)(\s(?![^>]*\bstyle=)[^>]*)?>/gi, function (_, tag, rest) {
      return '<' + tag + (rest || '') + ' style="' + ALINEA_STIJL + '">';
    })
    // Elke link zonder eigen stijl krijgt de onze.
    .replace(/<a(\s(?![^>]*\bstyle=)[^>]*)?>/gi, function (_, rest) {
      return '<a' + (rest || '') + ' style="' + LINK_STIJL + '">';
    })
    .trim();
}

/**
 * Kale tekst (zonder blok-HTML) in EEN alinea zetten. De regeleindes worden
 * daarna door normaliseerWitruimte() elk een `<br>`, dus een witregel blijft
 * een witregel. Staat er al blok-HTML in, dan blijft die ongemoeid.
 *
 * @param {string} tekst @returns {string}
 */
function alsAlineas(tekst) {
  if (heeftBlokHtml(tekst)) return tekst;
  return `<p>${String(tekst).replace(/^\s*\n|\n\s*$/g, '')}</p>`;
}

/**
 * Een platte tekstmail renderen.
 *
 * De tekst wordt NIET ge-escapet: hij komt uit onze eigen editor, net als
 * `block.html` in het TEXT-blok van de blokkenrenderer. Placeholders worden
 * ingevuld bij het versturen en als chip getoond in de editor -- exact
 * hetzelfde contract als daar, zodat één klik in het voorbeeld nooit een
 * placeholder stilletjes door zijn waarde vervangt.
 *
 * @param {Object} options
 * @param {string} options.html - de tekst, met {{placeholder}}-tokens
 * @param {Object} options.context - placeholderwaarden
 * @param {boolean} [options.editable] - chips i.p.v. ingevulde waarden
 * @param {Object<string,string>} [options.tokenLabels] - leesbare namen voor de chips
 * @returns {string} lege string als er niets te tonen valt
 */
export function renderPlainMailHtml({ html, context, editable = false, tokenLabels = {} }) {
  const ruw = String(html || '');
  if (ruw.trim() === '') return '';

  const inhoud = editable
    ? tokenizeToChips(normaliseerWitruimte(alsAlineas(ruw)), tokenLabels)
    : normaliseerWitruimte(alsAlineas(fillPlaceholders(ruw, context)));

  if (inhoud.trim() === '') return '';

  const mark = editable ? ' data-om-edit="body"' : '';
  return `<div dir="ltr"${mark} style="${PLAIN_STYLE}">${inhoud}</div>`;
}

/**
 * Onderwerp van een platte mail.
 *
 * Zelfde regel als bij de blokkenmail: nooit HTML, want een `<` komt
 * letterlijk in de inbox terecht. Staat hier apart zodat een aanroeper voor
 * een plain-mail niets uit render-blocks.js hoeft te halen.
 *
 * @param {string} subject @param {Object} context @returns {string}
 */
export function renderPlainSubject(subject, context) {
  return fillPlaceholders(String(subject || ''), context).replace(/\s+/g, ' ').trim();
}

/**
 * Zit er opmaak in die niet in een platte mail hoort?
 *
 * Bedoeld als CONTROLE bij het opslaan van een stap, niet als opschoning: wie
 * per ongeluk een tabel of een afbeelding in de tekst plakt, hoort dat te
 * horen in plaats van het stil verwijderd te zien. Geeft de gevonden tags
 * terug; een lege lijst is goed.
 *
 * @param {string} html @returns {string[]}
 */
export function nietPlatteOpmaak(html) {
  const verboden = ['table', 'img', 'iframe', 'style', 'font', 'center'];
  const tekst = String(html || '');
  return verboden.filter((tag) => new RegExp('<' + tag + '\\b', 'i').test(tekst));
}

export { esc };
