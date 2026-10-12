#!/usr/bin/env node
/**
 * DE CONTROLE van het tabblad Aanvragen in Dashboards (het terrein van David).
 *
 *   node scripts/vangrails/aanvragen.mjs
 *
 * WAAROM DIT BESTAAT: in public/dashboard-aanvragen/ en
 * src/modules/dashboards/lib/aanvragen/ voegt David zelf samen, zonder review van
 * Nico (.github/CODEOWNERS). Wat dan nog tegenhoudt dat het tabblad uit de toon
 * valt naast Verkoop en Marketing, of dat het iets in Odoo verandert, is deze
 * controle. GitHub laat niets samenvoegen zolang ze rood is
 * (.github/workflows/dashboards.yml).
 *
 * DE REGELS staan hieronder in REGELS: wat ze controleren, waarom, en wat je in
 * de plaats doet. Het regelboek (src/modules/dashboards/lib/aanvragen/CLAUDE.md)
 * zegt hetzelfde in mensentaal.
 *
 * Dit bestand staat onder CODEOWNERS: wijzigen enkel met goedkeuring van Nico.
 * Pas het nooit aan om een fout groen te krijgen -- pas het tabblad aan.
 *
 * Geen afhankelijkheden: enkel Node (18+).
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const WORTEL = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const FRONT = join(WORTEL, 'public', 'dashboard-aanvragen');
const SERVER = join(WORTEL, 'src', 'modules', 'dashboards', 'lib', 'aanvragen');
const HTML = join(WORTEL, 'public', 'dashboards.html');
const BRONNEN = join(WORTEL, 'src', 'modules', 'dashboards', 'lib', 'aanvragen-bronnen.js');

/** Waar de kerncijfers, filters en zin van het tabblad staan: enkel via de kit. */
const PREFIX = 'av';
const SLOTS = ['Status', 'Notice', 'Sentence', 'Filters', 'Kpis'];
/** Welke routes de browser mag aanspreken. */
const API_PREFIXEN = ['/dashboards/api/aanvragen', '/dashboards/api/targets'];
/** Welke bestanden de servercode mag importeren (naast de eigen map). */
const SERVER_IMPORTS = new Set(['../aanvragen-bronnen.js', '../lead-kanalen.js']);

