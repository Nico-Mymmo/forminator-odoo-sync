/**
 * Nieuwsbrieven -- de checklist "klaar om te verzenden?".
 *
 * EEN lijst, gebruikt door het scherm (de stappenbalk en het paneel) en door
 * de inplan-route: wat hier `blokkeert`, houdt een echte verzending tegen.
 * Zo lopen scherm en server nooit uiteen, en ziet marketing VOORAF wat er nog
 * ontbreekt in plaats van achteraf een foutmelding.
 *
 * Elk punt: { key, label, ok, blokkeert, uitleg?, ids? }
 *   ok        in orde
 *   blokkeert false = enkel een waarschuwing (bv. geen voorbeeldtekst)
 *   ids       stukjes waar het over gaat (het scherm springt ernaar)
 */

import { KINDS, CONTRIBUTION_STATUS, EDITION_STATUS, sendMode } from './constants.js';
import { heeftInhoud } from './render.js';

/**
 * @param {object} o
 * @param {object} o.series
 * @param {object} o.edition
 * @param {Array}  o.items     de stukjes van de editie
 * @param {object} o.ctx       context van de renderer (events), voor heeftInhoud
 * @param {boolean} o.tokenVeld  bestaat het Studio-veld voor de antwoorden
 * @param {object} o.env
 */
export function checklist({ series, edition, items, ctx = {}, tokenVeld = true, env }) {
  const punten = [];
  const echt = items.filter((i) => !KINDS[i.kind]?.auto);
  const metInhoud = echt.filter((i) => heeftInhoud(i, ctx));

  punten.push({
    key: 'onderwerp',
    label: String(edition.subject || '').trim() ? 'Onderwerp ingevuld' : 'Onderwerp ontbreekt',
    ok: Boolean(String(edition.subject || '').trim()),
    blokkeert: true,
  });
  punten.push({
    key: 'voorbeeldtekst',
    label: String(edition.preheader || '').trim() ? 'Voorbeeldtekst ingevuld' : 'Geen voorbeeldtekst (de grijze regel in de inbox)',
    ok: Boolean(String(edition.preheader || '').trim()),
    blokkeert: false,
  });

  const nietBevestigd = metInhoud.filter((i) => i.status !== CONTRIBUTION_STATUS.APPROVED);
  punten.push({
    key: 'bevestigd',
    label: nietBevestigd.length
      ? `${nietBevestigd.length} ${nietBevestigd.length === 1 ? 'stukje' : 'stukjes'} nog niet bevestigd`
      : metInhoud.length ? 'Alle stukjes bevestigd' : 'Nog geen stukjes met inhoud',
    ok: !nietBevestigd.length && metInhoud.length > 0,
    blokkeert: true,
    ids: nietBevestigd.map((i) => i.id),
    uitleg: nietBevestigd.map((i) => i.title || KINDS[i.kind]?.label || 'Stukje').join(', '),
  });

  const leeg = echt.filter((i) => !heeftInhoud(i, ctx));
  if (leeg.length) {
    punten.push({
      key: 'leeg',
      label: `${leeg.length} ${leeg.length === 1 ? 'stukje valt' : 'stukjes vallen'} weg (nog leeg)`,
      ok: false,
      blokkeert: false,
      ids: leeg.map((i) => i.id),
      uitleg: leeg.map((i) => i.title || KINDS[i.kind]?.label || 'Stukje').join(', '),
    });
  }

  punten.push({
    key: 'test',
    label: edition.last_test_at ? 'Testmail verstuurd' : 'Nog geen testmail verstuurd',
    ok: Boolean(edition.last_test_at),
    blokkeert: true,
  });

  const vragen = metInhoud.filter((i) => KINDS[i.kind]?.interactive);
  if (vragen.length) {
    punten.push({
      key: 'token',
      label: tokenVeld ? 'Antwoorden worden herkend (Studio-veld aanwezig)' : 'Het Studio-veld x_studio_om_token ontbreekt in Odoo: antwoorden tellen als anoniem',
      ok: Boolean(tokenVeld),
      blokkeert: false,
    });
  }

  const live = sendMode(env) === 'live';
  punten.push({
    key: 'ontvangers',
    label: (series.odoo_list_ids || []).length
      ? `Ontvangers: ${(series.odoo_list_ids || []).length} ${(series.odoo_list_ids || []).length === 1 ? 'Odoo-lijst' : 'Odoo-lijsten'}`
      : 'Geen Odoo-lijst gekozen bij de reeks',
    ok: (series.odoo_list_ids || []).length > 0,
    blokkeert: live,
  });
  punten.push({
    key: 'live',
    label: live ? 'Echte verzending staat aan' : 'Teststand: er kan enkel een testmail vertrekken',
    ok: live,
    blokkeert: true,
  });

  const al = [EDITION_STATUS.SCHEDULED, EDITION_STATUS.SENT, EDITION_STATUS.CANCELLED].includes(edition.status);
  const blokkades = punten.filter((p) => p.blokkeert && !p.ok);
  return {
    ok: !al && !blokkades.length,
    klaar_op_live_na: !al && blokkades.every((p) => p.key === 'live'),
    items: punten,
  };
}
