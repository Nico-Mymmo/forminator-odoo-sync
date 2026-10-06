/**
 * AV-slides -- van de inhoud naar de vormen op de twee slides. Puur: geen env,
 * geen fetch, geen database.
 *
 * EEN opmaak, twee schilders. Deze functie levert een lijst vormen in een vlak
 * van 960 x 540 eenheden; `slides-api.js` zet ze om naar Google Slides-verzoeken
 * en `public/av-slides.js` tekent ze als voorbeeld in de browser. Beide doen
 * enkel een omzetting, geen enkele beslissing over plaats of grootte: zo kan het
 * voorbeeld niet iets anders beloven dan wat er in de presentatie komt.
 *
 * Wat Google Slides via de API NIET laat instellen, en waar deze opmaak dus rond
 * gebouwd is:
 *   - de straal van een ROUND_RECTANGLE: altijd 1/6 van de kortste zijde
 *     (ROUND_RATIO; het voorbeeld rekent hetzelfde);
 *   - de binnenmarge van een tekstvak: 0,1" rondom (TEXT_INSET_PT). Een tekstvak
 *     wordt daarom zoveel GROTER gemaakt dan het vlak waarin de tekst moet staan;
 *   - tekst laten krimpen tot hij past: dat doet `pasGrootte()` hier, op een
 *     schatting van de tekenbreedte. Te lang = kleiner, nooit afgekapt.
 */

export const W = 960;
export const H = 540;
export const DEFAULT_SCALE = 0.75;   // pt per eenheid op een standaarddeck van 720 x 405 pt
export const TEXT_INSET_PT = 7.2;
export const ROUND_RATIO = 1 / 6;
export const LINE_HEIGHT = 1.22;     // regelhoogte bij lineSpacing 100

export const DEFAULT_STYLE = { titleFont: 'Young Serif', bodyFont: 'DM Sans' };

const INK = '#111827';
const MUTED = '#6b7280';
const MINT = '#99f6e4';

export const BLOK_STIJLEN = {
  mint: { fill: MINT, line: null },
  sky: { fill: '#bae6fd', line: null },
  pink: { fill: '#fbcfe8', line: null },
  yellow: { fill: '#fef08a', line: null },
  white: { fill: '#ffffff', line: { color: MINT, weight: 6 } },
};

const MAANDEN = ['januari', 'februari', 'maart', 'april', 'mei', 'juni', 'juli', 'augustus',
  'september', 'oktober', 'november', 'december'];

export function datumKort(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return '';
  return `${Number(m[3])} ${MAANDEN[Number(m[2]) - 1]}`;
}

// ── Tekst meten ─────────────────────────────────────────────────────────────

