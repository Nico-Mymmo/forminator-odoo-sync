/**
 * Event Operations v2 — Communicatie-studio (client)
 *
 * Bewerkt de mailblokken die IN ODOO staan:
 *   x_webinar_event_type.x_studio_mail_blocks      (standaard per type)
 *   x_webinar.x_studio_mail_blocks_override        (override per event)
 *
 * ONTWERPKEUZE: JE BEWERKT IN DE MAIL ZELF.
 * Een eerdere versie zette een blokkenlijst met ruwe velden (URL, alt, level,
 * een HTML-textarea) naast het voorbeeld. Dat werkt voor wie het gebouwd
 * heeft en voor niemand anders -- en de mensen die dit moeten kunnen zijn de
 * organisatoren van de events, niet alleen marketing. Nu klik je op een titel
 * of alinea IN de mail en typ je erin. Alles wat je niet kan typen (een link,
 * een afbeelding, zichtbaarheid per site) zit achter één knop "Instellingen"
 * op het onderdeel dat je geselecteerd hebt.
 *
 * WAAROM DE EDITOR IN HET IFRAME LEEFT
 * Het voorbeeld is een `srcdoc`-iframe en dus same-origin: we kunnen er
 * rechtstreeks in werken. De selectie-omlijning en de werkbalk worden IN dat
 * document gezet, zodat ze meebewegen met de layout. Een werkbalk in de
 * ouderpagina zou bij elke scroll herberekend moeten worden.
 *
 * De markers waarop dit werkt (`data-om-block`, `data-om-edit`) worden ALLEEN
 * gerenderd wanneer de preview-route `editable: true` meekrijgt. De mail die
 * naar Odoo geschreven wordt bevat ze niet.
 *
 * REGELS UIT CLAUDE.md die hier gelden: geen inline onclick/onchange (alles
 * via data-attributen en één centrale listener), tabs altijd tabs-boxed,
 * fetch met credentials: 'include' en bij 401 terug naar /.
 */

