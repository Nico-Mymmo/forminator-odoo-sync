/**
 * Koppelingen — formulierwaarden LEESBAAR maken voor tekst die een mens leest.
 *
 * Puur: geen env, geen fetch, geen database.
 *
 * Waarom dit bestaat: een keuzeveld stuurt zijn WAARDE door
 * (`lift,water_verwarming`), niet het label dat de bezoeker aanklikte
 * ("Lift", "Water en verwarming"). Die waarde is terecht zo -- ze ligt vast
 * zodra er inzendingen zijn en een mapping naar Odoo rekent erop. Maar in een
 * chatter-notitie, een mail of een offerte hoort het label te staan. En een
 * tijdstip als `2026-09-27T11:39:39+00:00` is voor een mens onleesbaar en
 * staat bovendien in UTC.
 *
 * TWEE VORMEN, en die blijven gescheiden:
 *   - normalizedForm (worker-handler.js) = de ruwe waarden. Die gaan naar
 *     Odoo-velden, voorwaarden en zoekdomeinen. Hier verandert niets aan.
 *   - buildDisplayForm() = dezelfde sleutels met leesbare waarden. Enkel voor
 *     TEKST: chatter, activiteit, mail, pdf, de indieningenlijst.
 *
 * Waar de labels vandaan komen: `value_labels` op het hoogste niveau van de
 * payload, `{ veldsleutel: { waarde: label } }`. Voor een OM-keuzeveld vult de
 * Worker die zelf uit de formulierdefinitie (forms/submit.js); voor een
 * verborgen veld dat door een HTML-stap in WordPress gevuld wordt, stuurt de
 * plugin ze mee (Mymmo_Forms_Submit::waarde_labels()), want alleen WordPress
 * kent die stap. Bewust NIET in form_data: dan zou elk label een mapbaar veld
 * worden in het koppelingsscherm.
 */

export const DISPLAY_TIME_ZONE = 'Europe/Brussels';

const MAX_LABEL_LENGTH = 300;
const MAX_VALUES_PER_FIELD = 200;
const MAX_FIELDS = 200;

/**
 * `value_labels` uit een payload, geschoond. Alles wat geen string→string is,
 * valt weg: dit komt (deels) van buiten.
 *
 * @param {*} ruw
 * @returns {Record<string, Record<string, string>>}
 */
export function sanitizeValueLabels(ruw) {
  const uit = {};
  if (!ruw || typeof ruw !== 'object' || Array.isArray(ruw)) return uit;
  let velden = 0;
  for (const [veld, kaart] of Object.entries(ruw)) {
    if (velden >= MAX_FIELDS) break;
    if (!veld || typeof veld !== 'string' || !kaart || typeof kaart !== 'object' || Array.isArray(kaart)) continue;
    const schoon = {};
    let n = 0;
    for (const [waarde, label] of Object.entries(kaart)) {
      if (n >= MAX_VALUES_PER_FIELD) break;
      if (typeof label !== 'string') continue;
      const w = String(waarde).trim();
      const l = label.replace(/\s+/g, ' ').trim().slice(0, MAX_LABEL_LENGTH);
      if (!w || !l || w === l) continue;
      schoon[w] = l;
      n++;
    }
    if (n > 0) {
      uit[veld] = schoon;
      velden++;
    }
  }
  return uit;
}

/**
 * Twee label-kaarten samenvoegen; `voorrang` wint per waarde.
 */
export function mergeValueLabels(basis, voorrang) {
  const uit = { ...sanitizeValueLabels(basis) };
  for (const [veld, kaart] of Object.entries(sanitizeValueLabels(voorrang))) {
    uit[veld] = { ...(uit[veld] || {}), ...kaart };
  }
  return uit;
}

/**
 * Labels uit een OM-formulierdefinitie: elke optie van een keuzeveld.
 *
 * @param {Array<{field_key?: string, key?: string, options?: Array<{value:*, label:*}>}>} fields
 */
export function valueLabelsFromFormFields(fields) {
  const uit = {};
  for (const f of Array.isArray(fields) ? fields : []) {
    const sleutel = String((f && (f.field_key || f.key)) || '');
    const opties = Array.isArray(f && f.options) ? f.options : [];
    if (!sleutel || !opties.length) continue;
    const kaart = {};
    for (const o of opties) {
      if (!o || o.value == null || typeof o.label !== 'string') continue;
      kaart[String(o.value)] = o.label;
    }
    uit[sleutel] = kaart;
  }
  return sanitizeValueLabels(uit);
}

// Een volledig tijdstip MET tijdzone. Zonder aanduiding weten we niet in welke
// zone het staat, en dan omrekenen zou een uur verschuiven dat er niet is.
// Een kale datum (2026-12-05) blijft ook staan: die is al leesbaar en heeft
// geen tijdzone om te corrigeren.
const ISO_TIJDSTIP = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/;

