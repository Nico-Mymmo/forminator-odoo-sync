/**
 * Dashboards — de aanvragen op de kaart.
 *
 * Twee plekken, EEN implementatie: Dashboards (alle koppelingen,
 * GET /dashboards/api/aanvragen-kaart) en het tabblad Kaart van een koppeling
 * (GET /forminator-v2/api/integrations/:id/aanvragen-kaart, met integrationId).
 * In de browser idem: public/aanvragen-kaart.js tekent ze allebei.
 *
 * Bron: de INZENDINGEN van de koppelingen (fs_v2_submissions), niet de leads
 * in Odoo. Een koppeling doet mee zodra haar OM-formulier een veld van het type
 * Postcode heeft (forms/schema.js); de postcode in de inzending wordt
 * opgezocht in dezelfde lijst die het formulier gebruikt om ze na te kijken
 * (forms/postcodes.js). Er is dus geen tweede bron van "waar ligt 9000".
 *
 * Waarom niet op Odoo: een lead in Odoo heeft wel een `zip`, maar welke lead
 * uit een aanvraag kwam en welke met de hand gemaakt werd, staat daar niet
 * betrouwbaar. De inzending is per definitie een aanvraag, met haar koppeling
 * en haar tijdstip.
 *
 * Wat NIET meetelt -- dezelfde regel als de conversies in Webgedrag
 * (web-story/lib/conversion-catchup.js):
 *   - status `received`: de koppeling stond UIT, dat is een testformulier;
 *   - status `duplicate_inflight`: een dubbel verzoek;
 *   - oude replay-rijen (replay_of_submission_id): een kopie van een andere
 *     inzending, die zou dezelfde aanvraag twee keer tellen.
 *
 * Een koppeling met een postcodeveld dat vroeger een gewoon tekstveld was (zelfde
 * veldnaam, ander type) telt ook haar oudere inzendingen mee: er wordt op de
 * veldNAAM gelezen. Wat daar dan niet als postcode te herkennen is, staat onder
 * "onbekend" -- nooit stil weg.
 */
import { getSupabaseClient } from '../../../lib/database.js';
import { postcodeInfo, postcodeBronnen, STANDAARD_LAND, isPostcodeLand } from '../../forminator-sync-v2/forms/postcodes.js';

export const KAART_PERIODES = {
  '30d': 30,
  '90d': 90,
  '12m': 365,
  alles: null,
};

const NIET_TELLEN = new Set(['received', 'duplicate_inflight']);
const PAGINA = 1000;          // PostgREST geeft er nooit meer per verzoek
const MAX_PER_KOPPELING = 50000;

/**
 * Een OUDERE inzending, van toen het veld nog vrije tekst was: "9000 Gent",
 * "B-9000 Gent", "9000-Gent". De postcode staat erin, alleen niet alleen.
 *
 * Enkel hier, bij het LEZEN voor de kaart. Een nieuwe inzending wordt streng
 * nagekeken (validateSubmissionValues() in forms/schema.js) en komt al
 * genormaliseerd binnen. De bewaarde inzending zelf wordt nooit herschreven:
 * dat is wat de bezoeker verstuurde, en replay en de dubbel-controle steunen
 * erop.
 *
 * Een getal met cijfers ervoor of erna (een telefoonnummer, "12000") telt niet.
 */
function postcodeUitVrijeTekst(land, waarde) {
  const patroon = land === 'NL'
    ? /(?:^|[^0-9])([1-9]\d{3}\s?[A-Za-z]{2})(?![A-Za-z])/
    : /(?:^|[^0-9])([1-9]\d{3})(?![0-9])/;
  const m = String(waarde || '').match(patroon);
  return m ? postcodeInfo(land, m[1]) : null;
}

export function normalizeKaartPeriode(value) {
  return Object.prototype.hasOwnProperty.call(KAART_PERIODES, value) ? value : '12m';
}