(function () {
  'use strict';

  var API = '/events-v2/api';

  var state = {
    eventId: null,
    eventTypeId: null,
    eventTypeName: '',
    event: null,
    kind: 'confirmation',
    /**
     * Alleen een VOORBEELDkeuze: welke header je ziet, en -- als de inhoud
     * gesplitst is -- welke variant je bewerkt. De inhoud zelf is standaard
     * één versie voor iedereen.
     */
    viewSite: 'openvme',
    headerSlot: null,
    /** false = de standaard van het event-type, true = alleen dit event */
    scopeEvent: false,
    typeDoc: null,
    eventDoc: null,
    schema: null,
    selectedId: null,
    dirty: false,
    previewTimer: null,
    busy: false,
    addAt: 'end',
    ownedByOm: false,
    proofPeople: null
  };

  var KIND_LABEL = { confirmation: 'bevestiging', reminder: 'reminder', recap: 'recap' };

  /**
   * De onderdelen zoals ze in de kiezer verschijnen. Bewust in mensentaal en
   * met een voorbeeld erbij -- niet de technische bloknaam.
   */
  var BLOCK_META = {
    heading:       { label: 'Titel',           icon: 'heading',             hint: 'Een kop in het vet',           sample: { level: 2, text: 'Nieuwe titel' } },
    text:          { label: 'Tekst',           icon: 'align-left',          hint: 'Een alinea',                   sample: { html: '<p style="margin:0 0 16px 0;">Nieuwe tekst.</p>' } },
    event_details: { label: 'Praktisch kader', icon: 'calendar-clock',      hint: 'Datum, tijd, locatie en link', sample: { title: 'Details van het evenement:' } },
    button:        { label: 'Knop',            icon: 'mouse-pointer-click', hint: 'Een duidelijke actieknop',     sample: { label: 'Neem deel', href: '{{event.link}}', variant: 'primary', align: 'left' } },
    map:           { label: 'Locatie en route', icon: 'map-pin',            hint: 'Adres met een routeknop',      sample: { title: 'Waar', label: 'Route openen' } },
    video:         { label: 'Opname',          icon: 'play-circle',         hint: 'De video van dit event',       sample: {} },
    image:         { label: 'Afbeelding',      icon: 'image',               hint: 'Een beeld in de tekst',        sample: { src: '', alt: '' } },
    signature:     { label: 'Afzender',        icon: 'user-round',          hint: 'Naam, functie en foto',        sample: {} },
    divider:       { label: 'Lijntje',         icon: 'minus',               hint: 'Scheidingslijn',               sample: {} },
    spacer:        { label: 'Witruimte',       icon: 'move-vertical',       hint: 'Extra lucht',                  sample: { height: 24 } },
    card_break:    { label: 'Nieuw kader',     icon: 'layout-panel-top',    hint: 'Begint een nieuw wit blok',    sample: {} },
    footer:        { label: 'Voettekst',       icon: 'panel-bottom',        hint: 'Klein en grijs, onderaan',     sample: { html: '&copy; {{now.year}} Mymmo BV' } }
  };

  /**
   * Regels die je in het praktisch kader kan toevoegen. Spiegel van
   * DETAIL_PRESETS in lib/mail-blocks.js -- die lijst is de bron; deze is er
   * alleen om de keuze te tonen. Voeg je daar iets toe, voeg het hier ook toe.
   */
  var DETAIL_PRESETS = {
    day: { icon: '📅', label: 'Datum', value: '{{event.day}}' },
    time: { icon: '🕒', label: 'Tijd', value: '{{event.time}}' },
    location: { icon: '📍', label: 'Locatie', value: '{{event.location}}' },
    link: { icon: '🔗', label: 'Deelnamelink', value: '{{event.link}}' },
    host: { icon: '👤', label: 'Spreker', value: '{{host.name}}' },
    capacity: { icon: '👥', label: 'Aantal plaatsen', value: '{{event.capacity}}' },
    seats_left: { icon: '🎟️', label: 'Nog vrij', value: '{{event.seats_left}}' },
    custom: { icon: '✏️', label: 'Eigen regel', value: '' }
  };

  /** Wat je NIET rechtstreeks in de mail kan typen. Leeg = alleen zichtbaarheid. */
  var BLOCK_SETTINGS = {
    image: [
      { key: 'src', label: 'Afbeelding-URL', type: 'url' },
      { key: 'alt', label: 'Omschrijving van de afbeelding', type: 'text' },
      { key: 'href', label: 'Klikt door naar (optioneel)', type: 'url' }
    ],
    heading: [{ key: 'level', label: 'Grootte', type: 'select', options: [['1', 'Groot'], ['2', 'Normaal'], ['3', 'Klein']] }],
    button: [
      { key: 'href', label: 'Link', type: 'url' },
      { key: 'variant', label: 'Stijl', type: 'select', options: [['brand', 'Kleur van de eventcategorie'], ['brand_outline', 'Omlijnd in de categoriekleur'], ['primary', 'Blauw'], ['dark', 'Donker'], ['outline', 'Omlijnd blauw'], ['subtle', 'Rustig grijs']] },
      { key: 'align', label: 'Uitlijning', type: 'select', options: [['left', 'Links'], ['center', 'Gecentreerd'], ['right', 'Rechts']] },
      { key: 'width', label: 'Breedte', type: 'select', options: [['auto', 'Zo breed als de tekst'], ['full', 'Volle breedte']] }
    ],
    // De kaart: een INTERACTIEVE kaart kan niet in een mail (iframes worden
    // gestript), een statische afbeelding wel. Die URL plak je hier.
    map: [
      { key: 'address', label: 'Adres', type: 'text', placeholder: 'Leeg = de locatie van dit event' },
      { key: 'image', label: 'Statische kaart-URL (optioneel)', type: 'url', placeholder: 'https://maps.googleapis.com/maps/api/staticmap?…' },
      { key: 'variant', label: 'Stijl van de routeknop', type: 'select', options: [['brand', 'Kleur van de eventcategorie'], ['brand_outline', 'Omlijnd in de categoriekleur'], ['outline', 'Omlijnd blauw'], ['primary', 'Blauw'], ['dark', 'Donker'], ['subtle', 'Rustig grijs']] }
    ],
    spacer: [{ key: 'height', label: 'Hoogte in pixels', type: 'number' }],
    signature: [
      { key: 'name', label: 'Naam', type: 'text', placeholder: 'Leeg = de host van dit event' },
      { key: 'job_title', label: 'Functie', type: 'text', placeholder: 'Leeg = uit Odoo' },
      { key: 'org', label: 'Organisatie', type: 'text', placeholder: 'Leeg = volgt de site' }
    ],
    video: [], text: [], event_details: [], divider: [], card_break: [], footer: []
  };

  function el(id) { return document.getElementById(id); }

  function esc(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  async function api(path, options) {
    var response = await fetch(API + path, Object.assign({ credentials: 'include' }, options || {}));
    if (response.status === 401) { window.location.href = '/'; return null; }
    var payload = await response.json().catch(function () { return {}; });
    if (!response.ok || payload.success === false) {
      throw new Error(payload.error || ('Serverfout ' + response.status));
    }
    return payload.data;
  }

  function toast(message, type) {
    if (typeof window.showToast === 'function') { window.showToast(message, type); return; }
    console.log('[mail-studio]', message);
  }

  function icons() { if (window.lucide) window.lucide.createIcons(); }

  // ─── Placeholders als chips ────────────────────────────────────────────────
  //
  // In de editor staat een placeholder als CHIP, niet als `{{event.title}}`.
  // Dat is niet alleen prettiger, het is noodzakelijk: het voorbeeld toont
  // normaal de ingevulde waarden, en bij het verlaten van een veld schrijven
  // we terug wat er staat. Zonder chips zou één klik op een titel
  // `{{event.type}}` vervangen door "Q&A" -- het sjabloon vernielt zichzelf
  // dan bij het eerste gebruik.
  //
  // De server rendert dezelfde chips (tokenizeToChips in mail-render.js);
  // deze functie maakt er identieke bij tijdens het typen.

  var CHIP_STYLE = 'display:inline-block;padding:1px 8px;margin:0 1px;border-radius:10px;' +
    'background:#e0e7ff;color:#3730a3;font-size:0.9em;font-weight:500;' +
    'white-space:nowrap;vertical-align:baseline;';

  /** Alle placeholders als platte lijst, uit het schema van de server. */
  function allTokens() {
    var groups = (state.schema && state.schema.placeholders) || [];
    var out = [];
    groups.forEach(function (group) {
      (group.items || []).forEach(function (item) {
        out.push({ path: item.path, label: item.label, group: group.group });
      });
    });
    return out;
  }

  function tokenLabel(path) {
    var found = allTokens().filter(function (t) { return t.path === path; })[0];
    return found ? found.label : path;
  }

  function chipHtml(path) {
    return ZWSP + '<span data-om-token="' + esc(path) + '" contenteditable="false" style="' + CHIP_STYLE + '">' +
      esc(tokenLabel(path)) + '</span>' + ZWSP;
  }

  /** `{{event.title}}` → chip. Voor het vullen van de onderwerpvelden. */
  function toChips(value, escapeText) {
    var text = String(value || '');
    var out = '';
    var last = 0;
    var re = /\{\{\s*([\w.]+)\s*\}\}/g;
    var match;
    while ((match = re.exec(text)) !== null) {
      var chunk = text.slice(last, match.index);
      out += escapeText ? esc(chunk) : chunk;
      out += chipHtml(match[1]);
      last = match.index + match[0].length;
    }
    var rest = text.slice(last);
    return out + (escapeText ? esc(rest) : rest);
  }

  /** Zero-width spatie: het enige teken dat naast een chip mag staan. */
  var ZWSP = '\u200b';

  /**
   * Zorgen dat je de cursor naast elke chip kan zetten.
   *
   * Een `contenteditable="false"`-element zonder tekstknooppunt ernaast is
   * een muur: je kan er niet achter klikken en dus niet verder typen. Een
   * zero-width spatie ervoor en erna lost dat op. De server zet ze er al bij
   * (tokenizeToChips), maar na knippen/plakken of het invoegen van een chip
   * kunnen ze ontbreken -- vandaar deze opruiming bij het starten met
   * bewerken.
   */
  function ensureCaretSpace(node) {
    var doc = node.ownerDocument;
    Array.prototype.forEach.call(node.querySelectorAll('[data-om-token]'), function (chip) {
      if (!chip.previousSibling || chip.previousSibling.nodeType !== 3) {
        chip.parentNode.insertBefore(doc.createTextNode(ZWSP), chip);
      }
      if (!chip.nextSibling || chip.nextSibling.nodeType !== 3) {
        if (chip.nextSibling) chip.parentNode.insertBefore(doc.createTextNode(ZWSP), chip.nextSibling);
        else chip.parentNode.appendChild(doc.createTextNode(ZWSP));
      }
    });
  }

  /**
   * Chip → `{{pad}}`. Loopt de DOM af in plaats van een reguliere expressie
   * op innerHTML: alleen zo weet je zeker dat een chip één geheel blijft en
   * dat de omliggende opmaak intact blijft.
   *
   * @param {Node} node
   * @param {boolean} asHtml - true voor rich-tekstvelden, false voor platte
   * @returns {string}
   */
  function fromChips(node, asHtml) {
    var out = '';
    Array.prototype.forEach.call(node.childNodes, function (child) {
      if (child.nodeType === 3) {
        // De zero-width spaties rond chips zijn hulpmiddelen voor de cursor,
        // geen inhoud -- die horen niet in Odoo terecht te komen.
        var tekst = child.nodeValue.split(ZWSP).join('');
        out += asHtml ? esc(tekst) : tekst;
        return;
      }
      if (child.nodeType !== 1) return;

      var token = child.getAttribute('data-om-token');
      if (token) { out += '{{' + token + '}}'; return; }

      if (!asHtml) { out += fromChips(child, false); return; }

      // Element behouden, maar de inhoud opnieuw opbouwen zodat chips
      // binnenin ook omgezet worden.
      if (child.tagName === 'BR') { out += '<br>'; return; }
      var attrs = Array.prototype.map.call(child.attributes, function (a) {
        return ' ' + a.name + '="' + esc(a.value) + '"';
      }).join('');
      out += '<' + child.tagName.toLowerCase() + attrs + '>' +
        fromChips(child, true) + '</' + child.tagName.toLowerCase() + '>';
    });
    return out;
  }

  // ─── De "/"-kiezer ─────────────────────────────────────────────────────────
  //
  // Typ "/" in een bewerkbaar veld en je krijgt een lijst met de gegevens van
  // het event. Verder typen filtert, pijltjes navigeren, Enter voegt in.
  //
  // Werkt in twee documenten: de ouderpagina (onderwerp en voorbeeldtekst) en
  // het voorbeeld-iframe (de mail zelf). Een menu uit de ouderpagina kan niet
  // over een iframe heen liggen, dus elk document krijgt zijn eigen menu-node.

  var menuState = null;

  function menuNodeFor(doc) {
    if (doc === document) return el('mailTokenMenu');

    var node = doc.getElementById('om-token-menu');
    if (node) return node;

    node = doc.createElement('div');
    node.id = 'om-token-menu';
    node.style.cssText =
      'position:absolute;z-index:10000;display:none;width:280px;max-height:260px;overflow-y:auto;' +
      'background:#fff;border:1px solid #d1d5db;border-radius:10px;padding:4px;' +
      "box-shadow:0 10px 30px rgba(0,0,0,.18);font-family:system-ui,-apple-system,'Segoe UI',sans-serif;";
    doc.body.appendChild(node);
    return node;
  }

  function closeTokenMenu() {
    if (!menuState) return;
    var node = menuNodeFor(menuState.doc);
    if (menuState.doc === document) node.classList.add('hidden');
    else node.style.display = 'none';
    menuState = null;
  }

  /**
   * Het menu openen op de plek van de cursor.
   *
   * `anchorNode`/`anchorOffset` wijzen naar het tekstknooppunt en de positie
   * van de "/" zelf. Alles tussen die "/" en de cursor is de zoekterm, en
   * wordt bij het invoegen weggehaald.
   */
  /**
   * De net getypte "/" terugvinden.
   *
   * Het menu opent NA de toetsaanslag, dus de cursor staat al achter het
   * teken. Twee gevallen:
   *
   *  - de cursor staat in een tekstknooppunt: één positie terug volstaat;
   *  - de cursor staat in het ELEMENT zelf. Dat gebeurt in Chrome zodra je
   *    typt in een leeg contenteditable veld -- en dat is precies het geval
   *    waarin de "/"-kiezer niet openging: in een leeg onderwerpveld.
   *
   * Geeft null terug als er geen "/" vlak voor de cursor staat.
   *
   * @param {Range} range
   * @returns {{ node: Node, offset: number }|null}
   */
  function vindSlash(range) {
    var container = range.startContainer;

    if (container.nodeType === 3) {
      var offset = Math.max(0, range.startOffset - 1);
      return container.nodeValue.charAt(offset) === '/' ? { node: container, offset: offset } : null;
    }

    // Element: het knooppunt net vóór de cursor pakken.
    var kind = container.childNodes[Math.max(0, range.startOffset - 1)];
    if (kind && kind.nodeType === 3) {
      var laatste = kind.nodeValue.length - 1;
      if (kind.nodeValue.charAt(laatste) === '/') return { node: kind, offset: laatste };
    }
    return null;
  }

  function openTokenMenu(doc, field) {
    var selection = doc.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    var plek = vindSlash(selection.getRangeAt(0));
    if (!plek) return;

    // De cursor achter de "/" zetten: bij het element-geval stond hij in het
    // element, en tokenQuery() vergelijkt straks met dit tekstknooppunt.
    var na = doc.createRange();
    na.setStart(plek.node, plek.offset + 1);
    na.collapse(true);
    selection.removeAllRanges();
    selection.addRange(na);

    menuState = {
      doc: doc,
      field: field,
      node: plek.node,
      offset: plek.offset,
      index: 0,
      query: ''
    };
    renderTokenMenu();
  }

  function tokenQuery() {
    if (!menuState) return null;
    var selection = menuState.doc.getSelection();
    if (!selection || selection.rangeCount === 0) return null;
    var range = selection.getRangeAt(0);
    // Cursor uit het tekstknooppunt of vóór de "/" gelopen: menu sluiten.
    if (range.startContainer !== menuState.node || range.startOffset <= menuState.offset) return null;
    var text = menuState.node.nodeValue.slice(menuState.offset + 1, range.startOffset);
    if (/\s/.test(text)) return null;
    return text;
  }

  function matchingTokens() {
    var query = String(menuState.query || '').toLowerCase();
    return allTokens().filter(function (token) {
      if (query === '') return true;
      return token.label.toLowerCase().indexOf(query) !== -1 ||
        token.path.toLowerCase().indexOf(query) !== -1;
    });
  }

  function renderTokenMenu() {
    if (!menuState) return;
    var node = menuNodeFor(menuState.doc);
    var items = matchingTokens();

    if (items.length === 0) {
      node.innerHTML = '<div style="padding:10px 12px;font-size:13px;color:#6b7280;">Niets gevonden</div>';
    } else {
      if (menuState.index >= items.length) menuState.index = items.length - 1;
      var lastGroup = null;
      node.innerHTML = items.map(function (token, index) {
        var kop = token.group !== lastGroup
          ? '<div style="padding:6px 10px 2px;font-size:11px;font-weight:600;color:#9ca3af;text-transform:uppercase;">' +
            esc(token.group) + '</div>'
          : '';
        lastGroup = token.group;
        var actief = index === menuState.index;
        return kop +
          '<button type="button" data-om-token-pick="' + esc(token.path) + '" ' +
          'style="display:block;width:100%;text-align:left;border:0;cursor:pointer;border-radius:6px;' +
          'padding:6px 10px;font-size:13px;color:#111827;background:' + (actief ? '#e0e7ff' : 'transparent') + ';">' +
          esc(token.label) + '</button>';
      }).join('');
    }

    // Positie: net onder de cursor.
    var selection = menuState.doc.getSelection();
    var rect = selection && selection.rangeCount > 0
      ? selection.getRangeAt(0).getBoundingClientRect()
      : { left: 20, bottom: 40 };

    if (menuState.doc === document) {
      node.classList.remove('hidden');
      node.style.left = Math.min(rect.left, window.innerWidth - 300) + 'px';
      node.style.top = (rect.bottom + 6) + 'px';
    } else {
      node.style.display = 'block';
      var scrollTop = menuState.doc.documentElement.scrollTop || 0;
      var scrollLeft = menuState.doc.documentElement.scrollLeft || 0;
      node.style.left = Math.max(8, rect.left + scrollLeft) + 'px';
      node.style.top = (rect.bottom + scrollTop + 6) + 'px';
    }
  }

  /** De getypte "/zoekterm" vervangen door een chip. */
  function insertToken(path) {
    if (!menuState) return;
    var doc = menuState.doc;
    var selection = doc.getSelection();
    if (!selection || selection.rangeCount === 0) { closeTokenMenu(); return; }

    var caret = selection.getRangeAt(0);
    var range = doc.createRange();
    range.setStart(menuState.node, menuState.offset);
    range.setEnd(
      caret.startContainer === menuState.node ? menuState.node : menuState.node,
      caret.startContainer === menuState.node ? caret.startOffset : menuState.node.nodeValue.length
    );
    range.deleteContents();

    // LET OP: chipHtml() levert de chip mét een zero-width spatie ervoor en
    // erna (anders kan je de cursor er niet naast zetten). `firstChild` is
    // dus die spatie, niet de chip -- daarom het hele fragment invoegen.
    var wrapper = doc.createElement('span');
    wrapper.innerHTML = chipHtml(path);

    var fragment = doc.createDocumentFragment();
    while (wrapper.firstChild) fragment.appendChild(wrapper.firstChild);

    var laatste = fragment.lastChild;
    range.insertNode(fragment);

    // Cursor achter de chip zetten, zodat je gewoon verder kan typen.
    var na = doc.createRange();
    na.setStartAfter(laatste);
    na.collapse(true);
    selection.removeAllRanges();
    selection.addRange(na);

    var field = menuState.field;
    closeTokenMenu();
    if (field && field.onChange) field.onChange();
  }

  /**
   * De "/"-kiezer aan een bewerkbaar veld hangen.
   *
   * @param {Document} doc
   * @param {HTMLElement} node - het contenteditable element
   * @param {Function} onChange - wordt aangeroepen na elke wijziging
   */
  function bindTokenInput(doc, node, onChange) {
    var field = { node: node, onChange: onChange };

    node.addEventListener('keydown', function (event) {
      if (menuState && menuState.field === field) {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          menuState.index += 1;
          renderTokenMenu();
          return;
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault();
          menuState.index = Math.max(0, menuState.index - 1);
          renderTokenMenu();
          return;
        }
        if (event.key === 'Enter' || event.key === 'Tab') {
          var items = matchingTokens();
          if (items.length > 0) {
            event.preventDefault();
            insertToken(items[menuState.index].path);
            return;
          }
        }
        if (event.key === 'Escape') { event.preventDefault(); closeTokenMenu(); return; }
      }

      if (event.key === '/') {
        // Na de "/" zelf openen, zodat de positie van het teken bekend is.
        setTimeout(function () { openTokenMenu(doc, field); }, 0);
      }
    });

    node.addEventListener('input', function () {
      // De placeholdertekst hangt aan data-empty; blijft die staan, dan zie
      // je hem door je eigen tekst heen.
      if (node.hasAttribute('data-empty') && node.textContent !== '') node.removeAttribute('data-empty');
      if (node.textContent === '' && node.hasAttribute('data-placeholder')) node.setAttribute('data-empty', '1');

      if (menuState && menuState.field === field) {
        var query = tokenQuery();
        if (query === null) closeTokenMenu();
        else { menuState.query = query; menuState.index = 0; renderTokenMenu(); }
      }
      if (onChange) onChange();
    });

    node.addEventListener('blur', function () {
      // Even wachten: een klik in het menu is ook een blur.
      setTimeout(function () {
        if (menuState && menuState.field === field) closeTokenMenu();
      }, 150);
    });

    return field;
  }

  // ─── Documentmodel ─────────────────────────────────────────────────────────

  function activeDoc() { return state.scopeEvent ? state.eventDoc : state.typeDoc; }

  /** De hele sectie van deze mailsoort: header + inhoud (+ eventuele varianten). */
  function section() {
    var doc = activeDoc();
    if (!doc[state.kind]) {
      doc[state.kind] = { header: {}, subject: '', preheader: '', blocks: [], variants: null, catchAll: 'openvme' };
    }
    if (!doc[state.kind].header) doc[state.kind].header = {};
    if (!Array.isArray(doc[state.kind].blocks)) doc[state.kind].blocks = [];
    return doc[state.kind];
  }

  /**
   * De inhoud die je op dit moment bewerkt.
   *
   * Zolang de mail niet gesplitst is, is dat de sectie zelf: één versie voor
   * iedereen. Is hij wél gesplitst, dan is het de variant van het bedrijf dat
   * je bovenaan gekozen hebt.
   */
  function content() {
    var sec = section();
    if (!sec.variants) return sec;
    var key = state.viewSite || sec.catchAll;
    if (!sec.variants[key]) key = sec.catchAll;
    if (!sec.variants[key]) sec.variants[key] = { subject: '', preheader: '', blocks: [] };
    if (!Array.isArray(sec.variants[key].blocks)) sec.variants[key].blocks = [];
    return sec.variants[key];
  }

  function blockById(id) {
    return content().blocks.filter(function (b) { return b.id === id; })[0] || null;
  }

  function indexOfBlock(id) {
    var blocks = content().blocks;
    for (var i = 0; i < blocks.length; i += 1) if (blocks[i].id === id) return i;
    return -1;
  }

  /**
   * @param {boolean} [herteken] - true bij een STRUCTURELE wijziging (blok
   *   erbij, weg, verplaatst, instelling gewijzigd). Bij gewoon typen NIET:
   *   het voorbeeld is de editor, en dat opnieuw opbouwen tijdens het typen
   *   gooit de cursor weg, sluit de "/"-kiezer en laat het scherm flikkeren.
   *   De tekst staat al op het scherm -- je typt hem daar zelf in.
   */
  function markDirty(herteken) {
    state.dirty = true;
    el('mailStudioDirty').textContent = 'Niet bewaard';
    if (herteken !== false) schedulePreview();
  }

  // ─── Openen ────────────────────────────────────────────────────────────────

  async function open(eventId) {
    state.eventId = Number(eventId);
    state.dirty = false;
    state.kind = 'confirmation';
    state.viewSite = 'openvme';
    state.selectedId = null;
    state.scopeEvent = false;
    state.proofPeople = null;

    el('mailStudioDialog').showModal();
    el('mailStudioDirty').textContent = '';

    try {
      if (!state.schema) state.schema = await api('/mail/schema');

      var data = await api('/events/' + state.eventId + '/mail-blocks');
      state.eventTypeId = data.event_type.id;
      state.eventTypeName = data.event_type.name || '(geen type)';
      state.typeDoc = data.type_doc;
      state.eventDoc = data.event_doc;

      renderStatus(data);
      renderPicker();
      render();
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  function renderStatus(data) {
    if (data && typeof data.owned_by_om === 'boolean') state.ownedByOm = data.owned_by_om;
    var owned = state.ownedByOm;

    // De gevaarlijke combinatie: de OM heeft deze mails overgenomen, maar er
    // staat niets klaar. Dan krijgt niemand iets, en de oude automation is
    // (na de cutover) ook weg. Dat hoort niet als een geruststellend groen
    // badge in beeld te staan.
    var leeg = state.typeDoc && content().blocks.length === 0;
    var waarschuwing = owned && leeg && state.kind !== 'recap'
      ? '<span class="badge badge-error badge-sm gap-1">Er staat niets klaar</span>' +
        '<span class="opacity-70">Zolang deze mail leeg is, krijgen inschrijvers niets.</span>'
      : '';

    el('mailStudioStatus').innerHTML =
      (waarschuwing ||
        ((owned
          ? '<span class="badge badge-success badge-sm">Deze mails worden vanuit de OM verstuurd</span>'
          : '<span class="badge badge-warning badge-sm">Nog niet actief</span>') +
        '<span class="opacity-70">' +
        esc(owned
          ? 'Bevestiging en reminder vertrekken automatisch bij het inschrijven.'
          : 'Je kan de opmaak nu al klaarzetten; er wordt nog niets vanuit de OM verstuurd.') +
        '</span>')) +
      // De keuze tussen "standaard voor het type" en "alleen dit event" staat
      // bewust HIER en niet als grote schakelaar bovenaan: het is een
      // uitzondering, geen dagelijkse handeling.
      '<button class="link link-hover ml-auto" data-action="mail-scope-toggle">' +
      (state.scopeEvent
        ? 'Je bewerkt nu alleen dit event — terug naar de standaard'
        : 'Alleen voor dit event laten afwijken') +
      '</button>';
  }

  function renderPicker() {
    el('mailBlockPickerGrid').innerHTML = Object.keys(BLOCK_META).map(function (type) {
      var meta = BLOCK_META[type];
      return '<button class="btn btn-outline h-auto py-3 flex-col gap-1 items-start text-left normal-case" ' +
        'data-action="mail-add-pick" data-mail-add-type="' + esc(type) + '">' +
        '<span class="flex items-center gap-2 font-medium">' +
          '<i data-lucide="' + esc(meta.icon) + '" class="w-4 h-4"></i>' + esc(meta.label) + '</span>' +
        '<span class="text-xs opacity-60 font-normal">' + esc(meta.hint) + '</span></button>';
    }).join('');
  }

  function render() {
    el('mailStudioKindTabs').querySelectorAll('[data-mail-kind]').forEach(function (tab) {
      tab.classList.toggle('tab-active', tab.getAttribute('data-mail-kind') === state.kind);
    });
    el('mailSiteSwitch').querySelectorAll('[data-mail-view]').forEach(function (btn) {
      btn.classList.toggle('btn-active', btn.getAttribute('data-mail-view') === state.viewSite);
    });

    renderStatus();

    el('mailStudioSubtitle').textContent = state.scopeEvent
      ? 'Alleen voor dit ene event'
      : 'Geldt voor elk event van het type ' + state.eventTypeName;

    var huidig = content();
    // De velden alleen opnieuw vullen als de gebruiker er niet in staat te
    // typen -- anders springt de cursor bij elke toetsaanslag naar het begin.
    ['subject', 'preheader'].forEach(function (naam) {
      var veld = el('mailStudioDialog').querySelector('[data-mail-field="' + naam + '"]');
      if (!veld || veld === document.activeElement) return;
      var waarde = huidig[naam] || '';
      veld.innerHTML = waarde === '' ? '' : toChips(waarde, true);
      if (waarde === '') veld.setAttribute('data-empty', '1');
      else veld.removeAttribute('data-empty');
      if (!veld.hasAttribute('data-om-bound')) {
        veld.setAttribute('data-om-bound', '1');
        bindTokenInput(document, veld, function () {
          content()[naam] = fromChips(veld, false);
          markDirty(false);
        });
      }
    });

    renderHeaderSlots();
    renderVariantBar();

    // De knop is een INHAALACTIE, geen "nu versturen". Bevestiging en
    // reminder vertrekken vanzelf bij het inschrijven; dit is er voor de
    // recap, en om iemand die er doorheen geglipt is alsnog te bedienen.
    el('mailSendLabel').textContent = state.kind === 'recap'
      ? 'Recap klaarzetten'
      : 'Alsnog klaarzetten';
    el('mailSendBtn').title = state.kind === 'recap'
      ? 'Zet de recapmail klaar voor iedereen die hem nog niet gehad heeft.'
      : 'Alleen nodig als iemand deze mail nog niet gekregen heeft — normaal gaat hij automatisch bij het inschrijven.';
    schedulePreview();
    icons();
  }

  var SLOT_LABEL = { openvme: 'OpenVME', syndicoach: 'Syndicoach', fallback: 'Overige' };

  /**
   * De header per bedrijf. Drie vaste vakjes, altijd zichtbaar: dit is het
   * enige onderdeel dat per definitie verschilt, en meestal het enige.
   */
  function renderHeaderSlots() {
    var header = section().header || {};

    el('mailHeaderSlots').innerHTML = ['openvme', 'syndicoach', 'fallback'].map(function (slot) {
      var value = header[slot];
      var beeld = value && value.src
        ? '<img src="' + esc(value.src) + '" alt="" class="w-full aspect-[3/1] object-cover rounded border border-base-300">'
        : '<div class="w-full aspect-[3/1] rounded border border-dashed border-base-300 flex items-center justify-center">' +
          '<span class="text-xs opacity-50">geen afbeelding</span></div>';

      return '<button class="text-left group" data-action="mail-header-open" data-mail-slot="' + slot + '">' +
        beeld +
        '<div class="flex items-center gap-1 mt-1">' +
          '<span class="text-xs font-medium">' + esc(SLOT_LABEL[slot]) + '</span>' +
          (slot === 'fallback' ? '<span class="text-xs opacity-50">— wie via een andere weg inschreef</span>' : '') +
        '</div></button>';
    }).join('');
  }

  /**
   * Eén inhoud voor iedereen, of gesplitst per bedrijf.
   *
   * Splitsen is bewust een expliciete stap met één knop: standaard schrijf je
   * één mail, en pas wie er echt van moet afwijken krijgt twee versies om bij
   * te houden.
   */
  function renderVariantBar() {
    var sec = section();
    var bar = el('mailVariantBar');

    if (!sec.variants) {
      bar.innerHTML =
        '<span class="badge badge-ghost badge-sm">Eén inhoud voor iedereen</span>' +
        '<button class="link link-hover text-xs ml-auto" data-action="mail-split">' +
          'Aparte inhoud per bedrijf</button>';
      return;
    }

    var actief = sec.variants[state.viewSite] ? state.viewSite : sec.catchAll;
    bar.innerHTML =
      '<span class="text-xs opacity-60">Je bewerkt:</span>' +
      ['openvme', 'syndicoach'].map(function (site) {
        return '<button class="btn btn-xs ' + (actief === site ? 'btn-primary' : 'btn-ghost') + '" ' +
          'data-action="mail-site" data-mail-view="' + site + '">' + esc(SLOT_LABEL[site]) + '</button>';
      }).join('') +
      '<label class="text-xs flex items-center gap-1 ml-2">' +
        '<input type="checkbox" class="checkbox checkbox-xs" data-mail-catchall ' +
          (sec.catchAll === actief ? 'checked' : '') + '>' +
        'Dit is de standaard' +
      '</label>' +
      '<button class="link link-hover text-xs ml-auto" data-action="mail-merge">Terug naar één inhoud</button>';
  }

  // ─── Voorbeeld + bewerken ──────────────────────────────────────────────────

  function schedulePreview() {
    clearTimeout(state.previewTimer);
    state.previewTimer = setTimeout(refreshPreview, 300);
  }

  async function refreshPreview() {
    if (!state.eventId) return;
    try {
      var data = await api('/events/' + state.eventId + '/mail-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: state.kind,
          site: state.viewSite || null,
          draft: activeDoc(),
          scope: state.scopeEvent ? 'event' : 'event_type',
          editable: true
        })
      });
      if (!data) return;

      if (data.event) state.event = data.event;

      // De mail ALTIJD tonen als er blokken zijn. Een eerdere versie had hier
      // een controle die op `<t` testte -- en de gerenderde mail begint met
      // `<table`, dus die sloeg altijd toe en je zag nooit iets anders dan de
      // "leeg"-tekst. Vandaar: de blokkenlijst bepaalt of hij leeg is, niet
      // de HTML.
      var leeg = content().blocks.length === 0;
      var frame = el('mailPreviewFrame');
      frame.onload = function () { enhance(frame); };
      frame.srcdoc = leeg
        ? '<p style="font-family:system-ui,sans-serif;padding:56px;text-align:center;color:#9ca3af;">' +
          'Deze mail heeft nog geen inhoud.</p>'
        : (data.html || '');

      renderEmptyState(leeg);
      renderVideoBar();
      renderTimingBar();

      var hint = el('mailEditHint');
      if (leeg) {
        hint.textContent = '';
      } else if (!data.subject) {
        hint.textContent = 'Vul hierboven een onderwerp in — zonder onderwerp wordt de mail niet verstuurd.';
      } else {
        hint.textContent = 'Klik in de mail om tekst aan te passen. Selecteer een onderdeel voor meer opties.';
      }
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  /**
   * Wat je ziet als deze mail nog geen inhoud heeft. Niemand hoort met een
   * leeg scherm te beginnen: de standaardopzet is de bestaande mail uit Odoo,
   * omgezet in blokken.
   */
  function renderEmptyState(leeg) {
    var box = el('mailEmptyState');
    if (!leeg) { box.classList.add('hidden'); box.innerHTML = ''; return; }

    box.classList.remove('hidden');
    box.innerHTML =
      '<div class="text-center py-8 px-6">' +
        '<i data-lucide="mail-plus" class="w-8 h-8 mx-auto opacity-40 mb-3"></i>' +
        '<p class="font-medium mb-1">Deze mail is nog leeg</p>' +
        '<p class="text-sm opacity-60 mb-4">Begin met de opzet die we vandaag al gebruiken, en pas ' +
          'daarna de teksten aan. Je kan altijd onderdelen toevoegen of weghalen.</p>' +
        '<div class="flex items-center justify-center gap-2 flex-wrap">' +
          '<button class="btn btn-sm btn-primary gap-2" data-action="mail-use-starter">' +
            '<i data-lucide="wand-sparkles" class="w-4 h-4"></i> Gebruik de standaardopzet</button>' +
          '<button class="btn btn-sm btn-ghost" data-action="mail-add-open">Leeg beginnen</button>' +
        '</div>' +
      '</div>';
  }

  /**
   * De opname van dit event, altijd zichtbaar op het recap-tabblad.
   *
   * Ze zat eerst alleen verstopt achter de instellingen van een videoblok --
   * en juist als er nog géén videoblok is, is dat de plek waar je hem niet
   * gaat zoeken.
   */
  function renderVideoBar() {
    var bar = el('mailVideoBar');

    // Op het recap-tabblad altijd, en verder zodra er ergens een opnameblok
    // in deze mail staat -- anders zie je een blok dat om een opname vraagt
    // zonder dat er een knop in de buurt is om er een te kiezen.
    var heeftBlok = content().blocks.some(function (b) { return b.type === 'video'; });
    if (state.kind !== 'recap' && !heeftBlok) { bar.classList.add('hidden'); return; }

    bar.classList.remove('hidden');
    var video = state.event && state.event.recap ? state.event.recap : {};
    var heeft = Boolean(video.video_url);

    bar.innerHTML =
      '<div class="flex items-center gap-3">' +
        (heeft && video.thumbnail_url
          ? '<img src="' + esc(video.thumbnail_url) + '" alt="" class="w-20 aspect-video object-cover rounded">'
          : '<div class="w-20 aspect-video rounded bg-base-300 flex items-center justify-center">' +
            '<i data-lucide="clapperboard" class="w-5 h-5 opacity-40"></i></div>') +
        '<div class="min-w-0 flex-1">' +
          '<p class="text-sm font-medium">' + (heeft ? 'Opname gekoppeld' : 'Nog geen opname') + '</p>' +
          '<p class="text-xs opacity-60 truncate">' +
            (heeft ? esc(video.video_url) : 'De recapmail toont de opname pas zodra die hier gekozen is.') +
          '</p>' +
        '</div>' +
        '<button class="btn btn-sm ' + (heeft ? 'btn-ghost' : 'btn-primary') + ' gap-2" data-action="mail-video-open">' +
          '<i data-lucide="clapperboard" class="w-4 h-4"></i>' + (heeft ? 'Wijzigen' : 'Opname kiezen') + '</button>' +
      '</div>';
    icons();
  }

  /**
   * Wanneer de reminder vertrekt.
   *
   * Staat op de sectie (niet op een blok): het is een eigenschap van DE MAIL,
   * en hij verhuist dus mee met de override per event.
   */
  function renderTimingBar() {
    var bar = el('mailTimingBar');
    if (state.kind !== 'reminder') { bar.classList.add('hidden'); return; }

    var sec = section();
    if (!sec.timing) sec.timing = { enabled: true, leadHours: 24, minLeadHours: 0 };
    var t = sec.timing;

    bar.classList.remove('hidden');
    bar.innerHTML =
      '<div class="flex items-center gap-3 flex-wrap">' +
        '<label class="flex items-center gap-2 text-sm">' +
          '<input type="checkbox" class="toggle toggle-sm" data-mail-timing="enabled"' +
            (t.enabled === false ? '' : ' checked') + '>' +
          '<span>Reminder versturen</span>' +
        '</label>' +

        '<div class="flex items-center gap-2 text-sm ' + (t.enabled === false ? 'opacity-40' : '') + '">' +
          '<span class="opacity-70">Vertrekt</span>' +
          '<input type="number" min="0" max="720" class="input input-bordered input-xs w-16 text-right" ' +
            'data-mail-timing="leadHours" value="' + Number(t.leadHours) + '"' +
            (t.enabled === false ? ' disabled' : '') + '>' +
          '<span class="opacity-70">uur voor de start</span>' +
        '</div>' +

        '<div class="flex items-center gap-2 text-sm ml-auto ' + (t.enabled === false ? 'opacity-40' : '') + '">' +
          '<span class="opacity-70">Niet meer bij inschrijven binnen</span>' +
          '<input type="number" min="0" max="720" class="input input-bordered input-xs w-16 text-right" ' +
            'data-mail-timing="minLeadHours" value="' + Number(t.minLeadHours) + '"' +
            (t.enabled === false ? ' disabled' : '') + '>' +
          '<span class="opacity-70">uur</span>' +
        '</div>' +
      '</div>' +
      '<p class="text-xs opacity-60 mt-2">' +
        (t.enabled === false
          ? 'Er vertrekt geen reminder voor ' + (state.scopeEvent ? 'dit event' : 'events van dit type') + '.'
          : uitlegTiming(t)) +
      '</p>';
  }

  function uitlegTiming(t) {
    var basis = 'Wie inschrijft krijgt zijn reminder ' + Number(t.leadHours) + ' uur voor de start. ' +
      'Schrijft iemand later in dan dat, dan vertrekt hij meteen';
    return Number(t.minLeadHours) > 0
      ? basis + ' — tenzij er nog minder dan ' + Number(t.minLeadHours) + ' uur te gaan is, dan krijgt hij er geen.'
      : basis + '. Zet de tweede waarde hoger dan 0 als een reminder vlak voor de start geen zin meer heeft.';
  }

  /**
   * De editor-laag in het iframe zetten: omlijning bij hover, selectie,
   * inline bewerken en een werkbalk boven het geselecteerde onderdeel.
   */
  function enhance(frame) {
    var doc = frame.contentDocument;
    if (!doc || !doc.body) return;

    // Het iframe scrollt niet zelf: het groeit mee met de mail en de
    // OUDERPAGINA scrollt. Zo blijft de werkbalk op de juiste plek staan en
    // is er maar één scrollbalk in beeld.
    frame.style.height = (Math.max(doc.body.scrollHeight, 400) + 48) + 'px';

    var style = doc.createElement('style');
    style.textContent =
      'body{margin:0;}' +
      '[data-om-block]{outline:2px solid transparent;outline-offset:2px;transition:outline-color .12s;cursor:pointer;}' +
      '[data-om-block]:hover{outline-color:#93c5fd;}' +
      '[data-om-block].om-selected{outline-color:#2563eb;}' +
      '[data-om-edit]{cursor:text;}' +
      // GEEN tweede kader rond het bewerkte stukje: het blok heeft er al
      // een, en twee geneste blauwe randen zien er kapot uit. Een zachte
      // achtergrond volstaat om te tonen waar je typt.
      '[data-om-edit]:focus{outline:none;background:#eff6ff;border-radius:3px;}' +
      '#om-bar{position:absolute;z-index:9999;display:flex;gap:2px;align-items:center;background:#111827;' +
        'border-radius:8px;padding:4px;box-shadow:0 6px 20px rgba(0,0,0,.25);' +
        "font-family:system-ui,-apple-system,'Segoe UI',sans-serif;white-space:nowrap;}" +
      '#om-bar button{border:0;background:transparent;color:#fff;font-size:12px;padding:5px 8px;' +
        'border-radius:5px;cursor:pointer;line-height:1;}' +
      '#om-bar button:hover{background:#374151;}' +
      '#om-bar .om-note{color:#9ca3af;font-size:11px;padding:0 6px;}';
    doc.head.appendChild(style);

    // Links in de mail niet volgen tijdens het bewerken -- anders navigeert
    // het iframe weg bij de eerste klik op een knop of een deelnamelink.
    doc.addEventListener('click', function (event) {
      var link = event.target.closest('a');
      if (link) event.preventDefault();
    }, true);

    doc.addEventListener('mousedown', function (event) {
      var pick = event.target.closest('[data-om-token-pick]');
      if (!pick) return;
      event.preventDefault();
      insertToken(pick.getAttribute('data-om-token-pick'));
    });

    doc.addEventListener('click', function (event) {
      if (event.target.closest('#om-token-menu')) return;
      if (event.target.closest('#om-bar')) return;

      // Klikken op de header opent meteen het juiste vakje -- dat is waar
      // iemand hem verwacht aan te passen.
      if (event.target.closest('[data-om-header]')) {
        deselect(doc);
        openHeader(state.viewSite || 'fallback');
        return;
      }

      var holder = event.target.closest('[data-om-block]');
      if (!holder) { deselect(doc); return; }

      select(doc, holder.getAttribute('data-om-block'));

      var editable = event.target.closest('[data-om-edit]');
      if (editable) startEditing(editable, holder.getAttribute('data-om-block'));
    });

    if (state.selectedId) select(doc, state.selectedId);
  }

  function startEditing(node, blockId) {
    if (node.getAttribute('contenteditable') === 'true') return;
    node.setAttribute('contenteditable', 'true');
    node.focus();

    var doc = node.ownerDocument;
    var prop = node.getAttribute('data-om-edit');

    ensureCaretSpace(node);

    var commit = function () {
      var block = blockById(blockId);
      if (!block) return;
      // Chips gaan terug naar `{{pad}}`. `html` bewaart opmaak (vet,
      // cursief); de rest wordt platte tekst, want een `<` in een knoplabel
      // of een titel hoort daar niet.
      var value = fromChips(node, prop === 'html');
      if (String(readPath(block, prop)) === String(value)) return;
      writePath(block, prop, value);
      // Niet hertekenen: je staat er zelf in te typen.
      markDirty(false);
    };

    if (!node.hasAttribute('data-om-bound')) {
      node.setAttribute('data-om-bound', '1');
      bindTokenInput(doc, node, commit);
    }

    node.addEventListener('blur', function () {
      closeTokenMenu();
      node.removeAttribute('contenteditable');
      commit();
    }, { once: true });

    node.addEventListener('keydown', function (event) {
      // Escape en Enter alleen afhandelen als de "/"-kiezer niet openstaat;
      // die gebruikt dezelfde toetsen (zie bindTokenInput).
      if (menuState) return;
      if (event.key === 'Escape') { node.blur(); return; }
      // Enter in een titel of een knoplabel maakt geen nieuwe regel.
      if (event.key === 'Enter' && prop !== 'html') { event.preventDefault(); node.blur(); }
    });
  }

  /**
   * `rows.0.value` → de waarde in block.rows[0].value.
   *
   * De regels van het praktisch kader zijn bewerkbaar, en die zitten een
   * niveau dieper dan een gewone blok-eigenschap.
   */
  function readPath(target, path) {
    var value = String(path).split('.').reduce(function (acc, key) {
      return acc === null || acc === undefined ? undefined : acc[key];
    }, target);
    return value === undefined || value === null ? '' : value;
  }

  function writePath(target, path, value) {
    var keys = String(path).split('.');
    var last = keys.pop();
    var host = keys.reduce(function (acc, key) {
      if (acc[key] === undefined || acc[key] === null) acc[key] = {};
      return acc[key];
    }, target);
    host[last] = value;
  }

  function deselect(doc) {
    state.selectedId = null;
    doc.querySelectorAll('.om-selected').forEach(function (n) { n.classList.remove('om-selected'); });
    var bar = doc.getElementById('om-bar');
    if (bar) bar.remove();
  }

  function select(doc, blockId) {
    state.selectedId = blockId;
    doc.querySelectorAll('.om-selected').forEach(function (n) { n.classList.remove('om-selected'); });

    var node = doc.querySelector('[data-om-block="' + String(blockId).replace(/["\\]/g, '\\$&') + '"]');
    if (!node) return;
    node.classList.add('om-selected');

    var old = doc.getElementById('om-bar');
    if (old) old.remove();

    var block = blockById(blockId);
    if (!block) return;

    // Gesplitst? Dan is het nuttig te zien welke versie je bewerkt.
    var sec = section();
    var note = sec.variants ? 'versie ' + (SLOT_LABEL[state.viewSite] || state.viewSite) : '';

    var bar = doc.createElement('div');
    bar.id = 'om-bar';
    bar.innerHTML =
      '<button data-om-cmd="up" title="Naar boven">&uarr;</button>' +
      '<button data-om-cmd="down" title="Naar onder">&darr;</button>' +
      '<button data-om-cmd="duplicate" title="Dupliceren">&#9096;</button>' +
      '<button data-om-cmd="settings">Instellingen</button>' +
      '<button data-om-cmd="add">+ hieronder</button>' +
      '<button data-om-cmd="remove" title="Verwijderen">&#128465;</button>' +
      (note ? '<span class="om-note">' + esc(note) + '</span>' : '');

    bar.addEventListener('click', function (event) {
      var button = event.target.closest('[data-om-cmd]');
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      handleCommand(button.getAttribute('data-om-cmd'), blockId);
    });

    doc.body.appendChild(bar);

    // offsetTop t.o.v. het document: het iframe scrollt niet zelf (zie
    // enhance), dus dit is meteen de juiste absolute positie.
    var top = node.getBoundingClientRect().top + doc.documentElement.scrollTop - bar.offsetHeight - 6;
    var left = node.getBoundingClientRect().left + doc.documentElement.scrollLeft;
    bar.style.top = Math.max(4, top) + 'px';
    bar.style.left = Math.max(8, left) + 'px';
  }

  function handleCommand(command, blockId) {
    var blocks = content().blocks;
    var index = indexOfBlock(blockId);
    if (index === -1) return;

    if (command === 'up' || command === 'down') {
      var target = index + (command === 'up' ? -1 : 1);
      if (target < 0 || target >= blocks.length) return;
      blocks.splice(target, 0, blocks.splice(index, 1)[0]);
      markDirty();
      return;
    }
    if (command === 'duplicate') {
      var copy = JSON.parse(JSON.stringify(blocks[index]));
      copy.id = copy.type + '-' + Date.now();
      blocks.splice(index + 1, 0, copy);
      state.selectedId = copy.id;
      markDirty();
      return;
    }
    if (command === 'remove') {
      blocks.splice(index, 1);
      state.selectedId = null;
      markDirty();
      return;
    }
    if (command === 'add') {
      state.addAt = index + 1;
      el('mailBlockPicker').showModal();
      icons();
      return;
    }
    if (command === 'settings') openSettings(blockId);
  }

  // ─── Instellingen van één onderdeel ────────────────────────────────────────

  function openSettings(blockId) {
    var block = blockById(blockId);
    if (!block) return;
    var meta = BLOCK_META[block.type] || { label: block.type, hint: '' };

    el('mailSettingsTitle').textContent = meta.label;
    el('mailSettingsHint').textContent = meta.hint;

    var fields = (BLOCK_SETTINGS[block.type] || []).map(function (field) {
      var value = block[field.key] === undefined || block[field.key] === null ? '' : block[field.key];
      if (field.type === 'select') {
        return '<label class="form-control"><span class="label-text text-xs opacity-70 mb-1">' + esc(field.label) + '</span>' +
          '<select class="select select-bordered select-sm" data-mail-setting="' + esc(field.key) + '">' +
          field.options.map(function (opt) {
            return '<option value="' + esc(opt[0]) + '"' + (String(value) === opt[0] ? ' selected' : '') + '>' + esc(opt[1]) + '</option>';
          }).join('') + '</select></label>';
      }
      return '<label class="form-control"><span class="label-text text-xs opacity-70 mb-1">' + esc(field.label) + '</span>' +
        '<input type="' + esc(field.type) + '" class="input input-bordered input-sm" data-mail-setting="' + esc(field.key) + '" ' +
        'placeholder="' + esc(field.placeholder || '') + '" value="' + esc(value) + '"></label>';
    }).join('');

    // Zichtbaarheid per blok BESTAAT NIET MEER. De inhoud is één versie voor
    // iedereen; wie echt wil afwijken splitst de hele mail (zie
    // renderVariantBar). Dat scheelt de gebruiker een beslissing per alinea.

    // Het praktisch kader: regels erbij, weg, of van volgorde wisselen. De
    // TEKST van een regel typ je gewoon in de mail zelf -- ook hier hoort
    // niet twee keer hetzelfde te staan.
    var detailRows = '';
    if (block.type === 'event_details') {
      var rijen = Array.isArray(block.rows) ? block.rows : [];
      detailRows =
        '<div class="space-y-1">' +
          '<span class="label-text text-xs opacity-70">Regels in dit kader</span>' +
          (rijen.length === 0
            ? '<p class="text-xs opacity-60">Nog geen regels.</p>'
            : rijen.map(function (rij, index) {
                return '<div class="flex items-center gap-2 bg-base-200/40 rounded px-2 py-1">' +
                  '<span>' + esc(rij.icon || '•') + '</span>' +
                  '<span class="text-sm flex-1 truncate">' + esc(rij.label || '(geen label)') + '</span>' +
                  '<button class="btn btn-xs btn-ghost btn-square" data-action="detail-row-move" ' +
                    'data-row-index="' + index + '" data-row-dir="-1" title="Omhoog">↑</button>' +
                  '<button class="btn btn-xs btn-ghost btn-square" data-action="detail-row-move" ' +
                    'data-row-index="' + index + '" data-row-dir="1" title="Omlaag">↓</button>' +
                  '<button class="btn btn-xs btn-ghost btn-square text-error" data-action="detail-row-remove" ' +
                    'data-row-index="' + index + '" title="Weghalen">✕</button>' +
                '</div>';
              }).join('')) +
          '<div class="flex items-center gap-2 pt-1">' +
            '<select class="select select-bordered select-xs flex-1" id="mailDetailPreset">' +
              Object.keys(DETAIL_PRESETS).map(function (key) {
                return '<option value="' + key + '">' + esc(DETAIL_PRESETS[key].label) + '</option>';
              }).join('') +
            '</select>' +
            '<button class="btn btn-xs btn-outline" data-action="detail-row-add">Regel toevoegen</button>' +
          '</div>' +
          '<p class="text-xs opacity-60">De tekst van een regel pas je aan in de mail zelf. ' +
            'Typ daar <kbd class="kbd kbd-xs">/</kbd> voor een gegeven van het event.</p>' +
        '</div>';
    }

    var video = block.type === 'video'
      ? '<button class="btn btn-sm btn-outline w-full gap-2" data-action="mail-video-open">' +
        '<i data-lucide="clapperboard" class="w-4 h-4"></i> Opname van dit event kiezen</button>' +
        '<p class="text-xs opacity-60">De opname hoort bij het event, niet bij deze mail — zo staat de link op één plek ' +
        'en klopt hij ook in een reminder of op de website.</p>'
      : '';

    el('mailSettingsBody').innerHTML =
      (fields || (detailRows ? '' : '<p class="text-sm opacity-60">Dit onderdeel heeft geen extra instellingen.</p>')) +
      detailRows + video;

    el('mailBlockSettings').showModal();
    icons();
  }

  // ─── Voorbeeld zoals verstuurd ─────────────────────────────────────────────
  //
  // De editor toont chips en lege blokken; dit toont de mail zoals hij bij de
  // ontvanger aankomt: placeholders ingevuld, knoppen in hun echte stijl, de
  // opname erin, en lege blokken weggevallen. Dat is het enige scherm waarop
  // je kan controleren of alles klopt vóór je verstuurt.
  //
  // Je kiest voor WIE: een echte inschrijving van dit event (dan zie je zijn
  // naam en adres) of een voorbeelddeelnemer als er nog niemand is.

  async function openProof() {
    el('mailProofDialog').showModal();
    el('mailProofSub').textContent =
      (KIND_LABEL[state.kind] || state.kind) + ' — ' + state.eventTypeName;

    // Inschrijvingen ophalen zodat je een echte ontvanger kan kiezen.
    if (!state.proofPeople) {
      state.proofPeople = [];
      try {
        var lijst = await api('/events/' + state.eventId + '/registrations?page=1&per_page=50');
        state.proofPeople = lijst || [];
      } catch (error) {
        // Zonder lijst blijft de voorbeelddeelnemer over -- geen blokkade.
        console.warn('[mail-studio] inschrijvingen niet geladen:', error.message);
      }
    }

    var opties = '<option value="">Voorbeelddeelnemer (Jan Voorbeeld)</option>' +
      state.proofPeople.map(function (r) {
        return '<option value="' + r.id + '">' +
          esc((r.partner && r.partner.name) || r.name || 'onbekend') +
          (r.submitted_email ? ' — ' + esc(r.submitted_email) : '') + '</option>';
      }).join('');
    el('mailProofWho').innerHTML = opties;
    if (state.viewSite) el('mailProofSite').value = state.viewSite;

    await refreshProof();
  }

  async function refreshProof() {
    var wie = el('mailProofWho').value;
    var site = el('mailProofSite').value;

    try {
      var data = await api('/events/' + state.eventId + '/mail-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: state.kind,
          site: site || null,
          draft: activeDoc(),
          scope: state.scopeEvent ? 'event' : 'event_type',
          // GEEN editable: dit is precies wat er verstuurd wordt.
          registration_id: wie ? Number(wie) : null
        })
      });
      if (!data) return;

      el('mailProofSubject').textContent = data.subject || '(geen onderwerp — de mail wordt dan niet verstuurd)';
      el('mailProofFrom').textContent = data.email_from || (data.sender_error || '—');
      el('mailProofTo').textContent = data.email_to || '—';
      el('mailProofFrame').srcdoc = data.html || '<p style="font-family:sans-serif;padding:40px;color:#9ca3af">Deze mail is leeg.</p>';

      var waarschuwingen = [];
      if (!data.subject) waarschuwingen.push('Er staat geen onderwerp ingesteld.');
      if (data.sender_error) waarschuwingen.push('Afzender: ' + data.sender_error);
      if (state.kind === 'recap' && data.video_missing) {
        waarschuwingen.push('Er hangt geen opname aan dit event — de recapmail kan zo niet verstuurd worden.');
      }

      var balk = el('mailProofWarning');
      if (waarschuwingen.length === 0) {
        balk.classList.add('hidden');
        balk.innerHTML = '';
      } else {
        balk.classList.remove('hidden');
        balk.className = 'px-4 py-2 text-xs shrink-0 bg-warning/20';
        balk.innerHTML = waarschuwingen.map(function (w) { return '<div>' + esc(w) + '</div>'; }).join('');
      }
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  // ─── Header per bedrijf ────────────────────────────────────────────────────

  function openHeader(slot) {
    state.headerSlot = slot;
    var value = (section().header || {})[slot] || {};
    el('mailHeaderTitle').textContent = 'Header — ' + (SLOT_LABEL[slot] || slot);
    el('mailHeaderSrc').value = value.src || '';
    el('mailHeaderAlt').value = value.alt || '';
    el('mailHeaderHref').value = value.href || '';
    el('mailHeaderDialog').showModal();
  }

  function saveHeader() {
    var src = el('mailHeaderSrc').value.trim();
    var sec = section();
    if (!sec.header) sec.header = {};
    sec.header[state.headerSlot] = src === ''
      ? null
      : { src: src, alt: el('mailHeaderAlt').value.trim(), href: el('mailHeaderHref').value.trim() };
    el('mailHeaderDialog').close();
    markDirty();
    render();
  }

  // ─── Videokiezer ───────────────────────────────────────────────────────────

  /**
   * @param {number} [eventId] - nodig wanneer de kiezer BUITEN de studio
   *   geopend wordt (vanuit het eventpaneel). De opname hoort bij het event,
   *   dus die knop hoort ook daar te staan en niet alleen in de mailstudio.
   * @param {Function} [onDone] - na het instellen, om het paneel te verversen
   */
  async function openVideoPicker(eventId, onDone) {
    if (eventId) state.eventId = Number(eventId);
    state.onVideoDone = typeof onDone === 'function' ? onDone : null;

    el('mailVideoPicker').showModal();
    el('mailVideoUrl').value = (state.event && state.event.recap && state.event.recap.video_url) || '';
    await loadVideos('');
  }

  async function loadVideos(query) {
    var box = el('mailVideoResults');
    box.innerHTML = '<p class="text-sm opacity-60 col-span-full">Laden…</p>';
    try {
      var data = await api('/vimeo/videos?q=' + encodeURIComponent(query || ''));
      if (!data) return;

      // De reden tonen, niet alleen "staat uit": een geweigerd token vraagt
      // iets heel anders dan een ontbrekend token.
      if (data.status === 'no_token' || !data.configured) {
        box.innerHTML = '<div class="col-span-full alert alert-info text-sm block">' +
          '<p class="font-medium mb-1">De Vimeo-lijst staat uit</p>' +
          '<p>De Worker vindt geen <code>VIMEO_ACCESS_TOKEN</code>. Een beheerder zet die zo:</p>' +
          '<pre class="bg-base-300 rounded p-2 my-2 text-xs overflow-x-auto">npx wrangler secret put VIMEO_ACCESS_TOKEN</pre>' +
          '<p class="text-xs opacity-80">Let op: in <code>.dev.vars</code> zetten werkt alleen lokaal, en in ' +
          '<code>wrangler.jsonc</code> hoort hij niet thuis. Controleer met ' +
          '<code>npx wrangler secret list</code> of de naam er exact zo tussen staat.</p>' +
          '<p class="text-xs opacity-80 mt-1">Ondertussen werkt een link plakken gewoon.</p>' +
          '</div>';
        return;
      }
      if (data.status === 'unauthorized') {
        box.innerHTML = '<div class="col-span-full alert alert-warning text-sm block">' +
          '<p class="font-medium mb-1">Vimeo weigert het token</p>' +
          '<p class="text-xs">' + esc(data.error || '') + '</p>' +
          '<p class="text-xs opacity-80 mt-1">Het moet een <strong>Authenticated (you)</strong>-token zijn ' +
          'met de scopes <strong>Public</strong> en <strong>Private</strong>. Een Client Secret werkt hier niet.</p>' +
          '</div>';
        return;
      }
      if (data.status === 'error') {
        box.innerHTML = '<div class="col-span-full alert alert-error text-sm">' +
          esc(data.error || 'Vimeo is niet bereikbaar.') + '</div>';
        return;
      }
      if (data.videos.length === 0) {
        box.innerHTML = '<p class="text-sm opacity-60 col-span-full">Niets gevonden.</p>';
        return;
      }

      box.innerHTML = data.videos.map(function (video) {
        var mins = Math.floor(video.duration_seconds / 60);
        var secs = String(video.duration_seconds % 60).padStart(2, '0');
        // Een privévideo in een mail is een klassieke misser: de ontvanger
        // krijgt een thumbnail die hij niet kan afspelen.
        var warning = video.privacy && video.privacy !== 'anybody'
          ? '<span class="badge badge-warning badge-xs mt-1">niet openbaar</span>' : '';
        // flex-col + justify-start: een <button> centreert zijn inhoud
        // verticaal, waardoor de thumbnails niet meer op één lijn stonden
        // zodra één titel over twee regels liep.
        // min-h op de titel houdt alle kaarten even hoog, ook bij één regel.
        return '<button class="group flex flex-col items-stretch justify-start text-left w-full" ' +
          'data-action="mail-video-pick" data-mail-video="' + esc(video.id) + '">' +
          '<img src="' + esc(video.thumbnail_url) + '" alt="" ' +
            'class="rounded w-full aspect-video object-cover bg-base-300 group-hover:ring-2 ring-primary">' +
          '<span class="text-xs mt-1 line-clamp-2 min-h-[2.5em] leading-snug">' + esc(video.title) + '</span>' +
          '<span class="text-xs opacity-50">' + mins + ':' + secs + '</span>' +
          (warning ? '<span>' + warning + '</span>' : '') +
        '</button>';
      }).join('');
    } catch (error) {
      box.innerHTML = '<p class="text-sm text-error col-span-full">' + esc(error.message) + '</p>';
    }
  }

  async function setVideo(payload) {
    try {
      var data = await api('/events/' + state.eventId + '/video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!data) return;
      state.event = data.event;
      toast(data.video ? 'Opname ingesteld: ' + data.video.title : 'Opname gewist', 'success');
      el('mailVideoPicker').close();

      if (el('mailStudioDialog').open) { renderVideoBar(); schedulePreview(); }
      if (state.onVideoDone) { state.onVideoDone(data); state.onVideoDone = null; }
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  // ─── Bewaren en klaarzetten ────────────────────────────────────────────────

  async function save() {
    if (!state.scopeEvent && !state.eventTypeId) {
      toast('Dit event heeft nog geen event-type. Kies er eerst een.', 'error');
      return;
    }
    var path = state.scopeEvent
      ? '/events/' + state.eventId + '/mail-blocks'
      : '/event-types/' + state.eventTypeId + '/mail-blocks';

    try {
      var saved = await api(path, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(activeDoc())
      });
      if (state.scopeEvent) state.eventDoc = saved; else state.typeDoc = saved;
      state.dirty = false;
      el('mailStudioDirty').textContent = '';
      toast('Bewaard', 'success');
      render();
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  /**
   * @param {boolean} [opnieuw] - true = de _sent-vlag negeren. Alleen voor
   *   oudere events waar die vlag onterecht op true staat; de bewaking op de
   *   message_id blijft gelden, dus dit kan geen dubbele mail geven.
   */
  async function send(opnieuw) {
    if (state.busy) return;
    if (state.dirty && !window.confirm('Er zijn niet-bewaarde wijzigingen. Toch klaarzetten met wat er bewaard is?')) return;

    var soort = KIND_LABEL[state.kind] || state.kind;
    if (!opnieuw && !window.confirm(
      'De ' + soort + '-mail klaarzetten voor iedereen die hem nog niet gehad heeft?\n\n' +
      'Odoo verstuurt ze daarna zelf. Wie hem al kreeg, krijgt hem niet opnieuw.'
    )) return;

    state.busy = true;
    el('mailSendBtn').classList.add('btn-disabled');
    try {
      var result = await api('/events/' + state.eventId + '/mails/' + state.kind + '/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ include_sent: opnieuw === true })
      });
      if (result) {
        var queued = result.queued ? result.queued.length : 0;
        var skipped = result.skipped ? result.skipped.length : 0;

        if (queued === 0 && !opnieuw) {
          // Voor OUDERE events is de _sent-vlag onbetrouwbaar: de oude
          // Odoo-serveractie zette hem op true voor alle registraties, ook
          // die waarvoor de verzending faalde. Daarom hier de uitweg
          // aanbieden in plaats van "er was niets te doen".
          if (window.confirm(
            'Volgens Odoo heeft iedereen deze mail al gehad, dus er is niets klaargezet.\n\n' +
            'Bij events van vóór deze nieuwe mails is die markering vaak onterecht gezet. ' +
            'Wil je hem alsnog klaarzetten voor iedereen?\n\n' +
            'Wie hem via de OM al gekregen heeft, krijgt hem niet opnieuw.'
          )) {
            state.busy = false;
            el('mailSendBtn').classList.remove('btn-disabled');
            return send(true);
          }
        }

        toast(result.message || (queued + ' mail(s) klaargezet' + (skipped ? ', ' + skipped + ' overgeslagen' : '')),
          queued > 0 ? 'success' : 'info');
      }
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      state.busy = false;
      el('mailSendBtn').classList.remove('btn-disabled');
    }
  }

  // ─── Eén centrale listener, geen inline handlers ───────────────────────────

  document.addEventListener('mousedown', function (event) {
    var pick = event.target.closest('[data-om-token-pick]');
    if (pick) {
      // mousedown, niet click: anders is het veld al geblurd voor we erbij zijn.
      event.preventDefault();
      insertToken(pick.getAttribute('data-om-token-pick'));
      return;
    }
    if (menuState && menuState.doc === document && !event.target.closest('#mailTokenMenu')) closeTokenMenu();
  });

  document.addEventListener('click', function (event) {
    var tab = event.target.closest('[data-mail-kind]');
    if (tab && el('mailStudioDialog').open) {
      state.kind = tab.getAttribute('data-mail-kind');
      state.selectedId = null;
      render();
      return;
    }

    var trigger = event.target.closest('[data-action]');
    if (!trigger) return;
    var action = trigger.getAttribute('data-action');

    if (action === 'open-mail-studio') { open(trigger.getAttribute('data-event-id')); return; }

    // De opname hoort bij het event: die knop staat ook op het eventpaneel,
    // buiten de studio om.
    if (action === 'open-video-picker') {
      openVideoPicker(trigger.getAttribute('data-event-id'), function () {
        if (typeof window.EventsV2 === 'object' && typeof window.EventsV2.refreshEvent === 'function') {
          window.EventsV2.refreshEvent(Number(trigger.getAttribute('data-event-id')));
        }
      });
      return;
    }

    // Deze vier horen bij de videokiezer, die ook los van de studio gebruikt
    // wordt vanuit het eventpaneel.
    if (!el('mailStudioDialog').open) {
      switch (action) {
        case 'mail-video-close': el('mailVideoPicker').close(); return;
        case 'mail-video-search': loadVideos(el('mailVideoSearch').value); return;
        case 'mail-video-pick': setVideo({ vimeo_id: trigger.getAttribute('data-mail-video') }); return;
        case 'mail-video-url': setVideo({ video_url: el('mailVideoUrl').value }); return;
        case 'mail-video-clear': setVideo({ video_url: '' }); return;
        default: return;
      }
    }

    switch (action) {
      case 'mail-studio-close': el('mailStudioDialog').close(); break;

      case 'mail-site':
        state.viewSite = trigger.getAttribute('data-mail-view') || '';
        state.selectedId = null;
        render();
        break;

      case 'mail-proof-open': openProof(); break;
      case 'mail-proof-close': el('mailProofDialog').close(); break;
      case 'mail-header-open': openHeader(trigger.getAttribute('data-mail-slot')); break;
      case 'mail-header-save': saveHeader(); break;
      case 'mail-header-clear':
        el('mailHeaderSrc').value = '';
        saveHeader();
        break;

      case 'mail-split': {
        // Beide varianten beginnen als een kopie van wat er stond, zodat
        // niemand opnieuw hoeft te typen.
        var sec = section();
        if (sec.variants) break;
        var basis = { subject: sec.subject || '', preheader: sec.preheader || '', blocks: sec.blocks || [] };
        sec.variants = {
          openvme: JSON.parse(JSON.stringify(basis)),
          syndicoach: JSON.parse(JSON.stringify(basis))
        };
        sec.catchAll = 'openvme';
        state.viewSite = 'openvme';
        state.selectedId = null;
        markDirty();
        render();
        toast('Je hebt nu een aparte inhoud per bedrijf. OpenVME staat als standaard.', 'success');
        break;
      }

      case 'mail-merge': {
        var s = section();
        if (!s.variants) break;
        if (!window.confirm('De inhoud van "' + (SLOT_LABEL[s.catchAll] || s.catchAll) +
          '" blijft behouden, de andere versie gaat weg. Doorgaan?')) break;
        var houden = s.variants[s.catchAll] || {};
        s.subject = houden.subject || '';
        s.preheader = houden.preheader || '';
        s.blocks = houden.blocks || [];
        s.variants = null;
        state.selectedId = null;
        markDirty();
        render();
        break;
      }

      case 'mail-scope-toggle':
        if (state.dirty && !window.confirm('Je hebt niet-bewaarde wijzigingen. Wisselen zonder te bewaren?')) return;
        state.scopeEvent = !state.scopeEvent;
        state.selectedId = null;
        state.dirty = false;
        el('mailStudioDirty').textContent = '';
        renderStatus();
        render();
        break;

      case 'mail-use-starter': {
        // De startopzet komt van de server (lib/mail-defaults.js) en wordt
        // pas iets zodra je hier bewaart. Alleen de soort die je nu bekijkt,
        // zodat je een al ingevulde reminder niet overschrijft.
        var starter = state.schema && state.schema.starter ? state.schema.starter[state.kind] : null;
        if (!starter) { toast('Geen standaardopzet beschikbaar.', 'error'); break; }
        var doc = activeDoc();
        doc[state.kind] = JSON.parse(JSON.stringify(starter));
        state.selectedId = null;
        markDirty();
        render();
        toast('Standaardopzet geladen — pas de teksten aan en bewaar.', 'success');
        break;
      }

      case 'mail-add-open':
        state.addAt = 'end';
        el('mailBlockPicker').showModal();
        icons();
        break;

      case 'mail-add-close': el('mailBlockPicker').close(); break;

      case 'mail-add-pick': {
        var type = trigger.getAttribute('data-mail-add-type');
        var meta = BLOCK_META[type] || { sample: {} };
        var block = Object.assign({ id: type + '-' + Date.now(), type: type },
          JSON.parse(JSON.stringify(meta.sample)));

        var blocks = content().blocks;
        if (state.addAt === 'end') blocks.push(block);
        else blocks.splice(Number(state.addAt), 0, block);

        state.selectedId = block.id;
        el('mailBlockPicker').close();
        markDirty();
        break;
      }

      case 'mail-settings-close': el('mailBlockSettings').close(); break;

      case 'detail-row-add': {
        var blok = blockById(state.selectedId);
        if (!blok) break;
        if (!Array.isArray(blok.rows)) blok.rows = [];
        var preset = DETAIL_PRESETS[el('mailDetailPreset').value] || DETAIL_PRESETS.custom;
        blok.rows.push({
          id: 'regel-' + Date.now(),
          icon: preset.icon,
          label: preset.label,
          value: preset.value
        });
        markDirty();
        openSettings(state.selectedId);
        break;
      }

      case 'detail-row-remove': {
        var b1 = blockById(state.selectedId);
        if (!b1 || !Array.isArray(b1.rows)) break;
        b1.rows.splice(Number(trigger.getAttribute('data-row-index')), 1);
        markDirty();
        openSettings(state.selectedId);
        break;
      }

      case 'detail-row-move': {
        var b2 = blockById(state.selectedId);
        if (!b2 || !Array.isArray(b2.rows)) break;
        var from = Number(trigger.getAttribute('data-row-index'));
        var to = from + Number(trigger.getAttribute('data-row-dir'));
        if (to < 0 || to >= b2.rows.length) break;
        b2.rows.splice(to, 0, b2.rows.splice(from, 1)[0]);
        markDirty();
        openSettings(state.selectedId);
        break;
      }
      case 'mail-video-open': openVideoPicker(); break;
      case 'mail-video-close': el('mailVideoPicker').close(); break;
      case 'mail-video-search': loadVideos(el('mailVideoSearch').value); break;
      case 'mail-video-pick': setVideo({ vimeo_id: trigger.getAttribute('data-mail-video') }); break;
      case 'mail-video-url': setVideo({ video_url: el('mailVideoUrl').value }); break;
      case 'mail-video-clear': setVideo({ video_url: '' }); break;
      case 'mail-save': save(); break;
      case 'mail-send': send(); break;
      default: break;
    }
  });

  document.addEventListener('input', function (event) {
    if (!el('mailStudioDialog').open) return;
    var target = event.target;

    // De onderwerpvelden lopen via bindTokenInput() hierboven: die leest ze
    // met fromChips(), want `value` bestaat niet op een contenteditable.
    var setting = target.getAttribute && target.getAttribute('data-mail-setting');
    if (setting && state.selectedId) {
      var block = blockById(state.selectedId);
      if (!block) return;
      block[setting] = target.type === 'number' ? Number(target.value) : target.value;
      markDirty();
    }
  });

  document.addEventListener('change', function (event) {
    if (!el('mailStudioDialog').open) return;
    var target = event.target;

    if (target.id === 'mailProofWho' || target.id === 'mailProofSite') { refreshProof(); return; }

    var timing = target.getAttribute && target.getAttribute('data-mail-timing');
    if (timing) {
      var sec = section();
      if (!sec.timing) sec.timing = { enabled: true, leadHours: 24, minLeadHours: 0 };
      sec.timing[timing] = timing === 'enabled' ? target.checked : Number(target.value);
      markDirty();
      renderTimingBar();
      return;
    }

    if (target.hasAttribute && target.hasAttribute('data-mail-catchall')) {
      // Precies één variant kan de standaard zijn; uitvinken kan dus niet --
      // dan zou er geen mail zijn voor wie via een andere weg inschreef.
      if (target.checked) {
        section().catchAll = state.viewSite;
        markDirty();
      }
      render();
      return;
    }

    var setting = target.getAttribute && target.getAttribute('data-mail-setting');
    if (setting && state.selectedId) {
      var settingBlock = blockById(state.selectedId);
      if (!settingBlock) return;
      settingBlock[setting] = target.type === 'number' ? Number(target.value) : target.value;
      markDirty();
    }
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Enter' && el('mailVideoPicker').open && event.target.id === 'mailVideoSearch') {
      event.preventDefault();
      loadVideos(el('mailVideoSearch').value);
    }
  });

  window.EventsMailStudio = { open: open, openVideoPicker: openVideoPicker };
})();
