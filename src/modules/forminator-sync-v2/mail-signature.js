/**
 * Koppelingen — de handtekening bij een `send_mail`-stap.
 *
 * GEEN TWEEDE COMPILER. De mail-signature-designer compileert de handtekening
 * al (`compileSignature()`) en pusht diezelfde HTML naar zowel Gmail als
 * `res.users.signature` in Odoo — expliciet zodat "Gmail en Odoo per
 * constructie niet uit elkaar kunnen lopen" (zie het doc-blok in
 * `src/modules/mail-signature-designer/lib/odoo-signature.js`). Deze stap
 * herhaalt die merge dus NIET en doet geen live Google-aanroep: hij LEEST
 * gewoon `res.users.signature`, dezelfde bron die Odoo's eigen chatter al
 * onderaan een mail plakt.
 *
 * VOORWAARDE: de medewerker moet minstens één keer via de signature-designer
 * gepusht zijn. Is dat nog niet gebeurd (of is er geen gekoppelde
 * Odoo-gebruiker), dan vertrekt de mail gewoon zonder handtekening — dat is
 * geen fout, want "nog niet ingesteld" is een normale, tijdelijke toestand.
 */

import { searchRead } from '../../lib/odoo.js';
import { resolveEmployeeRef } from './employee-reference.js';

/** Many2one komt als [id, naam] terug; wij willen alleen het id. */
function m2oId(waarde) {
  return Array.isArray(waarde) ? (waarde[0] || null) : (waarde || null);
}

/**
 * @param {Object} env
 * @param {Object} target - rij uit fs_v2_targets (mail_signature_*)
 * @param {Object} contextObject - uitvoer van eerdere stappen
 * @returns {Promise<{html: string|null, reden: string|null}>}
 * @throws {Error} enkel bij een ONGELDIGE configuratie (zie employee-reference.js) —
 *   een medewerker zonder Odoo-koppeling of zonder handtekening gooit NIET.
 */
export async function resolveMailSignatureHtml(env, target, contextObject) {
  const ref = resolveEmployeeRef({
    source: target.mail_signature_source,
    employeeId: target.mail_signature_employee_id,
    sourceValue: target.mail_signature_source_value,
    contextObject,
    errorPrefix: 'send_mail (handtekening)'
  });
  if (!ref) return { html: null, reden: null };

  let userId = null;
  if (ref.model === 'res.users') {
    userId = ref.id;
  } else if (ref.model === 'hr.employee') {
    const rijen = await searchRead(env, {
      model: 'hr.employee',
      domain: [['id', '=', ref.id]],
      fields: ['user_id'],
      limit: 1
    });
    const rec = Array.isArray(rijen) && rijen.length ? rijen[0] : null;
    userId = rec ? m2oId(rec.user_id) : null;
  } else {
    throw new Error(`send_mail (handtekening): bron met onbekend model "${ref.model}".`);
  }

  if (!userId) {
    return { html: null, reden: 'Geen gekoppelde Odoo-gebruiker gevonden voor de handtekening.' };
  }

  const gebruikers = await searchRead(env, {
    model: 'res.users',
    domain: [['id', '=', userId]],
    fields: ['signature'],
    limit: 1
  });
  const html = (Array.isArray(gebruikers) && gebruikers.length ? gebruikers[0].signature : '') || '';
  if (!String(html).trim()) {
    return { html: null, reden: 'Deze medewerker heeft nog geen handtekening gepusht via de signature-designer.' };
  }
  return { html: String(html), reden: null };
}
