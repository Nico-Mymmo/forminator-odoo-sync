/**
 * Een gesprek afronden: EEN handeling die alles doet wat bij "ik heb gebeld" hoort.
 *
 *   1. De open beltaken van de kans worden afgevinkt, en de uitkomst komt als
 *      gekleurde kaart in de chatter (`chatterKaart()`). Zo staat er nooit een
 *      gesprek in de chatter terwijl de beltaak nog openstaat (dat was het
 *      probleem met de losse oproepknoppen). Het afvinken zelf krijgt geen
 *      feedback: Odoo toont die als platte tekst, en dan viel de oproep weg.
 *   2. De medewerker staat als auteur in de chatter, niet "Administrator".
 *   3. Na een poging zonder contact plant de SEQUENTIE de volgende beltaak
 *      (sequentie.js, via werkPaneelBij in stap 5). Een datum die de
 *      gebruiker zelf meegeeft ("Gesprek plannen") komt er los van bij.
 *   4. Het gesprek komt in opv_contactmomenten (voor de rapportering later).
 *   5. Het controlepaneel van de kans wordt meteen bijgewerkt.
 *
 * De kaart bevat de zin van de oude knoppen (UITKOMSTEN in constants.js).
 */

import { executeKw } from '../../../lib/odoo.js';
import { getCoreDb } from '../../../lib/core-db.js';
import { gebruikerVoorConnector, odooGebruiker } from '../../claude-sales/lib/toegang.js';
import { leesLead, activiteiten } from './odoo-data.js';
import { werkPaneelBij } from './paneel.js';
import { UITKOMSTEN, OpvolgingError, LOG_PREFIX, vandaag, chatterKaart, beltaakNotitie } from './constants.js';

const DATUM_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Wie is deze OM-gebruiker in Odoo? { uid, partner_id, naam } of null. */
export async function odooVan(env, user) {
  const g = await gebruikerVoorConnector(env, user.id);
  return g ? odooGebruiker(env, g) : null;
}

/** Een beltaak op een datum, voor de verkoper van de kans (anders voor wie het plant). */
async function planBeltaak(env, lead, odoo, datum, { terug = false, note = '' } = {}) {
  const voor = Array.isArray(lead.user_id) ? lead.user_id[0] : odoo?.uid;
  await executeKw(env, {
    model: 'crm.lead', method: 'activity_schedule', args: [[lead.id]],
    kwargs: {
      act_type_xmlid: 'mail.mail_activity_data_call', date_deadline: datum,
      summary: terug ? 'Terugbellen' : 'Bellen', ...(note ? { note } : {}), ...(voor ? { user_id: voor } : {}),
    },
  });
}

/**
 * @param {{ uitkomst?: string, notitie?: string, volgende?: string|null, alleen_volgende?: boolean }} invoer
 *   volgende = 'YYYY-MM-DD' voor een nieuwe beltaak, of leeg. Met alleen_volgende
 *   en zonder uitkomst wordt enkel een beltaak gepland.
 */
export async function rondGesprekAf(env, user, leadId, invoer) {
  const uitkomst = String(invoer?.uitkomst || '');
  const notitie = String(invoer?.notitie || '').trim().slice(0, 4000);
  const volgende = invoer?.volgende ? String(invoer.volgende) : null;
  if (volgende && (!DATUM_RE.test(volgende) || volgende < vandaag())) {
    throw new OpvolgingError('De datum van de volgende beltaak ligt in het verleden.');
  }
  // Zonder uitkomst kan je enkel een volgende beltaak plannen ("Volgende stap plannen").
  if (!UITKOMSTEN[uitkomst] && !(invoer?.alleen_volgende && volgende)) {
    throw new OpvolgingError('Kies hoe het gesprek afliep.');
  }

  const lead = await leesLead(env, leadId);
  if (!lead) throw new OpvolgingError('Deze kans bestaat niet (meer).', 404);

  const odoo = await odooVan(env, user);
  if (!UITKOMSTEN[uitkomst]) {
    await planBeltaak(env, lead, odoo, volgende);
    return { taken_afgerond: 0, volgende, paneel: await werkPaneelBij(env, leadId) };
  }
  const naam = odoo?.naam || user.full_name || user.email;
  const auteur = odoo?.partner_id ? { author_id: odoo.partner_id } : {};

  // 1. Beltaken afvinken, zonder feedback (zie bovenaan).
  const bel = (await activiteiten(env, [leadId])).get(leadId)?.filter(a => a.bellen) || [];
  if (bel.length) {
    const doneId = await executeKw(env, { model: 'mail.activity', method: 'action_feedback', args: [bel.map(a => a.id)], kwargs: {} });
    // 2. Auteur rechtzetten: action_feedback schrijft als de technische gebruiker.
    if (Number.isInteger(doneId) && odoo?.partner_id) {
      try {
        await executeKw(env, { model: 'mail.message', method: 'write', args: [[doneId], { author_id: odoo.partner_id }] });
      } catch (err) { console.warn(LOG_PREFIX, 'auteur niet gezet', err?.message); }
    }
  }
  // De oproep zelf: als kaart, NA het afvinken, zodat ze bovenaan staat.
  const berichtId = await executeKw(env, {
    model: 'crm.lead', method: 'message_post', args: [[leadId]],
    kwargs: {
      body: chatterKaart({ uitkomst, naam, notitie, volgende }), body_is_html: true,
      message_type: 'comment', subtype_xmlid: 'mail.mt_note', ...auteur,
    },
  });

  // 3. Volgende beltaak, voor de verkoper van de kans (anders voor wie belde).
  if (volgende) {
    await planBeltaak(env, lead, odoo, volgende, {
      terug: true, note: beltaakNotitie({ uitkomst, naam, notitie: uitkomst === 'ingesproken' ? notitie : '' }),
    });
  }

  // 4. Bijhouden. Mislukt dat, dan staat het gesprek wel in Odoo: niet fataal.
  try {
    const r = await getCoreDb(env).from('opv_contactmomenten').insert({
      lead_id: leadId, kanaal: 'telefoon', uitkomst, soort: UITKOMSTEN[uitkomst].soort,
      notitie: notitie || null, bron: 'om', door_user_id: user.id, door_naam: naam,
      odoo_message_id: Number.isInteger(berichtId) ? berichtId : null,
      taken_afgerond: bel.length, volgende_deadline: volgende,
    });
    if (r?.error) console.error(LOG_PREFIX, 'contactmoment niet bewaard', r.error.message);
  } catch (err) { console.error(LOG_PREFIX, 'contactmoment niet bewaard', err?.message); }

  // 5. Sequentie (volgende beltaak) en paneel.
  const paneel = await werkPaneelBij(env, leadId);
  return { taken_afgerond: bel.length, volgende, paneel };
}
