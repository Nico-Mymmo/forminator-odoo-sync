/**
 * Bewerklaag voor mailteksten: chips en de "/"-kiezer.
 *
 * HERKOMST. Dit was de bovenste 380 regels van
 * `public/events-v2-mail-studio.js`. Bij het bouwen van de maileditor in
 * Koppelingen is het hierheen verplaatst, LETTERLIJK, met drie
 * aanknopingspunten als parameter:
 *
 *   getTokens()    welke placeholders bestaan en hoe ze heten
 *   parentMenuId   de id van de menu-node in de OUDERpagina
 *   esc()          de escape-functie van de aanroeper
 *
 * Waarom gedeeld en niet gekopieerd: de zes bugs die de browsertest van de
 * studio vangt (`mail-studio-ui-test.mjs`) zaten allemaal in dit soort
 * cursor- en chipdetails. Twee kopieen betekent dat de tweede die bugs
 * opnieuw krijgt, een voor een.
 *
 * WAT JE MOET WETEN VOOR JE HIERIN SNIJDT
 * ---------------------------------------
 * - Chips staan tussen ZERO-WIDTH SPATIES. Zonder tekstknooppunt naast een
 *   `contenteditable="false"`-element kan je de cursor er niet naast zetten,
 *   en kan je dus niet achter een chip verder typen. `fromChips()` strookt ze
 *   weer weg zodat ze nooit in Odoo belanden.
 * - `fromChips()` loopt de DOM af en gebruikt GEEN reguliere expressie op
 *   innerHTML: alleen zo blijft een chip een geheel en blijft de omliggende
 *   opmaak intact.
 * - De "/"-kiezer werkt in TWEE documenten: de ouderpagina (onderwerp,
 *   voorbeeldtekst) en het voorbeeld-iframe (de mail zelf). Een menu uit de
 *   ouderpagina kan niet over een iframe heen liggen, dus elk document krijgt
 *   zijn eigen menu-node.
 * - Een `<dialog>` met `showModal()` rendert in de TOP LAYER. Staat de
 *   menu-node van de ouderpagina BUITEN die dialoog, dan valt hij eronder,
 *   ook met `position:fixed` en `z-index`. De node hoort dus BINNEN de
 *   dialoog te staan.
 * - Het menu opent NA de toetsaanslag, dus `vindSlash()` zoekt de "/" een
 *   positie terug -- en houdt rekening met het geval waarin de cursor in het
 *   ELEMENT staat in plaats van in een tekstknooppunt (Chrome doet dat in een
 *   leeg contenteditable veld; daar ging de kiezer eerder niet open).
 *
 * Draai na elke wijziging de browsertest van de studio. Zie CLAUDE.md voor
 * hoe je die zonder lokale Playwright-installatie draait.
 */
(function () {
  'use strict';

  function standaardEsc(v) {
    return String(v == null ? '' : v)
      .split('&').join('&amp;')
      .split('<').join('&lt;')
      .split('>').join('&gt;')
      .split('"').join('&quot;');
  }

  /**
   * Een bewerklaag maken.
   *
   * @param {Object} options
   * @param {Function} options.getTokens - () => [{ path, label, group }]
   * @param {string} options.parentMenuId - id van de menu-node in document
   * @param {Function} [options.esc]
   */
  function create(options) {
    var opties       = options || {};
    var getTokens    = opties.getTokens;
    var parentMenuId = opties.parentMenuId;
    var esc          = opties.esc || standaardEsc;

  var CHIP_STYLE = 'display:inline-block;padding:1px 8px;margin:0 1px;border-radius:10px;' +
    'background:#e0e7ff;color:#3730a3;font-size:0.9em;font-weight:500;' +
    'white-space:nowrap;vertical-align:baseline;';

  /**
   * De beschikbare placeholders. KOMT VAN BUITEN: bij een event zijn dat de
   * gegevens van het event, bij een koppeling de velden van het formulier.
   * Dat verschil is de enige reden dat deze laag ooit event-specifiek was.
   */
  function allTokens() {
    var lijst = getTokens ? getTokens() : [];
    return Array.isArray(lijst) ? lijst : [];
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
    if (doc === document) return document.getElementById(parentMenuId);

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

    return {
      chipHtml:         chipHtml,
      toChips:          toChips,
      fromChips:        fromChips,
      ensureCaretSpace: ensureCaretSpace,
      bindTokenInput:   bindTokenInput,
      insertToken:      insertToken,
      closeMenu:        closeTokenMenu,
      renderMenu:       renderTokenMenu,
      /** Staat de kiezer open? Vervangt het rechtstreeks lezen van menuState. */
      isOpen:  function () { return menuState !== null; },
      /** In welk document staat de open kiezer? null als hij dicht is. */
      menuDoc: function () { return menuState ? menuState.doc : null; },
      ZWSP: '\u200b'
    };
  }

  window.OMTokenEditor = { create: create };
})();
