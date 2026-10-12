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
import { STYLE as S, BRAND, KINDS, CONTRIBUTION_STATUS } from './constants.js';

const WIDTH = 640;

// ─── Kleine bouwstenen ──────────────────────────────────────────────────────

/** Platte tekst naar alinea's. **vet** en [label](https://...) worden opmaak. */
export function tekstNaarHtml(text, { size = 16, color = S.text, lineHeight = 1.6, gap = 14, linkColor = S.primary } = {}) {
  const blokken = String(text || '').replace(/\r\n?/g, '\n').split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  return blokken.map((blok, i) => {
    let h = esc(blok)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, `<a href="$2" style="color:${linkColor};text-decoration:underline">$1</a>`)
      .replace(/\n/g, '<br>');
    const mb = i === blokken.length - 1 ? 0 : gap;
    return `<p style="margin:0 0 ${mb}px;font-family:${S.fontBody};font-size:${size}px;line-height:${lineHeight};color:${color}">${h}</p>`;
  }).join('');
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

function byline(author, { onDark = false, prefix = '' } = {}) {
  if (!author?.name) return '';
  const kleur = onDark ? S.sky100 : S.muted;
  const naamKleur = onDark ? '#ffffff' : S.headingSoft;
  const functie = author.job_title ? ` · ${esc(author.job_title)}` : '';
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:22px"><tr>
<td valign="middle" style="padding-right:10px">${avatar(author, 32, { onDark })}</td>
<td valign="middle" style="font-family:${S.fontBody};font-size:13px;line-height:1.4;color:${kleur}">${prefix ? esc(prefix) + ' ' : ''}<strong style="color:${naamKleur}">${esc(author.name)}</strong>${functie}</td>
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

function rij(inhoud, { padding = '40px 40px 0', id = null } = {}) {
  const attr = id ? ` data-nb-id="${esc(id)}"` : '';
  return `<tr${attr}><td style="padding:${padding}">${inhoud}</td></tr>`;
}

function paneel(inhoud, bg, { padding = '36px 32px 30px', margin = '32px 24px 0', id = null } = {}) {
  const attr = id ? ` data-nb-id="${esc(id)}"` : '';
  return `<tr${attr}><td style="padding:${margin}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${bg};border-radius:18px"><tr><td style="padding:${padding}">${inhoud}</td></tr></table></td></tr>`;
}

function beeld(url, { width = 560, alt = '', radius = 14, href = '' } = {}) {
  const src = safeUrl(url);
  if (!src) return '';
  const img = `<img src="${src}" width="${width}" alt="${esc(alt)}" style="display:block;width:100%;max-width:${width}px;height:auto;border:0;border-radius:${radius}px">`;
  const link = safeUrl(href);
  return link ? `<a href="${link}" style="text-decoration:none">${img}</a>` : img;
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
    case 'intro':
    case 'article':
      return Boolean(String(c.title || '').trim() || String(c.text || '').trim());
    case 'video':
      return Boolean(safeUrl(c.video_url));
    case 'link':
    case 'linkedin':
      return Boolean(safeUrl(c.url));
    case 'quote':
      return Boolean(String(c.quote || '').trim());
    case 'statement':
    case 'question':
    case 'poll':
      return Boolean(String(c.question || '').trim()) && opties(item).length >= 2;
    case 'events':
      return eventsVoor(item, ctx).length > 0;
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

/** De kop waaronder een stukje in de inhoudstafel staat. */
export function kopVan(item) {
  const c = item?.content || {};
  return String(c.title || c.question || item?.title || '').trim();
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

function blokIntro(item, ctx, id) {
  const c = item.content || {};
  const tekening = c.thingie && ctx.thingieUrl ? ctx.thingieUrl(c.thingie) : null;
  const rechts = tekening
    ? `<td width="150" valign="top" style="padding-left:20px"><img src="${esc(tekening)}" width="150" height="150" alt="" style="display:block;width:150px;height:150px"></td>`
    : '';
  const inhoud = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td valign="top">${pil(item.title, '#ffffff', S.primary)}
${kop(c.title, { size: 38, tag: 'h1', margin: '18px 0 16px' })}
${tekstNaarHtml(c.text, { size: 17 })}
${byline(item.author)}</td>${rechts}</tr></table>`;
  return `<tr${id ? ` data-nb-id="${esc(id)}"` : ''}><td style="padding:44px 40px 40px;background-color:${S.teal50}">${inhoud}</td></tr>`;
}

function blokArticle(item, ctx, id) {
  const c = item.content || {};
  const tekening = c.thingie && ctx.thingieUrl ? ctx.thingieUrl(c.thingie) : null;
  const foto = safeUrl(c.image_url) ? `<div style="margin:16px 0 4px">${beeld(c.image_url, { alt: c.image_alt || '' })}</div>` : '';
  const tekst = `${kop(c.title)}${tekstNaarHtml(c.text)}${c.link_url ? `<div style="margin-top:18px">${leesLink(c.link_label, c.link_url)}</div>` : ''}`;
  const kern = tekening
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td valign="top">${tekst}</td><td width="128" valign="top" style="padding-left:20px"><img src="${esc(tekening)}" width="128" height="128" alt="" style="display:block;width:128px;height:128px"></td></tr></table>`
    : tekst;
  return rij(`${pil(item.title, S.pink50, S.pink700)}${foto}${kern}${byline(item.author)}`, { padding: '44px 40px 4px', id });
}

function blokVideo(item, ctx, id) {
  const c = item.content || {};
  const thumb = safeUrl(c.thumbnail_url)
    ? `<div style="margin:16px 0 16px">${beeld(c.thumbnail_url, { href: c.video_url, alt: c.title || 'Video' })}</div>`
    : '';
  return rij(`${pil(item.title, S.sky50, S.primary)}${kop(c.title)}${thumb}${tekstNaarHtml(c.text)}
<div style="margin-top:18px">${knop(c.button_label || 'Bekijk de video', c.video_url)}</div>${byline(item.author)}`, { padding: '44px 40px 4px', id });
}

function blokLink(item, ctx, id, { linkedin = false } = {}) {
  const c = item.content || {};
  const bron = linkedin ? `Op LinkedIn${c.author_name ? ` · ${esc(c.author_name)}` : ''}` : esc(c.site_name || '');
  const foto = safeUrl(c.image_url) ? beeld(c.image_url, { width: 558, radius: 0, href: c.url }) : '';
  const kaart = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${S.border};border-radius:14px;border-collapse:separate;overflow:hidden">
${foto ? `<tr><td style="border-radius:14px 14px 0 0;overflow:hidden">${foto}</td></tr>` : ''}
<tr><td style="padding:20px 22px 22px">
${bron ? `<div style="font-family:${S.fontBody};font-size:12px;font-weight:700;color:${S.muted};margin-bottom:6px">${bron}</div>` : ''}
<div style="font-family:${S.fontBody};font-size:17px;font-weight:700;line-height:1.35;color:${S.headingSoft};margin-bottom:8px">${esc(c.title || c.url)}</div>
${tekstNaarHtml(c.text, { size: 15, lineHeight: 1.55 })}
<div style="margin-top:14px">${leesLink(c.link_label || (linkedin ? 'Lees de post' : 'Lees meer'), c.url)}</div>
</td></tr></table>`;
  return rij(`${pil(item.title, S.sky50, S.primary)}<div style="margin-top:16px">${kaart}</div>${byline(item.author)}`, { padding: '44px 40px 4px', id });
}

function blokQuote(item, ctx, id) {
  const c = item.content || {};
  const wie = [c.person, c.role].filter(Boolean).map(esc).join(' · ');
  return paneel(`${label(item.title, S.teal700)}
<div style="font-family:${S.fontHead};font-size:56px;line-height:0.6;color:${S.teal700};margin:22px 0 4px">&ldquo;</div>
<div style="font-family:${S.fontHead};font-size:23px;line-height:1.35;color:${S.heading}">${esc(c.quote)}</div>
${wie ? `<div style="font-family:${S.fontBody};font-size:14px;color:${S.muted};margin-top:14px">${wie}</div>` : ''}`, S.teal50, { id });
}

function blokStatement(item, ctx, id) {
  const c = item.content || {};
  const ops = opties(item);
  const knopStijl = `display:block;text-align:center;background-color:${S.mint};color:${S.primary};font-family:${S.fontBody};font-size:16px;font-weight:700;padding:15px 6px;border-radius:8px;text-decoration:none`;
  let knoppen;
  if (ops.length <= 4) {
    const breed = Math.floor(100 / ops.length);
    knoppen = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px"><tr>${ops.map((o, i) =>
      `<td width="${breed}%" style="padding:0 ${i === ops.length - 1 ? 0 : 6}px 0 ${i === 0 ? 0 : 6}px">${antwoordA(item, o, ctx, knopStijl, esc(o.label))}</td>`).join('')}</tr></table>`;
  } else {
    knoppen = `<div style="margin-top:22px">${ops.map((o) => `<div style="margin-bottom:10px">${antwoordA(item, o, ctx, knopStijl, esc(o.label))}</div>`).join('')}</div>`;
  }
  return paneel(`${label(item.title, S.mint)}
${kop(`“${String(c.question || '').trim()}”`, { size: 32, color: '#ffffff' })}
${tekstNaarHtml(c.intro || 'Eén klik volstaat.', { size: 15, color: S.sky100 })}
${knoppen}${byline(item.author, { onDark: true, prefix: 'Gesteld door' })}`, S.primary, { padding: '40px 36px 30px', id });
}

function blokQuestion(item, ctx, id) {
  const c = item.content || {};
  const stijl = `display:inline-block;background-color:#ffffff;border:1.5px solid ${S.orange200};color:${S.orange800};font-family:${S.fontBody};font-size:15px;font-weight:600;padding:10px 16px;border-radius:999px;text-decoration:none;margin:0 8px 10px 0`;
  return paneel(`${label(item.title, S.orange700)}
${kop(c.question, { size: 25, tag: 'h3', margin: '10px 0 10px' })}
${c.intro ? tekstNaarHtml(c.intro, { size: 15 }) : ''}
<div style="margin-top:16px">${opties(item).map((o) => antwoordA(item, o, ctx, stijl, esc(o.label))).join('')}</div>
${byline(item.author, { prefix: 'Gesteld door' })}`, S.orange50, { padding: '32px 32px 24px', id });
}

function blokPoll(item, ctx, id) {
  const c = item.content || {};
  const letters = 'ABCDEF';
  const stijl = `display:block;background-color:${S.mint};color:${S.primary};font-family:${S.fontBody};font-size:16px;font-weight:700;padding:14px 18px;border-radius:8px;text-decoration:none`;
  const rijen = opties(item).map((o, i) => `<div style="margin-bottom:10px">${antwoordA(item, o, ctx, stijl,
    `<span style="display:inline-block;width:26px;height:26px;line-height:26px;text-align:center;border-radius:50%;background-color:#ffffff;font-size:13px;margin-right:12px">${letters[i]}</span>${esc(o.label)}`)}</div>`).join('');
  return paneel(`${label(item.title, S.mint)}
${kop(c.question, { size: 30, color: '#ffffff', margin: '12px 0 8px' })}
${tekstNaarHtml(c.intro || 'Eén klik is je stem.', { size: 15, color: S.sky100 })}
<div style="margin-top:22px">${rijen}</div>${byline(item.author, { onDark: true, prefix: 'Gesteld door' })}`, S.primary, { padding: '38px 36px 30px', id });
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
  return paneel(`${label(item.title, S.primary)}
${kop(c.heading || 'Kom ons ontmoeten', { margin: '10px 0 20px' })}${rijen}`, S.sky50, { padding: '36px 32px 26px', id });
}

function blokNews(item, ctx, id) {
  const c = item.content || {};
  const kaarten = (c.items || []).filter((n) => String(n?.title || '').trim()).slice(0, 4).map((n, i) => `
<td width="50%" valign="top" style="padding:0 ${i % 2 === 0 ? 8 : 0}px 16px ${i % 2 === 1 ? 8 : 0}px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid ${S.border};border-radius:14px;border-collapse:separate"><tr><td style="padding:20px">
<div style="font-family:${S.fontBody};font-size:15px;font-weight:700;line-height:1.35;color:${S.headingSoft}">${esc(n.title)}</div>
${n.note ? `<div style="font-family:${S.fontBody};font-size:14px;line-height:1.55;color:${S.text};margin-top:10px">${esc(n.note)}</div>` : ''}
${safeUrl(n.url) ? `<div style="margin-top:12px"><a href="${safeUrl(n.url)}" style="font-family:${S.fontBody};font-size:14px;font-weight:700;color:${S.primary};text-decoration:none">Lees meer &rarr;</a></div>` : ''}
</td></tr></table></td>`);
  const rijen = [];
  for (let i = 0; i < kaarten.length; i += 2) {
    rijen.push(`<tr>${kaarten[i]}${kaarten[i + 1] || '<td width="50%"></td>'}</tr>`);
  }
  return rij(`${pil(item.title, S.sky50, S.primary)}
${kop(c.heading || 'Wat er speelt', { margin: '14px 0 18px' })}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rijen.join('')}</table>`, { padding: '44px 40px 0', id });
}

function blokToc(item, ctx, id) {
  const lijst = (ctx.toc || []).slice(0, 8);
  if (!lijst.length) return '';
  const rijen = lijst.map((t, i) => `<tr><td width="34" valign="baseline" style="padding:12px 0;${i ? `border-top:1px solid ${S.line};` : ''}font-family:${S.fontHead};font-size:22px;color:${S.primary}">${i + 1}</td>
<td valign="baseline" style="padding:12px 0;${i ? `border-top:1px solid ${S.line};` : ''}font-family:${S.fontBody};font-size:16px;font-weight:600;color:${S.headingSoft}">${esc(t)}</td></tr>`).join('');
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
  const knopHtml = knop(c.button_label, c.button_url);
  return rij(`${kop(item.title || 'Tot de volgende', { size: 26, tag: 'h3', margin: '0 0 12px' })}
${tekstNaarHtml(c.text || 'Een vraag, of een idee voor de volgende editie? Antwoord gewoon op deze mail, we lezen alles.')}
${samen}${knopHtml ? `<div style="margin-top:22px">${knopHtml}</div>` : ''}`, { padding: '44px 40px 44px', id });
}

function blokPlaatshouder(item, id) {
  const wie = item.author?.name ? ` · ${esc(item.author.name)}` : '';
  const stand = item.status === CONTRIBUTION_STATUS.DRAFT ? 'wordt geschreven' : 'nog niet ingeleverd';
  return rij(`<div style="border:2px dashed #d1d5db;border-radius:14px;padding:18px 20px;font-family:${S.fontBody};font-size:14px;color:${S.muted}"><strong style="color:${S.headingSoft}">${esc(item.title || KINDS[item.kind]?.label || 'Stukje')}</strong>${wie} &middot; ${stand}</div>`, { padding: '24px 40px 0', id });
}

const BLOKKEN = {
  intro: blokIntro,
  article: blokArticle,
  video: blokVideo,
  link: (item, ctx, id) => blokLink(item, ctx, id),
  linkedin: (item, ctx, id) => blokLink(item, ctx, id, { linkedin: true }),
  quote: blokQuote,
  statement: blokStatement,
  question: blokQuestion,
  poll: blokPoll,
  events: blokEvents,
  news: blokNews,
  toc: blokToc,
  closing: blokClosing,
};

// ─── Het geheel ─────────────────────────────────────────────────────────────

function kopRij(series, edition) {
  const brand = BRAND[series.brand] || BRAND.openvme;
  const logo = series.logo_url || brand.logo;
  const standaard = logo === brand.logo;
  const maat = standaard
    ? `width="${brand.logoWidth}" height="${brand.logoHeight}" style="display:block;width:${brand.logoWidth}px;height:${brand.logoHeight}px;border:0"`
    : `height="30" style="display:block;height:30px;width:auto;border:0"`;
  return `<tr><td style="padding:26px 40px;border-bottom:1px solid ${S.line}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td valign="middle"><a href="${esc(brand.site)}" style="text-decoration:none"><img src="${safeUrl(logo)}" alt="${esc(brand.name)}" ${maat}></a></td>
<td valign="middle" align="right" style="font-family:${S.fontBody}"><div style="font-size:13px;font-weight:700;color:${S.primary}">${esc(series.name)}</div><div style="font-size:12px;color:${S.muted};margin-top:2px">${esc(edition.title || maandLabel(edition.send_at))}</div></td>
</tr></table></td></tr>`;
}

function voet(series, ctx, mode) {
  const brand = BRAND[series.brand] || BRAND.openvme;
  // Odoo herschrijft /unsubscribe_from_list per ontvanger. In het voorbeeld
  // doet die link niets.
  const uitschrijven = mode === 'preview' ? '#' : '/unsubscribe_from_list';
  const jaar = new Date(ctx.now || Date.now()).getUTCFullYear();
  const bedrijf = [ctx.company?.name || 'Mymmo BV', ctx.company?.address].filter(Boolean).map(esc).join(' · ');
  return `<tr><td align="center" style="padding:24px 40px 8px;font-family:${S.fontBody};font-size:13px;line-height:1.7;color:${S.muted}">
<div>Je krijgt deze mail omdat je ingeschreven bent voor ${esc(series.name)} van ${esc(brand.name)}.</div>
<div><a href="${uitschrijven}" style="color:${S.primary}">Uitschrijven</a></div>
<div style="font-size:12px;margin-top:6px">${esc(brand.name)} is een merk van ${bedrijf} &middot; &copy; ${jaar}</div>
</td></tr>`;
}

function huls(rijen, { tint, preheader, voetRij }) {
  return `<div style="margin:0;padding:0;background-color:${tint}">
<style>@import url('${S.rethinkCss}');@font-face{font-family:'Gelica';src:url('${S.gelicaUrl}') format('opentype');font-weight:400;font-style:normal}</style>
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

  // Inhoudstafel en afsluiting kijken naar wat ECHT meegaat.
  const toc = mee.filter((it) => !['toc', 'closing', 'intro'].includes(it.kind)).map(kopVan).filter(Boolean);
  const authors = [];
  const gezien = new Set();
  for (const it of mee) {
    const a = it.author;
    if (a?.name && !gezien.has(a.name)) { gezien.add(a.name); authors.push(a); }
  }
  const blokCtx = { ...ctx, toc, authors };

  const rijen = [kopRij(series, edition)];
  const open = [];
  for (const it of items) {
    const id = mode === 'preview' ? it.id : null;
    if (meeIds.has(it.id)) {
      const maak = BLOKKEN[it.kind];
      if (maak) rijen.push(maak(it, blokCtx, id));
    } else if (mode === 'preview' && !KINDS[it.kind]?.auto) {
      open.push(it);
      rijen.push(blokPlaatshouder(it, id));
    }
  }

  return {
    html: huls(rijen.filter(Boolean), { tint, preheader: edition.preheader, voetRij: voet(series, ctx, mode) }),
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
