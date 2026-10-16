/**
 * Nieuwsbrieven -- een editie (of één stukje) naar mail-HTML.
 *
 * PUUR: geen env, geen fetch, geen database. Alles wat van buiten komt (events,
 * tekeningen, bedrijfsgegevens, antwoordlinks) zit in `ctx`. Daardoor maakt
 * dezelfde functie het voorbeeld in de OM, de testmail en de echte mailing --
 * er is geen tweede renderer die uit de pas kan lopen.
 *
 * De opmaak vertrekt van de huisstijl van openvme.be en syndicoach.be (Gelica
 * voor titels, Rethink Sans voor tekst, #0369a1 met mint), NIET van de oude
 * Dynapps-blokken. Tabellen met een width-attribuut, zodat Outlook voor Windows
 * de breedte respecteert. Nooit de shorthand `background`: Odoo's sanitizer
 * knipt die stil weg (zie CLAUDE.md, het vrije chatter-bericht).
 *
 * Modi:
 *   'preview'   alles, ook wat nog leeg is (als stippellijn), met data-nb-id
 *               zodat het scherm een blok kan aanklikken
 *   'test'      wat ingeleverd of goedgekeurd is, zoals het zou vertrekken
 *   'live'      enkel goedgekeurde stukjes
 */

import { esc, safeUrl } from '../../../lib/mail/render-blocks.js';
import {
  STYLE as S, BRAND, KINDS, CONTRIBUTION_STATUS, BEELD_KADERS, TEKENING_MATEN, TITEL_NIVEAUS, merkkleur, isDonker,
  VRAAG_STIJLEN, VRAAG_STANDAARD, vraagThema,
} from './constants.js';

/** Hoe breed een beeld op zijn plek staat: een tekening naar haar grootte, een foto naar het kader. */
function beeldBreedte(b, plaats) {
  if (b?.thingie) return TEKENING_MATEN[b.maat] || TEKENING_MATEN.middel;
  return (BEELD_KADERS[plaats] || BEELD_KADERS.rechts).breedte;
}

const WIDTH = 640;

// ─── Kleine bouwstenen ──────────────────────────────────────────────────────

/** Platte tekst naar alinea's. **vet** en [label](https://...) worden opmaak. */
export function tekstNaarHtml(text, opties = {}) {
  return alineas(text, opties).join('');
}

/** Dezelfde alinea's als losse stukken, om er een beeld tussen te zetten. */
export function alineas(text, { size = 16, color = S.text, lineHeight = 1.6, gap = 14, linkColor = S.primary } = {}) {
  const blokken = String(text || '').replace(/\r\n?/g, '\n').split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return blokken.map((blok, i) => {
    let h = esc(blok)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, `<a href="$2" style="color:${linkColor};text-decoration:underline">$1</a>`)
      .replace(/\n/g, '<br>');
    const mb = i === blokken.length - 1 ? 0 : gap;
    return `<p style="margin:0 0 ${mb}px;font-family:${S.fontBody};font-size:${size}px;line-height:${lineHeight};color:${color}">${h}</p>`;
  });
}

function initialen(naam) {
  const delen = String(naam || '').trim().split(/\s+/).filter(Boolean);
  if (!delen.length) return '?';
  return (delen[0][0] + (delen.length > 1 ? delen[delen.length - 1][0] : '')).toUpperCase();
}

const AVATAR_KLEUREN = [
  [S.sky100, S.primary], [S.pink100, S.pink700], [S.teal100, S.teal700], ['#ffedd5', S.orange700],
];

