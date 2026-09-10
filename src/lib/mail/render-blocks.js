/**
 * Blokken → HTML. Gedeelde mailrenderer.
 *
 * Pure module: geen I/O, geen env, geen Odoo. De uitvoer is een volledige
 * HTML-mail, klaar om als `body_html` op een `mail.mail` te zetten.
 *
 * HERKOMST. Dit was `event-operations-v2/lib/mail-render.js`, de renderer van
 * de events-mailstudio. Bij het bouwen van de `send_mail`-stap in Koppelingen
 * is het generieke deel hierheen verplaatst, ONGEWIJZIGD op één punt na: de
 * leesbare namen van de placeholders (de chips in de editor) komen nu als
 * `tokenLabels` mee in plaats van uit een vaste lijst in dit bestand. Wat er
 * in mail-render.js achterbleef, is wat écht over events gaat:
 * `TOKEN_LABELS`, `formatEventMoment` en `buildPlaceholderContext`.
 *
 * De opmaak is overgenomen van de bestaande bevestigingsmail (template 50/55):
 * lichtblauwe achtergrond, full-bleed hero, witte kaarten met afgeronde
 * hoeken, een grijs detailkader, een afzenderkaart met foto en een kleine
 * grijze voettekst. Wat hier ANDERS is dan die template staat als comment bij
 * het betrokken blok.
 *
 * TABELLEN, GEEN DIVS. De oorspronkelijke template bouwt de layout met
 * `<div>`, `max-width` en `border-radius`. Outlook op Windows rendert met de
 * Word-engine: die kent geen `max-width` en geen `border-radius`, dus daar
 * liep de mail over de volle vensterbreedte. Hier draagt een tabel met een
 * `width`-ATTRIBUUT de layout; de afgeronde hoeken blijven staan als
 * verfraaiing voor clients die ze wél kennen.
 *
 * GEEN QWEB. De mails worden hier gerenderd, niet door Odoo. `mail.mail.
 * body_html` wordt door Odoo NIET nog eens door QWeb gehaald (anders dan
 * `mail.template.body_html`), dus wat hier uitkomt is letterlijk wat de
 * ontvanger krijgt.
 */

import { BLOCK_TYPE } from './block-types.js';

/**
 * De huisstijl van de mail, op één plek. Waarden overgenomen uit de
 * bestaande template zodat de nieuwe mails er identiek uitzien.
 */
const STYLE = {
  page: '#f0f9ff',
  card: '#ffffff',
  box: '#f9fafb',
  heading: '#1f2937',
  text: '#374151',
  link: '#2563eb',
  footer: '#9ca3af',
  border: '#e5e7eb',
  radius: 16,
  boxRadius: 12,
  pad: 48,
  gap: 40,
  width: 720,
  font: "Helvetica,Arial,sans-serif",
  headingFont:
    "'SF Pro Display',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Ubuntu,'Noto Sans',Arial,sans-serif"
};


/** @param {any} value @returns {string} */
export function esc(value) {
  return String(value === null || value === undefined || value === false ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Alleen http(s) doorlaten. Een `javascript:`-URL doet niets in een
 * mailclient, maar wél in het preview-iframe in de OM.
 *
 * @param {any} value @returns {string}
 */
export function safeUrl(value) {
  const raw = String(value || '').trim();
  if (raw === '') return '';
  if (!/^https?:\/\//i.test(raw)) return '';
  return esc(raw);
}

/**
 * Placeholders vervangen. Logic-loos: `{{pad.naar.waarde}}` en niets anders.
 * Geen conditionals, geen loops, geen eval -- wie variatie wil, zet `sites`
 * op een blok.
 *
 * Een onbekende placeholder wordt LEEG, niet zijn eigen naam.
 *
 * @param {string} template @param {Object} context @returns {string}
 */
export function fillPlaceholders(template, context) {
  if (typeof template !== 'string' || template === '') return '';

  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, path) => {
    const value = path
      .split('.')
      .reduce((acc, key) => (acc === null || acc === undefined ? undefined : acc[key]), context);
    if (value === null || value === undefined || value === false) return '';
    return String(value);
  });
}

/**
 * Placeholders als CHIP tonen in plaats van in te vullen.
 *
 * Alleen in de editor. Waarom dit moet: het voorbeeld toont normaal de
 * INGEVULDE waarden, en de editor schrijft bij het verlaten van een veld
 * terug wat er staat. Zonder chips zou één klik op een titel `{{event.type}}`
 * vervangen door "Q&A" -- het sjabloon vernielt zichzelf dan stilletjes bij
 * het eerste gebruik.
 *
 * `contenteditable="false"` maakt de chip één ondeelbaar geheel: je kan er
 * niet middenin typen, en backspace haalt hem in zijn geheel weg.
 *
 * De labels komen als PARAMETER binnen, niet uit een vaste lijst in dit
 * bestand: welke placeholders er bestaan en hoe ze heten hangt af van wie
 * de mail samenstelt (een event heeft `{{event.title}}`, een koppeling
 * heeft de velden van haar formulier). Zonder labels valt de chip terug op
 * het pad zelf -- lelijk, maar nooit stuk.
 *
 * @param {string} html - al ge-escapete tekst, of vertrouwde HTML
 * @param {Object<string,string>} [labels] - pad -> leesbare naam
 * @returns {string}
 */
export function tokenizeToChips(html, labels = {}) {
  return String(html || '').replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, path) => {
    const label = labels[path] || path;
    // De zero-width spaties eromheen zijn geen opsmuk: zonder een
    // tekstknooppunt naast een `contenteditable=false`-element kan je de
    // cursor er niet naast zetten, en kan je dus niet achter een chip
    // verder typen. fromChips() in de studio strippt ze weer.
    return (
      '\u200b' +
      `<span data-om-token="${esc(path)}" contenteditable="false" ` +
      `style="display:inline-block;padding:1px 8px;margin:0 1px;border-radius:10px;` +
      `background:#e0e7ff;color:#3730a3;font-size:0.9em;font-weight:500;` +
      `white-space:nowrap;vertical-align:baseline;">${esc(label)}</span>` +
      '\u200b'
    );
  });
}