const REGELS = {
  A1: { niveau: 'fout', naam: 'Ongeldige JavaScript',
    oplossing: 'Los de syntaxfout op (node --check <bestand> toont waar).' },
  A2: { niveau: 'fout', naam: 'Een bestand dat hier niet hoort',
    oplossing: 'public/dashboard-aanvragen/ bevat enkel .js (alles in public/ is publiek, ook een .md). De servermap bevat enkel .js en CLAUDE.md.' },
  A3: { niveau: 'fout', naam: 'Een script dat niet laadt',
    oplossing: 'Elk .js-bestand in public/dashboard-aanvragen/ moet als <script> in public/dashboards.html staan, NA dashboards-kit.js. Die regel zetten vraagt Nico (dashboards.html is van hem): vraag het in een aparte pull request, of zet de code in aanvragen.js.' },

  F1: { niveau: 'fout', naam: 'Het geraamte niet uit de kit',
    oplossing: 'Het tabblad begint met root.innerHTML = K.geraamte({ prefix: \'av\', ... }) -- precies een keer. Zo heeft het dezelfde drie kolommen als Verkoop, Targets en Marketing: filters links, kaarten in het midden, kerncijfers rechts.' },
  F2: { niveau: 'fout', naam: 'Een eigen kolommenindeling of kaart',
    oplossing: 'Geen eigen <aside>, sticky kolom, kolomraster of kaart (rounded-2xl). De kolommen komen uit K.geraamte, een kaart in het midden uit K.kaart(id, titel, uitleg, knoppen). Binnen een kaart mag je vrij indelen.' },
  F3: { niveau: 'fout', naam: 'Een kolom rechtstreeks gevuld',
    oplossing: 'Vul de kolommen met de kit: K.zin(P, tekst) en K.filters(P, [groepen]) links, K.kpis(P, [tegels]) rechts, K.status(P, html) en K.melding(P, html) bovenaan. Nooit met getElementById(\'avKpis\') en co.' },
  F4: { niveau: 'fout', naam: 'Een kolom blijft leeg',
    oplossing: 'Het tabblad roept K.zin, K.filters en K.kpis aan: wat je bekijkt en de filters links, de kerncijfers rechts. Een kolom zonder inhoud leest als een storing.' },
  F5: { niveau: 'fout', naam: 'Buiten het eigen tabblad',
    oplossing: 'Het tabblad raakt enkel [data-dash-panel="instroom"] en wat erin staat: geen andere panelen, de tabbladknoppen, #dashMain, de navbar of document.body.' },
  F6: { niveau: 'fout', naam: 'Luisteren op het hele document',
    oplossing: 'Een klik, wijziging of toets vang je op met root.addEventListener(...): op document zou het tabblad klikken van andere tabbladen opvangen.' },
  F7: { niveau: 'fout', naam: 'Een inline event handler of een algemeen data-action',
    oplossing: 'Geen onclick="..." (REGEL 3 in claude.md). Gebruik data-av-action="..." en de ene luisteraar op root. Een attribuut zonder av-voorvoegsel kan botsen met een ander tabblad.' },
  F8: { niveau: 'fout', naam: 'Een rand die in het donkere thema zwart wordt',
    oplossing: 'border-base-content/10 (of /15, /20), nooit border-base-200/-300 of divide-base-*: REGEL 7 in claude.md. Voor een lijntje tussen rijen: de klasse om-lijnen.' },
  F9: { niveau: 'fout', naam: 'Tabs in een andere stijl',
    oplossing: 'Tabs zijn altijd tabs-boxed (REGEL 6 in claude.md), nooit tabs-bordered of tabs-lifted.' },
  F10: { niveau: 'fout', naam: 'Een eigen kleur',
    oplossing: 'Geen hex, rgb(), hsl() of oklch() in het tabblad: kleuren komen uit de kit (K.C.primary/good/bad/warn/muted, K.palette(i), K.kanaalKleur(kanaal), K.REF) of uit daisyUI-klassen (text-success, bg-primary, ...). Zo volgen ze het thema, ook donker. Een kleur erbij = in dashboards-kit.js, via Nico.' },
  F11: { niveau: 'fout', naam: 'Eigen stijl, lettertype of script laden',
    oplossing: 'Geen <style>, <link>, font-family, extra script of import(): het tabblad gebruikt de klassen van Tailwind en daisyUI en de bouwstenen van de kit. Iets nieuws nodig? Vraag het voor de kit.' },
  F12: { niveau: 'fout', naam: 'Zelf fetchen of een andere route',
    oplossing: 'Data via K.api(\'/dashboards/api/aanvragen?...\') (of /dashboards/api/targets): dat stuurt de sessie mee en stuurt bij 401 naar het aanmeldscherm. Een nieuwe vraag aan de server = een nieuwe parameter op /api/aanvragen, gelezen in lib/aanvragen/index.js.' },
  F13: { niveau: 'fout', naam: 'Een grafiek buiten de kit',
    oplossing: 'Grafieken met K.chart(id, config) en K.baseOptions(...), reeksen met K.bars / K.area / K.refLine: dezelfde assen, tooltips en kleuren als Verkoop, en de oude grafiek wordt netjes opgeruimd.' },

  S1: { niveau: 'fout', naam: 'Een import buiten de vangrails',
    oplossing: 'De servercode leest enkel via ../aanvragen-bronnen.js (Odoo en targets, alleen lezen) en ../lead-kanalen.js (merk en kanaal), en importeert verder enkel bestanden uit de eigen map. Iets anders nodig (een model, Supabase, D1)? Dat komt in aanvragen-bronnen.js, via een pull request voor Nico.' },
  S2: { niveau: 'fout', naam: 'Rechtstreeks naar een database, Odoo of het internet',
    oplossing: 'Geen executeKw, fetch, getSupabaseClient en geen env.IETS: geef env enkel door aan leesGroepen / leesRecords / tel. Zo kan een wijziging aan het dashboard nooit iets in Odoo of in een database veranderen.' },
  S3: { niveau: 'fout', naam: 'Een Odoo-model dat het tabblad niet mag lezen',
    oplossing: 'Enkel de modellen in MODELLEN (lib/aanvragen-bronnen.js). Een model erbij vraagt een review van Nico.' },
  S4: { niveau: 'fout', naam: 'De route vindt het tabblad niet',
    oplossing: 'lib/aanvragen/index.js exporteert getAanvragen(env, params): dat is wat GET /dashboards/api/aanvragen aanroept.' },
};

