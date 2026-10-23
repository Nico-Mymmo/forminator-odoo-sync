/**
 * Tekst heen en terug tussen Odoo (HTML) en Claude (gewone tekst).
 * Puur: geen env, geen fetch.
 */

const ENTITEITEN = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: ' ' };

/** HTML uit Odoo -> leesbare tekst, hoogstens `max` tekens. */
export function htmlNaarTekst(html, max = 0) {
  if (!html || typeof html !== 'string') return '';
  let t = html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<\/(p|div|h[1-6]|li|tr|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (m, e) => {
      if (ENTITEITEN[e] !== undefined) return ENTITEITEN[e];
      if (e[0] === '#') {
        const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(n) ? String.fromCodePoint(n) : m;
      }
      return m;
    })
    .replace(/[​-‍⁠﻿]/g, '')
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (max && t.length > max) t = t.slice(0, max).trimEnd() + ' …';
  return t;
}

export function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function inline(s) {
  return esc(s)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])_(.+?)_(?=[\s).,!?:;]|$)/g, '$1<em>$2</em>');
}

/**
 * Gewone tekst (met wat Markdown: **vet**, _cursief_, "- " lijstjes,
 * "### " tussenkop) -> HTML voor de chatter of een HTML-veld in Odoo.
 * Alles wordt eerst ge-escaped: er gaat nooit HTML van Claude rechtstreeks
 * naar Odoo.
 */
export function tekstNaarHtml(tekst) {
  let bron = String(tekst || '');
  // Stuurt Claude toch HTML mee ("<p>...</p>"), dan eerst terug naar tekst. Anders
  // komen de tags ge-escaped en dus zichtbaar in Odoo te staan (2026-10-23, actieblad 1052).
  if (/<\/?(p|br|ul|ol|li|strong|b|em|i|h[1-6]|div)\b[^>]*>/i.test(bron)) {
    bron = htmlNaarTekst(bron
      .replace(/<(strong|b)\b[^>]*>(.*?)<\/\1>/gis, '**$2**')
      .replace(/<\/li>/gi, '')
      .replace(/<\/(p|h[1-6]|ul|ol|div|blockquote)>/gi, '\n\n'));
  }
  const blokken = bron.replace(/\r\n?/g, '\n').trim().split(/\n{2,}/);
  return blokken.map((blok) => {
    const regels = blok.split('\n');
    if (regels.every((r) => /^\s*[-*•]\s+/.test(r))) {
      return '<ul>' + regels.map((r) => '<li>' + inline(r.replace(/^\s*[-*•]\s+/, '')) + '</li>').join('') + '</ul>';
    }
    if (regels.every((r) => /^\s*\d+[.)]\s+/.test(r))) {
      return '<ol>' + regels.map((r) => '<li>' + inline(r.replace(/^\s*\d+[.)]\s+/, '')) + '</li>').join('') + '</ol>';
    }
    const kop = regels[0].match(/^#{1,6}\s+(.*)$/);
    if (kop) {
      const rest = regels.slice(1);
      return '<p><strong>' + inline(kop[1]) + '</strong></p>' + (rest.length ? tekstNaarHtml(rest.join('\n')) : '');
    }
    return '<p>' + regels.map(inline).join('<br>') + '</p>';
  }).join('');
}
