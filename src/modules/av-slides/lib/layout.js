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
 *     (ROUND_RATIO; het voorbeeld rekent hetzelfde). Daarom heeft een kaart op
 *     het prikbord GEEN aparte kopbalk: een smallere balk bovenin heeft een
 *     kleinere straal dan de kaart, en die twee hoeken lopen nooit gelijk;
 *   - de binnenmarge van een tekstvak: 0,1" rondom (TEXT_INSET_PT). Een tekstvak
 *     wordt daarom zoveel GROTER gemaakt dan het vlak waarin de tekst moet staan;
 *   - tekst laten krimpen tot hij past: dat doet `pasGrootte()` hier, op een
 *     schatting van de tekenbreedte (met marge). Een woord wordt nooit
 *     afgebroken; liever kleiner. Kaarten van dezelfde soort krijgen DEZELFDE
 *     lettergrootte, anders oogt het prikbord rommelig.
 *
 * Tekeningetjes (`thingy`) komen binnen als naam; `opts.tekening(naam)` geeft de
 * URL (of null, en dan valt een kaart terug op haar emoji).
 */

export const W = 960;
export const H = 540;
export const DEFAULT_SCALE = 0.75;   // pt per eenheid op een standaarddeck van 720 x 405 pt
export const TEXT_INSET_PT = 7.2;
export const ROUND_RATIO = 1 / 6;
export const LINE_HEIGHT = 1.22;     // regelhoogte bij lineSpacing 100

export const DEFAULT_STYLE = { titleFont: 'Young Serif', bodyFont: 'DM Sans' };
export const DEFAULT_ICON = 'calendar2';   // in het vierkantje naast "Prikbord"
export const DEFAULT_DECOR = 'brieven';    // rechtsboven op het prikbord

const INK = '#111827';
const MUTED = '#6b7280';
const DATUM_KLEUR = '#334155';
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

