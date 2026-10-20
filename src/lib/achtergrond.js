/**
 * De achtergrondbouwer -- de serverkant (gedeeld, niet aan een module gebonden).
 *
 * Een opgemaakt beeld bestaat uit TWEE LAGEN die apart blijven:
 *   - de ACHTERGROND: een vlak in een merkkleur, met optioneel een swirl in
 *     een tweede merkkleur. Die vult ALTIJD het hele vak, welke vorm het vak
 *     ook heeft (de swirl schaalt mee met de langste zijde).
 *   - de VOORGROND: het opgeladen beeld (een componentje, een screenshot).
 *     Het staat RELATIEF: aan een anker (midden, een rand of een hoek), met
 *     een marge tot die rand. Verandert de vorm van het vak, dan blijft het
 *     aan datzelfde anker staan.
 * De voorgrond kan BIJGESNEDEN worden (`snij`: per zijde het deel van het
 * beeld dat eraf gaat, 0 = niets). Wat binnen de uitsnede valt, staat ALTIJD
 * volledig in beeld, welke vorm het vak ook heeft (grootte hoogstens 100%);
 * de ruimte die overblijft, vult de achtergrond.
 *
 * De browser tekent en maakt er een PNG van (public/om-achtergrond.js); de
 * server bewaart enkel de KEUZES, zodat je ze later kan bijstellen, plus het
 * adres van de gemaakte PNG.
 *
 * Bewaarde vorm (normaliseerAchtergrond), versie 2:
 *   { v: 2, verhouding: '16:9', kleur: '#f0f9ff' | '',
 *     swirl: { naam, kleur, schaal, x, y, draai, dekking } | null,
 *     voorgrond: { anker, schaal, marge, snij: { boven, onder, links, rechts } },
 *     bron: <adres van de voorgrond>, url: <adres van de gemaakte PNG> }
 * Versie 1 (`beeld: { schaal, x, y }`, vrij geplaatst) wordt bij het lezen
 * omgezet: het dichtstbijzijnde anker.
 *
 * De swirls zijn de SVG's in de Asset Manager onder `brand/swirls/`. Elk
 * bestand heeft EEN kleur; de browser kleurt het om. Dezelfde vorm in twee
 * kleuren (`..._grey50.svg`, `..._white.svg`) is EEN keuze: het stuk na de
 * laatste underscore valt weg. Een vorm toevoegen = een SVG in die map zetten.
 */

import { merkkleur, MERKKLEUREN } from './merkkleuren.js';

export const SWIRL_MAP = 'brand/swirls/';

/** De vormen van het vlak (breedte:hoogte). */
export const VERHOUDINGEN = [
  { key: '16:9', label: 'Breed (16:9)' },
  { key: '3:2', label: 'Liggend (3:2)' },
  { key: '4:3', label: 'Liggend (4:3)' },
  { key: '1:1', label: 'Vierkant' },
  { key: '4:5', label: 'Staand (4:5)' },
];
const VERHOUDING_KEYS = new Set(VERHOUDINGEN.map((v) => v.key));

/** Waar de voorgrond vastzit. Dezelfde lijst staat in public/om-achtergrond.js. */
export const ANKERS = ['linksboven', 'boven', 'rechtsboven', 'links', 'midden', 'rechts', 'linksonder', 'onder', 'rechtsonder'];
const ANKER_SET = new Set(ANKERS);

// Een kleuraanduiding achteraan de bestandsnaam: die vorm bestaat in meerdere kleuren.
const KLEUR_ACHTERVOEGSEL = /_(grey|gray|grijs|white|wit|black|zwart|blue|blauw|mint|orange|oranje|pink|roze)\d*$/i;
// Lichte versies eerst NIET kiezen: een witte vorm is onzichtbaar als voorbeeldje.
const LICHT = /_(white|wit)\d*$/i;

function naamVan(key) {
  return key.slice(SWIRL_MAP.length).replace(/\.svg$/i, '').replace(KLEUR_ACHTERVOEGSEL, '');
}

