/**
 * AV-slides -- de tekeningetjes ("thingies") uit de Asset Manager.
 *
 * Ze staan in R2 als `brand/thingies/thingies_<naam>.svg` (dezelfde die de
 * stappen van mymmo-forms en de keienwolk gebruiken). De lijst wordt hier
 * GELEZEN, nooit met de hand bijgehouden: een tekening die iemand in de Asset
 * Manager zet, verschijnt vanzelf in de keuzelijst. Lezen is beperkt tot dat ene
 * prefix; deze module schrijft daar nooit.
 *
 * Google Slides aanvaardt geen SVG. De PNG-kopie wordt gemaakt door de BROWSER
 * van wie het scherm open heeft (canvas), en hier bewaard als
 * `av-slides/thingies/<naam>-<etag>.png`. De etag van de SVG zit in de naam:
 * vervangt iemand de tekening, dan hoort de oude kopie er niet meer bij en wordt
 * er een nieuwe gemaakt. Een Worker heeft geen rasterizer, en Browser Rendering
 * opstarten voor een paar kleine tekeningen per maand is te zwaar.
 */

const BRON = 'brand/thingies/';
const KOPIE = 'av-slides/thingies/';
const TTL_MS = 5 * 60 * 1000;

let memo = { at: 0, data: null };

async function alles(env, prefix) {
  const uit = [];
  let cursor;
  do {
    const r = await env.R2_ASSETS.list({ prefix, cursor, limit: 500 });
    uit.push(...(r.objects || []));
    cursor = r.truncated ? r.cursor : undefined;
  } while (cursor && uit.length < 2000);
  return uit;
}

function tagVan(obj) {
  const t = String(obj.etag || obj.httpEtag || '').replace(/[^a-z0-9]/gi, '').toLowerCase();
  return (t || String(obj.size || 0)).slice(0, 8);
}

const LABELS = { vuilniishok: 'Vuilnishok', calendar1: 'Kalender', calendar2: 'Kalender (2)' };

function label(naam) {
  if (LABELS[naam]) return LABELS[naam];
  const s = naam.replace(/-/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * @returns {Promise<Array<{ name, label, svgKey, pngKey|null, tag }>>}
 */
export async function lijstTekeningen(env, { vers = false } = {}) {
  if (!vers && memo.data && Date.now() - memo.at < TTL_MS) return memo.data;
  const [bron, kopie] = await Promise.all([alles(env, BRON), alles(env, KOPIE)]);
  const kopieen = new Set(kopie.map((o) => o.key));
  const perNaam = new Map();
  for (const o of bron) {
    const m = /^brand\/thingies\/thingies_([a-z0-9-]+)\.(svg|png)$/i.exec(o.key);
    if (!m) continue;
    const naam = m[1].toLowerCase();
    const isPng = m[2].toLowerCase() === 'png';
    const tag = tagVan(o);
    const png = isPng ? o.key : (kopieen.has(pngSleutel(naam, tag)) ? pngSleutel(naam, tag) : null);
    const bestaand = perNaam.get(naam);
    // Staat er al een PNG in de bron, dan is dat de betere van de twee.
    if (bestaand && bestaand.pngKey && !png) continue;
    perNaam.set(naam, { name: naam, label: label(naam), svgKey: o.key, pngKey: png, tag });
  }
  const data = [...perNaam.values()].sort((a, b) => a.label.localeCompare(b.label, 'nl'));
  memo = { at: Date.now(), data };
  return data;
}

export function pngSleutel(naam, tag) {
  return `${KOPIE}${naam}-${tag}.png`;
}

export function vergeetTekeningen() {
  memo = { at: 0, data: null };
}

/**
 * Een opzoekfunctie voor layout.js: naam -> URL, of null.
 * `enkelPng` voor Google Slides (dat kent geen SVG); het voorbeeld mag de SVG tonen.
 */
export function tekeningZoeker(lijst, origin, { enkelPng = false } = {}) {
  const per = new Map((lijst || []).map((t) => [t.name, t]));
  return (naam) => {
    const t = naam ? per.get(naam) : null;
    if (!t) return null;
    const key = t.pngKey || (enkelPng ? null : t.svgKey);
    return key ? `${origin}/assets/${key}` : null;
  };
}
