/**
 * Koppelingen — "Adres naar dit gebouw": met één klik het adres uit het
 * formulier op een Gebouw-stap zetten.
 *
 * Wat de knop doet (bij een stap op het model `company` en een OM-formulier
 * met een postcodeveld en een veld "Straat en huisnummer" eronder):
 *   zip    <- de postcode          (zoekt mee)
 *   street <- straat en huisnummer (zoekt mee)
 *   city   <- de gemeente, als die er is
 *   name   <- "VME {straat en huisnummer}", enkel bij een NIEUW gebouw
 *
 * Postcode en straat worden samen het zoekcriterium: een gebouw met exact
 * hetzelfde adres wordt hergebruikt in plaats van een tweede aan te maken. Dat
 * werkt omdat de straat altijd in de officiele schrijfwijze binnenkomt
 * (forms/straten.js). Een klein verschil ("12" tegenover "12-16") blijft een
 * tweede gebouw; dat meldt de Claude-connector als mogelijk dubbel.
 *
 * Wat er al op die vier Odoo-velden stond, wordt vervangen; andere
 * zoekcriteria van de stap gaan uit (een gebouw zoeken op adres EN op iets
 * anders vindt het bestaande gebouw niet terug). planAdres() is puur en zegt
 * in gewone taal wat er verandert; het scherm toont dat eerst.
 */

import { getTargetById, listMappingsByTarget, createMapping, updateMapping, updateTarget } from './database.js';
import { getFormByIntegrationId } from './forms/database.js';
import { koppelPostcodeVelden } from './forms/schema.js';

/** Welke velden van het formulier het adres vormen, of de reden waarom het niet kan. */
export function vindAdresVelden(fields) {
  const lijst = (fields || []).filter((f) => f && f.field_key);
  const { postcodeVan, gemeenteVan } = koppelPostcodeVelden(lijst);
  const straat = lijst.find((f) => f.field_type === 'street' && postcodeVan[f.field_key]);
  if (!straat) return { fout: 'Het formulier heeft geen veld "Straat en huisnummer" onder een postcodeveld. Voeg in het tabblad Formulier het adres toe (knop Postcode).' };
  const postcode = lijst.find((f) => f.field_key === postcodeVan[straat.field_key]);
  const gemeenteKey = gemeenteVan[postcode.field_key];
  const gemeente = gemeenteKey ? lijst.find((f) => f.field_key === gemeenteKey) : null;
  // Het huisnummer: het tekstveld vlak na de straat (zo zet de knop Postcode
  // het neer). Zonder zo'n veld typt de bezoeker het nummer achter de straat.
  const volgende = lijst[lijst.indexOf(straat) + 1];
  const nummer = volgende && volgende.field_type === 'text' ? volgende : null;
  const nietVerplicht = [postcode, straat, nummer].filter((f) => f && !f.is_required).map((f) => `"${f.label || f.field_key}"`);
  if (nietVerplicht.length) {
    return { fout: `Zet ${nietVerplicht.join(' en ')} eerst op verplicht in het tabblad Formulier. Het adres wordt het zoekcriterium voor het gebouw, en zonder adres kan de stap het gebouw niet terugvinden of aanmaken.` };
  }
  return { postcode, straat, nummer, gemeente };
}

/**
 * @returns {{ rijen: Array, uitzetten: Array, zinnen: string[] }}
 *   rijen: per Odoo-veld de nieuwe mapping (met het id van de bestaande als die er is)
 */
export function planAdres(velden, mappings) {
  const { postcode, straat, nummer, gemeente } = velden;
  const naamVan = (f) => `"${f.label || f.field_key}"`;
  // Odoo bewaart straat en huisnummer samen in `street` ("Kerkstraat 12-16").
  const adres = nummer ? `{${straat.field_key}} {${nummer.field_key}}` : `{${straat.field_key}}`;
  const straatBron = nummer
    ? { source_type: 'template', source_value: adres, wat: `Straat van het gebouw: ${naamVan(straat)} en ${naamVan(nummer)} samen (zoekt mee)` }
    : { source_type: 'form', source_value: straat.field_key, wat: `Straat van het gebouw: uit ${naamVan(straat)} (zoekt mee)` };
  const doel = [
    { odoo_field: 'zip', source_type: 'form', source_value: postcode.field_key, is_identifier: true, is_update_field: true, wat: `Postcode van het gebouw: uit ${naamVan(postcode)} (zoekt mee)` },
    { odoo_field: 'street', ...straatBron, is_identifier: true, is_update_field: true },
    ...(gemeente ? [{ odoo_field: 'city', source_type: 'form', source_value: gemeente.field_key, is_identifier: false, is_update_field: true, wat: `Gemeente van het gebouw: uit ${naamVan(gemeente)}` }] : []),
    { odoo_field: 'name', source_type: 'template', source_value: `VME ${adres}`, is_identifier: false, is_update_field: false, wat: `Naam van een nieuw gebouw: "VME" met straat en huisnummer` },
  ];
  const opVeld = (veld) => mappings.find((m) => m.odoo_field === veld);
  const rijen = doel.map((d) => ({ ...d, bestaand: opVeld(d.odoo_field) || null }));
  const doelVelden = new Set(doel.map((d) => d.odoo_field));
  const uitzetten = mappings.filter((m) => m.is_identifier && !doelVelden.has(m.odoo_field));
  const zinnen = rijen.map((r) => (r.bestaand ? `${r.wat} (vervangt wat er stond)` : r.wat));
  uitzetten.forEach((m) => zinnen.push(`Zoekt het gebouw niet meer op het veld "${m.odoo_field}"`));
  return { rijen, uitzetten, zinnen };
}

/** Plan (dry) of uitvoeren voor een stap. Gooit een Error met een leesbare boodschap. */
export async function adresNaarGebouw(env, targetId, { uitvoeren = false } = {}) {
  const target = await getTargetById(env, targetId);
  if (!target) throw new Error('Stap niet gevonden.');
  if (target.is_system) throw new Error('Een vaste stap kan je niet aanpassen.');
  if (target.odoo_model !== 'company') throw new Error('Dit kan enkel op een Gebouw-stap.');
  if (target.operation_type && !['upsert', 'create', 'update_only'].includes(target.operation_type)) {
    throw new Error('Dit kan enkel op een stap die een gebouw aanmaakt of bijwerkt.');
  }

  const bundel = await getFormByIntegrationId(env, target.integration_id);
  if (!bundel) throw new Error('Deze koppeling heeft geen formulier in de OM.');
  const velden = vindAdresVelden(bundel.fields);
  if (velden.fout) throw new Error(velden.fout);

  const mappings = await listMappingsByTarget(env, targetId);
  const plan = planAdres(velden, mappings);
  if (!uitvoeren) return { zinnen: plan.zinnen };

  let volgorde = mappings.reduce((max, m) => Math.max(max, Number(m.order_index) || 0), 0);
  for (const r of plan.rijen) {
    const rij = {
      odoo_field: r.odoo_field,
      source_type: r.source_type,
      source_value: r.source_value,
      is_identifier: r.is_identifier,
      is_update_field: r.is_update_field,
      is_required: false,
      value_map: null,
    };
    if (r.bestaand) await updateMapping(env, r.bestaand.id, rij);
    else await createMapping(env, { ...rij, target_id: targetId, order_index: ++volgorde });
  }
  for (const m of plan.uitzetten) await updateMapping(env, m.id, { is_identifier: false });
  if (target.identifier_type !== 'mapped_fields') await updateTarget(env, targetId, { identifier_type: 'mapped_fields' });
  return { zinnen: plan.zinnen };
}
