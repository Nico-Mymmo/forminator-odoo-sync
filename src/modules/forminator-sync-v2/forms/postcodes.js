/**
 * Koppelingen — postcodes herkennen (puur)
 *
 * Geen env, geen fetch, geen database: de lijsten zijn statische modules die
 * scripts/postcodes/build-postcodes.py genereert uit open overheidsdata (BE:
 * FOD BOSA BeST Address, NL: GeoNames, beide CC BY 4.0). Bewerk die lijsten
 * nooit met de hand; draai het script opnieuw.
 *
 * Wie dit gebruikt:
 *   - forms/schema.js        het postcodeveld nakijken en het gemeenteveld
 *                            invullen bij een inzending (de enige controle die
 *                            telt -- zie validateSubmissionValues()).
 *   - dashboards             de aanvragen op de kaart (zwaartepunt per postcode).
 *   - wp-plugin/build-mymmo-forms.sh  maakt er een afgeslankte kopie van voor
 *                            de browser (enkel postcode -> plaatsen).
 *
 * De vormregels per land staan hier EN in
 * wp-plugin/mymmo-forms/assets/js/mymmo-forms-postcode.js (LANDEN). Dat is
 * bewust: de plugin kan geen Worker-code importeren. Voeg je een land toe,
 * dan op beide plekken -- plus een lijst in build-postcodes.py.
 */

import BE from './postcodes/be.js';
import NL from './postcodes/nl.js';

/**
 * De landen waarvoor een postcodeveld kan gelden.
 *
 * `patroon` geldt voor de GENORMALISEERDE vorm zonder spaties: hoofdletters,
 * geen landprefix. `formaat` maakt daar de vorm van die in Odoo hoort te
 * staan ("1011 AB", met spatie, zoals PostNL hem schrijft).
 *
 * Nederland: de lettercombinaties SA, SD en SS worden niet uitgegeven
 * (PostNL), dus die wijzen we meteen af.
 */
export const POSTCODE_LANDEN = {
  BE: {
    label: 'België',
    voorbeeld: '9000',
    numeriek: true,
    data: BE,
    patroon: /^[1-9]\d{3}$/,
    sleutel: (v) => v,
    formaat: (v) => v,
  },
  NL: {
    label: 'Nederland',
    voorbeeld: '1011 AB',
    numeriek: false,
    data: NL,
    patroon: /^[1-9]\d{3}(?!SA|SD|SS)[A-Z]{2}$/,
    sleutel: (v) => v.slice(0, 4),
    formaat: (v) => `${v.slice(0, 4)} ${v.slice(4)}`,
  },
};

export const STANDAARD_LAND = 'BE';

export function isPostcodeLand(value) {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(POSTCODE_LANDEN, value);
}

/**
 * Wat een bezoeker typt, terugbrengen tot de vorm die de lijst kent.
 *
 * Soepel aan de invoerkant (spaties, kleine letters, "B-9000", "BE 9000",
 * "NL-1011ab" mogen allemaal) en streng aan de uitkomst: wat eruit komt,
 * bestaat in de officiële lijst. Dat is de gangbare aanpak bij adresinvoer --
 * de bezoeker hoeft het formaat niet te kennen, Odoo krijgt altijd hetzelfde.
 *
 * @returns {{ok: true, waarde: string, sleutel: string, entry: object}
 *          |{ok: false, reden: 'formaat'|'onbekend'}}
 */
export function normalizePostcode(land, raw) {
  const spec = POSTCODE_LANDEN[isPostcodeLand(land) ? land : STANDAARD_LAND];
  let s = String(raw == null ? '' : raw).toUpperCase().trim();
  // Een landprefix ervoor, enkel als er daarna een cijfer komt: "B-9000",
  // "BE 9000", "NL-1011 AB". Zonder die voorwaarde zou "BE" uit iets anders
  // geknipt worden.
  s = s.replace(/^(?:BE|NL|B)(?=[\s\-–.]*\d)[\s\-–.]*/, '');
  s = s.replace(/[\s.]+/g, '');

  if (!spec.patroon.test(s)) return { ok: false, reden: 'formaat' };

  const sleutel = spec.sleutel(s);
  const entry = spec.data.postcodes[sleutel];
  if (!entry) return { ok: false, reden: 'onbekend' };

  return { ok: true, waarde: spec.formaat(s), sleutel, entry };
}

/**
 * De naam van een plaats in een taal.
 *
 * Een plaats is een string, of -- waar ze officieel meertalig is (Brussel, de
 * Duitstalige Gemeenschap) -- een object { nl, fr } of { de, fr }. Vraag je
 * een taal die er niet in staat (Engels, of Nederlands in Büllingen), dan de
 * EERSTE: dat is de taal van de streek zelf.
 */
export function plaatsNaam(plaats, lang) {
  if (typeof plaats === 'string') return plaats;
  if (!plaats || typeof plaats !== 'object') return '';
  if (lang && plaats[lang]) return plaats[lang];
  const eerste = Object.values(plaats)[0];
  return eerste ? String(eerste) : '';
}

/** Alle plaatsnamen van een postcode in een taal, de hoofdplaats vooraan. */
export function plaatsenVoorPostcode(land, raw, lang) {
  const uit = normalizePostcode(land, raw);
  if (!uit.ok) return [];
  return (uit.entry.p || []).map((p) => plaatsNaam(p, lang)).filter(Boolean);
}

/**
 * Een gekende postcode, met wat de kaart nodig heeft: het zwaartepunt, de
 * gemeente en de provincie. null als ze niet in de lijst staat.
 */
export function postcodeInfo(land, raw) {
  const code = isPostcodeLand(land) ? land : STANDAARD_LAND;
  const uit = normalizePostcode(code, raw);
  if (!uit.ok) return null;
  const spec = POSTCODE_LANDEN[code];
  const gemeente = spec.data.gemeenten[uit.entry.g] || {};
  return {
    land: code,
    postcode: uit.waarde,
    sleutel: uit.sleutel,
    lat: uit.entry.c[0],
    lng: uit.entry.c[1],
    plaats: plaatsNaam((uit.entry.p || [])[0], 'nl'),
    gemeente: gemeente.n || '',
    gemeente_code: uit.entry.g || '',
    provincie: gemeente.pr || '',
    adressen: uit.entry.a || null,
  };
}

/** Bronvermelding voor onder een kaart: CC BY vraagt dat. */
export function postcodeBronnen() {
  return Object.entries(POSTCODE_LANDEN).map(([code, spec]) => ({
    land: code,
    bron: spec.data.bron,
    licentie: spec.data.licentie,
    stand: spec.data.stand,
  }));
}
