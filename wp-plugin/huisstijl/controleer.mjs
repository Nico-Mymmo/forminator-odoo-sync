#!/usr/bin/env node
/**
 * DE HUISSTIJLCONTROLE van Mymmo Componenten (wp-plugin/mymmo-cards).
 *
 *   node wp-plugin/huisstijl/controleer.mjs                  controleren
 *   node wp-plugin/huisstijl/controleer.mjs --stempel "..."   na de review: stempel zetten
 *   node wp-plugin/huisstijl/controleer.mjs --bouw            controle + review verplicht
 *   node wp-plugin/huisstijl/controleer.mjs --afdruk [ref]    enkel de vingerafdruk van de code
 *                                                             (van de werkboom, of van een tag/commit)
 *   --offline                                                 thingies niet online nakijken
 *
 * Wie geen Node heeft, zet de stempel met `bash wp-plugin/huisstijl/stempel.sh
 * "..."` (enkel git nodig); de controle zelf draait dan op GitHub na het pushen.
 *
 * WAAROM DIT BESTAAT: een component kan op zich goed ogen en toch uit de toon
 * vallen naast de rest van de pagina -- een eigen grijs, een andere afronding,
 * een iets zwaardere schaduw, een breekpunt dat net anders ligt. Dat zie je pas
 * op de site, en dan moet iemand het tegenhouden. Dat iemand is deze controle:
 * het bouwscript maakt geen zip zolang ze niet groen is, en GitHub laat niets
 * samenvoegen dat rood is.
 *
 * DE REGELS staan hieronder in REGELS, met wat ze controleren, waarom, en wat
 * je in de plaats doet. Het regelboek (wp-plugin/mymmo-cards/CLAUDE.md) zegt
 * hetzelfde in mensentaal. Een regel aanscherpen = een regel erbij hier, of een
 * waarschuwing die een fout wordt.
 *
 * UITZONDERINGEN staan in uitzonderingen.json, elk met een reden. Die lijst mag
 * alleen korter worden: een uitzondering die niets meer vindt, is zelf een fout.
 *
 * DE REVIEW: een lint ziet niet of iets "strak" zit. Daarvoor is er de stap
 * /huisstijl-review in Claude Code; die zet na een goede review een stempel
 * (wp-plugin/mymmo-cards.review.json) met een vingerafdruk van precies deze
 * code. `--bouw` weigert zolang die vingerafdruk niet klopt -- wie na de review
 * nog iets wijzigt, moet er opnieuw door.
 *
 * DE VINGERAFDRUK komt uit GIT, niet uit de bestanden op schijf: de blob-id's
 * van de codebestanden zoals git ze zou bewaren. Zo is ze op Windows, op een
 * Mac en op GitHub dezelfde (regeleindes worden door .gitattributes gelijk
 * getrokken), en kan stempel.sh ze met enkel git uitrekenen. Wie geen
 * ontwikkelaar is, heeft geen Node; tot 2026-10-09 kon zo iemand daardoor geen
 * stempel zetten, en dus niets op de site krijgen.
 *
 * Dit bestand staat onder CODEOWNERS: wijzigen enkel met goedkeuring van Nico.
 * Pas het nooit aan om een fout groen te krijgen -- pas het component aan.
 *
 * Geen afhankelijkheden: enkel Node (18+).
 */

