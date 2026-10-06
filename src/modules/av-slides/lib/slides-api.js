/**
 * AV-slides -- de twee slides in een Google Slides-presentatie zetten.
 *
 * Werkt NAMENS de aangemelde collega (domeinbrede delegatie, subject = zijn
 * @mymmo.com-adres), dus met precies de rechten die hij zelf op de presentatie
 * heeft. Geen bewerkrecht = een nette melding, geen omweg.
 *
 * Eenmalig nodig (anders zegt de foutmelding het):
 *   1. de Google Slides API aanzetten in het Cloud-project van het service-account;
 *   2. de scope https://www.googleapis.com/auth/presentations toevoegen bij de
 *      client-ID in de Admin Console, NAAST de scopes die er al staan.
 *
 * Herkennen en vervangen: onze slides hebben een objectId die met `avs_wist_` of
 * `avs_prik_` begint. Een tweede keer invoegen in dezelfde presentatie VERVANGT
 * ze op dezelfde plek. Een kopie van de presentatie van vorige maand houdt die
 * id's, dus ook daar worden de oude vervangen in plaats van dat er twee staan.
 *
 * Volgorde, zodat een fout halverwege nooit de vorige versie kost: eerst de twee
 * nieuwe (lege) slides maken, dan in EEN batch vullen en de oude weghalen. Faalt
 * het vullen, dan worden de nieuwe weer verwijderd en staat de oude versie er nog.
 */

import { getGoogleAccessToken } from '../../../lib/google-auth.js';
import { W, H } from './layout.js';

export const SLIDES_SCOPE = 'https://www.googleapis.com/auth/presentations';
const API = 'https://slides.googleapis.com/v1/presentations';
const EMU_PER_PT = 12700;
const PREFIXEN = ['avs_wist_', 'avs_prik_'];