// Breedtes in em, ruim genomen (DM Sans is een brede letter). Liever een maat
// te klein dan een woord dat over de rand van een kaart loopt.
function tekenBreedte(ch) {
  if (ch === ' ') return 0.28;
  if (/[iljtfI.,:;'!|()[\]]/.test(ch)) return 0.31;
  if (/[mwMW@]/.test(ch)) return 0.88;
  if (/[A-Z]/.test(ch)) return 0.68;
  if (/[0-9]/.test(ch)) return 0.6;
  if (/[rsz]/.test(ch)) return 0.5;
  if (ch.codePointAt(0) > 0x2000) return 1.2; // emoji, sterren
  return 0.57;
}

const VEILIG = 0.94;

export function tekstBreedte(tekst, size, bold = false) {
  let w = 0;
  for (const ch of String(tekst || '')) w += tekenBreedte(ch);
  return w * size * (bold ? 1.07 : 1);
}

function langsteWoord(tekst, bold) {
  let max = 0;
  for (const woord of String(tekst || '').split(/\s+/)) max = Math.max(max, tekstBreedte(woord, 1, bold));
  return max;
}

/** Aantal regels na woordafbreking (schatting). */
export function aantalRegels(tekst, maxW, size, bold = false) {
  const breed = maxW * VEILIG;
  const spatie = tekstBreedte(' ', size, bold);
  let n = 0;
  for (const alinea of String(tekst || '').split('\n')) {
    n++;
    let lijn = 0;
    for (const woord of alinea.split(/\s+/).filter(Boolean)) {
      const b = tekstBreedte(woord, size, bold);
      if (lijn > 0 && lijn + spatie + b > breed) {
        n++;
        lijn = b;
      } else {
        lijn += (lijn > 0 ? spatie : 0) + b;
      }
    }
  }
  return n;
}

/**
 * De grootste lettergrootte (stap 0,5) waarbij de tekst in het vlak past en het
 * langste woord op een regel past -- een woord wordt nooit afgebroken.
 */
export function pasGrootte(tekst, w, h, max, min, { bold = false, lineSpacing = 100 } = {}) {
  const lh = LINE_HEIGHT * (lineSpacing / 100) * 1.04;
  const woord = langsteWoord(tekst, bold);
  for (let s = max; s > min; s -= 0.5) {
    if (woord * s <= w * VEILIG && aantalRegels(tekst, w, s, bold) * s * lh <= h) return s;
  }
  return min;
}

/** Eén regel: zo groot mogelijk zonder breder te worden dan w. */
function pasOpRegel(tekst, w, max, min, bold = true) {
  const per = tekstBreedte(tekst, 1, bold) || 1;
  return Math.max(min, Math.min(max, Math.floor(((w * VEILIG) / per) * 2) / 2));
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
    beeld(x, y, w, h, url, opts = {}) {
      if (!url) return;
      els.push({ id: id(), type: 'image', x, y, w, h, url, rotate: opts.rotate || 0 });
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

const geenTekening = () => null;

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
  return Math.max(110, 44 + kop + aantalRegels(b.text, binnen - (b.thingy ? 80 : 0), 18) * 18 * LINE_HEIGHT * 1.15);
}

function tekenTekstblok(t, b, x, y, w, h, st, tekening) {
  const s = BLOK_STIJLEN[b.style] || BLOK_STIJLEN.mint;
  t.vorm('ROUND_RECTANGLE', x, y, w, h, s.fill, s.line);
  const pad = clamp(h * 0.12, 16, 26) + (s.line ? 4 : 0);
  // Een tekeningetje rechtsboven; de tekst blijft er links van.
  const url = tekening(b.thingy);
  const ico = url ? clamp(h * 0.42, 44, 84) : 0;
  if (url) t.beeld(x + w - pad - ico, y + pad - 6, ico, ico, url);
  const bw = w - 2 * pad - (ico ? ico + 10 : 0);
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

export function wistLayout(content, { scale = DEFAULT_SCALE, imageUrl = null, tekening = geenTekening } = {}) {
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
    else tekenTekstblok(t, b, kolX, y, kolW, h, st, tekening);
    y += h + gap;
  });
  return t.els;
}

// ── Slide 2: Prikbord ───────────────────────────────────────────────────────

const GRID = { x: 60, y: 122, w: 840, h: 380, cols: 6, gx: 12, gy: 12, maxRij: 118 };
const VOLGORDE = { holiday: 0, birthday: 1, event: 2, custom: 3 };

function span(k) {
  return k.span === 2 ? 2 : 1;
}

export function zichtbareKaarten(p) {
  return ((p && p.cards) || [])
    .filter((k) => k && k.include !== false && /^\d{4}-\d{2}-\d{2}$/.test(String(k.date || '')))
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (VOLGORDE[a.kind] ?? 9) - (VOLGORDE[b.kind] ?? 9)));
}

function gretigeRijen(kaarten) {
  const rijen = [];
  let rij = [];
  let vrij = GRID.cols;
  for (const k of kaarten) {
    if (span(k) > vrij) {
      rijen.push(rij);
      rij = [];
      vrij = GRID.cols;
    }
    rij.push(k);
    vrij -= span(k);
  }
  if (rij.length) rijen.push(rij);
  return rijen;
}

/**
 * Dezelfde kaarten, in dezelfde volgorde, over `r` rijen verdeeld zodat elke rij
 * ongeveer even vol zit (hoogstens zes plaatsen). Zonder dit staat de laatste
 * rij er half leeg bij en zijn de andere propvol.
 */