// ─── Blokken binnen een kaart ─────────────────────────────────────────────────

/**
 * Markers voor de klik-om-te-bewerken-editor in de OM.
 *
 * Deze attributen worden ALLEEN toegevoegd wanneer `editable` aanstaat, dus
 * in het voorbeeldpaneel. De mail die naar Odoo gaat wordt met `editable:
 * false` gerenderd en bevat ze niet -- controleer dat met de test
 * "verzonden mail bevat geen editor-markers".
 *
 * @param {boolean} editable @param {string} prop @returns {string}
 */
function editMark(editable, prop) {
  return editable ? ` data-om-edit="${prop}"` : '';
}

/**
 * @param {Object} block @param {Object} context @param {boolean} [editable]
 * @returns {string} een <tr>
 */
function renderCardBlock(block, context, editable = false, tokenLabels = {}) {
  const fill = (value) => fillPlaceholders(String(value || ''), context);
  const mark = editable ? ` data-om-block="${esc(block.id)}" data-om-type="${esc(block.type)}"` : '';
  const row = (inner, style = '') =>
    `<tr><td${mark} style="font-family:${STYLE.font};${style}">${inner}</td></tr>`;
  const ed = (prop) => editMark(editable, prop);

  // Tekst die de gebruiker bewerkt: in de editor blijven de placeholders
  // staan (als chip), bij het versturen worden ze ingevuld. Attributen
  // (src, href) gaan ALTIJD door fill() -- een chip in een URL is onzin.
  const txt = (value) => (editable ? tokenizeToChips(esc(String(value || '')), tokenLabels) : esc(fill(value)));
  const rich = (value) => (editable ? tokenizeToChips(String(value || ''), tokenLabels) : fill(value));

  /**
   * Een blok dat nog niet getoond kan worden.
   *
   * Bij het VERSTUREN valt zo'n blok weg -- een opname die er niet is, hoort
   * geen gebroken afbeelding te worden. In de EDITOR moet het juist zichtbaar
   * blijven: anders voeg je een opnameblok toe, gebeurt er ogenschijnlijk
   * niets, en kan je het ook niet meer selecteren of weghalen omdat er geen
   * enkele marker in de HTML staat.
   */
  const leegBlok = (titel, uitleg) => {
    if (!editable) return '';
    return row(
      `<div style="border:1px dashed #cbd5e1;border-radius:${STYLE.boxRadius}px;padding:20px;` +
      `text-align:center;color:${STYLE.footer};font-size:13px;background:#f8fafc;">` +
      `<div style="font-weight:600;color:${STYLE.text};margin-bottom:2px;">${esc(titel)}</div>` +
      `<div>${esc(uitleg)}</div></div>`,
      'padding:8px 0 16px;'
    );
  };

  switch (block.type) {
    case BLOCK_TYPE.HEADING: {
      const text = txt(block.text);
      if (text === '') return leegBlok('Titel', 'Klik hier en typ je titel.');
      const level = [1, 2, 3].includes(Number(block.level)) ? Number(block.level) : 2;
      const size = { 1: 30, 2: 26, 3: 20 }[level];
      return row(
        `<h${level}${ed('text')} style="margin:0 0 24px 0;font-family:${STYLE.headingFont};font-size:${size}px;` +
        `line-height:1.2;font-weight:600;color:${STYLE.heading};">${text}</h${level}>`
      );
    }

    case BLOCK_TYPE.TEXT: {
      // Redactionele inhoud uit Odoo: vertrouwd, dus niet ge-escaped.
      // Placeholders worden er wél in ingevuld.
      const html = rich(block.html);
      if (html.trim() === '') return leegBlok('Tekst', 'Klik hier en begin te typen.');
      return row(
        `<div${ed('html')} style="margin:0 0 16px 0;font-size:16px;line-height:1.6;color:${STYLE.text};">${html}</div>`
      );
    }

    case BLOCK_TYPE.EVENT_DETAILS: {
      // Het grijze kader uit de bestaande mail, met dezelfde emoji-labels.
      //
      // De regels zijn GEEN vaste lijst meer: het zijn gewone rijen met een
      // icoon, een label en een waarde, en die waarde is vrije tekst met
      // placeholders. Zo kan een gebruiker zelf "Parking" of "Meebrengen"
      // toevoegen zonder dat daar code voor nodig is.
      //
      // Twee dingen die anders zijn dan template 50/55: de datumregel
      // gebruikte daar `x_studio_date` naast `starting_day` (dat veld staat
      // in FORBIDDEN_FIELDS en is false op elk record, dus die helft was
      // altijd leeg), en er was geen locatieregel.
      const title = txt(block.title) || esc('Details van het evenement:');
      const detailRows = Array.isArray(block.rows) ? block.rows : [];

      const rows = detailRows
        .map((detail, index) => {
          const raw = String(detail?.value || '');
          const shown = editable ? txt(raw) : esc(fill(raw));
          // Bij het versturen valt een lege regel weg; in de editor blijft
          // hij staan, anders kan je hem niet meer invullen.
          if (!editable && shown.trim() === '') return '';

          const label = txt(detail?.label || '');
          const icon = esc(String(detail?.icon || ''));
          const filled = fill(raw);
          const isLink = /^https?:\/\//i.test(filled);

          const value = isLink && !editable
            ? `<br><a href="${safeUrl(filled)}" style="color:${STYLE.link};text-decoration:none;word-break:break-all;">${esc(filled)}</a>`
            : ` <span${ed(`rows.${index}.value`)}>${shown || (editable ? '&nbsp;' : '')}</span>`;

          return `<p style="margin:0 0 8px 0;">${icon} <strong${ed(`rows.${index}.label`)} style="font-weight:700;">${label}:</strong>${value}</p>`;
        })
        .join('');

      if (rows === '') return '';
      return row(
        `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" ` +
        `style="border-collapse:separate;background:${STYLE.box};border-radius:${STYLE.boxRadius}px;">` +
        `<tr><td style="padding:20px;font-family:${STYLE.font};font-size:14px;color:${STYLE.text};">` +
        `<p style="margin:0 0 12px 0;"><strong${ed('title')} style="font-weight:700;">${title}</strong></p>` +
        rows +
        `</td></tr></table>`,
        'padding:24px 0;'
      );
    }

    case BLOCK_TYPE.BUTTON: {
      const href = safeUrl(fill(block.href));
      const label = txt(block.label);
      if (label === '') return leegBlok('Knop', 'Klik op het opschrift om het in te vullen.');
      if (href === '') return leegBlok('Knop', 'Nog geen link. Zet die in Instellingen.');
      return row(knopHtml({ href, label, block, editable, editAttr: ed('label'), context }), 'padding:8px 0 16px;');
    }

    case BLOCK_TYPE.MAP: {
      // Alleen zinvol bij een live event. Is er geen locatie (online event),
      // dan valt het blok weg -- geen kaart van nergens.
      const adres = String(fill(block.address || '{{event.location}}')).trim();
      if (adres === '') {
        return leegBlok('Locatie en route', 'Dit event heeft geen locatie, dus er is niets om te tonen.');
      }

      const route = safeUrl(fill('{{event.maps_url}}'));
      // Een INTERACTIEVE kaart kan niet in een mail: iframes worden gestript.
      // Een statische afbeelding wél -- die plak je als URL in de
      // instellingen (Google Static Maps, Mapbox, wat je ook gebruikt). Zonder
      // afbeelding blijft het adres met de routeknop over, en dat werkt overal.
      const kaart = safeUrl(fill(block.image));

      const beeld = kaart === ''
        ? ''
        : `<tr><td style="padding:0 0 12px;">` +
          (route === '' ? '' : `<a href="${route}" target="_blank">`) +
          `<img src="${kaart}" alt="${esc(adres)}" width="${STYLE.width - STYLE.pad * 2}" ` +
          `style="display:block;width:100%;height:auto;border:0;border-radius:${STYLE.boxRadius}px;">` +
          (route === '' ? '' : `</a>`) +
          `</td></tr>`;

      const knop = route === ''
        ? ''
        : `<tr><td style="padding:4px 0 0;">` +
          knopHtml({
            href: route,
            label: txt(block.label) || esc('Route openen'),
            block: { ...block, variant: block.variant || 'outline' },
            editable,
            editAttr: ed('label'),
            context
          }) +
          `</td></tr>`;

      return row(
        `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" ` +
        `style="border-collapse:separate;background:${STYLE.box};border-radius:${STYLE.boxRadius}px;">` +
        `<tr><td style="padding:20px;font-family:${STYLE.font};">` +
        `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">` +
        beeld +
        `<tr><td style="font-size:14px;color:${STYLE.text};padding:0 0 4px;">` +
        `📍 <strong${ed('title')} style="font-weight:700;">${txt(block.title) || esc('Waar')}:</strong> ` +
        `<span${ed('address')}>${txt(block.address || '{{event.location}}')}</span></td></tr>` +
        knop +
        `</table></td></tr></table>`,
        'padding:24px 0;'
      );
    }

    case BLOCK_TYPE.SIGNATURE: {
      // De afzenderkaart uit de bestaande mail: naam + functie links, ronde
      // foto rechts. Ontbreekt de foto, dan valt die kolom gewoon weg in
      // plaats van een lege blokje van 120px achter te laten.
      const name = editable
        ? (txt(block.name) || esc(context.host.name))
        : esc(fill(block.name) || context.host.name);
      if (name === '') return leegBlok('Afzender', 'Dit event heeft nog geen host. Kies er een, of vul een naam in bij Instellingen.');
      const jobTitle = txt(block.job_title !== undefined ? block.job_title : '{{host.job_title}}');
      const org = txt(block.org !== undefined ? block.org : '{{site.name}}');
      const avatar = safeUrl(fill(block.avatar !== undefined ? block.avatar : '{{host.avatar_url}}'));

      const left =
        `<td width="66%" style="vertical-align:middle;padding:0;font-family:${STYLE.font};font-size:16px;color:${STYLE.text};">` +
        `<p style="margin:0 0 16px 0;"><strong style="font-weight:700;">${name}</strong></p>` +
        `<p style="margin:0;">${jobTitle}${jobTitle && org ? '<br>' : ''}${org}</p>` +
        `</td>`;

      const right = avatar === ''
        ? ''
        : `<td width="34%" style="vertical-align:middle;text-align:right;padding:0;">` +
          `<img src="${avatar}" width="120" height="120" alt="${name}" ` +
          `style="display:block;width:120px;height:120px;border-radius:60px;border:0;margin-left:auto;"></td>`;

      return row(
        `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" ` +
        `style="border-collapse:collapse;"><tr>${left}${right}</tr></table>`
      );
    }

    case BLOCK_TYPE.VIDEO: {
      // Geen <iframe> in een mail: mailclients strippen die. Een thumbnail
      // die naar de video linkt is de enige vorm die overal werkt.
      //
      // Leeg laten = de opname van DIT EVENT. Zo staat de videolink op één
      // plek en niet ook nog eens in het mailsjabloon.
      const href = safeUrl(fill(block.href || '{{event.video_url}}'));
      const thumb = safeUrl(fill(block.thumbnail || '{{event.video_thumbnail}}'));
      // Geen opname op het event: bij het VERSTUREN valt het blok weg (geen
      // gebroken afbeelding), in de EDITOR blijft het staan met de reden
      // erbij -- anders lijkt het alsof het toevoegen niets deed.
      if (href === '' || thumb === '') {
        return leegBlok(
          'Opname',
          href !== '' && thumb === ''
            ? 'Deze video heeft geen beeld. Kies hem opnieuw via "Opname kiezen".'
            : 'Nog geen opname gekoppeld aan dit event. Kies er een met de knop "Opname kiezen" bovenaan.'
        );
      }

      const caption = txt(block.label) || esc('Bekijk de opname');
      const alt = esc(fill(block.alt) || caption);
      const inner = STYLE.width - STYLE.pad * 2;

      // Één klikbare kaart: thumbnail bovenaan, donkere balk met een
      // afspeeldriehoek eronder. Een echte play-knop ÓP de afbeelding vraagt
      // een overlay, en positionering over een afbeelding is precies wat de
      // Word-engine van Outlook niet doet -- vandaar de balk eronder, die
      // overal hetzelfde oogt.
      return row(
        `<a href="${href}" target="_blank" style="text-decoration:none;color:inherit;display:block;">` +
        `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" ` +
        `style="border-collapse:separate;border-radius:${STYLE.boxRadius}px;overflow:hidden;background:#111827;">` +
        `<tr><td style="padding:0;font-size:0;line-height:0;">` +
        `<img src="${thumb}" alt="${alt}" width="${inner}" ` +
        `style="display:block;width:100%;height:auto;border:0;"></td></tr>` +
        `<tr><td style="padding:14px 18px;font-family:${STYLE.font};font-size:15px;font-weight:600;color:#ffffff;">` +
        `<span style="display:inline-block;width:26px;height:26px;line-height:26px;text-align:center;` +
        `background:#ffffff;color:#111827;border-radius:13px;font-size:12px;margin-right:10px;">&#9654;</span>` +
        `${caption}</td></tr>` +
        `</table></a>`,
        'padding:8px 0 16px;'
      );
    }

    case BLOCK_TYPE.ANNOUNCEMENT: {
      // Het event zelf is al opgezocht (mail-service.resolveAnnouncements) en
      // staat op blok-id in de context. Deze functie blijft puur: geen Odoo,
      // geen fetch, geen "wat is het eerstvolgende event" hier.
      const aankondiging = context?.announcements?.[block.id] || null;

      if (!aankondiging) {
        // Bij het VERSTUREN valt het blok weg: liever geen kaart dan een
        // kaart die zegt dat er niets gevonden is. In de EDITOR blijft hij
        // staan, met de reden erbij.
        const waarom = {
          next: 'Er staat nog geen volgend gepubliceerd event in de agenda.',
          next_of_type: block.eventTypeId
            ? 'Er staat nog geen volgend gepubliceerd event van dit type in de agenda.'
            : 'Kies eerst een event-type bij Instellingen.',
          highlighted: 'Er staat geen volgend uitgelicht event in de agenda (vinkje "uitgelicht" in Odoo).',
          fixed: block.eventId
            ? 'Dit event is niet gevonden, of het is niet gepubliceerd.'
            : 'Kies eerst een event bij Instellingen.'
        };
        return leegBlok(
          'Aankondiging',
          waarom[block.pick] || 'Geen event gevonden. Kijk de keuze na bij Instellingen.'
        );
      }

      const kop = txt(block.title);
      const meta = [aankondiging.day, aankondiging.time].filter((s) => String(s || '') !== '').join(' &middot; ');
      const plaats = String(aankondiging.location || '').trim() !== ''
        ? esc(aankondiging.location)
        : (String(aankondiging.link || '').trim() !== '' ? 'Online' : '');

      const knop = String(aankondiging.url || '') === ''
        ? ''
        : `<tr><td style="padding:16px 0 0;">` +
          knopHtml({
            href: safeUrl(aankondiging.url),
            label: txt(block.label) || esc('Bekijk en schrijf je in'),
            block,
            editable,
            editAttr: ed('label'),
            context
          }) +
          `</td></tr>`;

      const samenvatting = block.showSummary !== false && String(aankondiging.summary || '').trim() !== ''
        ? `<tr><td style="font-size:14px;line-height:22px;color:${STYLE.text};padding:8px 0 0;">` +
          `${esc(aankondiging.summary)}</td></tr>`
        : '';

      return row(
        `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" ` +
        `style="border-collapse:separate;background:${STYLE.box};border-radius:${STYLE.boxRadius}px;">` +
        `<tr><td style="padding:24px;font-family:${STYLE.font};">` +
        `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">` +
        (kop === ''
          ? ''
          : `<tr><td${ed('title')} style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;` +
            `font-weight:700;color:${STYLE.footer};padding:0 0 8px;">${kop}</td></tr>`) +
        `<tr><td style="font-family:${STYLE.headingFont};font-size:20px;line-height:28px;font-weight:700;` +
        `color:${STYLE.heading};padding:0;">${esc(aankondiging.title)}</td></tr>` +
        (meta === '' && plaats === ''
          ? ''
          : `<tr><td style="font-size:14px;color:${STYLE.text};padding:6px 0 0;">` +
            `${meta}${meta !== '' && plaats !== '' ? ' &middot; ' : ''}${plaats}</td></tr>`) +
        samenvatting +
        knop +
        `</table></td></tr></table>`,
        'padding:24px 0;'
      );
    }

    case BLOCK_TYPE.IMAGE: {
      const src = safeUrl(fill(block.src));
      if (src === '') return leegBlok('Afbeelding', 'Nog geen afbeelding. Zet de URL in Instellingen.');
      const alt = esc(fill(block.alt));
      const href = safeUrl(fill(block.href));
      const img = `<img src="${src}" alt="${alt}" width="${STYLE.width - STYLE.pad * 2}" ` +
        `style="display:block;width:100%;height:auto;border:0;border-radius:${STYLE.boxRadius}px;">`;
      return row(href === '' ? img : `<a href="${href}" target="_blank">${img}</a>`, 'padding:8px 0 16px;');
    }

    case BLOCK_TYPE.DIVIDER:
      return row(
        `<div style="height:1px;background:${STYLE.border};line-height:1px;font-size:0;">&nbsp;</div>`,
        'padding:16px 0;'
      );

    case BLOCK_TYPE.SPACER: {
      const height = Math.min(Math.max(Number(block.height) || 16, 4), 80);
      return `<tr><td style="height:${height}px;line-height:${height}px;font-size:0;">&nbsp;</td></tr>`;
    }

    default:
      // normalizeMailBlocks() weert onbekende types al; dit is het vangnet.
      return '';
  }
}