export class SlidesError extends Error {
  constructor(message, status = 400, code = 'SLIDES_ERROR') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** De id uit een Slides-link (of een kale id). */
export function presentatieId(invoer) {
  const s = String(invoer || '').trim();
  const m = /\/presentation\/d\/([a-zA-Z0-9_-]{20,})/.exec(s);
  if (m) return m[1];
  if (/^[a-zA-Z0-9_-]{25,}$/.test(s)) return s;
  return null;
}

async function api(token, pad, init = {}) {
  const res = await fetch(`${API}/${pad}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  });
  const tekst = await res.text();
  let json = null;
  try { json = JSON.parse(tekst); } catch { json = null; }
  if (!res.ok) {
    const bericht = (json && json.error && json.error.message) || tekst.slice(0, 300);
    if (res.status === 404) {
      throw new SlidesError('Die presentatie bestaat niet, of je Google-account kan ze niet openen.', 404, 'NOT_FOUND');
    }
    if (res.status === 403 && /has not been used|is disabled|SERVICE_DISABLED|accessNotConfigured/i.test(bericht)) {
      throw new SlidesError(
        'De Google Slides API staat nog niet aan in het Google Cloud-project van het service-account. Zet ze aan via APIs & Services -> Library -> Google Slides API, en probeer het daarna opnieuw.',
        503, 'API_DISABLED',
      );
    }
    if (res.status === 403) {
      throw new SlidesError('Je Google-account heeft geen bewerkrechten op die presentatie.', 403, 'NO_ACCESS');
    }
    throw new SlidesError(`Google Slides weigerde de wijziging: ${bericht}`, 502, 'SLIDES_ERROR');
  }
  return json;
}

function batch(token, id, requests) {
  return api(token, `${encodeURIComponent(id)}:batchUpdate`, { method: 'POST', body: JSON.stringify({ requests }) });
}

function naarPt(dim) {
  if (!dim) return null;
  return dim.unit === 'PT' ? Number(dim.magnitude) : Number(dim.magnitude) / EMU_PER_PT;
}

function rgb(hex) {
  const n = parseInt(String(hex || '#000000').slice(1), 16) || 0;
  return { red: ((n >> 16) & 255) / 255, green: ((n >> 8) & 255) / 255, blue: (n & 255) / 255 };
}

function plaatsing(pagina, el, maat) {
  const w = el.w * maat.s * EMU_PER_PT;
  const h = el.h * maat.s * EMU_PER_PT;
  const x = (maat.ox + el.x * maat.s) * EMU_PER_PT;
  const y = (maat.oy + el.y * maat.s) * EMU_PER_PT;
  const hoek = ((el.rotate || 0) * Math.PI) / 180;
  const cos = Math.cos(hoek);
  const sin = Math.sin(hoek);
  // Draaien om het MIDDEN: Slides draait om de linkerbovenhoek, dus verschuiven.
  const cx = x + w / 2;
  const cy = y + h / 2;
  return {
    pageObjectId: pagina,
    size: {
      width: { magnitude: Math.max(1, Math.round(w)), unit: 'EMU' },
      height: { magnitude: Math.max(1, Math.round(h)), unit: 'EMU' },
    },
    transform: {
      scaleX: cos, scaleY: cos, shearX: -sin, shearY: sin,
      translateX: Math.round(cx - (cos * w / 2 - sin * h / 2)),
      translateY: Math.round(cy - (sin * w / 2 + cos * h / 2)),
      unit: 'EMU',
    },
  };
}

function vormVerzoeken(pagina, el, maat, id) {
  const props = { shapeBackgroundFill: { solidFill: { color: { rgbColor: rgb(el.fill) } } } };
  let velden = 'shapeBackgroundFill.solidFill.color';
  if (el.line) {
    props.outline = {
      outlineFill: { solidFill: { color: { rgbColor: rgb(el.line.color) } } },
      weight: { magnitude: el.line.weight * maat.s, unit: 'PT' },
    };
    velden += ',outline.outlineFill.solidFill.color,outline.weight';
  } else {
    props.outline = { propertyState: 'NOT_RENDERED' };
    velden += ',outline.propertyState';
  }
  return [
    { createShape: { objectId: id, shapeType: el.shape, elementProperties: plaatsing(pagina, el, maat) } },
    { updateShapeProperties: { objectId: id, shapeProperties: props, fields: velden } },
  ];
}

function tekstVerzoeken(pagina, el, maat, id) {
  const tekst = el.runs.map((r) => r.text).join('');
  const uit = [
    { createShape: { objectId: id, shapeType: 'TEXT_BOX', elementProperties: plaatsing(pagina, el, maat) } },
    { insertText: { objectId: id, text: tekst, insertionIndex: 0 } },
  ];
  // Indexen in UTF-16-eenheden, net als String.length: een emoji telt voor twee.
  let pos = 0;
  for (const run of el.runs) {
    const eind = pos + run.text.length;
    uit.push({
      updateTextStyle: {
        objectId: id,
        textRange: { type: 'FIXED_RANGE', startIndex: pos, endIndex: eind },
        style: {
          fontFamily: run.font || 'Arial',
          fontSize: { magnitude: Math.round(run.size * maat.s * 10) / 10, unit: 'PT' },
          bold: Boolean(run.bold),
          foregroundColor: { opaqueColor: { rgbColor: rgb(run.color || '#111827') } },
        },
        fields: 'fontFamily,fontSize,bold,foregroundColor',
      },
    });
    pos = eind;
  }
  uit.push({
    updateParagraphStyle: {
      objectId: id,
      textRange: { type: 'ALL' },
      style: {
        alignment: el.align,
        lineSpacing: el.lineSpacing,
        spaceAbove: { magnitude: 0, unit: 'PT' },
        spaceBelow: { magnitude: 0, unit: 'PT' },
      },
      fields: 'alignment,lineSpacing,spaceAbove,spaceBelow',
    },
  });
  uit.push({ updateShapeProperties: { objectId: id, shapeProperties: { contentAlignment: el.valign }, fields: 'contentAlignment' } });
  return uit;
}

function elementVerzoeken(pagina, elementen, maat, run) {
  const uit = [];
  for (const el of elementen) {
    const id = `avs${run}${el.id}`;
    if (el.type === 'shape') uit.push(...vormVerzoeken(pagina, el, maat, id));
    else if (el.type === 'text') uit.push(...tekstVerzoeken(pagina, el, maat, id));
    else if (el.type === 'image') uit.push({ createImage: { objectId: id, url: el.url, elementProperties: plaatsing(pagina, el, maat) } });
  }
  return uit;
}

/** Een lege lay-out als die er is, anders die met de minste vakken. */
function kiesLayout(layouts) {
  const leeg = layouts.find((l) => l.layoutProperties && l.layoutProperties.name === 'BLANK');
  if (leeg) return { layoutId: leeg.objectId };
  const gesorteerd = layouts.slice().sort((a, b) => (a.pageElements || []).length - (b.pageElements || []).length);
  return gesorteerd.length ? { layoutId: gesorteerd[0].objectId } : { predefinedLayout: 'BLANK' };
}

/**
 * @param {object} env
 * @param {{ email: string, invoer: string, bouw: (scale: number) => { wist: Array, prik: Array } }} opties
 * @returns {Promise<{ presentationId: string, title: string, url: string, replaced: number }>}
 */
export async function zetInPresentatie(env, { email, invoer, bouw }) {
  const id = presentatieId(invoer);
  if (!id) throw new SlidesError('Dat is geen link naar een Google Slides-presentatie.', 400, 'BAD_URL');

  const token = await getGoogleAccessToken(env, email, SLIDES_SCOPE);
  const velden = 'presentationId,title,pageSize,slides(objectId),layouts(objectId,layoutProperties(name),pageElements(objectId))';
  const pres = await api(token, `${encodeURIComponent(id)}?fields=${encodeURIComponent(velden)}`);

  const breed = naarPt(pres.pageSize && pres.pageSize.width) || 720;
  const hoog = naarPt(pres.pageSize && pres.pageSize.height) || 405;
  const s = Math.min(breed / W, hoog / H);
  const maat = { s, ox: (breed - W * s) / 2, oy: (hoog - H * s) / 2 };
  const { wist, prik } = bouw(s);

  const slides = pres.slides || [];
  const oud = slides
    .map((sl, i) => ({ id: sl.objectId, i }))
    .filter((x) => PREFIXEN.some((p) => String(x.id).startsWith(p)));
  const plek = oud.length ? Math.min(...oud.map((x) => x.i)) : slides.length;
  const layout = kiesLayout(pres.layouts || []);
  const run = Date.now().toString(36);
  const wistId = `avs_wist_${run}`;
  const prikId = `avs_prik_${run}`;

  await batch(token, id, [
    { createSlide: { objectId: wistId, insertionIndex: plek, slideLayoutReference: layout } },
    { createSlide: { objectId: prikId, insertionIndex: plek + 1, slideLayoutReference: layout } },
  ]);

  try {
    // Een lay-out met vakken (titel, tekst) zet die op de nieuwe slide: weg ermee.
    const na = await api(token, `${encodeURIComponent(id)}?fields=${encodeURIComponent('slides(objectId,pageElements(objectId))')}`);
    const vakken = [];
    for (const sl of na.slides || []) {
      if (sl.objectId !== wistId && sl.objectId !== prikId) continue;
      for (const pe of sl.pageElements || []) vakken.push({ deleteObject: { objectId: pe.objectId } });
    }
    await batch(token, id, [
      ...vakken,
      ...elementVerzoeken(wistId, wist, maat, run),
      ...elementVerzoeken(prikId, prik, maat, run),
      ...oud.map((x) => ({ deleteObject: { objectId: x.id } })),
    ]);
  } catch (err) {
    await batch(token, id, [{ deleteObject: { objectId: wistId } }, { deleteObject: { objectId: prikId } }]).catch(() => {});
    throw err;
  }

  return {
    presentationId: id,
    title: pres.title || '',
    url: `https://docs.google.com/presentation/d/${id}/edit#slide=id.${wistId}`,
    replaced: oud.length,
  };
}