function avatarKleur(naam) {
  let h = 0;
  for (const ch of String(naam || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_KLEUREN[h % AVATAR_KLEUREN.length];
}

function avatar(author, size = 32, { onDark = false } = {}) {
  const naam = author?.name || '';
  if (author?.avatar_url && safeUrl(author.avatar_url)) {
    return `<img src="${safeUrl(author.avatar_url)}" width="${size}" height="${size}" alt="" style="display:block;width:${size}px;height:${size}px;border-radius:50%;object-fit:cover">`;
  }
  const [bg, fg] = onDark ? [S.mint, S.primary] : avatarKleur(naam);
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="${size}" height="${size}" align="center" valign="middle" style="width:${size}px;height:${size}px;border-radius:50%;background-color:${bg};color:${fg};font-family:${S.fontBody};font-size:${Math.round(size * 0.36)}px;font-weight:700;line-height:${size}px;text-align:center">${esc(initialen(naam))}</td></tr></table>`;
}

/** Een technisch account (Administrator, OdooBot) is geen collega. */
function isTechnisch(naam) {
  return /^(administrator|admin|odoobot)$/i.test(String(naam || '').trim());
}

/**
 * Wie een stukje echt bijdroeg: bij een bericht uit Nieuws & updates wie het
 * deelde, bij een blok dat zichzelf vult niemand, anders de schrijver.
 */
function bijdrageVan(it) {
  if (KINDS[it.kind]?.auto || it.kind === 'heading') return null;
  const a = it.kind === 'snippet' ? it.content?.door : it.author;
  return a?.name && !isTechnisch(a.name) ? a : null;
}

function byline(author, { onDark = false, prefix = '' } = {}) {
  // Een technisch account is geen collega: dan liever geen naam.
  if (!author?.name || isTechnisch(author.name)) return '';
  const kleur = onDark ? S.sky100 : S.muted;
  const naamKleur = onDark ? '#ffffff' : S.headingSoft;
  const functie = author.job_title ? ` · ${esc(author.job_title)}` : '';
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:22px"><tr>
<td valign="middle" style="padding-right:10px">${avatar(author, 32, { onDark })}</td>
<td valign="middle" style="font-family:${S.fontBody};font-size:13px;line-height:1.4;color:${kleur}">${prefix ? esc(prefix) + ' ' : ''}<strong style="color:${naamKleur}">${esc(String(author.name).trim().split(/\s+/)[0])}</strong>${functie}</td>
</tr></table>`;
}

function pil(tekst, bg, fg) {
  if (!tekst) return '';
  return `<span style="display:inline-block;font-family:${S.fontBody};font-size:12px;font-weight:700;letter-spacing:0.02em;padding:5px 12px;border-radius:999px;background-color:${bg};color:${fg}">${esc(tekst)}</span>`;
}

function label(tekst, kleur) {
  if (!tekst) return '';
  return `<div style="font-family:${S.fontBody};font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${kleur}">${esc(tekst)}</div>`;
}

function kop(tekst, { size = 28, color = S.heading, tag = 'h2', margin = '14px 0 12px' } = {}) {
  if (!tekst) return '';
  return `<${tag} style="margin:${margin};font-family:${S.fontHead};font-weight:400;font-size:${size}px;line-height:1.15;color:${color}">${esc(tekst)}</${tag}>`;
}

function knop(tekst, href, { bg = S.mint, fg = S.primary, size = 15 } = {}) {
  const url = safeUrl(href);
  if (!tekst || !url) return '';
  return `<a href="${url}" style="display:inline-block;background-color:${bg};color:${fg};font-family:${S.fontBody};font-size:${size}px;font-weight:700;padding:14px 22px;border-radius:8px;text-decoration:none">${esc(tekst)}</a>`;
}

function leesLink(tekst, href) {
  const url = safeUrl(href);
  if (!url) return '';
  return `<a href="${url}" style="font-family:${S.fontBody};font-size:15px;font-weight:700;color:${S.primary};text-decoration:none;border-bottom:2px solid ${S.mint};padding-bottom:2px">${esc(tekst || 'Lees verder')} &rarr;</a>`;
}

/**
 * Een veld dat je in het voorbeeld (`id` gezet) rechtstreeks in de brief
 * typt: `data-nb-veld` + plaatshouder. In een test of echte mail: enkel de
 * waarde, en niets als ze leeg is (tenzij `altijd`).
 */
function typbaar(id, naam, waarde, { tag = 'div', stijl = '', plaatshouder = '', optioneel = false, altijd = false, html = null } = {}) {
  const inhoud = html !== null ? html : esc(waarde || '');
  if (id) {
    return `<${tag} data-nb-veld="${naam}"${optioneel ? ' data-nb-optioneel="1"' : ''} data-placeholder="${esc(plaatshouder)}" style="${stijl}">${inhoud}</${tag}>`;
  }
  if (!String(waarde || '').trim() && !altijd) return '';
  return `<${tag} style="${stijl}">${inhoud}</${tag}>`;
}

function rij(inhoud, { padding = '40px 40px 0', id = null } = {}) {
  const attr = id ? ` data-nb-id="${esc(id)}"` : '';
  return `<tr${attr}><td class="nb-cel" style="padding:${padding}">${inhoud}</td></tr>`;
}

/**
 * EEN breedte voor alles: de tekstkolom van 560 px (40 px marge links en
 * rechts). Ook een gekleurde kaart of vlak gaat daar nooit over.
 */
function paneel(inhoud, bg, { padding = '36px 32px 30px', margin = '32px 40px 0', id = null } = {}) {
  const attr = id ? ` data-nb-id="${esc(id)}"` : '';
  return `<tr${attr}><td class="nb-cel" style="padding:${margin}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${bg};border-radius:18px"><tr><td style="padding:${padding}">${inhoud}</td></tr></table></td></tr>`;
}

// ─── Beelden: één manier voor elke plek ─────────────────────────────────────

/**
 * Het beeld van een stukje: `content.beeld` = { url | thingie, plaats,
 * na_alinea, vulling ('vullen'|'heel'), focus {x,y}, uitsnede }. Oudere
 * stukjes hebben enkel een losse URL of tekening: die tellen als "heel tonen"
 * op de plek waar ze vroeger stonden.
 */
export function beeldVan(c = {}, { fotoVeld = 'image_url', plaats = 'rechts' } = {}) {
  const b = c.beeld;
  if (b && (b.url || b.thingie)) return b;
  if (c.thingie) return { thingie: c.thingie, plaats: 'rechts', vulling: 'heel' };
  if (safeUrl(c[fotoVeld])) return { url: c[fotoVeld], plaats, vulling: 'heel' };
  return null;
}

/** Wat er in de mail komt: de uitsnede bij "vullen", anders het beeld zelf. */
function beeldSrc(b, ctx) {
  if (!b) return '';
  if (b.thingie) return ctx.thingieUrl ? ctx.thingieUrl(b.thingie) || '' : '';
  return safeUrl(b.vulling === 'vullen' && b.uitsnede ? b.uitsnede : b.url) || '';
}

function beeldTag(b, ctx, breedte, { radius = 14, href = '', alt = '' } = {}) {
  const src = beeldSrc(b, ctx);
  if (!src) return '';
  const r = b.thingie ? 0 : radius;
  const img = `<img src="${esc(src)}" width="${breedte}" alt="${esc(alt)}" style="display:block;width:100%;max-width:${breedte}px;height:auto;border:0;border-radius:${r}px">`;
  const link = safeUrl(href);
  return link ? `<a href="${link}" style="text-decoration:none">${img}</a>` : img;
}

/**
 * Alinea's met het beeld erbij, op plek `na_alinea` (het aantal alinea's
 * ervoor; 0 = bij de eerste):
 *   'tekst'          tussen de alinea's, over de hele breedte
 *   'rechts'/'links' naast die alinea; de tekst loopt eromheen (zoals in Word).
 *                    In de mail met `align` op het beeld: dat volgen ook
 *                    Outlook en Gmail, een CSS-float op een div niet.
 * In het voorbeeld is het beeld een eiland dat je niet kan bewerken
 * (`data-nb-eiland`), zodat het bij zijn alinea blijft terwijl je typt.
 */
function tekstMetBeeld(stukken, b, ctx, id) {
  const lijst = stukken.slice();
  const pl = b && b.plaats;
  if (!b || !['tekst', 'rechts', 'links'].includes(pl) || !beeldSrc(b, ctx)) return lijst.join('');
  const n = Math.max(0, Math.min(lijst.length, Number.isInteger(b.na_alinea) ? b.na_alinea : 0));
  const eiland = id ? ' data-nb-eiland="1" data-nb-beeld="1" contenteditable="false"' : '';
  if (pl === 'tekst') {
    // Een tekening tussen de tekst staat op haar grootte, gecentreerd; een foto over de hele breedte.
    const tag = b.thingie
      ? `<div align="center" style="text-align:center">${beeldTag(b, ctx, beeldBreedte(b, pl)).replace('width:100%', 'width:' + beeldBreedte(b, pl) + 'px').replace('display:block', 'display:inline-block')}</div>`
      : beeldTag(b, ctx, BEELD_KADERS.tekst.breedte);
    lijst.splice(n, 0, `<div${eiland} style="margin:${n === 0 ? 0 : 6}px 0 18px">${tag}</div>`);
    return lijst.join('');
  }
  const breedte = beeldBreedte(b, pl);
  const marge = pl === 'rechts' ? '4px 0 12px 24px' : '4px 24px 12px 0';
  const src = beeldSrc(b, ctx);
  const img = `<img src="${esc(src)}" width="${breedte}" align="${pl === 'rechts' ? 'right' : 'left'}" alt="" style="float:${pl === 'rechts' ? 'right' : 'left'};width:${breedte}px;max-width:46%;height:auto;margin:${marge};border:0;border-radius:${b.thingie ? 0 : 14}px">`;
  if (id) {
    // Voorbeeld: het eiland staat VOOR de alinea waar het naast hoort. Het
    // eiland zelf is 46% van de kolom breed (zoals het beeld in de mail);
    // het beeld erin vult het eiland (en niet 46% van het eiland: dan was het
    // een postzegel).
    lijst.splice(Math.min(n, lijst.length), 0, `<div${eiland} style="float:${pl === 'rechts' ? 'right' : 'left'};width:${breedte}px;max-width:46%;margin:${marge}">${img.replace(/float:[a-z]+;/, '').replace(/margin:[^;]+;/, 'margin:0;').replace('max-width:46%', 'max-width:100%')}</div>`);
    return lijst.join('');
  }
  if (!lijst.length) return `<div>${img}</div>`;
  const i = Math.min(n, lijst.length - 1);
  lijst[i] = lijst[i].replace(/^(<p[^>]*>)/, `$1${img}`);
  // Het beeld mag niet onder de volgende blokken doorlopen.
  return `${lijst.join('')}<div style="clear:both;font-size:0;line-height:0">&nbsp;</div>`;
}

/**
 * Een blok met zijn beeld als tweede kolom over het hele blok ('kolom-…'),
 * BINNEN de vaste breedte (40 px marge, zoals alles). De andere plekken staan
 * al in de tekst (tekstMetBeeld).
 */
function schikBeeld({ b, ctx, id, inhoud, padding, bg = '' }) {
  const attr = id ? ` data-nb-id="${esc(id)}"` : '';
  const bgStijl = bg ? `background-color:${bg};` : '';
  const pl = b && b.plaats;
  const k = BEELD_KADERS[pl];
  if (b && pl === 'hoek-rechts' && beeldSrc(b, ctx)) {
    // Rechtsboven in de hoek, boven alles (ook het labeltje en de titel); de
    // tekst loopt er links van. Een tekening op haar grootte, een foto in
    // het vierkante kader. `align` op het beeld: dat volgen Outlook en Gmail.
    const breedte = beeldBreedte(b, pl);
    const tag = beeldTag(b, ctx, breedte, { radius: b.thingie ? 0 : 14 }).replace('width:100%', `width:${breedte}px`);
    const hoek = id
      ? `<div data-nb-eiland="1" data-nb-beeld="1" contenteditable="false" style="float:right;width:${breedte}px;max-width:46%;margin:0 0 14px 24px">${tag}</div>`
      : tag.replace('<img ', `<img align="right" `).replace('style="display:block;', 'style="display:block;float:right;margin:0 0 14px 24px;');
    return `<tr${attr}><td class="nb-cel" style="padding:${padding};${bgStijl}">${hoek}${inhoud}<div style="clear:both;font-size:0;line-height:0">&nbsp;</div></td></tr>`;
  }
  if (!b || !k || !pl.startsWith('kolom') || !beeldSrc(b, ctx)) {
    return `<tr${attr}><td class="nb-cel" style="padding:${padding};${bgStijl}">${inhoud}</td></tr>`;
  }
  const bAttr = id ? ' data-nb-beeld="1"' : '';
  const delen = String(padding).trim().split(/\s+/);
  const boven = delen[0] || '40px';
  const onder = delen[2] || boven;
  const links = pl === 'kolom-links';
  const tabel = (cellen) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${cellen}</tr></table>`;
  // Op een smal scherm vallen de twee kolommen onder elkaar (nb-kol); het beeld komt dan bovenaan.
  const beeldCel = `<td class="nb-kol" width="${k.breedte}" valign="top" style="width:${k.breedte}px;padding:0"${bAttr}>${beeldTag(b, ctx, k.breedte).replace('max-width:' + k.breedte + 'px', 'max-width:' + k.breedte + 'px" class="nb-gsm-vol')}</td>`;
  const tekstCel = `<td class="nb-kol${links ? ' nb-kol-na' : ''}" valign="top" style="padding:0 ${links ? 0 : 24}px 0 ${links ? 24 : 0}px">${inhoud}</td>`;
  return `<tr${attr}><td class="nb-cel" style="padding:${boven} 40px ${onder};${bgStijl}">${tabel(links ? beeldCel + tekstCel : tekstCel + beeldCel)}</td></tr>`;
}

// ─── Datums (Europe/Brussels) ───────────────────────────────────────────────

function deel(date, opties) {
  try {
    return new Intl.DateTimeFormat('nl-BE', { timeZone: 'Europe/Brussels', ...opties }).format(date);
  } catch {
    return '';
  }
}

export function eventDatum(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const dag = deel(d, { day: 'numeric' });
  const maand = deel(d, { month: 'short' }).replace('.', '').toUpperCase();
  const weekdag = deel(d, { weekday: 'long' });
  const uur = deel(d, { hour: '2-digit', minute: '2-digit', hour12: false });
  return { dag, maand, weekdag: weekdag.charAt(0).toUpperCase() + weekdag.slice(1), uur };
}

export function maandLabel(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const s = deel(d, { month: 'long', year: 'numeric' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── Wat doet mee ───────────────────────────────────────────────────────────

/** Is er iets om te tonen? Een leeg stukje wordt nooit verstuurd. */
export function heeftInhoud(item, ctx = {}) {
  const c = item?.content || {};
  switch (item?.kind) {
    case 'heading':
      return Boolean(String(c.title || '').trim());
    case 'intro':
    case 'article':
    case 'snippet':
      return Boolean(String(c.title || '').trim() || String(c.text || '').trim());
    case 'video':
      return Boolean(safeUrl(c.video_url));
    case 'link':
    case 'linkedin':
      return Boolean(safeUrl(c.url));
    case 'quote':
      return Boolean(String(c.quote || '').trim());
    case 'image': {
      const b = beeldVan(c);
      return Boolean(b && (b.thingie || safeUrl(b.url)));
    }
    case 'statement':
    case 'question':
    case 'poll':
      return Boolean(String(c.question || '').trim()) && opties(item).length >= 2;
    case 'events':
      return eventsVoor(item, ctx).length > 0;
    case 'feature':
      return Boolean(String(c.title || '').trim());
    case 'news':
      return (c.items || []).some((n) => String(n?.title || '').trim());
    case 'toc':
    case 'closing':
      return true;
    default:
      return false;
  }
}

/** Telt dit stukje mee in deze modus? */
export function doetMee(item, mode, ctx = {}) {
  if (!heeftInhoud(item, ctx)) return false;
  // Een TEST toont alles met inhoud, ook wat nog niet ingeleverd is: zo lees je
  // de hele editie in je eigen mailbox na. Enkel de echte verzending is streng.
  if (mode === 'preview' || mode === 'test') return true;
  if (KINDS[item.kind]?.auto) return true;
  return item.status === CONTRIBUTION_STATUS.APPROVED;
}

export function opties(item) {
  return (item?.content?.options || [])
    .map((o) => ({ value: String(o?.value || '').trim(), label: String(o?.label || '').trim() }))
    .filter((o) => o.value && o.label)
    .slice(0, 6);
}

function eventsVoor(item, ctx) {
  const uit = new Set((item?.content?.exclude_ids || []).map(Number));
  return (ctx.events || []).filter((e) => !uit.has(Number(e.id))).slice(0, 6);
}

/**
 * Staat dit blok in de inhoudstafel? Marketing beslist per blok (knopje in
 * de werkbalk, `content.in_toc`): true = erin, false = eruit. Zonder keuze:
 * alles erin behalve de inhoudstafel zelf, het woordje vooraf, een losse
 * afbeelding en de afsluiting.
 */
export function inToc(item) {
  if (item?.kind === 'toc') return false;
  const v = item?.content?.in_toc;
  if (v === true) return true;
  if (v === false) return false;
  return !['closing', 'intro', 'image'].includes(item?.kind);
}

/** De kop waaronder een stukje in de inhoudstafel staat. */
export function kopVan(item) {
  const c = item?.content || {};
  return String(c.title || c.question || (item?.kind === 'news' ? c.heading : '') || item?.title || '').trim();
}

// ─── Antwoordlinks ──────────────────────────────────────────────────────────

/**
 * Een optie als link. In 'live' en 'test' komt er per ontvanger een token in
 * via QWeb (`t-att` met een dict, zie lib/answers.js: answerAttrs). Bewust
 * GEEN `t-attf-href`: Odoo's linkverkorter zoekt op `href=` en zou dat stuk
 * van de attribuutnaam ook pakken, waarna elke ontvanger dezelfde link krijgt.
 */
function antwoordA(item, optie, ctx, stijl, inhoud) {
  const links = ctx.answerLink ? ctx.answerLink(item, optie) : { href: '#' };
  const extra = links.tAtt ? ` t-att="${esc(links.tAtt)}"` : '';
  return `<a href="${esc(links.href || '#')}"${extra} style="${stijl}">${inhoud}</a>`;
}

// ─── De blokken ─────────────────────────────────────────────────────────────

/**
 * De handtekening onder het woordje vooraf: foto, voornaam, en eronder de
 * functie. Warm en persoonlijk, geen achternaam of mailadres. De groet schrijft
 * de schrijver zelf in de tekst (zo staat ze in hetzelfde lettertype). Wie
 * ondertekent, staat in `item.signer` (lib/editions.js: metOndertekening);
 * foto en functie komen uit hr.employee in Odoo.
 */
function handtekening(item) {
  const a = item.signer || item.author || {};
  const voornaam = String(a.name || '').trim().split(/\s+/)[0] || '';
  if (!voornaam) return '';
  const functie = String(a.job_title || '').trim();
  const foto = safeUrl(a.avatar_url);
  const beeld = foto
    ? `<img src="${foto}" width="68" height="68" alt="${esc(voornaam)}" style="display:block;width:68px;height:68px;border-radius:50%;object-fit:cover">`
    : avatar({ name: voornaam }, 68, { onDark: true });
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:22px"><tr>
<td valign="middle" style="padding-right:16px">${beeld}</td>
<td valign="middle"><div style="font-family:${S.fontHead};font-size:24px;line-height:1.15;color:${S.heading}">${esc(voornaam)}</div>${functie ? `<div style="font-family:${S.fontBody};font-size:14px;line-height:1.4;color:${S.muted};margin-top:4px">${esc(functie)}</div>` : ''}</td>
</tr></table>`;
}

/**
 * In het voorbeeld (`id` gezet) zijn titel en tekst aanwijsbaar met
 * `data-nb-veld`: het scherm maakt ze daar bewerkbaar, en een lege titel of
 * tekst staat er dan toch (het scherm toont een plaatshouder). In een test of
 * echte mail staat er niets van.
 */
function blokIntro(item, ctx, id) {
  const c = item.content || {};
  const b = beeldVan(c);
  const titel = id
    ? `<h1 data-nb-veld="title" data-placeholder="Typ hier een titel" style="margin:0 0 16px;font-family:${S.fontHead};font-weight:400;font-size:38px;line-height:1.15;color:${S.heading}">${esc(c.title || '')}</h1>`
    : kop(c.title, { size: 38, tag: 'h1', margin: '0 0 16px' });
  const tekstHtml = tekstMetBeeld(alineas(c.text, { size: 17 }), b, ctx, id);
  const tekst = id
    ? `<div data-nb-veld="text" data-placeholder="Typ hier je inleiding. Sluit af met je groet, bv. Veel leesplezier," style="font-family:${S.fontBody};font-size:17px;line-height:1.6;color:${S.text}">${tekstHtml}</div>`
    : tekstHtml;
  return schikBeeld({ b, ctx, id, inhoud: `${titel}\n${tekst}\n${handtekening(item)}`, padding: '44px 40px 40px', bg: S.teal50 });
}

function blokArticle(item, ctx, id) {
  const c = item.content || {};
  const b = beeldVan(c, { plaats: 'tekst' });
  const tekstHtml = tekstMetBeeld(alineas(c.text), b && b.plaats === 'tekst' && !c.beeld ? { ...b, na_alinea: 0 } : b, ctx, id);
  // In het voorbeeld typ je titel en tekst IN de brief (zoals het woordje vooraf).
  const titel = id
    ? `<h2 data-nb-veld="title" data-placeholder="Typ hier een titel" style="margin:14px 0 12px;font-family:${S.fontHead};font-weight:400;font-size:28px;line-height:1.15;color:${S.heading}">${esc(c.title || '')}</h2>`
    : kop(c.title);
  const lijf = id
    ? `<div data-nb-veld="text" data-placeholder="Typ hier je tekst. Een lege regel = een nieuwe alinea." style="font-family:${S.fontBody};font-size:16px;line-height:1.6;color:${S.text}">${tekstHtml}</div>`
    : tekstHtml;
  // Optioneel: een subtitel onder de titel. In het voorbeeld enkel zichtbaar
  // als ze er staat of als het blok gekozen is (`data-nb-optioneel`).
  const subStijl = `margin:-4px 0 14px;font-family:${S.fontBody};font-size:18px;font-weight:600;line-height:1.4;color:${S.headingSoft}`;
  const sub = id
    ? `<div data-nb-veld="subtitle" data-nb-optioneel="1" data-placeholder="Subtitel (optioneel)" style="${subStijl}">${esc(c.subtitle || '')}</div>`
    : String(c.subtitle || '').trim() ? `<div style="${subStijl}">${esc(c.subtitle)}</div>` : '';
  // Het labeltje (naam van het blok) is ook optioneel en typ je in de brief.
  const labeltje = id
    ? `<div style="line-height:1"><span data-nb-veld="@title" data-nb-optioneel="1" data-placeholder="Label (optioneel)" style="display:inline-block;font-family:${S.fontBody};font-size:12px;font-weight:700;letter-spacing:0.02em;padding:5px 12px;border-radius:999px;background-color:${S.pink50};color:${S.pink700}">${esc(item.title || '')}</span></div>`
    : pil(item.title, S.pink50, S.pink700);
  const tekst = `${titel}${sub}${lijf}${c.link_url ? `<div style="margin-top:18px">${leesLink(c.link_label, c.link_url)}</div>` : ''}`;
  return schikBeeld({ b, ctx, id, inhoud: `${labeltje}${tekst}${byline(item.author)}`, padding: '44px 40px 4px' });
}

/**
 * Een bericht uit Nieuws & updates, in een van de vormen uit BERICHT_VORMEN.
 * Het label (het pilletje) komt uit het bericht zelf (`content.tag`, door
 * Nieuws & updates voorgesteld), anders de naam van het blok. Onder het
 * artikel staat wie het DEELDE (`content.door`, de eigenaar in Nieuws &
 * updates), niet wie het blok in de brief zette.
 */
function blokSnippet(item, ctx, id) {
  const c = item.content || {};
  const tag = String(c.tag || '').trim() || item.title;
  const door = byline(c.door, { prefix: 'Gedeeld door' });
  const b = beeldVan(c, { plaats: 'tekst' });
  const bron = esc(c.source || '');
  switch (c.vorm) {
    case 'kaart': {
      const foto = beeldTag(b, ctx, BEELD_KADERS.link.breedte, { radius: 0, href: c.link_url, alt: c.title || '' });
      const kaart = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${S.border};border-radius:14px;border-collapse:separate;overflow:hidden">
${foto ? `<tr><td style="border-radius:14px 14px 0 0;overflow:hidden">${foto}</td></tr>` : ''}
<tr><td style="padding:22px 24px 24px">
${pil(tag, S.pink50, S.pink700)}${bron ? `<span style="font-family:${S.fontBody};font-size:12px;font-weight:700;color:${S.muted};margin-left:8px">${bron}</span>` : ''}
<div style="font-family:${S.fontHead};font-size:24px;line-height:1.2;color:${S.heading};margin:12px 0 10px">${esc(c.title)}</div>
${alineas(c.text, { size: 15, lineHeight: 1.55 }).join('')}
<div style="margin-top:14px">${leesLink(c.link_label, c.link_url)}</div>
</td></tr></table>`;
      return rij(`${kaart}${door}`, { padding: '44px 40px 4px', id });
    }
    case 'uitgelicht': {
      const foto = beeldTag(b, ctx, 496, { href: c.link_url, alt: c.title || '' });
      return paneel(`${pil(tag, S.mint, S.primary)}
${kop(c.title, { size: 32, color: '#ffffff', margin: '16px 0 12px' })}
${foto ? `<div style="margin:6px 0 18px">${foto}</div>` : ''}
${alineas(c.text, { size: 16, color: S.sky100, linkColor: '#ffffff' }).join('')}
<div style="margin-top:20px">${knop(c.link_label || 'Lees verder', c.link_url)}</div>
${byline(c.door, { onDark: true, prefix: 'Gedeeld door' })}`, S.primary, { padding: '36px 32px 30px', id });
    }
    case 'compact': {
      const k = BEELD_KADERS.compact;
      const foto = beeldTag(b, ctx, k.breedte, { radius: 12, href: c.link_url, alt: c.title || '' });
      const eerste = alineas(c.text, { size: 15, lineHeight: 1.5 })[0] || '';
      const tekst = `${pil(tag, S.sky100, S.primary)}
<div style="font-family:${S.fontBody};font-size:18px;font-weight:700;line-height:1.3;color:${S.headingSoft};margin:10px 0 8px">${esc(c.title)}</div>
${eerste}<div style="margin-top:10px">${leesLink(c.link_label, c.link_url)}</div>`;
      const inhoud = foto
        ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="${k.breedte}" valign="top" style="width:${k.breedte}px;padding:4px 20px 0 0">${foto}</td>
<td valign="top">${tekst}</td></tr></table>`
        : tekst;
      return rij(`${inhoud}${door}`, { padding: '40px 40px 4px', id });
    }
    case 'citaat':
      if (String(c.quote || '').trim()) {
        return paneel(`${pil(tag, '#ffffff', S.teal700)}
<div style="font-family:${S.fontHead};font-size:56px;line-height:0.6;color:${S.teal700};margin:26px 0 4px">&ldquo;</div>
<div style="font-family:${S.fontHead};font-size:24px;line-height:1.35;color:${S.heading}">${esc(c.quote)}</div>
${bron ? `<div style="font-family:${S.fontBody};font-size:14px;color:${S.muted};margin-top:12px">${bron}</div>` : ''}
<div style="font-family:${S.fontBody};font-size:16px;font-weight:700;line-height:1.4;color:${S.headingSoft};margin:20px 0 10px">${esc(c.title)}</div>
${leesLink(c.link_label, c.link_url)}${door}`, S.teal50, { id });
      }
      break;
    default:
      break;
  }
  const tekst = `${kop(c.title)}${tekstMetBeeld(alineas(c.text), b, ctx, id)}${c.link_url ? `<div style="margin-top:18px">${leesLink(c.link_label, c.link_url)}</div>` : ''}`;
  return schikBeeld({ b, ctx, id, inhoud: `${pil(tag, S.pink50, S.pink700)}${tekst}${door}`, padding: '44px 40px 4px' });
}

/**
 * Een video is enkel het stilstaand beeld, met het labeltje erboven; klikken
 * op het beeld opent de video (Vimeo of YouTube). Geen titel, tekst of knop:
 * wie daar iets bij wil, zet er een tekstblok naast (beslissing 2026-10-15).
 */
function blokVideo(item, ctx, id) {
  const c = item.content || {};
  const b = beeldVan(c, { fotoVeld: 'thumbnail_url', plaats: 'video' });
  const thumbTag = beeldTag(b, ctx, BEELD_KADERS.video.breedte, { href: c.video_url, alt: item.title || 'Video' });
  const thumb = thumbTag ? `<div${id ? ' data-nb-beeld="1"' : ''} style="margin-top:14px">${thumbTag}</div>`
    : id ? `<div data-nb-video="1" style="margin-top:14px;border:2px dashed #d1d5db;border-radius:14px;padding:40px 20px;text-align:center;font-family:${S.fontBody};font-size:14px;color:${S.muted}">Klik hier om een video te kiezen</div>` : '';
  const labeltje = id
    ? `<div style="line-height:1"><span data-nb-veld="@title" data-nb-optioneel="1" data-placeholder="Label (optioneel)" style="display:inline-block;font-family:${S.fontBody};font-size:12px;font-weight:700;letter-spacing:0.02em;padding:5px 12px;border-radius:999px;background-color:${S.sky50};color:${S.primary}">${esc(item.title || '')}</span></div>`
    : pil(item.title, S.sky50, S.primary);
  return rij(`${labeltje}${thumb}`, { padding: '44px 40px 0', id });
}

function blokLink(item, ctx, id, { linkedin = false } = {}) {
  const c = item.content || {};
  const bron = linkedin ? `Op LinkedIn${c.author_name ? ` · ${esc(c.author_name)}` : ''}` : esc(c.site_name || '');
  const foto = beeldTag(beeldVan(c, { plaats: 'link' }), ctx, BEELD_KADERS.link.breedte, { radius: 0, href: c.url });
  const kaart = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${S.border};border-radius:14px;border-collapse:separate;overflow:hidden">
${foto ? `<tr><td${id ? ' data-nb-beeld="1"' : ''} style="border-radius:14px 14px 0 0;overflow:hidden">${foto}</td></tr>`
    : id ? `<tr><td data-nb-beeld="1" style="padding:18px;text-align:center;font-family:${S.fontBody};font-size:13px;color:${S.muted};border-bottom:1px dashed ${S.border}">Klik hier voor een beeld bij de link</td></tr>` : ''}
<tr><td style="padding:20px 22px 22px">
${bron ? `<div style="font-family:${S.fontBody};font-size:12px;font-weight:700;color:${S.muted};margin-bottom:6px">${bron}</div>` : ''}
${typbaar(id, 'title', c.title || (id ? '' : c.url), { plaatshouder: 'Titel van de link', altijd: true, stijl: `font-family:${S.fontBody};font-size:17px;font-weight:700;line-height:1.35;color:${S.headingSoft};margin-bottom:8px` })}
${typbaar(id, 'text', c.text, { plaatshouder: 'Waarom we dit delen (optioneel)', optioneel: true, html: tekstNaarHtml(c.text, { size: 15, lineHeight: 1.55 }), stijl: '' })}
<div style="margin-top:14px">${leesLink(c.link_label || (linkedin ? 'Lees de post' : 'Lees meer'), c.url)}</div>
</td></tr></table>`;
  return rij(`${pil(item.title, S.sky50, S.primary)}<div style="margin-top:16px">${kaart}</div>${byline(item.author)}`, { padding: '44px 40px 4px', id });
}

function blokQuote(item, ctx, id) {
  const c = item.content || {};
  const wieStijl = `font-family:${S.fontBody};font-size:14px;color:${S.muted};margin-top:14px`;
  const wie = id
    ? `<div style="${wieStijl}"><span data-nb-veld="person" data-placeholder="Wie zei het?">${esc(c.person || '')}</span> &middot; <span data-nb-veld="role" data-nb-optioneel="1" data-placeholder="Functie of gebouw">${esc(c.role || '')}</span></div>`
    : [c.person, c.role].filter(Boolean).length ? `<div style="${wieStijl}">${[c.person, c.role].filter(Boolean).map(esc).join(' · ')}</div>` : '';
  const kopje = id
    ? `<div data-nb-veld="@title" data-nb-optioneel="1" data-placeholder="Label (optioneel)" style="font-family:${S.fontBody};font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${S.teal700}">${esc(item.title || '')}</div>`
    : label(item.title, S.teal700);
  return paneel(`${kopje}
<div style="font-family:${S.fontHead};font-size:56px;line-height:0.6;color:${S.teal700};margin:22px 0 4px">&ldquo;</div>
${typbaar(id, 'quote', c.quote, { plaatshouder: 'Typ hier wat de klant of collega zei', altijd: true, stijl: `font-family:${S.fontHead};font-size:23px;line-height:1.35;color:${S.heading}` })}
${wie}`, S.teal50, { id });
}

/**
 * EEN blok voor elke vraag aan de lezer. De soort (`item.kind`: question,
 * statement, poll) bepaalt de antwoorden; `content.stijl` de OPBOUW
 * (VRAAG_STIJLEN):
 *   subtiel    één regel met een kleurstreep, kleine knopjes op een rij
 *   kaart      twee kolommen: vraag links, antwoorden onder elkaar rechts
 *   opvallend  een groot gekleurd vlak, alles gecentreerd, grote knoppen
 * `content.kleur` is een merkkleur; alle tinten komen uit haar familie
 * (vraagThema). Zonder keuze: VRAAG_STANDAARD.
 *
 * In het voorbeeld (`id` gezet) zijn labeltje, vraag, zinnetje en de
 * opschriften van de knoppen aanwijsbaar met `data-nb-veld`.
 */
function blokVraag(item, ctx, id) {
  const c = item.content || {};
  const kind = item.kind;
  const std = VRAAG_STANDAARD[kind] || VRAAG_STANDAARD.question;
  const stijl = VRAAG_STIJLEN.some((x) => x.key === c.stijl) ? c.stijl : std.stijl;
  const k = vraagThema(c.kleur || std.kleur);
  const standaardIntro = { question: '', statement: 'Eén klik volstaat.', poll: 'Eén klik is je stem.' }[kind] || '';
  const veld = (naam, plaatshouder, extra = '') => (id ? ` data-nb-veld="${naam}" data-placeholder="${esc(plaatshouder)}"${extra}` : '');
  const ops = opties(item);
  const letters = 'ABCDEF';
  const opschrift = (o, i) => `<span${veld(`options.${i}.label`, 'Antwoord')}>${esc(o.label)}</span>`;
  const vraagTekst = kind === 'statement' && String(c.question || '').trim() && !id ? `“${String(c.question).trim()}”` : String(c.question || '');
  const introWaarde = String(c.intro || '').trim();
  const opVlak = stijl === 'opvallend';

  const labelKleur = opVlak ? (k.opTekst === '#ffffff' ? k.knop : k.opTekst) : k.accentTekst;
  const kopje = id
    ? `<div${veld('@title', 'Label')} style="font-family:${S.fontBody};font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${labelKleur}">${esc(item.title || '')}</div>`
    : label(item.title, labelKleur);
  const vraag = (maat, kleur, extra = '') => (id || vraagTekst
    ? `<h3${veld('question', kind === 'statement' ? 'Typ hier de stelling' : 'Typ hier de vraag')} style="margin:8px 0 8px;font-family:${S.fontHead};font-weight:400;font-size:${maat}px;line-height:1.2;color:${kleur};${extra}">${esc(vraagTekst)}</h3>`
    : '');
  const intro = (kleur, extra = '') => (id
    ? `<div${veld('intro', standaardIntro || 'Een zinnetje erbij (optioneel)')} style="font-family:${S.fontBody};font-size:15px;line-height:1.55;color:${kleur};${extra}">${esc(introWaarde)}</div>`
    : (introWaarde || standaardIntro) ? `<div style="font-family:${S.fontBody};font-size:15px;line-height:1.55;color:${kleur};${extra}">${esc(introWaarde || standaardIntro)}</div>` : '');
  const letter = (i, achter, voor) => (kind === 'poll'
    ? `<span style="display:inline-block;width:24px;height:24px;line-height:24px;text-align:center;border-radius:50%;background-color:${achter};color:${voor};font-size:12px;margin-right:10px">${letters[i]}</span>` : '');
  const door = byline(item.author, { onDark: opVlak && k.opTekst === '#ffffff', prefix: 'Gesteld door' });
  const omhul = (html) => (id ? `<div data-nb-antwoorden="1">${html}</div>` : html);

  if (stijl === 'subtiel') {
    // Eén regel: streep links, kleine vraag, knopjes op een rij.
    const knop = `display:inline-block;background-color:#ffffff;border:1.5px solid ${k.rand};color:${k.accentTekst};font-family:${S.fontBody};font-size:14px;font-weight:700;padding:7px 14px;border-radius:999px;text-decoration:none;margin:0 6px 8px 0`;
    const knoppen = omhul(`<div style="margin-top:10px">${ops.map((o, i) => antwoordA(item, o, ctx, knop, `${kind === 'poll' ? `<span style="opacity:.6;margin-right:6px">${letters[i]}</span>` : ''}${opschrift(o, i)}`)).join('')}</div>`);
    return rij(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td width="4" style="width:4px;background-color:${k.sterk};border-radius:2px;font-size:0;line-height:0">&nbsp;</td>
<td style="padding:4px 0 4px 18px">${kopje}${vraag(20, S.heading)}${intro(S.text, 'font-size:14px')}${knoppen}${door}</td></tr></table>`, { padding: '36px 40px 4px', id });
  }

  if (stijl === 'kaart') {
    // Twee kolommen in een licht vlak: links de vraag, rechts de antwoorden.
    const knop = `display:block;background-color:${kind === 'poll' ? '#ffffff' : k.sterk};${kind === 'poll' ? `border:1.5px solid ${k.rand};` : ''}color:${kind === 'poll' ? k.accentTekst : k.opTekst};font-family:${S.fontBody};font-size:15px;font-weight:700;padding:12px 14px;border-radius:8px;text-decoration:none;text-align:${kind === 'poll' ? 'left' : 'center'}`;
    const knoppen = omhul(ops.map((o, i) => `<div style="margin-bottom:8px">${antwoordA(item, o, ctx, knop, `${letter(i, k.sterk, k.opTekst)}${opschrift(o, i)}`)}</div>`).join(''));
    const inhoud = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td class="nb-kol" width="55%" valign="top" style="width:55%;padding-right:22px">${kopje}${vraag(26, S.heading)}${intro(S.text)}${door}</td>
<td class="nb-kol nb-kol-na" width="45%" valign="middle" style="width:45%">${knoppen}</td></tr></table>`;
    return paneel(inhoud, k.licht, { padding: '30px 28px 22px', id });
  }

  // Opvallend: een band over de hele breedte, alles gecentreerd.
  let knoppen;
  if (kind === 'poll') {
    const knop = `display:block;background-color:${k.knop};color:${k.knopTekst};font-family:${S.fontBody};font-size:16px;font-weight:700;padding:14px 18px;border-radius:10px;text-decoration:none;text-align:left`;
    const bol = k.knop === '#ffffff' ? [k.sterk, k.opTekst] : ['#ffffff', k.knopTekst];
    knoppen = ops.map((o, i) => `<div style="margin-bottom:10px">${antwoordA(item, o, ctx, knop, `${letter(i, bol[0], bol[1])}${opschrift(o, i)}`)}</div>`).join('');
  } else {
    const knop = `display:block;text-align:center;background-color:${k.knop};color:${k.knopTekst};font-family:${S.fontBody};font-size:16px;font-weight:700;padding:15px 8px;border-radius:10px;text-decoration:none`;
    if (ops.length <= 4) {
      const breed = Math.floor(100 / Math.max(1, ops.length));
      knoppen = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${ops.map((o, i) =>
        `<td width="${breed}%" style="padding:0 ${i === ops.length - 1 ? 0 : 5}px 0 ${i === 0 ? 0 : 5}px">${antwoordA(item, o, ctx, knop, opschrift(o, i))}</td>`).join('')}</tr></table>`;
    } else {
      knoppen = ops.map((o, i) => `<div style="margin-bottom:10px">${antwoordA(item, o, ctx, knop, opschrift(o, i))}</div>`).join('');
    }
  }
  const midden = 'text-align:center';
  const band = `${kopje.replace('style="', `style="${midden};`)}
${vraag(34, k.opTekst, midden)}
${intro(k.opZacht, midden)}
<div style="margin-top:24px">${omhul(knoppen)}</div>
${door ? `<table role="presentation" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td>${door}</td></tr></table>` : ''}`;
  // Groot en gecentreerd, maar binnen de vaste breedte (zoals elke kaart).
  return paneel(`<div align="center" style="text-align:center">${band}</div>`, k.sterk, { padding: '44px 36px 36px', id });
}

function blokEvents(item, ctx, id) {
  const c = item.content || {};
  const rijen = eventsVoor(item, ctx).map((e) => {
    const d = eventDatum(e.starts_at);
    if (!d) return '';
    const meta = [d.weekdag, d.uur, e.location].filter(Boolean).map(esc).join(' · ');
    const link = safeUrl(e.url);
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff;border-radius:14px;margin-bottom:10px"><tr>
<td width="62" align="center" valign="middle" style="padding:14px 0 14px 12px"><div style="font-family:${S.fontHead};font-size:28px;line-height:1;color:${S.primary}">${esc(d.dag)}</div><div style="font-family:${S.fontBody};font-size:11px;font-weight:700;letter-spacing:0.08em;color:${S.muted};margin-top:4px">${esc(d.maand)}</div></td>
<td valign="middle" style="padding:14px 12px"><div style="font-family:${S.fontBody};font-size:15px;font-weight:700;line-height:1.35;color:${S.headingSoft}">${esc(e.title)}</div><div style="font-family:${S.fontBody};font-size:13px;color:${S.muted};margin-top:2px">${meta}</div></td>
${link ? `<td align="right" valign="middle" style="padding:14px 18px 14px 0;white-space:nowrap"><a href="${link}" style="font-family:${S.fontBody};font-size:14px;font-weight:700;color:${S.primary};text-decoration:none">${esc(e.cta || 'Inschrijven')} &rarr;</a></td>` : ''}
</tr></table>`;
  }).join('');
  const kopHtml = id
    ? typbaar(id, 'heading', c.heading || 'Kom ons ontmoeten', { tag: 'h2', plaatshouder: 'Kom ons ontmoeten', stijl: `margin:10px 0 20px;font-family:${S.fontHead};font-weight:400;font-size:28px;line-height:1.15;color:${S.heading}` })
    : kop(c.heading || 'Kom ons ontmoeten', { margin: '10px 0 20px' });
  // Het labeltje (bv. "Schrijf je in") typ je in de brief, zoals de kop.
  const labeltje = id
    ? `<div data-nb-veld="@title" data-nb-optioneel="1" data-placeholder="Label (optioneel), bv. Schrijf je in" style="font-family:${S.fontBody};font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${S.primary}">${esc(item.title || '')}</div>`
    : label(item.title, S.primary);
  return paneel(`${labeltje}
${kopHtml}${rijen}`, S.sky50, { padding: '36px 32px 26px', id });
}

/**
 * Kort nieuws: twee of drie kleinere berichten uit Nieuws & updates in één
 * blok, in een van de NIEUWS_VORMEN. De kop is optioneel en typ je in de brief.
 */
/**
 * Kort nieuws: twee of drie berichten, strak uitgelijnd. Elk kaartje heeft
 * dezelfde opbouw (beeldvak, bron, titel, tekst, link) en de cellen van EEN
 * tabelrij zijn even hoog, dus de kaartjes ook. Geen foto in Nieuws &
 * updates? Dan een tekening (`beeld_thingie`) gecentreerd op een lichte
 * tint, of een leeg tintvak, zodat de rij uitgelijnd blijft.
 */
function blokNews(item, ctx, id) {
  const c = item.content || {};
  const lijst = (c.items || []).filter((n) => String(n?.title || '').trim()).slice(0, 4);
  const vorm = c.vorm || 'tekst';
  const kortje = (t, max) => { const x = String(t || '').trim(); return x.length > max ? `${x.slice(0, max - 1).replace(/\s+\S*$/, '')}…` : x; };
  const bron = (n) => (n.source ? `<div style="font-family:${S.fontBody};font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${S.muted};margin-bottom:6px">${esc(n.source)}</div>` : '');
  const meer = (n, maat = 14) => (safeUrl(n.url) ? `<div style="margin-top:10px"><a href="${safeUrl(n.url)}" style="font-family:${S.fontBody};font-size:${maat}px;font-weight:700;color:${S.primary};text-decoration:none">Lees meer &rarr;</a></div>` : '');
  const link = (n, html) => (safeUrl(n.url) ? `<a href="${safeUrl(n.url)}" style="text-decoration:none">${html}</a>` : html);
  const tekeningSrc = (n) => (n.beeld_thingie && ctx.thingieUrl ? ctx.thingieUrl(n.beeld_thingie) || '' : '');
  const heeftBeeld = (n) => Boolean(tekeningSrc(n) || safeUrl(n.beeld_url));
  /**
   * Het beeldvak: een foto die het vak vult, of een tekening gecentreerd op
   * een tint. `hoogte` = breedte * 9/16, als vaste hoogte van de cel zodat
   * elk kaartje in de rij op dezelfde hoogte begint.
   */
  const beeldvak = (n, breedte, hoogte, radius) => {
    const tek = tekeningSrc(n);
    if (tek) {
      const maat = Math.round(hoogte * 0.72);
      return link(n, `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" valign="middle" height="${hoogte}" style="height:${hoogte}px;background-color:${S.sky50};${radius}"><img src="${esc(tek)}" width="${maat}" height="${maat}" alt="" style="display:inline-block;width:${maat}px;height:${maat}px;border:0"></td></tr></table>`);
    }
    // Liefst de uitsnede (16:9, door het scherm gemaakt): dan is elk vak even hoog.
    const src = safeUrl(n.beeld_uitsnede && n.beeld_versie_uitsnede === String(n.beeld_versie || '') ? n.beeld_uitsnede : n.beeld_url);
    if (src) return link(n, `<img class="nb-foto" src="${esc(src)}" width="${breedte}" alt="${esc(n.title)}" style="display:block;width:100%;max-width:${breedte}px;height:auto;border:0;${radius}">`);
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td height="${hoogte}" style="height:${hoogte}px;background-color:${S.sky50};${radius}">&nbsp;</td></tr></table>`;
  };
  let lijf = '';
  if (vorm === 'kolommen') {
    const aantal = Math.max(1, Math.min(3, lijst.length));
    const gat = 16;
    const breedte = Math.floor((560 - gat * (aantal - 1)) / aantal);
    const hoogte = Math.round(breedte * 9 / 16);
    const metBeeld = lijst.some(heeftBeeld);
    const cellen = lijst.slice(0, 3).map((n, i) => {
      // Lange woorden (appartementsgebouwen) breken af in plaats van uit het kaartje te lopen.
      const breek = 'overflow-wrap:break-word;word-break:break-word;hyphens:auto;';
      const kaart = `${metBeeld ? beeldvak(n, breedte - 2, hoogte, 'border-radius:12px 12px 0 0') : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="table-layout:fixed"><tr><td style="padding:12px 14px 14px;${breek}">${bron(n)}
<div lang="nl" style="font-family:${S.fontBody};font-size:${aantal === 3 ? 14 : 17}px;font-weight:700;line-height:1.3;color:${S.headingSoft};${breek}">${esc(n.title)}</div>
${n.note ? `<div lang="nl" style="font-family:${S.fontBody};font-size:14px;line-height:1.5;color:${S.text};margin-top:6px;${breek}">${esc(kortje(n.note, aantal === 3 ? 110 : 160))}</div>` : ''}${meer(n)}</td></tr></table>`;
      // Breedte als percentage, zodat de tabel nooit breder wordt dan het scherm;
      // de pixels staan enkel in `width=` voor Outlook. Op een gsm: onder elkaar.
      const pct = Math.floor(100 / aantal) - (aantal > 1 ? 2 : 0);
      return `${i ? `<td class="nb-gat" width="${gat}" style="width:${gat}px;font-size:0;line-height:0">&nbsp;</td>` : ''}<td class="nb-kol${i ? ' nb-kol-na' : ''}" width="${breedte}" valign="top" style="width:${pct}%;border:1px solid ${S.border};border-radius:12px;border-collapse:separate;overflow:hidden;background-color:#ffffff">${kaart}</td>`;
    }).join('');
    lijf = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;table-layout:fixed">${aantal > 1 ? '' : ''}<tr>${cellen}</tr></table>`;
  } else if (vorm === 'lijst') {
    const metBeeld = lijst.some(heeftBeeld);
    lijf = lijst.map((n, i) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="${i ? `border-top:1px solid ${S.line};` : ''}"><tr>
${metBeeld ? `<td width="120" valign="top" style="width:120px;padding:16px 18px 16px 0">${beeldvak(n, 120, 68, 'border-radius:8px')}</td>` : ''}
<td valign="top" style="padding:16px 0;overflow-wrap:break-word;word-break:break-word">${bron(n)}<div lang="nl" style="font-family:${S.fontBody};font-size:16px;font-weight:700;line-height:1.35;color:${S.headingSoft};hyphens:auto">${esc(n.title)}</div>
${n.note ? `<div style="font-family:${S.fontBody};font-size:14px;line-height:1.5;color:${S.text};margin-top:4px">${esc(kortje(n.note, 160))}</div>` : ''}${meer(n)}</td></tr></table>`).join('');
  } else {
    const kaarten = lijst.map((n, i) => `
<td width="50%" valign="top" style="padding:0 ${i % 2 === 0 ? 8 : 0}px 16px ${i % 2 === 1 ? 8 : 0}px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${S.border};border-radius:14px;border-collapse:separate"><tr><td style="padding:20px">
${bron(n)}<div style="font-family:${S.fontBody};font-size:15px;font-weight:700;line-height:1.35;color:${S.headingSoft}">${esc(n.title)}</div>
${n.note ? `<div style="font-family:${S.fontBody};font-size:14px;line-height:1.55;color:${S.text};margin-top:10px">${esc(n.note)}</div>` : ''}${meer(n)}
</td></tr></table></td>`);
    const rijen = [];
    for (let i = 0; i < kaarten.length; i += 2) rijen.push(`<tr>${kaarten[i]}${kaarten[i + 1] || '<td width="50%"></td>'}</tr>`);
    lijf = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rijen.join('')}</table>`;
  }
  const kopTekst = String(c.heading || '');
  const kopHtml = id
    ? `<h2 data-nb-veld="heading" data-nb-optioneel="1" data-placeholder="Een kop (optioneel)" style="margin:14px 0 18px;font-family:${S.fontHead};font-weight:400;font-size:28px;line-height:1.15;color:${S.heading}">${esc(kopTekst)}</h2>`
    : kopTekst.trim() ? kop(kopTekst, { margin: '14px 0 18px' }) : '<div style="height:16px;line-height:16px;font-size:0">&nbsp;</div>';
  const leeg = id && !lijst.length
    ? `<div style="border:2px dashed #d1d5db;border-radius:14px;padding:18px 20px;font-family:${S.fontBody};font-size:14px;color:${S.muted}">Kies rechts twee of drie berichten uit Nieuws &amp; updates.</div>`
    : '';
  return rij(`${pil(item.title, S.sky50, S.primary)}
${kopHtml}${leeg}${lijf}`, { padding: '44px 40px 0', id });
}

/**
 * Een titel boven een reeks blokken (door marketing gezet). Komt in de
 * inhoudstafel als kopje, met de blokken eronder.
 */
function blokHeading(item, ctx, id) {
  const c = item.content || {};
  const n = TITEL_NIVEAUS.find((x) => x.key === c.niveau) || TITEL_NIVEAUS[0];
  const h3 = n.key === 'h3';
  const stijl = h3
    ? `margin:0;font-family:${S.fontBody};font-weight:700;font-size:${n.size}px;line-height:1.25;color:${S.heading}`
    : `margin:0;font-family:${S.fontHead};font-weight:400;font-size:${n.size}px;line-height:1.15;color:${S.heading}`;
  const titel = id
    ? `<h2 data-nb-veld="title" data-placeholder="Typ hier de titel" style="${stijl}">${esc(c.title || '')}</h2>`
    : `<h2 style="${stijl}">${esc(c.title || '')}</h2>`;
  const sub = id
    ? `<div data-nb-veld="text" data-nb-optioneel="1" data-placeholder="Een zinnetje erbij (optioneel)" style="font-family:${S.fontBody};font-size:16px;line-height:1.55;color:${S.muted};margin-top:${h3 ? 6 : 10}px">${esc(c.text || '')}</div>`
    : String(c.text || '').trim() ? `<div style="font-family:${S.fontBody};font-size:16px;line-height:1.55;color:${S.muted};margin-top:${h3 ? 6 : 10}px">${esc(c.text)}</div>` : '';
  // Een tekening als icoon links van de titel, verticaal gecentreerd.
  const icoon = c.icoon && ctx.thingieUrl ? ctx.thingieUrl(c.icoon) || '' : '';
  const kern = icoon
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td width="${n.icoon}" valign="middle" style="width:${n.icoon}px;padding-right:${Math.round(n.icoon / 4)}px"><img src="${esc(icoon)}" width="${n.icoon}" height="${n.icoon}" alt="" style="display:block;width:${n.icoon}px;height:${n.icoon}px;border:0"></td><td valign="middle">${titel}${sub}</td></tr></table>`
    : `${titel}${sub}`;
  const balk = n.balk ? `<div style="width:44px;height:4px;border-radius:2px;background-color:${S.mint};margin-bottom:16px;font-size:0;line-height:0">&nbsp;</div>` : '';
  return rij(`${balk}${kern}`, { padding: `${h3 ? 36 : 52}px 40px 0`, id });
}

/**
 * De inhoudstafel: EEN vlakke lijst, doorlopend genummerd, alles in dezelfde
 * stijl, zonder kopjes of inspringen. Welke blokken erin staan, beslist
 * marketing per blok (inToc), welk soort blok ook.
 */
function blokToc(item, ctx, id) {
  const lijst = (ctx.toc || []).map((x) => (typeof x === 'string' ? x : String(x?.t || ''))).filter(Boolean).slice(0, 15);
  // In de werkstand blijft een lege inhoudstafel zichtbaar (anders lijkt ze weg); in de mail valt ze weg.
  if (!lijst.length) {
    return id ? rij(`${label(item.title || 'In deze editie', S.primary)}<div style="margin-top:8px;font-family:${S.fontBody};font-size:14px;color:${S.muted}">Vult zichzelf zodra er blokken in de brief staan.</div>`, { padding: '36px 40px 0', id }) : '';
  }
  const rijen = lijst.map((t, i) => {
    const lijn = i ? `border-top:1px solid ${S.line};` : '';
    return `<tr><td width="34" valign="baseline" style="padding:12px 0;${lijn}font-family:${S.fontHead};font-size:22px;color:${S.primary}">${i + 1}</td>
<td valign="baseline" style="padding:12px 0;${lijn}font-family:${S.fontBody};font-size:16px;font-weight:600;color:${S.headingSoft}">${esc(t)}</td></tr>`;
  }).join('');
  return rij(`${label(item.title || 'In deze editie', S.primary)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:8px">${rijen}</table>`, { padding: '36px 40px 0', id });
}

function blokClosing(item, ctx, id) {
  const c = item.content || {};
  const auteurs = (ctx.authors || []).slice(0, 8);
  const gezichten = auteurs.map((a, i) => `<td style="padding:0;${i ? 'padding-left:4px;' : ''}">${avatar(a, 36)}</td>`).join('');
  const namen = auteurs.map((a) => String(a.name || '').split(/\s+/)[0]).filter(Boolean);
  const zin = namen.length > 1
    ? `${namen.slice(0, -1).join(', ')} en ${namen[namen.length - 1]}`
    : (namen[0] || '');
  const samen = namen.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 4px"><tr>${gezichten}
<td valign="middle" style="padding-left:14px;font-family:${S.fontBody};font-size:14px;line-height:1.5;color:${S.text}">${esc(c.together_label || 'Deze editie maakten we samen:')} ${esc(zin)}.</td></tr></table>`
    : '';
  const standaardTekst = 'Een vraag, of een idee voor de volgende editie? Antwoord gewoon op deze mail, we lezen alles.';
  const tekst = id
    ? typbaar(id, 'text', c.text, { plaatshouder: standaardTekst, html: tekstNaarHtml(c.text), stijl: `font-family:${S.fontBody};font-size:16px;line-height:1.6;color:${S.text}` })
    : tekstNaarHtml(c.text || standaardTekst);
  const knopHtml = id
    ? `<a href="#" style="display:inline-block;background-color:${S.mint};color:${S.primary};font-family:${S.fontBody};font-size:15px;font-weight:700;padding:14px 22px;border-radius:8px;text-decoration:none"><span data-nb-veld="button_label" data-nb-optioneel="1" data-placeholder="Knop (optioneel)">${esc(c.button_label || '')}</span></a>`
    : knop(c.button_label, c.button_url);
  const kopHtml = id
    ? typbaar(id, '@title', item.title || 'Tot de volgende', { tag: 'h3', plaatshouder: 'Tot de volgende', stijl: `margin:0 0 12px;font-family:${S.fontHead};font-weight:400;font-size:26px;line-height:1.15;color:${S.heading}` })
    : kop(item.title || 'Tot de volgende', { size: 26, tag: 'h3', margin: '0 0 12px' });
  return rij(`${kopHtml}
${tekst}
${samen}${knopHtml ? `<div style="margin-top:22px">${knopHtml}</div>` : ''}`, { padding: '44px 40px 44px', id });
}

/** Een beeld over de hele breedte van de mail, van rand tot rand. */
function blokImage(item, ctx, id) {
  const c = item.content || {};
  const b = beeldVan(c, { plaats: 'vol' });
  const k = BEELD_KADERS.vol;
  let tag = beeldTag(b, ctx, k.breedte, { href: c.link_url, alt: c.bijschrift || '' });
  if (!tag && !id) return '';
  if (!tag) tag = `<div style="border:2px dashed #d1d5db;border-radius:14px;padding:40px 20px;text-align:center;font-family:${S.fontBody};font-size:14px;color:${S.muted}">Klik hier om een afbeelding te kiezen</div>`;
  const bijStijl = `padding:10px 0 0;font-family:${S.fontBody};font-size:13px;line-height:1.5;color:${S.muted};text-align:center`;
  const bijschrift = id
    ? `<tr><td style="${bijStijl}"><span data-nb-veld="bijschrift" data-nb-optioneel="1" data-placeholder="Bijschrift (optioneel)">${esc(c.bijschrift || '')}</span></td></tr>`
    : String(c.bijschrift || '').trim() ? `<tr><td style="${bijStijl}">${esc(c.bijschrift)}</td></tr>` : '';
  const bAttr = id ? ' data-nb-beeld="1"' : '';
  return `<tr${id ? ` data-nb-id="${esc(id)}"` : ''}><td style="padding:36px 40px 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td${bAttr} style="padding:0">${tag}</td></tr>${bijschrift}</table></td></tr>`;
}

function blokPlaatshouder(item, id) {
  const wie = item.author?.name ? ` · ${esc(item.author.name)}` : '';
  const stand = item.status === CONTRIBUTION_STATUS.DRAFT ? 'wordt geschreven' : 'nog niet ingeleverd';
  return rij(`<div style="border:2px dashed #d1d5db;border-radius:14px;padding:18px 20px;font-family:${S.fontBody};font-size:14px;color:${S.muted}"><strong style="color:${S.headingSoft}">${esc(item.title || KINDS[item.kind]?.label || 'Stukje')}</strong>${wie} &middot; ${stand}</div>`, { padding: '24px 40px 0', id });
}

/**
 * Een productfeature uit de bibliotheek, in een van de FEATURE_VORMEN
 * (constants van product-features). Titel en korte uitleg zijn in de werkstand
 * typbaar; de USP's, "waarom" en de knop regel je in het paneel. De inhoud is
 * een kopie: de bibliotheek later aanpassen, verandert deze mail niet.
 */
function blokFeature(item, ctx, id) {
  const c = item.content || {};
  const label_ = String(c.eyebrow || '').trim() || item.title;
  const b = beeldVan(c, { plaats: 'tekst' });
  const usps = c.toon_usps !== false ? (c.usps || []).filter(Boolean) : [];
  const why = c.toon_why !== false ? String(c.why || '').trim() : '';
  const vink = (kleur) => `<td width="22" valign="top" style="padding:0 8px 0 0;font-family:${S.fontBody};font-size:15px;line-height:1.55;color:${kleur}">&#10003;</td>`;
  const lijst = (kleur = S.primary, tekst = S.text, size = 15) => (usps.length
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:12px">${usps.map((u) => `<tr>${vink(kleur)}<td valign="top" style="padding:0 0 6px;font-family:${S.fontBody};font-size:${size}px;line-height:1.55;color:${tekst}">${esc(u)}</td></tr>`).join('')}</table>`
    : '');
  const titel = typbaar(id, 'title', c.title, { tag: 'div', plaatshouder: 'Titel van de feature', altijd: true, stijl: `font-family:${S.fontHead};font-size:24px;line-height:1.2;color:${S.heading};margin:12px 0 10px` });
  const samenvatting = typbaar(id, 'summary', c.summary, { plaatshouder: 'Wat doet het, in één tot drie zinnen', optioneel: true, html: tekstNaarHtml(c.summary, { size: 15, lineHeight: 1.55 }), stijl: '' });
  const waarom = why ? `<div style="margin-top:14px;padding:12px 14px;border-left:3px solid ${S.mint};font-family:${S.fontBody};font-size:14px;line-height:1.55;color:${S.muted}"><strong style="color:${S.headingSoft}">Waarom we dit maakten.</strong> ${esc(why)}</div>` : '';
  const link = c.url ? `<div style="margin-top:16px">${leesLink(c.link_label || 'Meer over deze functie', c.url)}</div>` : '';

  switch (c.vorm) {
    case 'naast': {
      const foto = beeldTag(b, ctx, 200, { radius: 12, href: c.url, alt: c.title || '' });
      const tekst = `${pil(label_, S.sky100, S.primary)}${titel}${samenvatting}${lijst()}${waarom}${link}`;
      const inhoud = foto
        ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td class="nb-kol" valign="top">${tekst}</td>
<td class="nb-gat" width="20" style="width:20px">&nbsp;</td>
<td class="nb-kol nb-kol-na" width="200" valign="top" style="width:200px"${id ? ' data-nb-beeld="1"' : ''}>${foto}</td></tr></table>`
        : tekst;
      return rij(inhoud, { padding: '44px 40px 4px', id });
    }
    case 'uitgelicht': {
      const foto = beeldTag(b, ctx, 496, { href: c.url, alt: c.title || '' });
      return paneel(`${pil(label_, S.mint, S.primary)}
${typbaar(id, 'title', c.title, { tag: 'div', plaatshouder: 'Titel van de feature', altijd: true, stijl: `font-family:${S.fontHead};font-size:32px;line-height:1.15;color:#ffffff;margin:16px 0 12px` })}
${foto ? `<div${id ? ' data-nb-beeld="1"' : ''} style="margin:6px 0 18px">${foto}</div>` : ''}
${typbaar(id, 'summary', c.summary, { plaatshouder: 'Wat doet het', optioneel: true, html: tekstNaarHtml(c.summary, { size: 16, color: S.sky100, linkColor: '#ffffff' }), stijl: '' })}
${lijst('#ffffff', S.sky100, 15)}
${why ? `<div style="margin-top:14px;font-family:${S.fontBody};font-size:14px;line-height:1.55;color:${S.sky100}"><strong style="color:#ffffff">Waarom we dit maakten.</strong> ${esc(why)}</div>` : ''}
${c.url ? `<div style="margin-top:20px">${knop(c.link_label || 'Meer over deze functie', c.url)}</div>` : ''}`, S.primary, { padding: '36px 32px 30px', id });
    }
    case 'compact': {
      const k = BEELD_KADERS.compact;
      const foto = beeldTag(b, ctx, k.breedte, { radius: 12, href: c.url, alt: c.title || '' });
      const tekst = `${pil(label_, S.sky100, S.primary)}
${typbaar(id, 'title', c.title, { tag: 'div', plaatshouder: 'Titel van de feature', altijd: true, stijl: `font-family:${S.fontBody};font-size:18px;font-weight:700;line-height:1.3;color:${S.headingSoft};margin:10px 0 8px` })}
${typbaar(id, 'summary', c.summary, { plaatshouder: 'Eén zin', optioneel: true, html: tekstNaarHtml(c.summary, { size: 15, lineHeight: 1.5 }), stijl: '' })}${c.url ? `<div style="margin-top:10px">${leesLink(c.link_label || 'Meer', c.url)}</div>` : ''}`;
      const inhoud = foto
        ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td class="nb-kol" width="${k.breedte}" valign="top" style="width:${k.breedte}px;padding:4px 20px 0 0"${id ? ' data-nb-beeld="1"' : ''}>${foto}</td>
<td class="nb-kol nb-kol-na" valign="top">${tekst}</td></tr></table>`
        : tekst;
      return rij(inhoud, { padding: '40px 40px 4px', id });
    }
    case 'lijst':
      return rij(`${pil(label_, S.sky100, S.primary)}${titel}${lijst()}${link}`, { padding: '40px 40px 4px', id });
    default: {
      // kaart
      const foto = beeldTag(b, ctx, BEELD_KADERS.link.breedte, { radius: 0, href: c.url, alt: c.title || '' });
      const kaart = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${S.border};border-radius:14px;border-collapse:separate;overflow:hidden">
${foto ? `<tr><td${id ? ' data-nb-beeld="1"' : ''} style="border-radius:14px 14px 0 0;overflow:hidden">${foto}</td></tr>`
    : id ? `<tr><td data-nb-beeld="1" style="padding:18px;text-align:center;font-family:${S.fontBody};font-size:13px;color:${S.muted};border-bottom:1px dashed ${S.border}">Klik hier voor een beeld bij de feature</td></tr>` : ''}
<tr><td style="padding:22px 24px 24px">
${pil(label_, S.sky100, S.primary)}${titel}${samenvatting}${lijst()}${waarom}${link}
</td></tr></table>`;
      return rij(kaart, { padding: '44px 40px 4px', id });
    }
  }
}

const BLOKKEN = {
  intro: blokIntro,
  feature: blokFeature,
  heading: blokHeading,
  article: blokArticle,
  // Een bericht uit Nieuws & updates: in een van de BERICHT_VORMEN.
  snippet: blokSnippet,
  video: blokVideo,
  link: (item, ctx, id) => blokLink(item, ctx, id),
  linkedin: (item, ctx, id) => blokLink(item, ctx, id, { linkedin: true }),
  quote: blokQuote,
  image: blokImage,
  statement: blokVraag,
  question: blokVraag,
  poll: blokVraag,
  events: blokEvents,
  news: blokNews,
  toc: blokToc,
  closing: blokClosing,
};

// ─── Achtergrondkleuren ─────────────────────────────────────────────────────

/**
 * Op een donkere achtergrond wordt de tekst licht. De blokken zetten hun
 * kleuren inline (een mail kent geen erfenis via klassen), dus vervangen we de
 * tekstkleuren van de huisstijl in de HTML van dat blok -- maar enkel in een
 * style ZONDER eigen achtergrond: een knop, label, gezichtje of kader houdt
 * zijn kleuren.
 */
const OP_DONKER = [
  [S.heading, '#ffffff'], [S.headingSoft, '#f9fafb'], [S.text, '#e5e7eb'], [S.muted, '#d1d5db'], [S.primary, '#bae6fd'],
];

function lichteTekst(html) {
  return html.replace(/style="([^"]*)"/g, (heel, stijl) => {
    if (/background(-color)?\s*:/i.test(stijl)) return heel;
    let uit = stijl;
    for (const [van, naar] of OP_DONKER) uit = uit.replace(new RegExp(`(^|;)\\s*color:${van}`, 'gi'), `$1color:${naar}`);
    return `style="${uit}"`;
  });
}

/** De blokken die je in de brief zelf invult: in het voorbeeld staan ze er ook leeg. */
const IN_DE_BRIEF = new Set(['intro', 'article', 'heading', 'question', 'statement', 'poll', 'news', 'quote', 'video', 'link', 'linkedin', 'image']);

/** Blokken met een eigen gekleurd kader: daar blijft de tekst zoals ze is. */
const MET_KADER = new Set(['quote', 'statement', 'question', 'poll', 'events']);

/** Een blok met een eigen achtergrond: over de hele breedte van het blok. */
function metAchtergrond(html, kleur, kind) {
  const k = merkkleur(kleur);
  if (!k || !html) return html;
  const gekleurd = html.replace(/<td style="([^"]*)"/, (_, stijl) => `<td style="${stijl};background-color:${k}"`);
  if (!isDonker(k) || MET_KADER.has(kind)) return gekleurd;
  // De eerste td (net gekleurd) niet nog eens: die heeft nu een achtergrond.
  return lichteTekst(gekleurd);
}

// ─── Het geheel ─────────────────────────────────────────────────────────────

/** De naam van de reeks zoals de lezer ze ziet (instelling), anders de interne naam. */
export function lezersNaam(series) {
  return String(series.public_name || '').trim() || series.name;
}

/**
 * De kop van de mail. Per mailing instelbaar via `edition.header`
 * ({ logo_url, titel, ondertitel }): een sleutel die ontbreekt (of null) valt
 * terug op de reeks; een lege tekst is een bewuste keuze en blijft leeg.
 */
export function kopWaarden(series, edition) {
  const brand = BRAND[series.brand] || BRAND.openvme;
  const h = edition.header && typeof edition.header === 'object' ? edition.header : {};
  const tekst = (eigen, standaard) => (typeof eigen === 'string' ? eigen : standaard);
  const eigenLogo = /^https?:\/\//i.test(String(h.logo_url || '').trim()) ? String(h.logo_url).trim() : '';
  return {
    logo: eigenLogo || series.logo_url || brand.logo,
    titel: tekst(h.titel, lezersNaam(series)),
    ondertitel: tekst(h.ondertitel, edition.title || maandLabel(edition.send_at)),
    standaard: { logo: series.logo_url || brand.logo, titel: lezersNaam(series), ondertitel: edition.title || maandLabel(edition.send_at) },
  };
}

function kopRij(series, edition, mode) {
  const brand = BRAND[series.brand] || BRAND.openvme;
  const k = kopWaarden(series, edition);
  const standaard = k.logo === brand.logo;
  const maat = standaard
    ? `width="${brand.logoWidth}" height="${brand.logoHeight}" style="display:block;width:${brand.logoWidth}px;height:${brand.logoHeight}px;border:0"`
    : `height="30" style="display:block;height:30px;width:auto;border:0"`;
  const klik = mode === 'preview' ? ' data-nb-kop="1" title="Klik om logo en tekst aan te passen"' : '';
  return `<tr><td${klik} style="padding:26px 40px;border-bottom:1px solid ${S.line}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td valign="middle"><a href="${esc(brand.site)}" style="text-decoration:none"><img src="${safeUrl(k.logo)}" alt="${esc(brand.name)}" ${maat}></a></td>
<td valign="middle" align="right" style="font-family:${S.fontBody}">${k.titel ? `<div style="font-size:13px;font-weight:700;color:${S.primary}">${esc(k.titel)}</div>` : ''}${k.ondertitel ? `<div style="font-size:12px;color:${S.muted};margin-top:2px">${esc(k.ondertitel)}</div>` : ''}</td>
</tr></table></td></tr>`;
}

function voet(series, ctx, mode) {
  const brand = BRAND[series.brand] || BRAND.openvme;
  // Odoo herschrijft /unsubscribe_from_list per ontvanger. In het voorbeeld
  // doet die link niets.
  const uitschrijven = mode === 'preview' ? '#' : '/unsubscribe_from_list';
  const v = voetWaarden(series, ctx);
  const klik = mode === 'preview' ? ' data-nb-voet="1" title="Klik om de voetteksten aan te passen"' : '';
  return `<tr><td${klik} align="center" style="padding:24px 40px 8px;font-family:${S.fontBody};font-size:13px;line-height:1.7;color:${S.muted}">
${v.reden ? `<div>${esc(v.reden)}</div>` : ''}
<div><a href="${uitschrijven}" style="color:${S.primary}">Uitschrijven</a></div>
${v.regel ? `<div style="font-size:12px;margin-top:6px">${esc(v.regel)}</div>` : ''}
</td></tr>`;
}

/**
 * De twee voetteksten: ingesteld op de reeks (`footer_reason`, `footer_line`),
 * anders de standaardzin. De link Uitschrijven staat er altijd tussen.
 */
export function voetWaarden(series, ctx = {}) {
  const brand = BRAND[series.brand] || BRAND.openvme;
  const jaar = new Date(ctx.now || Date.now()).getUTCFullYear();
  const bedrijf = [ctx.company?.name || 'Mymmo BV', ctx.company?.address].filter(Boolean).join(' · ');
  const standaard = {
    reden: `Je krijgt deze mail omdat je ingeschreven bent voor ${lezersNaam(series)} van ${brand.name}.`,
    regel: `${brand.name} is een merk van ${bedrijf} · © ${jaar}`,
  };
  return {
    reden: String(series.footer_reason || '').trim() || standaard.reden,
    regel: String(series.footer_line || '').trim() || standaard.regel,
    standaard,
  };
}

function huls(rijen, { tint, preheader, voetRij }) {
  return `<div style="margin:0;padding:0;background-color:${tint}">
<style>@import url('${S.rethinkCss}');@font-face{font-family:'Gelica';src:url('${S.gelicaUrl}') format('opentype');font-weight:400;font-style:normal}
/* Smalle schermen (Apple Mail, iOS, de Gmail-apps): kolommen onder elkaar, minder marge. Outlook negeert dit en houdt de vaste breedtes. */
@media only screen and (max-width:480px){.nb-cel{padding-left:20px!important;padding-right:20px!important}.nb-kol{display:block!important;width:100%!important;max-width:100%!important;box-sizing:border-box!important;padding-left:0!important;padding-right:0!important}.nb-kol-na{padding-top:14px!important}.nb-gat{display:none!important}.nb-gsm-vol,.nb-kol .nb-foto{width:100%!important;max-width:100%!important}}</style>
${preheader ? `<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${tint}">${esc(preheader)}</div>` : ''}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${tint}"><tr><td align="center" style="padding:28px 12px 36px">
<table role="presentation" width="${WIDTH}" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:${WIDTH}px;background-color:#ffffff;border-radius:20px;border-collapse:separate;overflow:hidden">
${rijen.join('\n')}
</table>
<table role="presentation" width="${WIDTH}" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:${WIDTH}px">${voetRij}</table>
</td></tr></table>
</div>`;
}

/**
 * @param {object} opts
 * @param {object} opts.series   rij uit newsletter_series
 * @param {object} opts.edition  rij uit newsletter_editions
 * @param {Array}  opts.items    bijdragen in volgorde, met `author` ({name, job_title, avatar_url})
 * @param {'preview'|'test'|'live'} opts.mode
 * @param {object} opts.ctx      { events, thingieUrl, answerLink, company, now }
 * @returns {{ html: string, included: string[], open: Array }}
 */
export function renderEdition({ series, edition, items, mode = 'preview', ctx = {} }) {
  const brand = BRAND[series.brand] || BRAND.openvme;
  const tint = series.tint || brand.tint;
  const mee = items.filter((it) => doetMee(it, mode, ctx));
  const meeIds = new Set(mee.map((it) => it.id));

  // Inhoudstafel en afsluiting kijken naar wat ECHT meegaat. Welke blokken
  // erin staan, beslist marketing per blok (inToc): een vlakke, doorlopend
  // genummerde lijst in de volgorde van de brief.
  const toc = mee.filter(inToc).map(kopVan).filter(Boolean);
  const authors = [];
  const gezien = new Set();
  // Enkel wie in DEZE versie echt iets bijdroeg: een stukje dat wegvalt, telt niet mee.
  for (const it of mee) {
    const a = bijdrageVan(it);
    if (a && !gezien.has(a.name)) { gezien.add(a.name); authors.push(a); }
  }
  const blokCtx = { ...ctx, toc, authors };

  const rijen = [kopRij(series, edition, mode)];
  const open = [];
  for (const it of items) {
    const id = mode === 'preview' ? it.id : null;
    if (meeIds.has(it.id)) {
      const maak = BLOKKEN[it.kind];
      if (maak) rijen.push(metAchtergrond(maak(it, blokCtx, id), it.content?.achtergrond, it.kind));
    } else if (mode === 'preview' && IN_DE_BRIEF.has(it.kind)) {
      // Wat je IN de brief invult, staat er ook leeg al (met plaatshouders).
      open.push(it);
      rijen.push(metAchtergrond(BLOKKEN[it.kind](it, blokCtx, id), it.content?.achtergrond, it.kind));
    } else if (mode === 'preview' && !KINDS[it.kind]?.auto) {
      open.push(it);
      rijen.push(blokPlaatshouder(it, id));
    }
  }

  return {
    html: huls(rijen.filter(Boolean), { tint, preheader: edition.preheader, voetRij: isDonker(tint) ? lichteTekst(voet(series, ctx, mode)) : voet(series, ctx, mode) }),
    included: [...meeIds],
    open,
  };
}

/** Eén stukje zoals het in de mail komt, voor het schrijfscherm. */
export function renderContribution({ series, item, ctx = {} }) {
  const brand = BRAND[series?.brand] || BRAND.openvme;
  const tint = series?.tint || brand.tint;
  const maak = BLOKKEN[item.kind];
  let rij = '';
  if (maak && heeftInhoud(item, ctx)) {
    rij = maak(item, { ...ctx, toc: ctx.toc || ['Een eerste stukje', 'Een tweede stukje'], authors: item.author ? [item.author] : [] }, null);
  } else {
    rij = blokPlaatshouder(item, null);
  }
  return huls([rij, '<tr><td style="height:36px;line-height:36px">&nbsp;</td></tr>'], { tint, preheader: '', voetRij: '' });
}
