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

/** De marge tussen alinea's. Eén plek, zodat elke alinea er hetzelfde uitziet. */
const ALINEA_STIJL = 'margin:0 0 1em;';

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
 * De witruimte gelijktrekken, ongeacht waar de HTML uit komt.
 *
 * Twee dingen gingen hier mis in de eerste versie, en samen gaven ze dubbel
 * zoveel ruimte als je in de editor zag:
 *
 * 1. LEGE ALINEA'S. Wie in de editor twee keer Enter drukt, krijgt van Quill
 *    een `<p><br></p>`. Dat is geen inhoud maar ruimte, en bovenop de marge
 *    van de volgende alinea wordt dat een gat van twee regels. Ze gaan eruit;
 *    de afstand tussen alinea's komt van de marge, niet van lege elementen.
 *
 * 2. GEEN EIGEN MARGE. Een `<p>` zonder stijl krijgt de standaard van de
 *    mailclient (1em boven EN onder), en die verschilt per client. Elke
 *    alinea krijgt hier dezelfde marge, zodat wat je typt is wat er vertrekt.
 *
 * @param {string} html @returns {string}
 */
function normaliseerWitruimte(html) {
  return String(html)
    // Lege alinea's en lege divs -- ook met &nbsp; of meerdere <br> erin.
    .replace(/<(p|div)\b[^>]*>(?:\s|&nbsp;|<br\s*\/?>)*<\/\1>/gi, '')
    // Een <p> of <div> zonder eigen style krijgt de onze.
    .replace(/<(p|div)(\s(?![^>]*\bstyle=)[^>]*)?>/gi, function (_, tag, rest) {
      return '<' + tag + (rest || '') + ' style="' + ALINEA_STIJL + '">';
    })
    // Elke link zonder eigen stijl krijgt de onze.
    .replace(/<a(\s(?![^>]*\bstyle=)[^>]*)?>/gi, function (_, rest) {
      return '<a' + (rest || '') + ' style="' + LINK_STIJL + '">';
    })
    // Meer dan twee <br> op een rij is ook iemand die op Enter bleef duwen.
    .replace(/(<br\s*\/?>\s*){3,}/gi, '<br><br>')
    .trim();
}

/**
 * Kale tekst met witregels omzetten naar alinea's.
 *
 * Zo mag iemand in de editor gewoon typen met enters, zonder dat er HTML aan
 * te pas komt. Staat er al blok-HTML in, dan blijft die ongemoeid -- dan
 * heeft de editor het al gestructureerd.
 *
 * @param {string} tekst @returns {string}
 */
function alsAlineas(tekst) {
  if (heeftBlokHtml(tekst)) return tekst;
  return String(tekst)
    .trim()
    .split(/\n{2,}/)
    .map((deel) => `<p style="${ALINEA_STIJL}">${deel.trim().replace(/\n/g, '<br>')}</p>`)
    .join('');
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