// ─── Blokken buiten een kaart ─────────────────────────────────────────────────

/**
 * Knopvarianten. Bewust een gesloten lijstje: een vrije kleurkiezer levert
 * onleesbare combinaties op, en in een mail kan je dat niet meer bijstellen.
 */
const KNOP_STIJLEN = {
  brand: { merk: 'vol' },
  brand_outline: { merk: 'omlijnd' },
  primary: { bg: '#2563eb', kleur: '#ffffff', rand: '#2563eb' },
  dark: { bg: '#111827', kleur: '#ffffff', rand: '#111827' },
  outline: { bg: '#ffffff', kleur: '#2563eb', rand: '#2563eb' },
  subtle: { bg: '#f1f5f9', kleur: '#1f2937', rand: '#e2e8f0' }
};

/**
 * De kleuren van een knop.
 *
 * DRIE bronnen, in deze volgorde:
 *
 *  1. `block.color` -- een vrije kleur die de gebruiker in de kleurkiezer
 *     koos. `'category'` betekent uitdrukkelijk "de kleur van de
 *     eventcategorie", zodat die keuze meeschuift als de categorie later een
 *     andere kleur krijgt (en niet als bevroren hex in duizend mails staat).
 *  2. `block.variant` -- de oude, gesloten lijst. Blijft werken: er staan
 *     bestaande mails in Odoo met `variant: "subtle"`, en die mogen niet
 *     ineens blauw worden.
 *  3. blauw, als er niets bruikbaars is.
 *
 * `block.outline` maakt van elke kleur de omlijnde versie: witte vulling,
 * tekst en rand in die kleur. Dat is één schakelaar in plaats van twee
 * varianten per kleur.
 *
 * De TEKSTKLEUR wordt altijd berekend (leesbareTekstkleur), nooit gekozen.
 * Een vrije kleurkiezer zonder die berekening levert onleesbare knoppen op,
 * en in een verstuurde mail kan je dat niet meer bijstellen.
 *
 * @param {Object} block @param {Object} context
 * @returns {{ bg: string, kleur: string, rand: string }}
 */
