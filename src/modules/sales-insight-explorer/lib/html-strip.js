/**
 * Eenvoudige, dependency-vrije HTML → platte tekst reductie.
 *
 * Odoo html-velden (notities, chatter-berichten, beschrijvingen, ...) bevatten
 * vaak enkel opmaak zonder extra informatie -- een <p> rond één zin, een lege
 * <span style="...">. Voor query-resultaten, exports en AI-context is die
 * opmaak dan pure ruis. Er is geen DOM beschikbaar in de Cloudflare
 * Worker-runtime, dus bewust regex-based i.p.v. een DOM-parser-dependency:
 * goed genoeg voor Odoo's eigen, beperkte HTML-subset (p, br, div, li, ul/ol,
 * strong/em/span, a, ...) -- dit is geen algemene HTML-sanitizer.
 *
 * Instelbaar per informatieset-veld (information_set_fields.strip_html, zie
 * de admin-tab "Categorieën" in ui-admin.js) en toegepast in
 * lib/graph/cascade-executor.js, vlak voor records teruggaan naar de wizard
 * of een mini-app.
 *
 * @module modules/sales-insight-explorer/lib/html-strip
 */

/**
 * @param {*} html
 * @returns {*} de platte tekst, of de input ongewijzigd als het geen
 *   niet-lege string met tags was (zodat null/false/getallen gewoon
 *   doorgegeven worden zoals elk ander Odoo-veld).
 */
export function stripHtml(html) {
  if (typeof html !== 'string' || !html) return html;
  if (!/<[a-z][\s\S]*>/i.test(html)) return html; // geen tags -- niets te doen

  return html
    // Blok-elementen worden een regeleinde i.p.v. zomaar te verdwijnen, anders
    // plakken twee alinea's/regels aan elkaar vast.
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*\/\s*(p|div|li|tr|h[1-6])\s*>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '• ')
    // Alle overige tags weg.
    .replace(/<[^>]+>/g, '')
    // Meest voorkomende entities -- geen volledige entity-tabel nodig voor
    // Odoo's eigen html-velden.
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    // Whitespace opkuisen: geen dubbele spaties, geen 3+ opeenvolgende
    // regeleindes, geen rand-witruimte per regel.
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^[ \t]+|[ \t]+$/gm, '')
    .trim();
}