/**
 * `2026-09-27T11:39:39+00:00` → `27 september 2026 om 13:39` (Brussel).
 * Geen tijdstip of onleesbaar → null.
 */
export function formatTimestamp(waarde, timeZone = DISPLAY_TIME_ZONE) {
  const tekst = String(waarde == null ? '' : waarde).trim();
  if (!ISO_TIJDSTIP.test(tekst)) return null;
  const d = new Date(tekst.replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return null;
  let delen;
  try {
    delen = new Intl.DateTimeFormat('nl-BE', {
      timeZone, day: 'numeric', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(d);
  } catch (_) {
    return null;
  }
  const p = {};
  for (const deel of delen) p[deel.type] = deel.value;
  if (!p.day || !p.month || !p.year || !p.hour || !p.minute) return null;
  return `${p.day} ${p.month} ${p.year} om ${p.hour}:${p.minute}`;
}

// Een technische sleutel: kleine letters, cijfers, liggende streepjes, en
// minstens een streepje. Zonder streepje ("lift", "ja") valt er niets te
// verbeteren en zou de terugval alleen hoofdletters rommelen.
const ZIET_ERUIT_ALS_SLEUTEL = /^[a-z0-9]+(_[a-z0-9]+)+$/;

/**
 * Een waarde leesbaar maken.
 *
 * @param {*} waarde
 * @param {Record<string,string>|null} labels  waarde → label voor DIT veld
 * @param {{heuristiek?: boolean}} [opties]
 *   heuristiek: zonder labels een lijst sleutels toch als woorden tonen
 *   (`teveel_fouten` → "teveel fouten"). Voor inzendingen van voor de labels
 *   meereisden; nooit voor herkomstvelden.
 */
export function formatDisplayValue(waarde, labels, opties = {}) {
  if (waarde == null) return waarde;
  const tekst = String(waarde);
  if (tekst.trim() === '') return waarde;

  const tijd = formatTimestamp(tekst);
  if (tijd) return tijd;

  const delen = tekst.split(/\s*,\s*/).map((d) => d.trim()).filter((d) => d !== '');
  if (!delen.length) return waarde;

  if (labels && Object.keys(labels).length) {
    // Heel de waarde is een label (een waarde met een komma erin)?
    if (Object.prototype.hasOwnProperty.call(labels, tekst.trim())) return labels[tekst.trim()];
    // Alleen omzetten als er iets herkend wordt: een vrij tekstveld met een
    // komma erin mag niet van vorm veranderen omdat het toevallig een
    // labelkaart heeft. Wat niet herkend wordt (een eigen kei die de bezoeker
    // typte) blijft letterlijk staan.
    if (delen.some((d) => Object.prototype.hasOwnProperty.call(labels, d))) {
      // Een sleutel zonder label (een optie die intussen uit de stap verdween)
      // krijgt tenminste spaties in plaats van liggende streepjes.
      return delen.map((d) => {
        if (Object.prototype.hasOwnProperty.call(labels, d)) return labels[d];
        return ZIET_ERUIT_ALS_SLEUTEL.test(d) ? d.replace(/_+/g, ' ') : d;
      }).join(', ');
    }
    return waarde;
  }

  if (opties.heuristiek && delen.some((d) => ZIET_ERUIT_ALS_SLEUTEL.test(d))
      && delen.every((d) => /^[a-z0-9_]+$/.test(d) || /\s/.test(d))) {
    const zin = delen.map((d) => (/^[a-z0-9_]+$/.test(d) ? d.replace(/_+/g, ' ') : d)).join(', ');
    return zin.charAt(0).toUpperCase() + zin.slice(1);
  }

  // Een lijst zonder spatie na de komma is een lijst, geen zin.
  if (delen.length > 1 && /,\S/.test(tekst) && delen.every((d) => /^[a-z0-9_]+$/.test(d))) {
    return delen.join(', ');
  }
  return waarde;
}

/**
 * Dezelfde sleutels als normalizedForm, met leesbare waarden.
 *
 * @param {Record<string,*>} normalizedForm
 * @param {*} valueLabels  `value_labels` uit de payload (wordt geschoond)
 */
export function buildDisplayForm(normalizedForm, valueLabels) {
  const labels = sanitizeValueLabels(valueLabels);
  const uit = {};
  for (const [sleutel, waarde] of Object.entries(normalizedForm || {})) {
    // Subvelden (name-1.first-name) delen de kaart van hun hoofdveld niet.
    const kaart = labels[sleutel] || null;
    uit[sleutel] = formatDisplayValue(waarde, kaart, {
      heuristiek: !kaart && !sleutel.startsWith('meta_'),
    });
  }
  return uit;
}
