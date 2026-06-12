/**
 * Chatter Enrichment — twee-fase met type-categorisatie
 *
 * Haalt conversatieberichten (mail.message) op voor een batch actiebladen
 * en categoriseert ze in drie types:
 *
 *   - notitie  : interne opmerking van medewerker (message_type='comment', geen tracking)
 *   - email    : e-mailcommunicatie (message_type='email'), HTML gestript
 *   - wijziging: technisch logbericht met veldwijzigingen (tracking_value_ids aanwezig)
 *
 * Uitgefilterd (via domain):
 *   - notification  (systeem-notificaties, gebruikersnotificaties)
 *   - auto_comment  (aanmaken van records, activiteiten-log)
 *   - Lege berichten na HTML-stripping
 *
 * HTML-stripping: volledige body → plain text, inclusief entity-decoding.
 * Bewust NIET opgenomen: attachment_ids, partner_ids, notification_ids.
 *
 * @module modules/sales-insight-explorer/lib/chatter-enrichment
 */

import { searchRead } from '../../../lib/odoo.js';

/**
 * Velden die we ophalen per bericht.
 * body = volledige inhoud (html), tracking_value_ids = aanwezig → wijziging
 */
const LEAN_MESSAGE_FIELDS = [
  'id', 'res_id', 'date', 'author_id', 'message_type', 'subtype_id', 'body', 'tracking_value_ids'
];

/**
 * Strip HTML agressief naar schone plain text voor AI-analyse.
 *
 * Verwijdert:
 *   - <style> / <script> blokken incl. inhoud
 *   - <img> tags (afbeeldingen zijn nutteloos voor tekst-AI)
 *   - Signature-blokken: .o_signature, #Signature, .gmail_signature, .msoSignature
 *   - Geciteerde reply-secties: blockquote, .gmail_quote, .yahoo_quoted, .moz-cite-prefix
 *   - <table> opmaak — inhoud bewaard als plain text
 *   - Alle overige HTML-tags
 *   - HTML-entities gedecodeerd
 *
 * Bewaard:
 *   - Tekst-inhoud van alle niet-verwijderde elementen
 *   - Regelafbrekingen via <br>, </p>, </li>, </td>, </tr>
 *
 * @param {string} html
 * @returns {string}
 */
function stripHtml(html) {
  if (!html) return '';

  let s = html;

  // 1. Verwijder <style> en <script> blokken volledig (incl. inhoud)
  s = s.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  s = s.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');

  // 2. Verwijder signature-blokken volledig (Odoo, Gmail, Outlook, Yahoo)
  s = s.replace(/<div[^>]*class="[^"]*o_signature[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '');
  s = s.replace(/<div[^>]*id="[^"]*[Ss]ignature[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '');
  s = s.replace(/<div[^>]*class="[^"]*gmail_signature[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '');
  s = s.replace(/<div[^>]*class="[^"]*msoSignature[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '');

  // 3. Verwijder geciteerde reply-secties (niet-eigen tekst)
  s = s.replace(/<blockquote[^>]*>[\s\S]*?<\/blockquote>/gi, '');
  s = s.replace(/<div[^>]*class="[^"]*gmail_quote[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '');
  s = s.replace(/<div[^>]*class="[^"]*yahoo_quoted[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '');
  s = s.replace(/<div[^>]*class="[^"]*moz-cite-prefix[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '');
  // Outlook quote-separator
  s = s.replace(/<hr[^>]*>/gi, '\n---\n');

  // 4. Verwijder <img> tags volledig
  s = s.replace(/<img[^>]*>/gi, '');

  // 5. Regelafbrekingen voor blok-elementen vóór tag-verwijdering
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<\/p>/gi, '\n');
  s = s.replace(/<\/li>/gi, '\n');
  s = s.replace(/<\/tr>/gi, '\n');
  s = s.replace(/<\/td>/gi, ' | ');
  s = s.replace(/<\/th>/gi, ' | ');
  s = s.replace(/<\/div>/gi, '\n');
  s = s.replace(/<\/h[1-6]>/gi, '\n');

  // 6. Verwijder alle overige tags
  s = s.replace(/<[^>]+>/g, '');

  // 7. HTML entities decoderen
  s = s.replace(/&nbsp;/g, ' ')
       .replace(/&amp;/g, '&')
       .replace(/&lt;/g, '<')
       .replace(/&gt;/g, '>')
       .replace(/&quot;/g, '"')
       .replace(/&#39;/g, "'")
       .replace(/&#x27;/g, "'")
       .replace(/&hellip;/g, '…')
       .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code, 10)));

  // 8. Witruimte normaliseren
  s = s.replace(/[ \t]+/g, ' ')      // meerdere spaties → één
       .replace(/\n[ \t]+/g, '\n')   // leading whitespace na newline
       .replace(/[ \t]+\n/g, '\n')   // trailing whitespace voor newline
       .replace(/\n{3,}/g, '\n\n')   // max 2 opeenvolgende lege regels
       .replace(/^---\n/gm, '')      // verwijder losse scheidingslijnen bovenaan
       .trim();

  return s;
}