/**
 * De koppelingen met een postcodeveld, met dat veld (of die velden) erbij.
 * Met `integrationId` enkel die ene: dan eerst haar formulier, zodat er niet
 * over alle postcodevelden van de module gezocht wordt.
 */
async function koppelingenMetPostcode(sb, integrationId = null) {
  let forms;
  let velden;
  if (integrationId) {
    const { data: f, error: e1 } = await sb.from('fs_v2_forms')
      .select('id, integration_id, name')
      .eq('integration_id', integrationId);
    if (e1) throw new Error(`formulier: ${e1.message}`);
    forms = f || [];
    if (!forms.length) return [];
    const { data: v, error } = await sb.from('fs_v2_form_fields')
      .select('form_id, field_key, validation')
      .eq('field_type', 'postcode')
      .in('form_id', forms.map((x) => x.id));
    if (error) throw new Error(`postcodevelden: ${error.message}`);
    velden = v || [];
  } else {
    const { data: v, error } = await sb.from('fs_v2_form_fields')
      .select('form_id, field_key, validation')
      .eq('field_type', 'postcode');
    if (error) throw new Error(`postcodevelden: ${error.message}`);
    velden = v || [];
    if (!velden.length) return [];
    const formIds = [...new Set(velden.map((x) => x.form_id))];
    const { data: f, error: e2 } = await sb.from('fs_v2_forms')
      .select('id, integration_id, name')
      .in('id', formIds);
    if (e2) throw new Error(`formulieren: ${e2.message}`);
    forms = f || [];
  }
  if (!velden.length) return [];

  const integratieIds = [...new Set((forms || []).map((f) => f.integration_id).filter(Boolean))];
  if (!integratieIds.length) return [];
  const { data: ints, error: e3 } = await sb.from('fs_v2_integrations')
    .select('id, name, is_active, web_action')
    .in('id', integratieIds);
  if (e3) throw new Error(`koppelingen: ${e3.message}`);

  const perIntegratie = new Map((ints || []).map((i) => [i.id, i]));
  const uit = [];
  for (const form of forms || []) {
    const integratie = perIntegratie.get(form.integration_id);
    if (!integratie) continue;
    if (!velden.some((v) => v.form_id === form.id)) continue;
    const eigen = velden.filter((v) => v.form_id === form.id).map((v) => ({
      key: v.field_key,
      land: isPostcodeLand(v.validation && v.validation.country) ? v.validation.country : STANDAARD_LAND,
    }));
    uit.push({
      id: integratie.id,
      name: integratie.name || form.name || 'Koppeling',
      is_active: !!integratie.is_active,
      web_action: integratie.web_action || null,
      velden: eigen,
    });
  }
  return uit.sort((a, b) => a.name.localeCompare(b.name, 'nl'));
}

/**
 * De postcodes van de inzendingen van één koppeling, pagina per pagina.
 *
 * Enkel de postcodewaarde komt mee (JSON-pad in de select), niet de hele
 * payload: die kan groot zijn, en een kaart heeft er niets aan.
 */
async function postcodesVan(sb, koppeling, sinds) {
  const kolommen = koppeling.velden
    .map((v, i) => `pc${i}:source_payload->form_data->>${v.key}`)
    .join(', ');
  const rijen = [];
  for (let van = 0; van < MAX_PER_KOPPELING; van += PAGINA) {
    let q = sb.from('fs_v2_submissions')
      .select(`id, status, created_at, ${kolommen}`)
      .eq('integration_id', koppeling.id)
      .is('replay_of_submission_id', null)
      .order('created_at', { ascending: false })
      .range(van, van + PAGINA - 1);
    if (sinds) q = q.gte('created_at', sinds);
    const { data, error } = await q;
    if (error) throw new Error(`inzendingen van ${koppeling.name}: ${error.message}`);
    rijen.push(...(data || []));
    if (!data || data.length < PAGINA) break;
  }
  return rijen;
}

/**
 * Heeft deze koppeling een postcodeveld in haar formulier? Licht: enkel twee
 * kleine opzoekingen, zodat het detailscherm weet of het tabblad Kaart er
 * hoort te staan zonder de inzendingen te lezen.
 */