export function knopStijl(block, context) {
  const categorie = hexOfNiets(context?.event?.type_color) || KNOP_STIJLEN.primary.bg;

  const vrij = String(block?.color || '').trim().toLowerCase();
  let basis = null;

  if (vrij === 'category') {
    basis = categorie;
  } else if (hexOfNiets(vrij)) {
    basis = hexOfNiets(vrij);
  }

  if (basis === null) {
    const gekozen = KNOP_STIJLEN[block?.variant] || KNOP_STIJLEN.primary;
    if (gekozen.merk === 'vol') basis = categorie;
    else if (gekozen.merk === 'omlijnd') return { bg: '#ffffff', kleur: categorie, rand: categorie };
    else return gekozen;
  }

  return block?.outline === true
    ? { bg: '#ffffff', kleur: basis, rand: basis }
    : { bg: basis, kleur: leesbareTekstkleur(basis), rand: basis };
}

/**
 * Zwarte of witte tekst op deze achtergrond?
 *
 * De categoriekleuren komen uit Odoo en zijn dus door een gebruiker in te
 * stellen. Witte tekst hardcoderen zou op een lichte kleur onleesbaar zijn,
 * en in een mail kan je dat achteraf niet meer bijstellen.
 *
 * Drempel 0,6 op de relatieve helderheid (WCAG-formule): daarboven zwarte
 * tekst, daaronder witte.
 *
 * @param {string} hex - #rrggbb
 * @returns {string}
 */