function verdeel(kaarten, r) {
  const n = kaarten.length;
  const som = [0];
  for (const k of kaarten) som.push(som[som.length - 1] + span(k));
  const doel = som[n] / r;
  const kost = Array.from({ length: n + 1 }, () => new Array(r + 1).fill(Infinity));
  const van = Array.from({ length: n + 1 }, () => new Array(r + 1).fill(-1));
  kost[0][0] = 0;
  for (let k = 1; k <= r; k++) {
    for (let i = 1; i <= n; i++) {
      for (let j = k - 1; j < i; j++) {
        const u = som[i] - som[j];
        if (u > GRID.cols || kost[j][k - 1] === Infinity) continue;
        const c = kost[j][k - 1] + (u - doel) * (u - doel);
        if (c < kost[i][k]) {
          kost[i][k] = c;
          van[i][k] = j;
        }
      }
    }
  }
  if (kost[n][r] === Infinity) return null;
  const rijen = [];
  let i = n;
  for (let k = r; k > 0; k--) {
    const j = van[i][k];
    rijen.unshift(kaarten.slice(j, i));
    i = j;
  }
  return rijen;
}

export function prikbordRijen(kaarten) {
  const gretig = gretigeRijen(kaarten);
  if (gretig.length <= 1) return gretig;
  return verdeel(kaarten, gretig.length) || gretig;
}

/** Waar elke kaart komt: elke rij loopt tot de rand (uitgevuld), gecentreerd in de hoogte. */
function plaatsKaarten(kaarten) {
  const rijen = prikbordRijen(kaarten);
  const n = rijen.length;
  if (!n) return { plaatsen: [], rijen: 0 };
  const rijH = Math.min(GRID.maxRij, (GRID.h - (n - 1) * GRID.gy) / n);
  const y0 = GRID.y + (GRID.h - (n * rijH + (n - 1) * GRID.gy)) / 2;
  // Een rij met weinig kaarten wordt niet eindeloos opgerekt: dan liever gecentreerd.
  const maxEenheid = ((GRID.w - (GRID.cols - 1) * GRID.gx) / GRID.cols) * 1.5;
  const plaatsen = [];
  rijen.forEach((rij, r) => {
    const u = rij.reduce((a, k) => a + span(k), 0);
    const eenheid = Math.min((GRID.w - (rij.length - 1) * GRID.gx) / u, maxEenheid);
    const rijW = eenheid * u + (rij.length - 1) * GRID.gx;
    let x = GRID.x + (GRID.w - rijW) / 2;
    for (const k of rij) {
      const w = span(k) * eenheid;
      plaatsen.push({ k, x, y: y0 + r * (rijH + GRID.gy), w, h: rijH });
      x += w + GRID.gx;
    }
  });
  return { plaatsen, rijen: n };
}

function binnenmaten(p) {
  const pad = clamp(p.h * 0.1, 8, 12);
  const ico = clamp(p.h * 0.3, 22, 36);
  return {
    pad,
    ico,
    lijf: { x: p.x + pad, y: p.y + pad + ico + 4, w: p.w - 2 * pad, h: p.h - 2 * pad - ico - 4 },
  };
}

function kaartTekst(k) {
  return [String(k.title || '').trim(), String(k.text || '').trim()].filter(Boolean).join('\n');
}

