/**
 * Event Operations v2 — Redactionele inhoud
 *
 * De inhoud van de publieke eventpagina staat in x_studio_webinar_info
 * (HTML) in Odoo. Er komt GEEN apart blokkenschema: dat zou een tweede
 * waarheid naast Odoo zijn.
 *
 * Deze module doet twee dingen: HTML veilig maken voor publieke uitvoer,
 * en er een leesbare samenvatting uit halen.
 */

/**
 * Alles wat in een publieke respons niet thuishoort.
 *
 * Let op de shortcodes: v1 injecteerde `[forminator_form id="..."]` in de
 * beschrijving. In v2 serveert de OM het inschrijfformulier zelf, dus een
 * shortcode in de tekst is oude rommel die de bezoeker niet mag zien.
 *
 * @param {string|null} html
 * @returns {string}
 */
export function sanitizePublicHtml(html) {
  if (typeof html !== 'string' || html.trim() === '') return '';

  return html
    // script, style, iframe en form eruit, inclusief inhoud
    .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, '')
    .replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe\s*>/gi, '')
    .replace(/<form\b[^>]*>[\s\S]*?<\/form\s*>/gi, '')
    // inline event handlers en javascript:-urls
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')
    .replace(/javascript:/gi, '')
    // WordPress-shortcodes: omsluitend eerst, dan zelfsluitend
    .replace(/\[([\w-]+)(?:\s+[^\]]*)?\][\s\S]*?\[\/\1\]/g, '')
    .replace(/\[[\w-]+(?:\s+[^\]]*)?\]/g, '')
    .trim();
}

/**
 * HTML → platte tekst. Voor een samenvatting of een meta description.
 *
 * @param {string|null} html
 * @returns {string}
 */
export function htmlToText(html) {
  if (typeof html !== 'string' || html === '') return '';

  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr)\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number.parseInt(code, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Korte samenvatting, afgekapt op een woordgrens.
 *
 * @param {string|null} html
 * @param {number} [maxLength]
 * @returns {string}
 */
export function summarize(html, maxLength = 200) {
  const text = htmlToText(html).replace(/\s+/g, ' ');
  if (text.length <= maxLength) return text;

  const cut = text.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}...`;
}

/**
 * Meta description: eigen SEO-tekst als die er is, anders de
 * samenvatting, anders de eerste alinea van de inhoud.
 *
 * @param {Object} dto - resultaat van toEventDto
 * @returns {string}
 */
export function buildMetaDescription(dto) {
  if (dto?.seo?.description) return String(dto.seo.description).trim();
  if (dto?.summary) return String(dto.summary).trim();
  return summarize(dto?.body_html, 160);
}