export function leesbareTekstkleur(hex) {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!match) return '#ffffff';

  const waarde = match[1];
  const kanaal = (start) => {
    const v = Number.parseInt(waarde.slice(start, start + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };

  const helderheid = 0.2126 * kanaal(0) + 0.7152 * kanaal(2) + 0.0722 * kanaal(4);
  return helderheid > 0.6 ? '#111827' : '#ffffff';
}

/** Een geldige hexkleur, of leeg. @returns {string} */
function hexOfNiets(waarde) {
  return /^#[0-9a-fA-F]{6}$/.test(String(waarde || '').trim()) ? String(waarde).trim() : '';
}

/**
 * Eén knop, in de gekozen stijl en breedte.
 *
 * @param {Object} options
 * @param {string} options.href - al door safeUrl gehaald
 * @param {string} options.label - al ge-escapet of getokeniseerd
 * @param {Object} options.block
 * @param {boolean} options.editable
 * @param {string} options.editAttr
 * @returns {string}
 */
function knopHtml({ href, label, block, editable, editAttr, context }) {
  const stijl = knopStijl(block, context);

  const volleBreedte = block?.width === 'full';
  const uitlijning = ['left', 'center', 'right'].includes(block?.align) ? block.align : 'left';

  // Het opschrift zit in een SPAN BINNEN de link, niet op de <a> zelf:
  // `contenteditable` op een anchor geeft in Chrome geen cursor, waardoor de
  // tekst van een knop niet te bewerken was.
  const knop =
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0"` +
    (volleBreedte ? ' width="100%"' : '') +
    ` style="border-collapse:separate;${volleBreedte ? 'width:100%;' : ''}">` +
    `<tr><td align="center" style="background:${stijl.bg};border:1px solid ${stijl.rand};border-radius:8px;">` +
    `<a href="${href}" target="_blank" style="display:inline-block;padding:14px 28px;` +
    `font-family:${STYLE.font};font-size:16px;font-weight:600;color:${stijl.kleur};text-decoration:none;">` +
    `<span${editAttr}>${label}</span></a></td></tr></table>`;

  // In de editor de link eronder zetten: anders moet je de instellingen
  // openen om te zien waar een knop naartoe gaat, en dat is precies wat je
  // wil controleren voor je verstuurt.
  const linkHint = editable
    ? `<div style="margin-top:6px;font-family:${STYLE.font};font-size:11px;color:${STYLE.footer};` +
      `word-break:break-all;">→ ${esc(href)}</div>`
    : '';

  if (uitlijning === 'left' || volleBreedte) return knop + linkHint;
  return `<div style="text-align:${uitlijning};">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="${uitlijning}" ` +
    `style="display:inline-table;"><tr><td>${knop}</td></tr></table></div>` + linkHint;
}

/**
 * De HEADER: full-bleed afbeelding boven de eerste kaart.
 *
 * Dit is geen blok maar een eigen veld, omdat hij als enige onderdeel per
 * bedrijf verschilt. Welke van de drie slots hier binnenkomt bepaalt
 * headerFor() in mail-blocks.js.
 *
 * @param {Object|null} header - { src, alt, href }
 * @returns {string}
 */
function renderHeader(header, context, editable = false) {
  if (!header) return '';
  const fill = (value) => fillPlaceholders(String(value || ''), context);
  const src = safeUrl(fill(header.src));
  if (src === '') return '';

  const alt = esc(fill(header.alt));
  const href = safeUrl(fill(header.href));
  const mark = editable ? ' data-om-header="1"' : '';

  // `object-fit:cover` stond in de oorspronkelijke template maar wordt door
  // vrijwel elke mailclient genegeerd -- weggelaten in plaats van te doen
  // alsof het werkt. Lever de afbeelding op de juiste verhouding aan.
  const img =
    `<img src="${src}" alt="${alt}" width="${STYLE.width}" ` +
    `style="display:block;width:100%;max-width:${STYLE.width}px;height:auto;border:0;line-height:0;font-size:0;">`;

  return `<tr><td${mark} style="padding:0;font-size:0;line-height:0;">${href === '' ? img : `<a href="${href}" target="_blank">${img}</a>`}</td></tr>`;
}

/** Kleine grijze voettekst, buiten en onder de kaarten. @returns {string} */
function renderFooter(block, context, editable = false, tokenLabels = {}) {
  const html = editable
    ? tokenizeToChips(String(block.html || ''), tokenLabels)
    : fillPlaceholders(String(block.html || ''), context);
  if (html.trim() === '') return '';
  const mark = editable ? ` data-om-block="${esc(block.id)}" data-om-type="${esc(block.type)}"` : '';
  return (
    `<tr><td${mark}${editMark(editable, 'html')} style="padding:${STYLE.gap}px 20px 0;text-align:center;` +
    `font-family:${STYLE.font};font-size:12px;line-height:1.6;color:${STYLE.footer};">${html}</td></tr>`
  );
}

// ─── De mail als geheel ───────────────────────────────────────────────────────

/**
 * Volledige mail renderen.
 *
 * De header komt altijd eerst, full-bleed en buiten de kaarten. Daarna is de
 * blokkenlijst een LINEAIRE stroom; de layout volgt uit het type:
 *
 *   card_break  → sluit de kaart; het volgende blok opent een nieuwe
 *   footer      → sluit de kaart, rendert eronder als kleine grijze tekst
 *   al de rest  → binnen de huidige kaart (die opent vanzelf)
 *
 * Zo komt de bestaande mail er precies uit: header → kaart met de inhoud →
 * card_break → kaart met de afzender → footer.
 *
 * @param {Object} options
 * @param {Object|null} [options.header] - uit resolveSection()
 * @param {Object[]} options.blocks - uit resolveSection()
 * @param {Object} options.context - uit buildPlaceholderContext()
 * @param {string} [options.preheader]
 * @param {Object<string,string>} [options.tokenLabels] - alleen voor de editor:
 *        pad -> leesbare naam voor de chips (zie tokenizeToChips)
 * @returns {string}
 */
export function renderMailHtml({ header = null, blocks, context, preheader = '', editable = false, tokenLabels = {} }) {
  // GEEN filtering meer op blokken: de inhoud is één versie voor iedereen.
  // Het enige dat per bedrijf verschilt is de header (en, als iemand daar
  // uitdrukkelijk voor kiest, een hele variant -- maar dan is de keuze al
  // gemaakt vóór deze functie, in resolveSection()).
  const visible = blocks || [];

  const rows = [];
  let cardRows = [];
  let lastWasHeader = false;

  const spacer = (height) => `<tr><td style="height:${height}px;line-height:${height}px;font-size:0;">&nbsp;</td></tr>`;

  const flushCard = () => {
    if (cardRows.length === 0) return;
    // Een kaart die op de header volgt sluit er naadloos op aan (margin-top:0
    // in de oorspronkelijke template); anders 40px ertussen.
    if (rows.length > 0 && !lastWasHeader) rows.push(spacer(STYLE.gap));
    rows.push(
      `<tr><td style="background:${STYLE.card};border-radius:${STYLE.radius}px;padding:${STYLE.pad}px;">` +
      `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">` +
      cardRows.join('') +
      `</table></td></tr>`
    );
    cardRows = [];
    lastWasHeader = false;
  };

  const headerRow = renderHeader(header, context, editable);
  if (headerRow !== '') {
    rows.push(headerRow);
    lastWasHeader = true;
  }

  for (const block of visible) {
    if (block.type === BLOCK_TYPE.CARD_BREAK) {
      flushCard();
      continue;
    }
    if (block.type === BLOCK_TYPE.FOOTER) {
      flushCard();
      rows.push(renderFooter(block, context, editable, tokenLabels));
      continue;
    }
    const html = renderCardBlock(block, context, editable, tokenLabels);
    if (html !== '') cardRows.push(html);
  }
  flushCard();

  // De preheader is de voorbeeldtekst in de inbox: zichtbaar in de lijst,
  // onzichtbaar in de mail zelf. De oorspronkelijke template had er geen,
  // waardoor Gmail de eerste zin van de hero-alt-tekst toonde.
  const pre = esc(fillPlaceholders(String(preheader || ''), context));
  const preheaderHtml =
    pre === ''
      ? ''
      : `<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${pre}</div>`;

  return (
    preheaderHtml +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" ` +
    `style="border-collapse:collapse;background:${STYLE.page};margin:0;padding:0;">` +
    `<tr><td align="center" style="padding:${STYLE.gap}px 12px;">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${STYLE.width}" ` +
    `style="border-collapse:collapse;width:100%;max-width:${STYLE.width}px;">` +
    rows.join('') +
    `</table></td></tr></table>`
  );
}

/**
 * Onderwerp renderen. Apart van de body omdat het nooit HTML mag zijn: een
 * `<` in een subject komt letterlijk in de inbox terecht.
 *
 * @param {string} subject @param {Object} context @returns {string}
 */
export function renderSubject(subject, context) {
  return fillPlaceholders(String(subject || ''), context).replace(/\s+/g, ' ').trim();
}
