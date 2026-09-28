/**
 * Afspraaklinks — de placeholder {{afspraak.<stap>.<soort>}} in de koppelingen.
 *
 *   maak een afspraak <a href="{{afspraak.2.demo}}">hier</a>      (mailstap)
 *   maak een afspraak <a href="{afspraak.2.demo}">hier</a>        (notitiestap)
 *
 * <stap> is het volgnummer of het label van een EERDERE stap; de EIGENAAR van
 * het record dat die stap aanmaakte of vond (user_id van de lead, het contact
 * of de medewerker) bepaalt wiens agenda het wordt. <soort> is de soort van de
 * afspraaklink ("demo"), of `standaard`.
 *
 * `{{afspraak.sender.<soort>}}` is de agenda van de AFZENDER van de mail --
 * dezelfde persoon als de handtekening en `{{sender.*}}`. Die wordt niet hier
 * ingevuld maar in runSendMailStep(), want pas daar is de afzender bekend.
 *
 * WAAROM DIT VOORAF IN contextObject GEZET WORDT en niet in de renderer.
 * De mailstap en de notitiestap hebben elk hun eigen placeholder-motor
 * (fillPlaceholders met {{…}} resp. een regex op {…}), en allebei lezen ze al
 * uit contextObject. Door de ingevulde URL daar onder de sleutel
 * `afspraak.<stap>.<soort>` te zetten, werken beide zonder een derde motor,
 * en staat de opgezochte link ook in het logboek van de indiening.
 *
 * WAAROM DE EIGENAAR HIER ZELF GELEZEN WORDT. step.N.user_id bestaat alleen
 * als een veldkoppeling er expliciet om vraagt (collectRequestedStepFields);
 * een placeholder in de tekst doet dat niet. Zou dit daarop steunen, dan werkt
 * de link zodra iemand toevallig ergens anders user_id mapt, en anders niet.
 *
 * Nooit fataal: lukt het opzoeken niet, dan wordt het de algemene agenda. Een
 * mail zonder persoonlijke agenda is beter dan een mail die niet vertrekt.
 */

import { searchRead } from '../../../lib/odoo.js';
import { findLinkForOwner, bookingUrl, generalBookingUrl, STANDAARD } from './links.js';

/** `{{afspraak.sender.<soort>}}`: de agenda van wie de mail verstuurt. */
export const SENDER = 'sender';

const REF_RE = /afspraak\.([A-Za-z0-9_-]+)\.([a-z0-9][a-z0-9-]*)/g;

/** Alle (stap, soort)-paren die in een tekst voorkomen. */
export function collectAfspraakRefs(tekst) {
  const uit = new Map();
  const bron = String(tekst || '');
  for (const m of bron.matchAll(REF_RE)) {
    uit.set(`${m[1]}.${m[2]}`, { stap: m[1], soort: m[2] });
  }
  return [...uit.values()];
}

/** Modellen met een eigenaar in `user_id` (res.users). */
const MODELLEN_MET_EIGENAAR = new Set(['crm.lead', 'res.partner', 'hr.employee', 'project.task', 'helpdesk.ticket']);

async function eigenaarVan(env, model, recordId) {
  if (model === 'res.users') return recordId;
  if (!MODELLEN_MET_EIGENAAR.has(model)) return null;
  const rijen = await searchRead(env, { model, domain: [['id', '=', recordId]], fields: ['user_id'], limit: 1 });
  const veld = rijen[0]?.user_id;
  const id = Array.isArray(veld) ? veld[0] : veld;
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * De afspraaklinks die een stap nodig heeft in contextObject zetten.
 *
 * @param {Object} env
 * @param {Object} args
 * @param {string} args.tekst          alles waar placeholders in kunnen staan (onderwerp, body, knoppen)
 * @param {Object} args.contextObject  wordt aangevuld
 * @param {Function} [args.log]        (bericht) => void
 */
export async function enrichAfspraakContext(env, { tekst, contextObject, log = () => {} }) {
  // `afspraak.sender.<soort>` is de agenda van de AFZENDER van een mail, en die
  // kent pas de mailstap zelf (runSendMailStep in mail-step.js).
  const refs = collectAfspraakRefs(tekst).filter((r) => r.stap !== SENDER);
  if (!refs.length) return;

  const eigenaars = new Map();

  for (const { stap, soort } of refs) {
    const sleutel = `afspraak.${stap}.${soort}`;
    let url = null;
    let uitleg = '';

    try {
      if (!eigenaars.has(stap)) {
        const recordId = Number.parseInt(String(contextObject[`step.${stap}.record_id`] ?? ''), 10);
        const model = String(contextObject[`step.${stap}.record_model`] || '');
        eigenaars.set(stap, Number.isInteger(recordId) && recordId > 0 && model
          ? await eigenaarVan(env, model, recordId)
          : null);
      }
      const eigenaar = eigenaars.get(stap);

      if (!eigenaar) {
        uitleg = `stap ${stap} leverde geen record met een eigenaar op`;
      } else {
        const link = await findLinkForOwner(env, eigenaar, soort === STANDAARD ? null : soort);
        if (link) {
          url = bookingUrl(env, link);
          uitleg = `link "${link.slug}" van ${link.odoo_user_name || `gebruiker ${eigenaar}`}`;
        } else {
          uitleg = `gebruiker ${eigenaar} heeft geen actieve afspraaklink`;
        }
      }
    } catch (err) {
      uitleg = `opzoeken mislukt: ${err.message}`;
    }

    if (!url) {
      url = generalBookingUrl(env);
      uitleg += ' → algemene agenda';
    }

    contextObject[sleutel] = url || '';
    log(`${sleutel}: ${uitleg}${url ? ` (${url})` : ' (geen site ingesteld)'}`);
  }
}