import { readFileSync, readdirSync, statSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { execSync, execFileSync } from 'node:child_process';

const HIER = dirname(fileURLToPath(import.meta.url));
const WORTEL = join(HIER, '..', '..');
const PLUGIN = join(WORTEL, 'wp-plugin', 'mymmo-cards');
const UITZONDERINGEN = join(HIER, 'uitzonderingen.json');
const REVIEW = join(WORTEL, 'wp-plugin', 'mymmo-cards.review.json');

const MERK = 'https://link.openvme.be/assets/brand/';
const HUISSTIJL_CSS = 'assets/css/mymmo-huisstijl.css';
/** Editorscripts van voor de naamregel "*-editor.js". Nieuwe: naam eindigt op -editor.js. */
const EXTRA_EDITOR_JS = new Set(['assets/js/mymmo-markering.js']);

/** De vier breekpunten. Telefoon = smaller dan 640, smal = tot en met 781 (de grens van WordPress). */
const BREEKPUNTEN = new Set([
  '(max-width: 639.98px)',
  '(min-width: 640px)',
  '(max-width: 781px)',
  '(min-width: 782px)',
]);
const ANDERE_MEDIA = new Set([
  '(prefers-reduced-motion: reduce)',
  '(prefers-reduced-motion: no-preference)',
  '(hover: hover)',
  '(hover: none)',
  '(pointer: coarse)',
  '(pointer: fine)',
]);

const ELEMENTEN = new Set([
  'a', 'button', 'input', 'select', 'textarea', 'label', 'ul', 'ol', 'li', 'dl', 'dt', 'dd',
  'img', 'picture', 'figure', 'figcaption', 'video', 'iframe', 'svg', 'path', 'p',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'table', 'tr', 'td', 'th', 'span',
  'strong', 'em', 'hr', 'form', 'legend', 'fieldset', 'details', 'summary', 'nav',
  'section', 'article', 'header', 'footer', 'aside', 'main', 'mark',
]);

const KLEURNAMEN = /\b(white|black|red|green|blue|yellow|orange|purple|pink|gray|grey|silver|maroon|navy|teal|olive|lime|aqua|fuchsia|brown|gold|beige|ivory|khaki|coral|salmon|tomato|crimson|indigo|violet|magenta|cyan|turquoise)\b/i;
const KLEUR_EIGENSCHAP = /^(color|background|background-color|border(-(top|right|bottom|left))?(-color)?|outline(-color)?|fill|stroke|box-shadow|text-shadow|text-decoration-color|caret-color|accent-color|column-rule(-color)?)$/;
const TYPOGRAFIE = new Set([
  'font', 'font-family', 'font-size', 'font-weight', 'font-style', 'font-variant',
  'line-height', 'letter-spacing', 'text-transform', 'word-spacing',
]);

// ─────────────────────────────────────────────────────────────────────────────
// De regels
// ─────────────────────────────────────────────────────────────────────────────

const REGELS = {
  H01: {
    naam: 'kleur', niveau: 'fout',
    oplossing: 'Een kleur komt uit de huisstijl (var(--mymmo-kleur-...)) of uit het palet van het thema (var(--wp--preset--color--...)) -- nooit letterlijk, ook niet als terugval in een var(). Mist er een rol? Vraag ze aan, zet ze niet zelf in je component.',
  },
  H02: {
    naam: 'typografie', niveau: 'fout',
    oplossing: 'Geen lettertype, -grootte, -dikte, regelhoogte of letterafstand in een component: de inhoud bestaat uit gewone kop- en alineablokken en die volgen het thema. Enkel `inherit` of var(--wp--preset--font-...) mag.',
  },
  H03: {
    naam: 'afronding', niveau: 'fout',
    oplossing: 'Een afronding komt uit de huisstijl: var(--mymmo-afronding-m) (beeld), var(--mymmo-afronding-l) (vlak), var(--mymmo-afronding-rond) of 0.',
  },
  H04: {
    naam: 'schaduw', niveau: 'fout',
    oplossing: 'Een schaduw is var(--mymmo-schaduw-1) of none. Een ander niveau is een vraag aan de huisstijl.',
  },
  H05: {
    naam: 'randdikte', niveau: 'fout',
    oplossing: 'Een rand is var(--mymmo-rand) dik (of 0); een focusring is var(--mymmo-focus).',
  },
  H06: {
    naam: 'breekpunt', niveau: 'fout',
    oplossing: 'Er zijn vier breekpunten: (max-width: 639.98px), (min-width: 640px), (max-width: 781px) en (min-width: 782px). Zo slaat elk component op hetzelfde moment om als de kaarten en de keien ernaast.',
  },
  H07: {
    naam: '!important', niveau: 'fout',
    oplossing: 'Geen !important. Wint het thema van je regel, zet er een tweede klasse bij (.mymmo-x .mymmo-y), zodat wie het bewust anders wil, nog kan winnen.',
  },
  H08: {
    naam: 'bron van buiten', niveau: 'fout',
    oplossing: 'Geen @import, geen @font-face, geen lettertypes van Google, en beelden enkel uit de Asset Manager (' + MERK + ') of de mediabibliotheek.',
  },
  H09: {
    naam: 'schuifbalk', niveau: 'fout',
    oplossing: 'Geen overflow: auto/scroll in een component -- een schuifbalk in een kaart of een venster leest als een fout. Past iets niet, dan is dat een vraag over de indeling. `hidden` of `clip` mag.',
  },
  H10: {
    naam: 'referentiekader', niveau: 'fout',
    oplossing: 'Geen container-type of contain: die maken van het element het kader voor position:fixed, en dan zit het venster van Mymmo Forms erin gevangen (zie de uitleg in mymmo-cards.css). Gebruik een media query op een van de vier breekpunten.',
  },
  H11: {
    naam: 'selector', niveau: 'fout',
    oplossing: 'Elke selector draagt een klasse die met .mymmo- begint, en een regel die een element raakt (img, ul, button, ...) heeft er twee: .mymmo-x .mymmo-y img. Een blokthema drukt zijn stijlen na de onze af en wint anders.',
  },
  H12: {
    naam: '100vw', niveau: 'fout',
    oplossing: '100vw telt de schuifbalk mee en geeft een horizontale schuifbalk over de hele pagina. Gebruik 100% of min(..., calc(100vw - 40px)) zoals de callout van Mymmo Forms.',
  },
  H13: {
    naam: 'telefoon', niveau: 'fout',
    oplossing: 'Een stylesheet met een indeling (flex of grid) heeft een eigen regel voor een telefoon: @media (max-width: 639.98px) of (min-width: 640px). Een telefoon is een eigen indeling, geen afgeleide.',
  },
  H14: {
    naam: 'beweging', niveau: 'fout',
    oplossing: 'Wat beweegt, staat stil voor wie beweging afwijst: in CSS een @media (prefers-reduced-motion: reduce), in een script matchMedia("(prefers-reduced-motion: reduce)").',
  },
  H15: {
    naam: 'ruimte', niveau: 'waarschuwing',
    oplossing: 'Opvulling en tussenruimte bij voorkeur uit de huisstijl (var(--mymmo-ruimte-krap/normaal/ruim)) of als variabele die het blok instelt, niet als los getal.',
  },
  H16: {
    naam: 'vaste hoogte', niveau: 'waarschuwing',
    oplossing: 'Geen vaste hoogte voor iets groots: op een laag scherm of in een venster geeft dat een schuifbalk. Laat de inhoud de hoogte bepalen, of gebruik een verhouding (aspect-ratio).',
  },
  H17: {
    naam: 'huisstijlwaarde', niveau: 'fout',
    oplossing: 'Een --mymmo-...-variabele wordt alleen in ' + HUISSTIJL_CSS + ' gemaakt, en je gebruikt enkel wat daar bestaat. Een nieuwe waarde is een vraag aan de huisstijl.',
  },
  H18: {
    naam: 'afhankelijkheid', niveau: 'fout',
    oplossing: 'Elke stylesheet voor de pagina hangt af van de huisstijl: wp_register_style(..., [Mymmo_Cards_Huisstijl::HANDLE], ...). Anders bestaan de variabelen niet op een pagina waar alleen jouw component staat.',
  },
  H20: {
    naam: 'inline stijl', niveau: 'fout',
    oplossing: 'In een style-attribuut staan enkel CSS-variabelen (--mk-...) en een background-image. Wat je instelt, gaat als variabele mee; de CSS beslist wat ermee gebeurt -- dan kan een telefoon het nog overschrijven.',
  },
  H21: {
    naam: 'svg', niveau: 'fout',
    oplossing: 'Geen inline SVG op de pagina, en nooit <use> of <defs>: op syndicoach.be kwam de markup daarna beschadigd aan. Een icoon is een thingy (mymmo_cards_thingies()), een glyph teken je met CSS.',
  },
  H22: {
    naam: 'icoon', niveau: 'fout',
    oplossing: 'Een icoon op de site is een thingy uit de Asset Manager (mymmo_cards_thingies()). Geen Dashicons, Font Awesome, Lucide of ander icoonlettertype op de pagina.',
  },
  H23: {
    naam: 'thingy', niveau: 'fout',
    oplossing: 'Dit bestand staat niet in de Asset Manager (brand/thingies/). Kijk de spelling na (vuilniishok heeft een dubbele i) of laat het eerst in de Asset Manager zetten.',
  },
  H30: {
    naam: 'categorie', niveau: 'fout',
    oplossing: "Elk blok staat in de categorie van de huisstijl: category: 'mymmo'. Zo vindt een redacteur alle Mymmo-componenten op één plek in de inserter.",
  },
  H31: {
    naam: 'blokinstellingen', niveau: 'fout',
    oplossing: 'Geen color, typography, spacing, border, shadow of dimensions in supports: dat geeft een vrije kleur, maat of afronding in de zijbalk. Wat instelbaar moet zijn, wordt een keuze uit een gesloten lijst.',
  },
  H32: {
    naam: 'inserter-icoon', niveau: 'fout',
    oplossing: "Het icoon in de inserter is een Dashicon (icon: 'index-card'), zoals bij de andere Mymmo-blokken.",
  },
  H33: {
    naam: 'vrije kiezer', niveau: 'fout',
    oplossing: 'Geen vrije kleur-, lettertype-, rand- of maatkiezer in de zijbalk. Een kleur kies je met ColorPalette uit het palet van het thema, met disableCustomColors: true.',
  },
  H34: {
    naam: 'vrije waarde', niveau: 'fout',
    oplossing: 'Een afronding, randdikte, schaduw, kleur of letter is geen schuifbalk of tekstveld maar een keuze uit de huisstijl (SelectControl met de waarden van de huisstijl).',
  },
  H40: {
    naam: 'versie', niveau: 'fout',
    oplossing: 'Het versienummer staat twee keer in mymmo-cards.php (docblock en MYMMO_CARDS_VERSION) en heeft een eigen **X.Y.Z**-sectie in README.md, met wat er veranderde en waarom.',
  },
  U01: {
    naam: 'uitzondering', niveau: 'fout',
    oplossing: 'Deze uitzondering vindt minder dan ze zegt: verlaag haar `aantal` of haal ze weg uit wp-plugin/huisstijl/uitzonderingen.json. De lijst wordt alleen korter.',
  },
  R01: {
    naam: 'review', niveau: 'fout',
    oplossing: 'Doe de review (/huisstijl-review in Claude Code) en zet daarna de stempel: bash wp-plugin/huisstijl/stempel.sh "wat er nagekeken is". Wie daarna nog iets wijzigt, moet er opnieuw door.',
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Bestanden
// ─────────────────────────────────────────────────────────────────────────────

function lijstBestanden(map) {
  const uit = [];
  for (const naam of readdirSync(map)) {
    const vol = join(map, naam);
    if (statSync(vol).isDirectory()) {
      uit.push(...lijstBestanden(vol));
    } else {
      uit.push(vol);
    }
  }
  return uit;
}

function rel(vol) {
  return relative(PLUGIN, vol).split('\\').join('/');
}

function lees(vol) {
  return readFileSync(vol, 'utf8').replace(/\r\n?/g, '\n');
}

function soortVan(pad) {
  if (pad.endsWith('.css')) {
    if (pad === HUISSTIJL_CSS) return 'huisstijl';
    return pad.endsWith('-editor.css') ? 'css-editor' : 'css';
  }
  if (pad.endsWith('.js')) {
    return pad.endsWith('-editor.js') || EXTRA_EDITOR_JS.has(pad) ? 'js-editor' : 'js';
  }
  if (pad.endsWith('.php')) return 'php';
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Code ontleden: commentaar en tekst uit elkaar houden
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Twee versies van dezelfde code, even lang (zodat posities en regelnummers
 * blijven kloppen):
 *   - code:   commentaar weg (vervangen door spaties)
 *   - skelet: commentaar EN de inhoud van tekst weg -- voor de structuur
 * plus de lijst tekstwaarden met hun positie.
 */
function ontleed(tekst, taal) {
  const n = tekst.length;
  const code = tekst.split('');
  const skelet = tekst.split('');
  const teksten = [];
  let i = 0;
  let vorige = ''; // laatste betekenisvolle teken in de code, voor regex-literals

  const wis = (doel, van, tot) => {
    for (let k = van; k < tot; k++) {
      if (doel[k] !== '\n') doel[k] = ' ';
    }
  };

  while (i < n) {
    const c = tekst[i];
    const d = tekst[i + 1];

    // Commentaar
    if ((c === '/' && d === '/') || (taal === 'php' && c === '#' && d !== '[')) {
      let j = i;
      while (j < n && tekst[j] !== '\n') j++;
      wis(code, i, j); wis(skelet, i, j);
      i = j;
      continue;
    }
    if (c === '/' && d === '*') {
      let j = tekst.indexOf('*/', i + 2);
      j = j === -1 ? n : j + 2;
      wis(code, i, j); wis(skelet, i, j);
      i = j;
      continue;
    }

    // Tekst
    if (c === "'" || c === '"' || (c === '`' && taal === 'js')) {
      let j = i + 1;
      while (j < n && tekst[j] !== c) {
        if (tekst[j] === '\\') j++;
        j++;
      }
      teksten.push({ start: i + 1, eind: j, waarde: tekst.slice(i + 1, j) });
      wis(skelet, i + 1, j);
      i = j + 1;
      vorige = c;
      continue;
    }

    // Een reguliere expressie in JS: die kan quotes bevatten die we anders
    // voor het begin van een tekst zouden houden.
    if (taal === 'js' && c === '/' && /[(,=:[!&|?{};]|^$/.test(vorige)) {
      let j = i + 1;
      let inKlasse = false;
      while (j < n && tekst[j] !== '\n') {
        if (tekst[j] === '\\') { j += 2; continue; }
        if (tekst[j] === '[') inKlasse = true;
        else if (tekst[j] === ']') inKlasse = false;
        else if (tekst[j] === '/' && !inKlasse) break;
        j++;
      }
      wis(skelet, i + 1, j);
      i = j + 1;
      vorige = '/';
      continue;
    }

    if (!/\s/.test(c)) vorige = c;
    i++;
  }

  return { code: code.join(''), skelet: skelet.join(''), teksten };
}

/** Het object of de argumentlijst die op `start` opent ({ of (), op het skelet. */
function sluiting(skelet, start) {
  const open = skelet[start];
  const dicht = open === '{' ? '}' : open === '(' ? ')' : ']';
  let diepte = 0;
  for (let k = start; k < skelet.length; k++) {
    if (skelet[k] === open) diepte++;
    else if (skelet[k] === dicht) {
      diepte--;
      if (diepte === 0) return k;
    }
  }
  return skelet.length - 1;
}

function regelnummer(tekst, index) {
  let r = 1;
  for (let k = 0; k < index && k < tekst.length; k++) {
    if (tekst[k] === '\n') r++;
  }
  return r;
}

function regelTekst(tekst, nr) {
  return (tekst.split('\n')[nr - 1] || '').trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// CSS
// ─────────────────────────────────────────────────────────────────────────────

/** Commentaar weg, posities behouden. */
function cssZonderCommentaar(tekst) {
  return tekst.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}

/**
 * Een eenvoudige CSS-lezer: verklaringen met hun selector en hun at-rules.
 * Genoeg voor wat hier gecontroleerd wordt; geen volledige CSS-parser.
 */
function leesCss(tekst) {
  const stapel = [];
  const verklaringen = [];
  const regels = [];
  const atRegels = [];
  let buffer = '';
  let bufStart = -1;
  let haakjes = 0;
  let quote = '';

  const context = () => ({
    media: stapel.filter((s) => s.soort === 'at' && s.naam === 'media').map((s) => s.prelude),
    keyframes: stapel.some((s) => s.soort === 'at' && /keyframes$/.test(s.naam)),
    selector: [...stapel].reverse().find((s) => s.soort === 'regel')?.selector || '',
  });

  const verklaring = () => {
    const ruw = buffer.trim();
    if (ruw !== '') {
      const dubbelepunt = ruw.indexOf(':');
      const top = stapel[stapel.length - 1];
      if (!top && ruw.startsWith('@')) {
        const naam = (ruw.match(/^@([\w-]+)/) || [])[1] || '';
        atRegels.push({ naam, prelude: ruw, index: bufStart });
      } else if (dubbelepunt > 0) {
        verklaringen.push({
          eigenschap: ruw.slice(0, dubbelepunt).trim().toLowerCase(),
          waarde: ruw.slice(dubbelepunt + 1).trim(),
          index: bufStart,
          ...context(),
        });
      }
    }
    buffer = '';
    bufStart = -1;
  };

  for (let i = 0; i < tekst.length; i++) {
    const c = tekst[i];
    if (quote) {
      buffer += c;
      if (c === quote && tekst[i - 1] !== '\\') quote = '';
      continue;
    }
    if (c === '"' || c === "'") { quote = c; buffer += c; continue; }
    if (c === '(') haakjes++;
    if (c === ')') haakjes--;

    if (haakjes === 0 && c === '{') {
      const prelude = buffer.trim();
      if (prelude.startsWith('@')) {
        const naam = (prelude.match(/^@([\w-]+)/) || [])[1] || '';
        const rij = { soort: 'at', naam, prelude, index: bufStart };
        atRegels.push(rij);
        stapel.push(rij);
      } else {
        const rij = { soort: 'regel', selector: prelude, index: bufStart, ...context() };
        regels.push(rij);
        stapel.push(rij);
      }
      buffer = '';
      bufStart = -1;
      continue;
    }
    if (haakjes === 0 && c === ';') { verklaring(); continue; }
    if (haakjes === 0 && c === '}') { verklaring(); stapel.pop(); continue; }

    if (bufStart === -1 && !/\s/.test(c)) bufStart = i;
    buffer += c;
  }

  return { verklaringen, regels, atRegels };
}

/** var(...) met alles erin weg, ook geneste. */
function zonderVar(waarde) {
  let uit = waarde;
  for (let k = 0; k < 10; k++) {
    const nieuw = uit.replace(/var\([^()]*(\([^()]*\)[^()]*)*\)/g, '');
    if (nieuw === uit) break;
    uit = nieuw;
  }
  return uit;
}

/** Enkel de NAMEN van variabelen weg; een terugval blijft staan. */
function zonderVarNamen(waarde) {
  return waarde.replace(/--[\w-]+/g, '').replace(/url\([^)]*\)/g, '');
}

function heeftLetterlijkeKleur(waarde, metNamen) {
  const w = zonderVarNamen(waarde);
  if (/#[0-9a-f]{3,8}\b/i.test(w)) return true;
  if (/\b(rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color-mix)\s*\(/i.test(w)) return true;
  return metNamen && KLEURNAMEN.test(w);
}

/** Lengtes groter dan 0 (px, rem, em, %) in een waarde. */
function lengtes(waarde) {
  const uit = [];
  for (const m of waarde.matchAll(/(-?\d*\.?\d+)(px|rem|em|%|vh|vw)\b/g)) {
    if (parseFloat(m[1]) !== 0) uit.push({ getal: parseFloat(m[1]), eenheid: m[2] });
  }
  return uit;
}

function normaliseerMedia(deel) {
  const binnen = deel.slice(1, -1).replace(/\s+/g, ' ').trim();
  const [naam, ...rest] = binnen.split(':');
  if (rest.length === 0) return '(' + naam.trim() + ')';
  return '(' + naam.trim() + ': ' + rest.join(':').trim() + ')';
}

function splitsSelectors(selector) {
  const uit = [];
  let diepte = 0;
  let huidig = '';
  for (const c of selector) {
    if (c === '(') diepte++;
    if (c === ')') diepte--;
    if (c === ',' && diepte === 0) { uit.push(huidig.trim()); huidig = ''; continue; }
    huidig += c;
  }
  if (huidig.trim()) uit.push(huidig.trim());
  return uit;
}

function laatsteDeel(selector) {
  let diepte = 0;
  let laatste = 0;
  for (let k = 0; k < selector.length; k++) {
    const c = selector[k];
    if (c === '(') diepte++;
    if (c === ')') diepte--;
    if (diepte === 0 && /[\s>+~]/.test(c)) laatste = k + 1;
  }
  return selector.slice(laatste).trim();
}

function controleerCss(pad, tekst, soort, huisstijlNamen, melden) {
  const schoon = cssZonderCommentaar(tekst);
  const { verklaringen, regels, atRegels } = leesCss(schoon);
  const meld = (regel, index, detail) => melden(regel, pad, regelnummer(tekst, index), detail);

  // H17 geldt ook voor de stylesheets van de editor.
  for (const v of verklaringen) {
    if (v.eigenschap.startsWith('--mymmo-')) {
      meld('H17', v.index, v.eigenschap + ' wordt hier gemaakt');
    }
    for (const m of v.waarde.matchAll(/(?<![\w-])--mymmo-[a-z0-9-]+/g)) {
      if (!huisstijlNamen.has(m[0])) meld('H17', v.index, m[0] + ' bestaat niet in de huisstijl');
    }
  }

  for (const at of atRegels) {
    if (at.naam === 'import' || at.naam === 'font-face') meld('H08', at.index, '@' + at.naam);
  }
  for (const v of verklaringen) {
    for (const m of v.waarde.matchAll(/url\(\s*['"]?(https?:\/\/[^'")\s]+)/g)) {
      if (!m[1].startsWith(MERK)) meld('H08', v.index, m[1]);
    }
    if (/fonts\.(googleapis|gstatic)\.com/.test(v.waarde)) meld('H08', v.index, 'Google Fonts');
  }

  if (soort !== 'css') return;

  // ── Alleen de stylesheets voor de pagina ──
  let heeftIndeling = false;
  let heeftTelefoon = false;
  let beweegt = false;
  let heeftRustig = false;

  for (const at of atRegels) {
    if (/keyframes$/.test(at.naam)) beweegt = true;
    if (at.naam !== 'media') continue;
    for (const deel of at.prelude.match(/\([^()]*\)/g) || []) {
      const genormaliseerd = normaliseerMedia(deel);
      if (BREEKPUNTEN.has(genormaliseerd)) {
        if (genormaliseerd !== '(min-width: 782px)') heeftTelefoon = true;
        continue;
      }
      if (genormaliseerd === '(prefers-reduced-motion: reduce)') heeftRustig = true;
      if (ANDERE_MEDIA.has(genormaliseerd)) continue;
      meld('H06', at.index, '@media ' + genormaliseerd);
    }
  }

  for (const v of verklaringen) {
    const e = v.eigenschap;
    const w = v.waarde;
    const eigen = e.startsWith('--');

    if (/!important/i.test(w)) meld('H07', v.index, e + ': ' + w);

    if (heeftLetterlijkeKleur(w, eigen || KLEUR_EIGENSCHAP.test(e))) {
      meld('H01', v.index, e + ': ' + w);
    }

    if (TYPOGRAFIE.has(e) && !/^(inherit|initial|unset)$/i.test(w) && !/^var\(--wp--preset--font-/.test(w)) {
      meld('H02', v.index, e + ': ' + w);
    }

    if (/^border(-[a-z]+)*-radius$/.test(e) || (eigen && /(hoek|radius|afronding)/.test(e))) {
      if (lengtes(zonderVarNamen(w)).length > 0) meld('H03', v.index, e + ': ' + w);
    }

    const isSchaduw = e === 'box-shadow' || e === 'text-shadow' || (e === 'filter' && /drop-shadow/.test(w))
      || (eigen && /(schaduw|shadow)/.test(e));
    if (isSchaduw) {
      const rest = zonderVarNamen(w).replace(/var\(\s*,?\s*\)/g, '').trim();
      if (!/^(none|0|inherit|initial|unset|)$/i.test(rest) && (lengtes(rest).length > 0 || heeftLetterlijkeKleur(rest, true))) {
        meld('H04', v.index, e + ': ' + w);
      }
    }

    const isRand = /^(border(-(top|right|bottom|left))?(-width)?|outline(-width)?|stroke-width|column-rule(-width)?)$/.test(e)
      || (eigen && /(rand-?dikte|border-width)/.test(e));
    if (isRand && lengtes(zonderVarNamen(w)).length > 0) {
      meld('H05', v.index, e + ': ' + w);
    }

    if (/^overflow(-[xy])?$/.test(e) && /\b(auto|scroll)\b/.test(w)) meld('H09', v.index, e + ': ' + w);
    if (e === 'container-type' || e === 'container' || e === 'contain') meld('H10', v.index, e + ': ' + w);
    if (/100vw/.test(w)) meld('H12', v.index, e + ': ' + w);

    if (/^(display)$/.test(e) && /\b(inline-)?(flex|grid)\b/.test(w)) heeftIndeling = true;
    if (/^grid-template-(columns|areas)$/.test(e)) heeftIndeling = true;
    if (/^(animation|animation-name|transition|transition-property)$/.test(e) && !/^none$/i.test(w)) beweegt = true;

    if (/^(padding|margin|gap|row-gap|column-gap)(-(top|right|bottom|left|inline|block)(-(start|end))?)?$/.test(e)) {
      const los = lengtes(zonderVar(w)).filter((l) => (l.eenheid === 'px' ? Math.abs(l.getal) >= 8 : ['rem', 'em'].includes(l.eenheid)));
      if (los.length > 0) meld('H15', v.index, e + ': ' + w);
    }

    if (/^(height|min-height)$/.test(e)) {
      const groot = lengtes(zonderVar(w)).filter((l) => (l.eenheid === 'px' && l.getal >= 200) || (l.eenheid === 'vh' && l.getal >= 50));
      if (groot.length > 0) meld('H16', v.index, e + ': ' + w);
    }
  }

  for (const r of regels) {
    if (r.keyframes) continue;
    for (const sel of splitsSelectors(r.selector)) {
      if (!/\.mymmo-/.test(sel)) {
        meld('H11', r.index, sel + ' (geen .mymmo-klasse)');
        continue;
      }
      const laatste = laatsteDeel(sel).replace(/::?[\w-]+(\([^)]*\))?/g, '');
      const element = (laatste.match(/^[a-z][a-z0-9]*/i) || [])[0];
      if (element && ELEMENTEN.has(element.toLowerCase())) {
        const klassen = (sel.match(/\.[a-zA-Z_][\w-]*/g) || []).length;
        if (klassen < 2) meld('H11', r.index, sel + ' (raakt <' + element + '> met maar een klasse)');
      }
    }
  }

  if (heeftIndeling && !heeftTelefoon) melden('H13', pad, 1, 'flex/grid zonder telefoonregel');
  if (beweegt && !heeftRustig) melden('H14', pad, 1, 'beweging zonder prefers-reduced-motion');
}

// ─────────────────────────────────────────────────────────────────────────────
// PHP en JavaScript
// ─────────────────────────────────────────────────────────────────────────────

function controleerTekstwaarden(pad, tekst, ontleding, soort, huisstijlNamen, melden) {
  const voorPagina = soort === 'php' || soort === 'js';
  const meld = (regel, index, detail) => melden(regel, pad, regelnummer(tekst, index), detail);

  for (const t of ontleding.teksten) {
    const w = t.waarde;

    // Enkel wat op de pagina TERECHTKOMT: een beeld, een lettertype, een
    // stylesheet of een script van elders. Een API-adres (de updates via
    // GitHub) is geen bron van de pagina.
    for (const m of w.matchAll(/https?:\/\/[^\s'"<>)]+/g)) {
      const url = m[0];
      if (url.startsWith(MERK) || url.startsWith('http://www.w3.org/')) continue;
      const bestand = /\.(svg|png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf|eot|css|js)([?#].*)?$/i.test(url);
      const cdn = /\/\/(fonts\.|use\.typekit|cdn\.|cdnjs\.|unpkg\.|.*jsdelivr\.)/i.test(url);
      if (bestand || cdn) meld('H08', t.start, url);
    }
    // Als CSS geschreven: `@import url(`, `@font-face {`. Een reguliere
    // expressie die die woorden zoekt (zoals in class-bewaking.php) telt niet.
    if (/fonts\.(googleapis|gstatic)\.com|@import\s+(url\(|['"])|@font-face\s*\{/.test(w)) meld('H08', t.start, w.slice(0, 80));

    for (const m of w.matchAll(/(?<![\w-])--mymmo-[a-z0-9-]+/g)) {
      if (!huisstijlNamen.has(m[0])) meld('H17', t.start, m[0] + ' bestaat niet in de huisstijl');
    }

    if (!voorPagina) continue;

    // Een kleur in een tekstwaarde: in een stijl, een standaardwaarde of HTML.
    // Het teken ervoor telt mee, zodat een reguliere expressie als
    // '/^#([0-9a-f]{3})$/' (vormcontrole op een kleur) niet als kleur geldt.
    if (/(^|[\s:;'"(,=])#[0-9a-f]{3,8}\b/i.test(w) || /\b(rgb|rgba|hsl|hsla)\s*\(\s*\d/i.test(w)) {
      meld('H01', t.start, w.slice(0, 80));
    }

    for (const m of w.matchAll(/\b(font-family|font-size|font-weight|font-style|line-height|letter-spacing|text-transform)\s*:\s*([^;'"}]*)/gi)) {
      const waarde = m[2].trim();
      if (waarde === '' || /^(inherit|var\(--wp--preset--font-)/i.test(waarde)) continue;
      meld('H02', t.start, m[1] + ': ' + waarde);
    }

    if (/<svg\b/i.test(w)) meld('H21', t.start, '<svg ...>');
    if (/<(use|defs)\b/i.test(w)) meld('H21', t.start, w.match(/<(use|defs)\b/i)[0]);

    if (/\bdashicons\b|font-?awesome|\bfa-[a-z]|\blucide\b|material-(icons|symbols)/i.test(w)) {
      meld('H22', t.start, w.slice(0, 60));
    }

    const stijl = w.match(/\bstyle\s*=\s*"(.*)$/i);
    if (stijl) {
      for (const deel of stijl[1].split(';')) {
        const e = deel.split(':')[0].trim().toLowerCase();
        if (e === '' || e.startsWith('--') || e === 'background-image') continue;
        meld('H20', t.start, e);
      }
    }
  }

  if (soort === 'php') {
    for (const m of ontleding.code.matchAll(/\$stijl\[\]\s*=\s*'([^']*)'/g)) {
      if (!m[1].startsWith('--')) meld('H20', m.index, m[1]);
    }
  }
}

function controleerPhp(pad, tekst, ontleding, melden) {
  const meld = (regel, index, detail) => melden(regel, pad, regelnummer(tekst, index), detail);
  const { skelet, code } = ontleding;

  for (const m of skelet.matchAll(/wp_register_style\s*\(/g)) {
    const open = m.index + m[0].length - 1;
    const args = code.slice(open, sluiting(skelet, open) + 1);
    const css = (args.match(/assets\/css\/([\w.-]+\.css)/) || [])[1];
    if (!css || css === 'mymmo-huisstijl.css' || css.endsWith('-editor.css')) continue;
    if (!/Mymmo_Cards_Huisstijl::HANDLE|mymmo-huisstijl/.test(args)) meld('H18', m.index, css);
  }
}

function controleerEditorJs(pad, tekst, ontleding, melden) {
  const meld = (regel, index, detail) => melden(regel, pad, regelnummer(tekst, index), detail);
  const { skelet } = ontleding;
  const origineel = tekst;

  // Elk blok: categorie, icoon, supports.
  for (const m of skelet.matchAll(/registerBlockType\s*\(/g)) {
    const open = m.index + m[0].length - 1;
    const eind = sluiting(skelet, open);
    const binnen = skelet.slice(open, eind);
    const accolade = binnen.indexOf('{');
    if (accolade === -1) continue;
    const objStart = open + accolade;
    const objEind = sluiting(skelet, objStart);
    const obj = origineel.slice(objStart, objEind + 1);
    const objSkelet = skelet.slice(objStart, objEind + 1);

    const cat = obj.match(/\bcategory\s*:\s*['"]([^'"]*)['"]/);
    if (!cat) meld('H30', m.index, 'geen category');
    else if (cat[1] !== 'mymmo') meld('H30', m.index + obj.indexOf(cat[0]) + accolade, "category: '" + cat[1] + "'");

    const icoon = objSkelet.match(/\bicon\s*:\s*(\S)/);
    if (icoon && icoon[1] !== "'" && icoon[1] !== '"') meld('H32', m.index, 'icon is geen Dashicon');

    const sup = objSkelet.match(/\bsupports\s*:\s*\{/);
    if (sup) {
      const sOpen = objStart + sup.index + sup[0].length - 1;
      const sObj = skelet.slice(sOpen, sluiting(skelet, sOpen) + 1);
      for (const k of sObj.matchAll(/[{,]\s*([\w$]+)\s*:/g)) {
        if (/^(color|typography|spacing|dimensions|border|__experimentalBorder|shadow|background|filter|__experimentalFontFamily|__experimentalFontWeight|fontSize|lineHeight)$/.test(k[1])) {
          meld('H31', sOpen, 'supports.' + k[1]);
        }
      }
    }
  }

  // Vrije kiezers.
  const verboden = /\b(?:__experimental)?(ColorPicker|GradientPicker|FontSizePicker|FontFamilyControl|LineHeightControl|LetterSpacingControl|BorderControl|BorderBoxControl|BoxControl|UnitControl|PanelColorSettings|ColorGradientControl|ColorGradientSettingsDropdown|DuotonePicker|TextTransformControl|TextDecorationControl)\b/g;
  for (const m of skelet.matchAll(verboden)) meld('H33', m.index, m[1]);

  for (const m of skelet.matchAll(/el\(\s*ColorPalette\s*,\s*\{/g)) {
    const open = m.index + m[0].length - 1;
    const obj = origineel.slice(open, sluiting(skelet, open) + 1);
    if (!/disableCustomColors\s*:\s*true/.test(obj)) meld('H33', m.index, 'ColorPalette zonder disableCustomColors: true');
  }

  // Vrije waarden voor wat de huisstijl bepaalt.
  for (const m of skelet.matchAll(/el\(\s*(RangeControl|TextControl|NumberControl|__experimentalNumberControl)\s*,\s*\{/g)) {
    const open = m.index + m[0].length - 1;
    const obj = origineel.slice(open, sluiting(skelet, open) + 1);
    const labelTreffer = obj.match(/\blabel\s*:\s*(['"])(.*?)\1/);
    const label = labelTreffer ? labelTreffer[2] : '';
    if (/hoek|afrond|radius|dikte van de rand|randdikte|rand \(px\)|border|schaduw|shadow|kleur|color|lettertype|lettergrootte|letterdikte|\bfont/i.test(label)) {
      // Gemeld op de regel van het LABEL: dan kan een uitzondering precies
      // dit ene veld noemen, en niet elk veld van die soort in het bestand.
      meld('H34', open + labelTreffer.index, m[1] + " '" + label + "'");
    }
  }
}

function controleerFrontJs(pad, tekst, ontleding, melden) {
  if (/requestAnimationFrame|\.animate\s*\(/.test(ontleding.skelet) && !/prefers-reduced-motion/.test(ontleding.code)) {
    melden('H14', pad, 1, 'beweging zonder prefers-reduced-motion');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Thingies en versie
// ─────────────────────────────────────────────────────────────────────────────

async function controleerThingies(helpers, offline, melden, waarschuw) {
  const basis = (helpers.match(/define\(\s*'MYMMO_CARDS_THINGIES_URL'\s*,\s*'([^']+)'/) || [])[1];
  const functie = helpers.match(/function mymmo_cards_thingies\(\)[\s\S]*?\breturn\s*\[([\s\S]*?)\];/);
  if (!basis || !functie) {
    melden('H23', 'includes/helpers.php', 1, 'mymmo_cards_thingies() of MYMMO_CARDS_THINGIES_URL niet gevonden');
    return;
  }
  const slugs = [...functie[1].matchAll(/'([a-z0-9-]+)'\s*=>/g)].map((m) => m[1]);
  if (offline) return;

  const fouten = [];
  let onbereikbaar = 0;
  await Promise.all(slugs.map(async (slug) => {
    const url = basis + slug + '.svg';
    try {
      const antwoord = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(10000) });
      if (antwoord.status === 404) fouten.push(slug);
      else if (!antwoord.ok) onbereikbaar++;
      await antwoord.body?.cancel?.();
    } catch {
      onbereikbaar++;
    }
  }));

  for (const slug of fouten.sort()) {
    const nr = helpers.split('\n').findIndex((r) => r.includes("'" + slug + "'")) + 1;
    melden('H23', 'includes/helpers.php', nr, basis + slug + '.svg');
  }
  if (onbereikbaar > 0) {
    waarschuw(onbereikbaar + ' thingies konden niet online nagekeken worden (geen verbinding?). Draai opnieuw met verbinding, of met --offline om dit over te slaan.');
  }
}

function controleerVersie(melden) {
  const hoofd = lees(join(PLUGIN, 'mymmo-cards.php'));
  const docblock = (hoofd.match(/^\s*\*\s*Version:\s*([0-9.]+)/m) || [])[1];
  const constante = (hoofd.match(/define\('MYMMO_CARDS_VERSION',\s*'([0-9.]+)'\)/) || [])[1];
  if (!docblock || docblock !== constante) {
    melden('H40', 'mymmo-cards.php', 1, 'docblock ' + docblock + ' / constante ' + constante);
    return docblock || '?';
  }
  const readme = lees(join(PLUGIN, 'README.md'));
  if (!readme.includes('**' + docblock + '**')) {
    melden('H40', 'README.md', 1, 'geen sectie **' + docblock + '**');
  }
  return docblock;
}

// ─────────────────────────────────────────────────────────────────────────────
// Vingerafdruk en stempel
// ─────────────────────────────────────────────────────────────────────────────

/**
 * De vingerafdruk: per codebestand "<blob-id>\t<pad>", gesorteerd op pad, en
 * daarvan de git-hash (eerste 16 tekens). README en CLAUDE.md tellen niet mee.
 *
 * STAAT OOK IN stempel.sh, in bash. Wijzig ze SAMEN: lopen ze uiteen, dan past
 * geen enkele stempel nog en is elke push rood.
 *
 * Zonder `ref`: de WERKBOOM, via een tijdelijke index (vanuit HEAD, met alles
 * erbij wat nog niet gecommit is). Dat is precies wat er na het committen in
 * git staat. Met `ref` (een tag of commit): wat daar in git staat -- zo kijkt de
 * release na of een versie al met dezelfde code uitstaat.
 */
const AFDRUK_MAP = 'wp-plugin/mymmo-cards';
const AFDRUK_CODE = /\.(php|js|css|svg|json|html)$/;

function git(args, env) {
  return execFileSync('git', args, {
    cwd: WORTEL,
    env: env || process.env,
    stdio: ['ignore', 'pipe', 'ignore'],
    maxBuffer: 64 * 1024 * 1024,
  }).toString();
}

function afdrukVan(rijen) {
  const lijst = rijen
    .filter(([, pad]) => AFDRUK_CODE.test(pad))
    .sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0))
    .map(([blob, pad]) => blob + '\t' + pad + '\n')
    .join('');
  return execFileSync('git', ['hash-object', '--stdin'], { cwd: WORTEL, input: lijst })
    .toString().trim().slice(0, 16);
}

function vingerafdruk(ref) {
  if (ref) {
    // "<mode> blob <id>\t<pad>"
    return afdrukVan(git(['ls-tree', '-r', ref, '--', AFDRUK_MAP]).split('\n').filter(Boolean)
      .map((r) => { const [kop, pad] = r.split('\t'); return [kop.split(' ')[2], pad]; }));
  }
  const index = join(tmpdir(), 'mymmo-afdruk-' + process.pid + '.index');
  const env = { ...process.env, GIT_INDEX_FILE: index };
  try {
    git(['read-tree', 'HEAD'], env);
    git(['add', '-A', '--', AFDRUK_MAP], env);
    // "<mode> <id> <stage>\t<pad>"
    return afdrukVan(git(['ls-files', '-s', '--', AFDRUK_MAP], env).split('\n').filter(Boolean)
      .map((r) => { const [kop, pad] = r.split('\t'); return [kop.split(' ')[1], pad]; }));
  } finally {
    rmSync(index, { force: true });
  }
}

// Op GitHub komt elke melding OOK als annotatie. Die zijn zonder aanmelding te
// lezen (GET /repos/.../check-runs/<id>/annotations): zo ziet wie geen Node
// heeft toch wat er tegengehouden werd. Zie het regelboek, "Van idee tot op de
// site".
function ghTekst(t) {
  return String(t).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

function ghEigenschap(t) {
  return ghTekst(t).replace(/:/g, '%3A').replace(/,/g, '%2C');
}

function annoteer(m) {
  const def = REGELS[m.regel];
  const bestand = m.pad.startsWith('wp-plugin/') ? m.pad : 'wp-plugin/mymmo-cards/' + m.pad;
  const eig = ['file=' + ghEigenschap(bestand)];
  if (m.nr > 0) eig.push('line=' + m.nr);
  eig.push('title=' + ghEigenschap(m.regel + ' ' + def.naam));
  console.log('::' + (def.niveau === 'fout' ? 'error' : 'warning') + ' ' + eig.join(',') + '::'
    + ghTekst(m.detail + ' -> ' + def.oplossing));
}

function gitNaam() {
  try {
    return execSync('git config user.name', { cwd: WORTEL, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return process.env.USERNAME || process.env.USER || 'onbekend';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Hoofdprogramma
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);

  // Enkel de vingerafdruk, voor de release-workflow: staat deze code al uit?
  const afdrukIdx = args.indexOf('--afdruk');
  if (afdrukIdx !== -1) {
    const ref = args[afdrukIdx + 1] && !args[afdrukIdx + 1].startsWith('--') ? args[afdrukIdx + 1] : null;
    process.stdout.write(vingerafdruk(ref) + '\n');
    return;
  }
  const bouw = args.includes('--bouw');
  const offline = args.includes('--offline');
  const stempelIdx = args.indexOf('--stempel');
  const stempel = stempelIdx !== -1;
  const samenvatting = stempel ? (args[stempelIdx + 1] || '').trim() : '';

  const meldingen = [];
  const losseWaarschuwingen = [];

  const huisstijlTekst = lees(join(PLUGIN, HUISSTIJL_CSS));
  const huisstijlNamen = new Set([...cssZonderCommentaar(huisstijlTekst).matchAll(/(--mymmo-[a-z0-9-]+)\s*:/g)].map((m) => m[1]));

  const bestanden = new Map();
  const melden = (regel, pad, nr, detail) => {
    if (!bestanden.has(pad) && existsSync(join(PLUGIN, pad))) bestanden.set(pad, lees(join(PLUGIN, pad)));
    meldingen.push({ regel, pad, nr, detail, fragment: regelTekst(bestanden.get(pad) || '', nr) });
  };

  for (const vol of lijstBestanden(PLUGIN)) {
    const pad = rel(vol);
    const soort = soortVan(pad);
    if (!soort) continue;
    const tekst = lees(vol);
    bestanden.set(pad, tekst);

    if (soort === 'huisstijl') continue;

    if (soort === 'css' || soort === 'css-editor') {
      controleerCss(pad, tekst, soort, huisstijlNamen, melden);
      continue;
    }

    const ontleding = ontleed(tekst, soort === 'php' ? 'php' : 'js');
    controleerTekstwaarden(pad, tekst, ontleding, soort, huisstijlNamen, melden);
    if (soort === 'php') controleerPhp(pad, tekst, ontleding, melden);
    if (soort === 'js-editor') controleerEditorJs(pad, tekst, ontleding, melden);
    if (soort === 'js') controleerFrontJs(pad, tekst, ontleding, melden);
  }

  await controleerThingies(bestanden.get('includes/helpers.php') || '', offline, melden, (t) => losseWaarschuwingen.push(t));
  const versie = controleerVersie(melden);

  // Uitzonderingen: wat erin staat, telt niet; wat niets meer vindt, wel.
  // Een uitzondering dekt hoogstens `aantal` meldingen (standaard 1): staat er
  // later een tweede veld van dezelfde soort naast, dan valt dat er niet onder.
  const lijst = existsSync(UITZONDERINGEN) ? JSON.parse(readFileSync(UITZONDERINGEN, 'utf8')).uitzonderingen || [] : [];
  const gebruikt = new Map();
  const over = meldingen.filter((m) => {
    const k = lijst.findIndex((u, i) => u.regel === m.regel && u.bestand === m.pad && m.fragment.includes(u.bevat)
      && (gebruikt.get(i) || 0) < (u.aantal || 1));
    if (k === -1) return true;
    gebruikt.set(k, (gebruikt.get(k) || 0) + 1);
    return false;
  });
  lijst.forEach((u, k) => {
    const keer = gebruikt.get(k) || 0;
    if (keer < (u.aantal || 1)) {
      over.push({
        regel: 'U01', pad: 'wp-plugin/huisstijl/uitzonderingen.json', nr: 0,
        detail: u.regel + ' ' + u.bestand + ' "' + u.bevat + '" (' + keer + ' van ' + (u.aantal || 1) + ' gevonden)',
        fragment: '',
      });
    }
  });

  // De review.
  const afdruk = vingerafdruk();
  const foutenVoorReview = over.filter((m) => REGELS[m.regel].niveau === 'fout');

  if (bouw) {
    const review = existsSync(REVIEW) ? JSON.parse(readFileSync(REVIEW, 'utf8')) : null;
    if (!review || review.hash !== afdruk) {
      over.push({
        regel: 'R01', pad: 'wp-plugin/mymmo-cards.review.json', nr: 0,
        detail: review ? 'de stempel hoort bij andere code (' + review.hash + ', nu ' + afdruk + ')' : 'er is nog geen review',
        fragment: '',
      });
    }
  }

  // Afdrukken.
  const fouten = over.filter((m) => REGELS[m.regel].niveau === 'fout');
  const waarschuwingen = over.filter((m) => REGELS[m.regel].niveau === 'waarschuwing');

  console.log('Huisstijlcontrole -- Mymmo Componenten ' + versie + '\n');

  const perRegel = new Map();
  for (const m of [...fouten, ...waarschuwingen]) {
    if (!perRegel.has(m.regel)) perRegel.set(m.regel, []);
    perRegel.get(m.regel).push(m);
  }
  for (const [regel, rijen] of perRegel) {
    const def = REGELS[regel];
    console.log((def.niveau === 'fout' ? 'FOUT  ' : 'LET OP ') + regel + ' ' + def.naam);
    for (const r of rijen) {
      const plaats = r.nr > 0 ? r.pad + ':' + r.nr : r.pad;
      console.log('       ' + plaats + '  ' + r.detail);
    }
    console.log('       -> ' + def.oplossing + '\n');
  }
  for (const t of losseWaarschuwingen) console.log('LET OP ' + t + '\n');

  if (process.env.GITHUB_ACTIONS === 'true') {
    for (const m of [...fouten, ...waarschuwingen]) annoteer(m);
    for (const t of losseWaarschuwingen) console.log('::warning title=Huisstijl::' + ghTekst(t));
  }

  console.log(fouten.length + ' fout(en), ' + waarschuwingen.length + ' waarschuwing(en). Vingerafdruk ' + afdruk + '.');

  if (stempel) {
    if (foutenVoorReview.length > 0) {
      console.log('\nGeen stempel: los eerst de fouten op.');
      process.exit(1);
    }
    if (samenvatting.length < 20) {
      console.log('\nGeen stempel: geef een samenvatting van de review mee (--stempel "wat er nagekeken is en wat de bevindingen waren").');
      process.exit(1);
    }
    writeFileSync(REVIEW, JSON.stringify({
      plugin: 'mymmo-cards',
      versie,
      hash: afdruk,
      datum: new Date().toISOString(),
      door: gitNaam(),
      samenvatting,
    }, null, 2) + '\n');
    console.log('\nStempel gezet: wp-plugin/mymmo-cards.review.json (' + afdruk + ').');
    process.exit(0);
  }

  if (fouten.length > 0) {
    console.log(bouw ? '\nGeen zip: los eerst de fouten op.' : '');
    process.exit(1);
  }
}

main().catch((fout) => {
  console.error(fout);
  process.exit(2);
});
