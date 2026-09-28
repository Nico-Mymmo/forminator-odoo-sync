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

  return normalizeQuillLists(html)
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
 * Quill 2 bewaart ELKE lijst als `<ol>`, ook een lijst met bolletjes: het
 * type staat enkel in `<li data-list="bullet">`. Buiten de editor (de
 * eventpagina, het voorbeeld) kent niemand dat attribuut, dus werd elke
 * opsomming een genummerde lijst. Erger: bij het opnieuw openen leest Quill
 * de ouder (`<ol>`) en maakte hij er ook in de editor zelf nummers van.
 *
 * Deze functie zet zo'n `<ol>` om in echte `<ul>`/`<ol>`-lijsten, per
 * aaneengesloten reeks van hetzelfde type (Quill zet twee soorten na elkaar
 * in één `<ol>`), en haalt Quill's eigen `<span class="ql-ui">` weg. HTML
 * zonder `data-list` blijft ongemoeid. Quill nest geen lijsten (inspringen is
 * een klasse), dus een niet-gretige match op `<ol>...</ol>` volstaat.
 *
 * Dezelfde logica staat in public/events-v2-client.js (bij het opslaan en
 * het voorbeeld); deze kant repareert wat al in Odoo staat.
 *
 * @param {string} html
 * @returns {string}
 */
export function normalizeQuillLists(html) {
  if (typeof html !== 'string' || html.indexOf('data-list') === -1) return html;

  return html.replace(/<ol\b[^>]*>([\s\S]*?)<\/ol\s*>/gi, (whole, inner) => {
    const runs = [];
    const re = /<li\b([^>]*)>([\s\S]*?)<\/li\s*>/gi;
    let m;
    while ((m = re.exec(inner)) !== null) {
      const type = /\bdata-list\s*=\s*["']([\w-]+)["']/i.exec(m[1]);
      const tag = type && type[1].toLowerCase() !== 'ordered' ? 'ul' : 'ol';
      const attrs = m[1].replace(/\s*\bdata-list\s*=\s*["'][^"']*["']/i, '');
      const body = m[2].replace(/<span\b[^>]*\bql-ui\b[^>]*>\s*<\/span>/gi, '');
      const item = `<li${attrs}>${body}</li>`;
      const last = runs[runs.length - 1];
      if (last && last.tag === tag) last.items.push(item);
      else runs.push({ tag, items: [item] });
    }
    if (runs.length === 0) return whole;
    return runs.map(r => `<${r.tag}>${r.items.join('')}</${r.tag}>`).join('');
  });
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