export async function postcodeveldenVanKoppeling(env, integrationId) {
  const sb = getSupabaseClient(env);
  const lijst = await koppelingenMetPostcode(sb, integrationId);
  return lijst.length ? lijst[0].velden : [];
}

/**
 * @returns {Promise<object>} { periode, sinds, koppelingen, punten, totalen, bronnen }
 *   punten: [{ land, postcode, lat, lng, plaats, gemeente, provincie, n, k: {koppelingId: n} }]
 */
export async function getAanvragenKaart(env, { periode, integrationId = null }) {
  const sb = getSupabaseClient(env);
  const dagen = KAART_PERIODES[periode];
  const sinds = dagen ? new Date(Date.now() - dagen * 86400000).toISOString() : null;

  const koppelingen = await koppelingenMetPostcode(sb, integrationId);
  const punten = new Map();
  const onbekendVoorbeelden = new Map();
  const totalen = { aanvragen: 0, met_postcode: 0, onbekend: 0, zonder_postcode: 0 };
  const perKoppeling = [];

  for (const koppeling of koppelingen) {
    const rijen = await postcodesVan(sb, koppeling, sinds);
    const tel = { id: koppeling.id, name: koppeling.name, is_active: koppeling.is_active,
      web_action: koppeling.web_action, aanvragen: 0, met_postcode: 0, onbekend: 0 };

    for (const rij of rijen) {
      if (NIET_TELLEN.has(rij.status)) continue;
      tel.aanvragen += 1;

      // Het eerste ingevulde postcodeveld van het formulier telt.
      let info = null;
      let ruw = '';
      for (let i = 0; i < koppeling.velden.length && !info; i += 1) {
        const waarde = String(rij[`pc${i}`] || '').trim();
        if (!waarde) continue;
        ruw = ruw || waarde;
        info = postcodeInfo(koppeling.velden[i].land, waarde)
          || postcodeUitVrijeTekst(koppeling.velden[i].land, waarde);
      }

      if (!ruw) continue;
      if (!info) {
        tel.onbekend += 1;
        // Enkel korte waarden als voorbeeld: in een veld dat vroeger iets
        // anders was, kan een heel adres of een naam staan, en dat hoort niet
        // in een overzicht.
        if (ruw.length <= 10) onbekendVoorbeelden.set(ruw, (onbekendVoorbeelden.get(ruw) || 0) + 1);
        continue;
      }

      tel.met_postcode += 1;
      const sleutel = `${info.land}:${info.sleutel}`;
      let punt = punten.get(sleutel);
      if (!punt) {
        punt = {
          land: info.land, postcode: info.sleutel, lat: info.lat, lng: info.lng,
          plaats: info.plaats, gemeente: info.gemeente, provincie: info.provincie,
          n: 0, k: {},
        };
        punten.set(sleutel, punt);
      }
      punt.n += 1;
      punt.k[koppeling.id] = (punt.k[koppeling.id] || 0) + 1;
    }

    tel.zonder_postcode = tel.aanvragen - tel.met_postcode - tel.onbekend;
    totalen.aanvragen += tel.aanvragen;
    totalen.met_postcode += tel.met_postcode;
    totalen.onbekend += tel.onbekend;
    totalen.zonder_postcode += tel.zonder_postcode;
    perKoppeling.push(tel);
  }

  return {
    periode,
    sinds,
    koppelingen: perKoppeling,
    punten: [...punten.values()].sort((a, b) => b.n - a.n),
    totalen,
    // Wat er als postcode ingevuld werd maar niet herkend is: de tien die het
    // vaakst voorkomen. Zo zie je of het om tikfouten gaat of om een veld dat
    // vroeger iets anders betekende.
    onbekend: [...onbekendVoorbeelden.entries()]
      .sort((a, b) => b[1] - a[1]).slice(0, 10)
      .map(([waarde, n]) => ({ waarde, n })),
    bronnen: postcodeBronnen(),
  };
}