function labelVan(naam) {
  const kort = naam.replace(/^scribbles-scribbles-/i, '').replace(/^swirl-/i, '');
  return /^\d/.test(kort) ? `Swirl ${kort}` : kort.replace(/[-_]+/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

/**
 * De swirls uit R2, per vorm EEN bestand. `pad` is het pad op de eigen
 * oorsprong (`/assets/...`): de browser moet de SVG kunnen lezen om hem om
 * te kleuren, en een canvas weigert beelden van een andere oorsprong.
 */
export async function listSwirls(env) {
  const lijst = await env.R2_ASSETS.list({ prefix: SWIRL_MAP, limit: 1000 });
  const perNaam = new Map();
  for (const o of lijst.objects || []) {
    if (!/\.svg$/i.test(o.key) || o.key.slice(SWIRL_MAP.length).includes('/')) continue;
    const naam = naamVan(o.key);
    const al = perNaam.get(naam);
    if (!al || (LICHT.test(al.key.replace(/\.svg$/i, '')) && !LICHT.test(o.key.replace(/\.svg$/i, '')))) {
      perNaam.set(naam, { naam, label: labelVan(naam), key: o.key, pad: `/assets/${o.key}` });
    }
  }
  return [...perNaam.values()].sort((a, b) => a.naam.localeCompare(b.naam, 'nl', { numeric: true }));
}

/** Wat het scherm van de bouwer nodig heeft, in een keer. */
export async function bouwerGegevens(env) {
  return { palet: MERKKLEUREN, verhoudingen: VERHOUDINGEN, swirls: await listSwirls(env) };
}

const getal = (v, min, max, standaard) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n * 1000) / 1000)) : standaard;
};
const adres = (v) => {
  const s = String(v || '').trim();
  return /^https?:\/\/[^\s]+$/i.test(s) ? s.slice(0, 1000) : '';
};

/** Het anker dat het dichtst bij een vrije plaats (v1: midden op x,y) ligt. */
function ankerVan(x, y) {
  const h = x < 0.4 ? 'links' : x > 0.6 ? 'rechts' : '';
  const v = y < 0.4 ? 'boven' : y > 0.6 ? 'onder' : '';
  return (h + v) || 'midden';
}

function normaliseerSnij(s) {
  const o = s && typeof s === 'object' ? s : {};
  const snij = {
    boven: getal(o.boven, 0, 0.97, 0),
    onder: getal(o.onder, 0, 0.97, 0),
    links: getal(o.links, 0, 0.97, 0),
    rechts: getal(o.rechts, 0, 0.97, 0),
  };
  // Er moet een stuk van het beeld overblijven.
  if (1 - snij.links - snij.rechts < 0.03) { snij.links = 0; snij.rechts = 0; }
  if (1 - snij.boven - snij.onder < 0.03) { snij.boven = 0; snij.onder = 0; }
  return snij;
}

function normaliseerVoorgrond(v) {
  if (v.voorgrond && typeof v.voorgrond === 'object') {
    const g = v.voorgrond;
    return {
      anker: ANKER_SET.has(g.anker) ? g.anker : 'midden',
      schaal: getal(g.schaal, 0.1, 1, 0.8),
      marge: getal(g.marge, 0, 0.3, 0.06),
      snij: normaliseerSnij(g.snij),
    };
  }
  // Versie 1: vrij geplaatst met x/y.
  const b = v.beeld && typeof v.beeld === 'object' ? v.beeld : {};
  return {
    anker: ankerVan(getal(b.x, -0.5, 1.5, 0.5), getal(b.y, -0.5, 1.5, 0.5)),
    schaal: getal(b.schaal, 0.1, 1, 0.75),
    marge: 0.06,
    snij: normaliseerSnij(null),
  };
}

/**
 * Enkel bekende sleutels, enkel merkkleuren, getallen binnen hun grenzen.
 * `null`/leeg = geen opmaak. Zonder gemaakte PNG (`url`) is het geen
 * opmaak: dan is er niets om te tonen.
 */
export function normaliseerAchtergrond(v) {
  if (!v || typeof v !== 'object') return null;
  const url = adres(v.url);
  if (!url) return null;
  const s = v.swirl && typeof v.swirl === 'object' && /^[a-z0-9][a-z0-9 _.-]{0,80}$/i.test(String(v.swirl.naam || ''))
    ? {
      naam: String(v.swirl.naam),
      kleur: merkkleur(v.swirl.kleur) || '#bae6fd',
      schaal: getal(v.swirl.schaal, 0.1, 4, 1),
      x: getal(v.swirl.x, -0.5, 1.5, 0.5),
      y: getal(v.swirl.y, -0.5, 1.5, 0.5),
      draai: getal(v.swirl.draai, -180, 180, 0),
      dekking: getal(v.swirl.dekking, 0.05, 1, 1),
    }
    : null;
  return {
    v: 2,
    verhouding: VERHOUDING_KEYS.has(v.verhouding) ? v.verhouding : '16:9',
    kleur: merkkleur(v.kleur),
    swirl: s,
    voorgrond: normaliseerVoorgrond(v),
    bron: adres(v.bron),
    url,
  };
}