const bevindingen = [];
function meld(regel, pad, nr, detail) { bevindingen.push({ regel, pad: relative(WORTEL, pad).split('\\').join('/'), nr, detail }); }

function bestanden(map) {
  if (!existsSync(map)) return [];
  const uit = [];
  for (const naam of readdirSync(map)) {
    const pad = join(map, naam);
    if (statSync(pad).isDirectory()) uit.push(...bestanden(pad));
    else uit.push(pad);
  }
  return uit;
}

/** Commentaar weghalen (blok, en regels die met // beginnen), met behoud van de regelnummers. */
function zonderCommentaar(tekst) {
  return tekst
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/^[ \t]*\/\/.*$/gm, '');
}
function regelVan(tekst, index) { return tekst.slice(0, index).split('\n').length; }
function zoek(tekst, re, pad, regel, detail) {
  const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
  let m;
  while ((m = g.exec(tekst))) meld(regel, pad, regelVan(tekst, m.index), typeof detail === 'function' ? detail(m) : detail || m[0]);
}
function syntax(pad) {
  const r = spawnSync(process.execPath, ['--check', pad], { encoding: 'utf8' });
  if (r.status !== 0) meld('A1', pad, 0, (r.stderr || '').split('\n').filter(Boolean).slice(0, 3).join(' | '));
}