/**
 * Classificeer een bericht in notitie / email / activiteit / wijziging.
 *
 * @param {Object} msg - Odoo mail.message record
 * @returns {'notitie'|'email'|'activiteit'|'wijziging'}
 */
function classifyMessage(msg) {
  const hasTracking = Array.isArray(msg.tracking_value_ids) && msg.tracking_value_ids.length > 0;
  if (hasTracking) return 'wijziging';
  if (msg.message_type === 'email') return 'email';
  // notification met activiteits-subtype (Activities = 3) → activiteitsafsluiting
  const subtypeId = Array.isArray(msg.subtype_id) ? msg.subtype_id[0] : null;
  if (msg.message_type === 'notification' && subtypeId === 3) return 'activiteit';
  return 'notitie';
}

/**
 * Enrich actiebladen met gecategoriseerde chatter-berichten.
 *
 * @param {Array}  actionSheets  - Primaire query resultaten (moeten .id bevatten)
 * @param {Object} config        - Chatter enrichment configuratie
 * @param {boolean} config.enabled
 * @param {boolean} config.include_wijzigingen - Technische wijzigingen meenemen (default: true)
 * @param {string}  config.odoo_model          - Odoo model naam (default: 'x_sales_action_sheet')
 * @param {Object}  env          - Cloudflare worker environment
 * @param {Array}   notes        - Execution notes array (mutated)
 * @returns {Promise<{records: Array, meta: Object}>}
 */
export async function enrichWithChatter(records, config, env, notes) {
  const startTime = Date.now();
  const includeWijzigingen = config.include_wijzigingen ?? true;
  const odooModel = config.odoo_model ?? 'x_sales_action_sheet';

  notes.push(`💬 Chatter enrichment (${odooModel}): alle berichten, wijzigingen=${includeWijzigingen}`);

  if (!records.length) {
    return { records, meta: { count: 0, execution_time_ms: 0 } };
  }

  const recordIds = records.map(r => r.id);

  // Domain: comment + email + notification (activiteitsafsluitingen, notities)
  // user_notification (toewijzingen) bewust uitgesloten — geen inhoudelijke waarde
  const messages = await searchRead(env, {
    model: 'mail.message',
    domain: [
      ['model', '=', odooModel],
      ['res_id', 'in', recordIds],
      ['message_type', 'in', ['comment', 'email', 'notification']]
    ],
    fields: LEAN_MESSAGE_FIELDS,
    order: 'date desc',
    limit: false
  });

  notes.push(`mail.message: ${messages.length} berichten opgehaald`);

  // Groepeer per record-ID, categoriseer en strip HTML
  const messagesByAsId = new Map();

  for (const msg of messages) {
    const asId = msg.res_id;
    if (!messagesByAsId.has(asId)) messagesByAsId.set(asId, []);

    const bucket = messagesByAsId.get(asId);

    const type = classifyMessage(msg);

    // Wijzigingen optioneel uitsluiten
    if (type === 'wijziging' && !includeWijzigingen) continue;

    const inhoud = stripHtml(msg.body);
    if (!inhoud) continue; // lege berichten overslaan

    bucket.push({
      id: msg.id,
      date: msg.date,
      auteur: msg.author_id,   // [id, name] tuple
      type,
      inhoud
    });
  }

  const enriched = records.map(r => ({
    ...r,
    __chatter: messagesByAsId.get(r.id) ?? []
  }));

  const totalMessages = [...messagesByAsId.values()].reduce((sum, arr) => sum + arr.length, 0);

  const meta = {
    execution_method: 'two_phase_chatter',
    total_messages_fetched: messages.length,
    total_messages_in_output: totalMessages,
    action_sheets_with_messages: messagesByAsId.size,
    include_wijzigingen: includeWijzigingen,
    execution_time_ms: Date.now() - startTime
  };

  notes.push(`Chatter klaar: ${messagesByAsId.size}/${records.length} records, ${totalMessages} berichten in output`);

  return { records: enriched, meta };
}
