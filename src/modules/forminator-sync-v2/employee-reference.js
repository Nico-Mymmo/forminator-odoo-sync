/**
 * Koppelingen — een "medewerker"-verwijzing oplossen (vast, of uit een vorige
 * stap), gedeeld door de pdf-stap (Contactpersoon) en de mail-stap
 * (Handtekening).
 *
 * WAAROM DIT MODEL NIET VAST STAAT.
 * ---------------------------------
 * "Uit een vorige stap" kan naar twee soorten stappen wijzen:
 *   - `step.N.record_id`: het record dat stap N zelf aanmaakte/vond. Alleen
 *     aangeboden voor een stap met `odoo_model = 'hr.employee'` (zie
 *     buildEmployeeStepOptions() in forminator-sync-v2-detail.js) -- dus altijd
 *     een hr.employee-id.
 *   - `step.N.round_robin_employee_id`: een round-robin-mapping (source_type
 *     'round_robin_pool') in stap N. De poule zelf bestaat uit hr.employee-ids,
 *     maar `resolveRoundRobinPoolValue()` in worker-handler.js vertaalt die al
 *     naar wat het GEMAPTE VELD verwacht -- bij een "Salesperson"-veld
 *     (crm.lead.user_id/res.partner.user_id) is dat een res.users-id, geen
 *     hr.employee-id. Welk model dat was staat in de companion-sleutel
 *     `step.N.round_robin_employee_model`, die registerTargetOutput ernaast
 *     zet. Zonder dit zou een salesperson-poule hier stil als hr.employee
 *     behandeld worden en de daaropvolgende Odoo-opzoeking zou een willekeurig
 *     ander record raken (of falen).
 */

/**
 * @param {Object} args
 * @param {string} [args.source] - '' | 'fixed' | 'dynamic'
 * @param {number} [args.employeeId] - bij 'fixed'
 * @param {string} [args.sourceValue] - bij 'dynamic', vorm "step.<order>.<veld>"
 * @param {Object} [args.contextObject] - uitvoer van eerdere stappen
 * @param {string} args.errorPrefix - voor leesbare foutmeldingen, bv. "generate_pdf"
 * @returns {{model: string, id: number}|null} null = geen bron ingesteld
 * @throws {Error} bij een ongeldige/ontbrekende waarde voor een WEL ingestelde bron
 */
export function resolveEmployeeRef({ source, employeeId, sourceValue, contextObject, errorPrefix }) {
  const bron = String(source || '').trim();
  if (bron === '') return null;

  if (bron === 'fixed') {
    const id = Number(employeeId);
    if (!Number.isInteger(id) || id <= 0) {
      throw new Error(`${errorPrefix}: geen geldige vaste medewerker ingesteld.`);
    }
    return { model: 'hr.employee', id };
  }

  if (bron === 'dynamic') {
    const bronVeld = String(sourceValue || '').trim();
    if (!bronVeld) {
      throw new Error(`${errorPrefix}: geen bron ingesteld voor de medewerker uit een vorige stap.`);
    }
    const ruw = contextObject ? contextObject[bronVeld] : null;
    const id = Number.parseInt(String(ruw), 10);
    if (!Number.isInteger(id) || id <= 0) {
      throw new Error(`${errorPrefix}: vorige stap gaf geen geldig id op (bron: "${bronVeld}", waarde: "${String(ruw)}").`);
    }

    const modelKey = bronVeld.endsWith('.round_robin_employee_id')
      ? bronVeld.slice(0, -'round_robin_employee_id'.length) + 'round_robin_employee_model'
      : null;
    const model = (modelKey && contextObject && contextObject[modelKey]) || 'hr.employee';
    return { model, id };
  }

  throw new Error(`${errorPrefix}: onbekende medewerker-bron "${bron}".`);
}