/** Eén lettergrootte per soort kaart: de kleinste die overal past. */
function lettergroottes(plaatsen) {
  let tekst = 15;
  let feest = 17;
  let naam = 28;
  for (const p of plaatsen) {
    const { lijf } = binnenmaten(p);
    const k = p.k;
    if (k.kind === 'birthday') {
      naam = Math.min(naam, pasOpRegel(String(k.title || ''), lijf.w * 0.92, Math.min(28, lijf.h * 0.8), 11, true));
    } else if (k.kind === 'holiday') {
      feest = Math.min(feest, pasGrootte(String(k.title || ''), lijf.w, lijf.h, 17, 9, { bold: true }));
    } else {
      tekst = Math.min(tekst, pasGrootte(kaartTekst(k), lijf.w, lijf.h, 15, 8, { lineSpacing: 105 }));
    }
  }
  return { tekst, feest, naam };
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

function tekenKaart(t, p, maten, st, tekening) {
  const { k, x, y, w, h } = p;
  const { pad, ico, lijf } = binnenmaten(p);
  t.vorm('ROUND_RECTANGLE', x, y, w, h, k.tint || '#e0f2fe');

  // Bovenste regel: datum links, tekeningetje (of emoji) rechts.
  t.tekst(x + pad, y + pad, w - 2 * pad - ico - 4, ico, [{ text: datumKort(k.date), size: clamp(Math.round(ico * 0.45), 11, 14), bold: true, font: st.bodyFont, color: DATUM_KLEUR }], { valign: 'MIDDLE' });
  const url = tekening(k.thingy);
  if (url) t.beeld(x + w - pad - ico, y + pad - 2, ico, ico, url);
  else if (k.emoji) t.tekst(x + w - pad - ico, y + pad, ico, ico, [{ text: String(k.emoji), size: Math.round(ico * 0.6), font: st.bodyFont, color: INK }], { align: 'CENTER', valign: 'MIDDLE' });

  const titel = String(k.title || '').trim();
  if (k.kind === 'birthday') {
    konfetti(t, k.key || titel, x + 6, lijf.y - 2, w - 12, lijf.h + 2);
    t.tekst(lijf.x, lijf.y, lijf.w, lijf.h, [{ text: titel, size: maten.naam, bold: true, font: st.bodyFont, color: INK }], { align: 'CENTER', valign: 'MIDDLE' });
    return;
  }
  if (k.kind === 'holiday') {
    t.tekst(lijf.x, lijf.y, lijf.w, lijf.h, [{ text: titel, size: maten.feest, bold: true, font: st.bodyFont, color: INK }], { align: 'CENTER', valign: 'MIDDLE' });
    return;
  }
  const tekst = String(k.text || '').trim();
  const runs = [];
  if (titel) runs.push({ text: titel, size: maten.tekst, bold: true, font: st.bodyFont, color: INK });
  if (tekst) runs.push({ text: (titel ? '\n' : '') + tekst, size: maten.tekst, font: st.bodyFont, color: INK });
  t.tekst(lijf.x, lijf.y, lijf.w, lijf.h, runs, { valign: 'TOP', lineSpacing: 105 });
}

export function prikbordLayout(content, { scale = DEFAULT_SCALE, tekening = geenTekening } = {}) {
  const st = stijlVan(content);
  const p = (content && content.prikbord) || {};
  const t = nieuweTekening('p', TEXT_INSET_PT / scale);

  t.vorm('RECTANGLE', 0, 0, W, H, '#ffffff');
  t.vorm('RECTANGLE', 20, 18, 920, 504, '#f8fafc', { color: '#e2e8f0', weight: 1 });

  t.vorm('ROUND_RECTANGLE', 60, 42, 52, 52, MINT);
  const icoon = tekening(p.icon === undefined ? DEFAULT_ICON : p.icon);
  if (icoon) t.beeld(66, 48, 40, 40, icoon);
  else t.tekst(60, 42, 52, 52, [{ text: '🗓️', size: 24, font: st.bodyFont, color: INK }], { align: 'CENTER', valign: 'MIDDLE' });
  t.tekst(126, 42, 560, 52, [{ text: String(p.title || 'Prikbord'), size: 28, font: st.titleFont, color: INK }], { valign: 'MIDDLE' });
  t.beeld(820, 26, 90, 90, tekening(p.decor === undefined ? DEFAULT_DECOR : p.decor), { rotate: 8 });

  const { plaatsen } = plaatsKaarten(zichtbareKaarten(p));
  const maten = lettergroottes(plaatsen);
  for (const plek of plaatsen) tekenKaart(t, plek, maten, st, tekening);
  return t.els;
}

/**
 * Beide slides, plus wat het scherm moet melden.
 *
 * @param {object} content
 * @param {{scale?: number, imageUrl?: string|null, tekening?: (naam: string) => string|null}} opts
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
