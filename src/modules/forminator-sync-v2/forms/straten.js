/**
 * Koppelingen — straatnamen per postcode, voor het veld "Straat en huisnummer".
 *
 * De lijst staat in D1 om-core (tabel `straten`, gegenereerd door
 * scripts/postcodes/build-straten.py uit FOD BOSA BeST Address). Ze HELPT, ze
 * houdt niemand tegen: een straat die er niet in staat (nieuwbouw, een tikfout
 * die we niet herkennen) gaat gewoon door zoals de bezoeker ze typte. Wat wel
 * herkend wordt, krijgt de officiele schrijfwijze -- zo staat er in Odoo
 * "Kerkstraat 12" en niet "kerkstr 12", en vindt de connector de dubbels.
 *
 * Dit bestand is PUUR (geen env, geen database): schema.js en de tests
 * gebruiken het. De lijst ophalen: stratenVoor() in straten-db.js.
 */

/** Een straatnaam zonder schrijfwijze: geen accenten, hoofdletters of leestekens, "str." = "straat". */
export function straatSleutel(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/\bstr\.?(?=\s|$)/g, 'straat').replace(/str\.?$/, 'straat')
    .replace(/\bstwg\.?(?=\s|$)/g, 'steenweg').replace(/stwg\.?$/, 'steenweg')
    .replace(/\bav\.?(?=\s)/g, 'avenue').replace(/\bbd\.?(?=\s)/g, 'boulevard')
    .replace(/[^a-z0-9]+/g, '');
}

/** De naam van een straat in de taal van het formulier (anders de eerste). */
export function straatNaam(item, taal) {
  if (typeof item === 'string') return item;
  if (!item || typeof item !== 'object') return '';
  return item[taal] || item.nl || item.fr || item.de || '';
}

/**
 * "kerkstr. 12 bus 3" -> "Kerkstraat 12 bus 3", als de straat in de lijst
 * staat. Het huisnummer en wat erachter komt, blijft zoals getypt. Een
 * meertalige straat houdt de taal waarin ze getypt werd. Niet herkend -> null.
 *
 * @param {string} waarde wat de bezoeker typte
 * @param {Array<string|Object>} namen de straten van die postcode
 * @param {string} taal taal van het formulier
 */
export function herkenStraat(waarde, namen, taal) {
  const v = String(waarde || '').replace(/\s+/g, ' ').trim();
  if (!v || !Array.isArray(namen) || !namen.length) return null;
  const m = v.match(/^(.*?)(?:[\s,]+(\d.*))?$/);
  const deel = (m && m[1]) || v;
  const rest = (m && m[2]) || '';
  const zoek = straatSleutel(deel);
  if (!zoek) return null;
  for (const item of namen) {
    const varianten = typeof item === 'string' ? [[null, item]] : Object.entries(item);
    for (const [t, naam] of varianten) {
      if (straatSleutel(naam) === zoek) {
        const officieel = t ? naam : straatNaam(item, taal);
        return rest ? `${officieel} ${rest}` : officieel;
      }
    }
  }
  return null;
}