// ── De browserkant ───────────────────────────────────────────────────────────
function controleerFront() {
  const alles = bestanden(FRONT);
  if (!alles.some((p) => p.endsWith(join('dashboard-aanvragen', 'aanvragen.js')))) {
    meld('A3', FRONT, 0, 'aanvragen.js ontbreekt');
  }
  const html = existsSync(HTML) ? readFileSync(HTML, 'utf8') : '';
  const kitPlaats = html.indexOf('src="/dashboards-kit.js"');
  for (const pad of alles) {
    if (extname(pad) !== '.js') { meld('A2', pad, 0, 'geen .js'); continue; }
    const web = '/' + relative(join(WORTEL, 'public'), pad).split('\\').join('/');
    const plaats = html.indexOf('src="' + web + '"');
    if (plaats < 0) meld('A3', pad, 0, 'staat niet als <script src="' + web + '"> in public/dashboards.html');
    else if (kitPlaats < 0 || plaats < kitPlaats) meld('A3', pad, 0, 'laadt voor dashboards-kit.js');
  }
  const verwijzingen = html.match(/src="\/dashboard-aanvragen\/[^"]+"/g) || [];
  for (const v of verwijzingen) {
    const pad = join(WORTEL, 'public', v.slice(5, -1));
    if (!existsSync(pad)) meld('A3', HTML, 0, v + ' bestaat niet');
  }

  const js = alles.filter((p) => extname(p) === '.js');
  let geraamtes = 0;
  const gebruikt = { zin: false, filters: false, kpis: false };
  for (const pad of js) {
    syntax(pad);
    const tekst = zonderCommentaar(readFileSync(pad, 'utf8'));

    // F1 -- het geraamte
    geraamtes += (tekst.match(/\bK\.geraamte\(/g) || []).length;
    zoek(tekst, /\broot\.innerHTML\s*[+]?=(?!\s*K\.geraamte\()/, pad, 'F1', 'root.innerHTML zonder K.geraamte');
    if (/\bK\.geraamte\(/.test(tekst) && !new RegExp("prefix\\s*:\\s*(P\\b|['\"]" + PREFIX + "['\"])").test(tekst)) meld('F1', pad, 0, "K.geraamte zonder prefix 'av'");
    if (/\bK\.geraamte\(/.test(tekst) && /\bvar\s+P\s*=/.test(tekst) && !new RegExp("\\bvar\\s+P\\s*=\\s*['\"]" + PREFIX + "['\"]").test(tekst)) meld('F1', pad, 0, "P is niet 'av'");

    // F2 -- geen eigen kolommen of kaarten
    zoek(tekst, /<aside\b|grid-cols-\[19rem|2xl:col-start-3|lg:row-span-2|\bsticky\b|om-scroll|rounded-2xl/, pad, 'F2');

    // F3 -- de kolommen enkel via de kit
    zoek(tekst, new RegExp("['\"]" + PREFIX + '(' + SLOTS.join('|') + ")['\"]"), pad, 'F3');
    zoek(tekst, new RegExp("\\bP\\s*\\+\\s*['\"](" + SLOTS.join('|') + ")['\"]"), pad, 'F3');

    // F4 -- wat er moet staan
    if (/\bK\.zin\(/.test(tekst)) gebruikt.zin = true;
    if (/\bK\.filters\(/.test(tekst)) gebruikt.filters = true;
    if (/\bK\.kpis\(/.test(tekst)) gebruikt.kpis = true;

    // F5 -- buiten het tabblad
    zoek(tekst, /data-dash-panel\s*=\s*\\?["'](?!instroom)/, pad, 'F5');
    zoek(tekst, /data-dash-tab|dashMain|renderSharedNavbar|getElementById\(\s*['"]navbar['"]|document\.body\.(innerHTML|appendChild|insertAdjacentHTML|prepend|append)|document\.write\(/, pad, 'F5');

    // F6 -- luisteren op het hele document of venster
    zoek(tekst, /\b(document|window)\.addEventListener\(\s*['"](click|change|input|submit|keydown|keyup|mouseover|focusin)['"]/, pad, 'F6');

    // F7 -- inline handlers en algemene data-action
    zoek(tekst, /\son[a-z]{3,}\s*=\s*\\?["']/, pad, 'F7');
    zoek(tekst, /\bdata-action\s*=|\[data-action\]/, pad, 'F7');

    // F8, F9 -- randen en tabs (claude.md, REGEL 6 en 7)
    zoek(tekst, /\b(border|divide)-base-(200|300)\b|\bdivide-base-/, pad, 'F8');
    zoek(tekst, /\btabs-(bordered|lifted)\b/, pad, 'F9');

    // F10 -- geen eigen kleuren
    zoek(tekst, /#[0-9a-fA-F]{3,8}\b(?![\w-])/, pad, 'F10', (m) => m[0]);
    zoek(tekst, /\b(rgba?|hsla?|oklch|oklab|lab|lch)\(/, pad, 'F10');

    // F11 -- eigen stijl, lettertype of script
    zoek(tekst, /<style\b|<link\b|font-family|createElement\(\s*['"](script|style|link)['"]|\bimport\(/, pad, 'F11');

    // F12 -- data enkel via K.api, naar de eigen routes
    zoek(tekst, /\bfetch\(|XMLHttpRequest|navigator\.sendBeacon/, pad, 'F12');
    zoek(tekst, /\bK\.api\(\s*['"`]([^'"`]*)/, pad, 'F12', (m) => (API_PREFIXEN.some((p) => m[1].startsWith(p)) ? null : 'K.api(\'' + m[1] + '\')'));

    // F13 -- grafieken via de kit
    zoek(tekst, /\bnew\s+(window\.)?Chart\(/, pad, 'F13');
  }
  if (js.length && geraamtes !== 1) meld('F1', FRONT, 0, 'K.geraamte( staat er ' + geraamtes + ' keer');
  for (const [k, ok] of Object.entries(gebruikt)) if (js.length && !ok) meld('F4', FRONT, 0, 'K.' + k + '( ontbreekt');
}

// ── De serverkant ────────────────────────────────────────────────────────────
function controleerServer() {
  const modellen = new Set();
  if (existsSync(BRONNEN)) {
    const m = readFileSync(BRONNEN, 'utf8').match(/export const MODELLEN = \[([\s\S]*?)\];/);
    if (m) for (const x of m[1].matchAll(/['"]([^'"]+)['"]/g)) modellen.add(x[1]);
  }
  const alles = bestanden(SERVER);
  let index = null;
  for (const pad of alles) {
    const naam = relative(SERVER, pad).split('\\').join('/');
    if (naam === 'CLAUDE.md') continue;
    if (extname(pad) !== '.js') { meld('A2', pad, 0, 'geen .js'); continue; }
    if (naam === 'index.js') index = pad;
    syntax(pad);
    const tekst = zonderCommentaar(readFileSync(pad, 'utf8'));

    // S1 -- imports
    for (const m of tekst.matchAll(/\b(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]/g)) {
      const bron = m[1];
      const eigen = bron.startsWith('./') && !bron.includes('..');
      if (!eigen && !SERVER_IMPORTS.has(bron)) meld('S1', pad, regelVan(tekst, m.index), bron);
    }
    zoek(tekst, /\bimport\s*['"][^'"]+['"]|\bimport\(|\brequire\(/, pad, 'S1');

    // S2 -- niets rechtstreeks
    zoek(tekst, /\b(executeKw|searchRead|getSupabaseClient|createClient)\b|\bfetch\(|\bcaches\.|\bprocess\.env\b|\bglobalThis\b/, pad, 'S2');
    zoek(tekst, /\benv\s*(\.|\[)\s*['"A-Za-z_]/, pad, 'S2');

    // S3 -- modellen
    for (const m of tekst.matchAll(/\b(leesGroepen|leesRecords|tel)\(\s*env\s*,\s*['"]([^'"]+)['"]/g)) {
      if (modellen.size && !modellen.has(m[2])) meld('S3', pad, regelVan(tekst, m.index), m[2]);
    }
  }
  if (!index) meld('S4', SERVER, 0, 'index.js ontbreekt');
  else if (!/export\s+(async\s+)?function\s+getAanvragen\s*\(/.test(readFileSync(index, 'utf8'))) meld('S4', index, 0, 'geen export getAanvragen');
}

function main() {
  controleerFront();
  controleerServer();
  const echt = bevindingen.filter((b) => b.detail !== null);
  console.log('Controle -- Dashboards, tabblad Aanvragen\n');
  const perRegel = new Map();
  for (const b of echt) {
    if (!perRegel.has(b.regel)) perRegel.set(b.regel, []);
    perRegel.get(b.regel).push(b);
  }
  for (const [regel, lijst] of perRegel) {
    const def = REGELS[regel];
    console.log((def.niveau === 'fout' ? 'FOUT  ' : 'LET OP ') + regel + ' ' + def.naam);
    for (const b of lijst) console.log('       ' + (b.nr > 0 ? b.pad + ':' + b.nr : b.pad) + '  ' + b.detail);
    console.log('       -> ' + def.oplossing + '\n');
  }
  const fouten = echt.filter((b) => REGELS[b.regel].niveau === 'fout');
  console.log(fouten.length + ' fout(en).');
  process.exit(fouten.length ? 1 : 0);
}

main();