function tekenBreedte(ch) {
  if (ch === ' ') return 0.27;
  if (/[iljtfI.,:;'!|()]/.test(ch)) return 0.3;
  if (/[mwMW@]/.test(ch)) return 0.85;
  if (/[A-Z]/.test(ch)) return 0.66;
  if (/[0-9]/.test(ch)) return 0.57;
  if (ch.codePointAt(0) > 0x2000) return 1.15; // emoji, sterren
  return 0.53;
}

export function tekstBreedte(tekst, size, bold = false) {
  let w = 0;
  for (const ch of String(tekst || '')) w += tekenBreedte(ch);
  return w * size * (bold ? 1.06 : 1);
}

/** Aantal regels na woordafbreking (schatting). */
export function aantalRegels(tekst, maxW, size, bold = false) {
  let n = 0;
  const spatie = tekstBreedte(' ', size, bold);
  for (const alinea of String(tekst || '').split('\n')) {
    n++;
    let lijn = 0;
    for (const woord of alinea.split(/\s+/).filter(Boolean)) {
      const b = tekstBreedte(woord, size, bold);
      if (lijn > 0 && lijn + spatie + b > maxW) {
        n++;
        lijn = 0;
      }
      if (b > maxW) {
        n += Math.floor(b / maxW);
        lijn = b % maxW;
      } else {
        lijn += (lijn > 0 ? spatie : 0) + b;
      }
    }
  }
  return n;
}

/** De grootste lettergrootte (stap 0,5) waarbij de tekst in het vlak past. */
export function pasGrootte(tekst, w, h, max, min, { bold = false, lineSpacing = 100 } = {}) {
  const lh = LINE_HEIGHT * (lineSpacing / 100) * 1.04;
  for (let s = max; s > min; s -= 0.5) {
    if (aantalRegels(tekst, w, s, bold) * s * lh <= h) return s;
  }
  return min;
}

/** Eén regel: zo groot mogelijk zonder breder te worden dan w. */
function pasOpRegel(tekst, w, max, min, bold = true) {
  const per = tekstBreedte(tekst, 1, bold) || 1;
  return Math.max(min, Math.min(max, Math.floor((w / per) * 2) / 2));
}

// ── Vormen maken ────────────────────────────────────────────────────────────

function nieuweTekening(prefix, inset) {
  let n = 0;
  const els = [];
  const id = () => `${prefix}${++n}`;
  return {
    els,
    vorm(shape, x, y, w, h, fill, line = null, extra = {}) {
      els.push({ id: id(), type: 'shape', shape, x, y, w, h, fill, line, ...extra });
    },
    /** x/y/w/h is het vlak waarin de TEKST staat; het tekstvak zelf is groter. */
    tekst(x, y, w, h, runs, opts = {}) {
      const r = (runs || []).filter((run) => run && run.text);
      if (!r.length) return;
      els.push({
        id: id(),
        type: 'text',
        x: x - inset, y: y - inset, w: w + 2 * inset, h: h + 2 * inset,
        inset,
        runs: r,
        align: opts.align || 'START',
        valign: opts.valign || 'TOP',
        lineSpacing: opts.lineSpacing || 100,
        rotate: opts.rotate || 0,
      });
    },
    beeld(x, y, w, h, url) {
      els.push({ id: id(), type: 'image', x, y, w, h, url });
    },
  };
}

function stijlVan(content) {
  const s = (content && content.style) || {};
  return {
    titleFont: s.titleFont || DEFAULT_STYLE.titleFont,
    bodyFont: s.bodyFont || DEFAULT_STYLE.bodyFont,
  };
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function zaad(str) {
  let h = 2166136261;
  for (const ch of String(str)) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function willekeurig(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const AVATAR_KLEUREN = ['#1d4ed8', '#047857', '#b45309', '#7c3aed', '#be185d', '#0e7490'];
const KONFETTI = ['#f472b6', '#facc15', '#60a5fa', '#34d399', '#a78bfa', '#fb923c'];

// ── Slide 1: Wist-je-weetje ─────────────────────────────────────────────────

function heeftInhoud(b) {
  if (b.type === 'review') return Boolean(String(b.text || '').trim() || String(b.name || '').trim());
  return Boolean(String(b.text || '').trim() || String(b.title || '').trim());
}

function blokNodig(b, w) {
  const binnen = w - 44;
  if (b.type === 'review') {
    return Math.max(130, 44 + 72 + aantalRegels(b.text, binnen, 14) * 14 * LINE_HEIGHT);
  }
  const kop = String(b.title || '').trim() ? 42 : 0;
  return Math.max(110, 44 + kop + aantalRegels(b.text, binnen, 18) * 18 * LINE_HEIGHT * 1.15);
}

function tekenTekstblok(t, b, x, y, w, h, st) {
  const s = BLOK_STIJLEN[b.style] || BLOK_STIJLEN.mint;
  t.vorm('ROUND_RECTANGLE', x, y, w, h, s.fill, s.line);
  const pad = clamp(h * 0.12, 16, 26) + (s.line ? 4 : 0);
  const bw = w - 2 * pad;
  let ty = y + pad;
  const titel = String(b.title || '').trim();
  if (titel) {
    const ts = pasOpRegel(titel, bw, 22, 13, true);
    t.tekst(x + pad, ty, bw, ts * LINE_HEIGHT, [{ text: titel, size: ts, bold: true, font: st.bodyFont, color: INK }], { valign: 'MIDDLE' });
    ty += ts * LINE_HEIGHT + 8;
  }
  const bh = y + h - pad - ty;
  const tekst = String(b.text || '').trim();
  const fs = pasGrootte(tekst, bw, bh, 19, 8, { lineSpacing: 115 });
  t.tekst(x + pad, ty, bw, bh, [{ text: tekst, size: fs, font: st.bodyFont, color: INK }], { lineSpacing: 115 });
}

function tekenReview(t, b, x, y, w, h, st) {
  const s = BLOK_STIJLEN[b.style] || BLOK_STIJLEN.white;
  t.vorm('ROUND_RECTANGLE', x, y, w, h, s.fill, s.line);
  const pad = 22 + (s.line ? 4 : 0);
  const naam = String(b.name || '').trim();
  const sterren = clamp(Math.round(Number(b.stars) || 5), 1, 5);
  const kleur = AVATAR_KLEUREN[zaad(naam) % AVATAR_KLEUREN.length];
  t.vorm('ELLIPSE', x + pad, y + pad, 34, 34, kleur);
  t.tekst(x + pad, y + pad, 34, 34, [{ text: (naam[0] || '?').toUpperCase(), size: 15, bold: true, font: st.bodyFont, color: '#ffffff' }], { align: 'CENTER', valign: 'MIDDLE' });
  const nx = x + pad + 46;
  const nw = w - 2 * pad - 46;
  t.tekst(nx, y + pad - 1, nw, 18, [{ text: naam.toUpperCase(), size: 13, bold: true, font: st.bodyFont, color: INK }], { valign: 'MIDDLE' });
  t.tekst(nx, y + pad + 18, nw, 15, [{ text: `Review via ${String(b.source || 'Google').trim() || 'Google'}`, size: 11, font: st.bodyFont, color: MUTED }], { valign: 'MIDDLE' });
  const wanneer = String(b.when || '').trim();
  t.tekst(x + pad, y + pad + 44, w - 2 * pad, 20, [
    { text: '★'.repeat(sterren) + '☆'.repeat(5 - sterren), size: 15, font: st.bodyFont, color: '#f59e0b' },
    { text: `  ${sterren}/5${wanneer ? ` · ${wanneer}` : ''}`, size: 12, font: st.bodyFont, color: MUTED },
  ], { valign: 'MIDDLE' });
  const ty = y + pad + 74;
  const bh = y + h - pad - ty;
  const tekst = String(b.text || '').trim();
  const fs = pasGrootte(tekst, w - 2 * pad, bh, 15, 8, { lineSpacing: 110 });
  t.tekst(x + pad, ty, w - 2 * pad, bh, [{ text: tekst, size: fs, font: st.bodyFont, color: '#374151' }], { lineSpacing: 110 });
}

export function wistLayout(content, { scale = DEFAULT_SCALE, imageUrl = null } = {}) {
  const st = stijlVan(content);
  const wist = (content && content.wist) || {};
  const t = nieuweTekening('w', TEXT_INSET_PT / scale);

  t.vorm('RECTANGLE', 0, 0, W, H, '#f0f7fd');
  t.vorm('ELLIPSE', 760, -150, 380, 380, '#e0eefb');
  t.vorm('ELLIPSE', 830, 330, 300, 300, '#e0eefb');
  t.tekst(60, 28, 840, 52, [{ text: String(wist.title || 'Wist-je-weetje-wist-je-datje'), size: 30, font: st.titleFont, color: INK }], { align: 'CENTER', valign: 'MIDDLE' });

  const top = 106;
  const bodem = 510;
  let kolX = 48;
  if (imageUrl) {
    t.vorm('ROUND_RECTANGLE', 48, top, 272, bodem - top, '#ffffff', { color: MINT, weight: 6 });
    t.beeld(68, top + 20, 232, bodem - top - 40, imageUrl);
    kolX = 344;
  }
  const kolW = 912 - kolX;
  const blokken = (wist.blocks || []).filter((b) => b && b.include !== false && heeftInhoud(b)).slice(0, 3);
  const gap = 18;
  const beschikbaar = bodem - top - gap * Math.max(0, blokken.length - 1);
  const nodig = blokken.map((b) => blokNodig(b, kolW));
  const som = nodig.reduce((a, b) => a + b, 0) || 1;
  let y = top;
  blokken.forEach((b, i) => {
    const h = i === blokken.length - 1 ? bodem - y : Math.round((beschikbaar * nodig[i]) / som);
    if (b.type === 'review') tekenReview(t, b, kolX, y, kolW, h, st);
    else tekenTekstblok(t, b, kolX, y, kolW, h, st);
    y += h + gap;
  });
  return t.els;
}

// ── Slide 2: Prikbord ───────────────────────────────────────────────────────

const GRID = { x: 64, y: 118, w: 832, h: 384, cols: 6, gx: 12, gy: 12, maxRij: 118 };

export function prikbordRijen(kaarten) {
  const rijen = [];
  let rij = [];
  let vrij = GRID.cols;
  for (const k of kaarten) {
    const span = k.span === 2 ? 2 : 1;
    if (span > vrij) {
      rijen.push(rij);
      rij = [];
      vrij = GRID.cols;
    }
    rij.push(k);
    vrij -= span;
  }
  if (rij.length) rijen.push(rij);
  return rijen;
}

function konfetti(t, sleutel, x, y, w, h) {
  const rnd = willekeurig(zaad(sleutel));
  for (let i = 0; i < 14; i++) {
    const kleur = KONFETTI[Math.floor(rnd() * KONFETTI.length)];
    const px = x + rnd() * (w - 8);
    const py = y + rnd() * (h - 8);
    if (rnd() < 0.35) t.vorm('ELLIPSE', px, py, 4, 4, kleur);
    else t.vorm('RECTANGLE', px, py, 3, 8, kleur, null, { rotate: Math.round(rnd() * 120 - 60) });
  }
}

function tekenKaart(t, k, x, y, w, h, st) {
  t.vorm('ROUND_RECTANGLE', x, y, w, h, '#ffffff', { color: '#e2e8f0', weight: 1 });
  const kop = clamp(h * 0.24, 20, 28);
  t.vorm('ROUND_RECTANGLE', x + 4, y + 4, w - 8, kop, k.tint || '#e0f2fe');
  t.tekst(x + 10, y + 4, kop, kop, [{ text: String(k.emoji || ''), size: Math.round(kop * 0.6), font: st.bodyFont, color: INK }], { valign: 'MIDDLE' });
  t.tekst(x + 10 + kop, y + 4, w - 22 - kop, kop, [{ text: datumKort(k.date), size: clamp(Math.round(kop * 0.55), 11, 14), bold: true, font: st.bodyFont, color: INK }], { align: 'END', valign: 'MIDDLE' });

  const bx = x + 10;
  const by = y + kop + 10;
  const bw = w - 20;
  const bh = h - kop - 16;
  const titel = String(k.title || '').trim();
  const tekst = String(k.text || '').trim();

  if (k.kind === 'birthday') {
    konfetti(t, k.key || titel, x + 6, by - 2, w - 12, bh + 2);
    const fs = pasOpRegel(titel, bw, Math.min(28, bh * 0.75), 11, true);
    t.tekst(bx, by, bw, bh, [{ text: titel, size: fs, bold: true, font: st.bodyFont, color: INK }], { align: 'CENTER', valign: 'MIDDLE' });
    return;
  }
  if (k.kind === 'holiday') {
    const fs = pasGrootte(titel, bw, bh, 18, 9, { bold: true });
    t.tekst(bx, by, bw, bh, [{ text: titel, size: fs, bold: true, font: st.bodyFont, color: INK }], { align: 'CENTER', valign: 'MIDDLE' });
    return;
  }
  const geheel = [titel, tekst].filter(Boolean).join('\n');
  const fs = pasGrootte(geheel, bw, bh, 15, 8);
  const runs = [];
  if (titel) runs.push({ text: titel, size: fs, bold: true, font: st.bodyFont, color: INK });
  if (tekst) runs.push({ text: (titel ? '\n' : '') + tekst, size: fs, font: st.bodyFont, color: INK });
  t.tekst(bx, by, bw, bh, runs, { valign: 'TOP' });
}

export function prikbordLayout(content, { scale = DEFAULT_SCALE } = {}) {
  const st = stijlVan(content);
  const p = (content && content.prikbord) || {};
  const t = nieuweTekening('p', TEXT_INSET_PT / scale);

  t.vorm('RECTANGLE', 0, 0, W, H, '#ffffff');
  t.vorm('RECTANGLE', 20, 18, 920, 504, '#f0fdfa', { color: '#cbd5e1', weight: 1 });
  t.vorm('ROUND_RECTANGLE', 62, 44, 50, 50, MINT);
  t.tekst(62, 44, 50, 50, [{ text: '🗓️', size: 24, font: st.bodyFont, color: INK }], { align: 'CENTER', valign: 'MIDDLE' });
  t.tekst(126, 44, 500, 50, [{ text: String(p.title || 'Prikbord'), size: 28, font: st.titleFont, color: INK }], { valign: 'MIDDLE' });
  t.tekst(836, 22, 80, 80, [{ text: '📌', size: 50, font: st.bodyFont, color: INK }], { align: 'CENTER', valign: 'MIDDLE', rotate: 18 });

  const kaarten = zichtbareKaarten(p);
  const rijen = prikbordRijen(kaarten);
  const n = rijen.length;
  const rijH = n ? Math.min(GRID.maxRij, (GRID.h - (n - 1) * GRID.gy) / n) : 0;
  const eenheid = (GRID.w - (GRID.cols - 1) * GRID.gx) / GRID.cols;
  rijen.forEach((rij, r) => {
    let kol = 0;
    for (const k of rij) {
      const span = k.span === 2 ? 2 : 1;
      const x = GRID.x + kol * (eenheid + GRID.gx);
      const w = span * eenheid + (span - 1) * GRID.gx;
      const y = GRID.y + r * (rijH + GRID.gy);
      tekenKaart(t, k, x, y, w, rijH, st);
      kol += span;
    }
  });
  return t.els;
}

export function zichtbareKaarten(p) {
  return ((p && p.cards) || [])
    .filter((k) => k && k.include !== false && /^\d{4}-\d{2}-\d{2}$/.test(String(k.date || '')))
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (VOLGORDE[a.kind] ?? 9) - (VOLGORDE[b.kind] ?? 9)));
}

const VOLGORDE = { holiday: 0, birthday: 1, event: 2, custom: 3 };

/**
 * Beide slides, plus wat het scherm moet melden.
 *
 * @param {object} content
 * @param {{scale?: number, imageUrl?: string|null}} opts
 */
export function bouwSlides(content, opts = {}) {
  const waarschuwingen = [];
  const p = (content && content.prikbord) || {};
  const rijen = prikbordRijen(zichtbareKaarten(p)).length;
  if (rijen > 4) {
    waarschuwingen.push(`Het prikbord heeft ${rijen} rijen: de kaarten worden klein. Zet er een paar uit, of maak een brede kaart smal.`);
  }
  const blokken = ((content && content.wist && content.wist.blocks) || []).filter((b) => b && b.include !== false && heeftInhoud(b));
  if (blokken.length > 3) waarschuwingen.push('Er passen hoogstens drie blokken op Wist-je-weetje; de overige vallen weg.');
  return {
    wist: wistLayout(content, opts),
    prik: prikbordLayout(content, opts),
    warnings: waarschuwingen,
  };
}
