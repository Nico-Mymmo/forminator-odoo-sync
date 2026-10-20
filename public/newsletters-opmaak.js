/**
 * Nieuwsbrieven -- opmaak in de tekst van een blok, zoals in Notion of Google
 * Docs. Werkt IN het voorbeeld-iframe, enkel in velden met `data-nb-rijk`
 * (tekst die render.js met alineas() tekent).
 *
 *   - Tekst selecteren = een zwevende balk: soort (Tekst, Tussenkop, ...),
 *     vet, cursief, doorhalen, link, opsomming, genummerd, citaat.
 *   - "/" aan het begin van een regel of na een spatie = een menu met de
 *     soorten; verder typen filtert, pijltjes + Enter kiezen, Esc sluit.
 *   - Markdown terwijl je typt: "- " of "* " = opsomming, "1. " = genummerd,
 *     "# " = tussenkop, "> " = citaat, "---" + Enter = scheidingslijn.
 *   - Sneltoetsen: Ctrl/Cmd+B, I, Shift+X (doorhalen), K (link),
 *     Shift+7 (genummerd), Shift+8 (opsomming).
 *
 * Bewaren doet dit bestand niet: elke wijziging vuurt een `input`-event, en
 * newsletters-edition.js zet de HTML met inlineTekst() om naar de bewaarde
 * vorm (**vet**, _cursief_, ~~doorgehaald~~, [label](url), "- ", "1. ",
 * "> ", "### ", "---"). Een vorm erbij = ook daar en in alineas() (render.js).
 *
 * Gebruik: NB.opmaak.koppel(doc) -- een keer per iframe-document.
 */
(function () {
  'use strict';
  var NB = window.NB;

  // Lucide-iconen (24x24, lijn).
  var IK = {
    tekst: '<path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/>',
    kop: '<path d="M4 12h8"/><path d="M4 18V6"/><path d="M12 18V6"/><path d="m17 12 3-2v8"/>',
    ul: '<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>',
    ol: '<path d="M10 6h11"/><path d="M10 12h11"/><path d="M10 18h11"/><path d="M4 6h1v4"/><path d="M4 10h2"/><path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1"/>',
    citaat: '<path d="M17 6H3"/><path d="M21 12H8"/><path d="M21 18H8"/><path d="M3 12v6"/>',
    hr: '<path d="M5 12h14"/>',
    vet: '<path d="M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8"/>',
    cursief: '<path d="M19 4h-9"/><path d="M14 20H5"/><path d="M15 4 9 20"/>',
    door: '<path d="M16 4H9a3 3 0 0 0-2.83 4"/><path d="M14 12a4 4 0 0 1 0 8H6"/><path d="M4 12h16"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    neer: '<path d="m6 9 6 6 6-6"/>',
    vink: '<path d="M20 6 9 17l-5-5"/>',
    weg: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  };
  function ikoon(naam, maat) {
    return '<svg viewBox="0 0 24 24" width="' + (maat || 16) + '" height="' + (maat || 16) + '" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' + IK[naam] + '</svg>';
  }

  var SOORTEN = [
    { key: 'p', label: 'Tekst', uitleg: 'Gewone alinea', ikoon: 'tekst', zoek: 'tekst text alinea p gewoon' },
    { key: 'h3', label: 'Tussenkop', uitleg: 'Een kopje boven een stuk tekst', ikoon: 'kop', zoek: 'tussenkop kop heading titel h3 h' },
    { key: 'ul', label: 'Opsomming', uitleg: 'Lijst met bolletjes', ikoon: 'ul', zoek: 'opsomming lijst bullet bolletjes ul' },
    { key: 'ol', label: 'Genummerde lijst', uitleg: 'Lijst met 1, 2, 3', ikoon: 'ol', zoek: 'genummerde lijst nummer numbered ol 1' },
    { key: 'blockquote', label: 'Citaat', uitleg: 'Een zin die eruit springt', ikoon: 'citaat', zoek: 'citaat quote aanhaling blockquote' },
    { key: 'hr', label: 'Scheidingslijn', uitleg: 'Een dunne lijn tussen twee stukken', ikoon: 'hr', zoek: 'scheidingslijn lijn divider hr streep' },
  ];

  var CSS = ''
    + '[data-nb-rijk] ul,[data-nb-rijk] ol{margin:0 0 14px;padding:0 0 0 24px}'
    + '[data-nb-rijk] li{margin:0 0 6px;padding-left:4px}'
    + '[data-nb-rijk] h3{margin:8px 0 8px;font-size:1.18em;font-weight:700;line-height:1.35;color:#030712}'
    + '[data-nb-rijk] blockquote{margin:0 0 14px;border-left:3px solid #99f6e4;padding:2px 0 2px 16px;font-style:italic}'
    + '[data-nb-rijk] hr{border:0;border-top:1px solid #e5e7eb;height:0;margin:6px 0 20px}'
    // De balk bij een selectie
    + '.nbo-balk{position:absolute;z-index:30;display:flex;align-items:center;gap:2px;padding:4px;border-radius:10px;background:#111827;color:#f9fafb;box-shadow:0 8px 24px rgba(0,0,0,.22),0 0 0 1px rgba(255,255,255,.06);font:500 13px/1 system-ui,-apple-system,"Segoe UI",sans-serif;user-select:none;animation:nbo-in .12s ease-out}'
    + '@keyframes nbo-in{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}'
    + '.nbo-balk button{display:inline-flex;align-items:center;gap:4px;height:30px;min-width:30px;padding:0 7px;border:0;border-radius:7px;background:transparent;color:inherit;cursor:pointer;font:inherit}'
    + '.nbo-balk button:hover{background:rgba(255,255,255,.12)}'
    + '.nbo-balk button.nbo-aan{background:rgba(125,211,252,.22);color:#7dd3fc}'
    + '.nbo-balk .nbo-scheid{width:1px;height:18px;background:rgba(255,255,255,.18);margin:0 3px}'
    + '.nbo-balk input{width:240px;height:30px;border:0;outline:0;border-radius:7px;padding:0 10px;background:rgba(255,255,255,.1);color:#fff;font:inherit}'
    + '.nbo-balk input::placeholder{color:rgba(255,255,255,.5)}'
    // Het menu (slash en soortkeuze)
    + '.nbo-menu{position:absolute;z-index:31;width:290px;max-height:340px;overflow-y:auto;padding:6px;border-radius:12px;background:#fff;color:#111827;box-shadow:0 12px 32px rgba(15,23,42,.18),0 0 0 1px rgba(15,23,42,.08);font:13px/1.3 system-ui,-apple-system,"Segoe UI",sans-serif;animation:nbo-in .12s ease-out}'
    + '.nbo-menu-kop{padding:6px 8px 6px;font-size:11px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:#6b7280}'
    + '.nbo-item{display:flex;align-items:center;gap:10px;padding:6px 8px;border-radius:8px;cursor:pointer}'
    + '.nbo-item.nbo-actief{background:#f1f5f9}'
    + '.nbo-ik{flex:none;display:flex;align-items:center;justify-content:center;width:38px;height:38px;border-radius:8px;border:1px solid #e5e7eb;background:#fff;color:#374151}'
    + '.nbo-item b{display:block;font-weight:600;font-size:14px}'
    + '.nbo-item span.nbo-uitleg{display:block;color:#6b7280;font-size:12px;margin-top:2px}'
    + '.nbo-leeg{padding:10px 8px;color:#6b7280}'
    + '.nbo-voet{display:flex;gap:10px;padding:8px 8px 4px;margin-top:4px;border-top:1px solid #f1f5f9;color:#9ca3af;font-size:11px}'
    + '.nbo-voet kbd{font:600 10px/1 system-ui,sans-serif;padding:2px 5px;border-radius:4px;border:1px solid #e5e7eb;background:#f9fafb;color:#6b7280}';

  function normaal(t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

  function koppel(doc) {
    var win = doc.defaultView;
    var st = doc.createElement('style');
    st.textContent = CSS;
    (doc.head || doc.documentElement).appendChild(st);

    var balk = null, menu = null, slash = null, linkRange = null;
    var MAC = /Mac|iPhone|iPad/.test(navigator.platform || '');
    var MOD = MAC ? '⌘' : 'Ctrl+';

    function sel() { return doc.getSelection(); }
    function rijkVeld(node) {
      var n = node && (node.nodeType === 3 ? node.parentNode : node);
      var v = n && n.closest && n.closest('[data-nb-veld][contenteditable]');
      return v && v.hasAttribute('data-nb-rijk') ? v : null;
    }
    function huidigVeld() { var s = sel(); return s && s.rangeCount ? rijkVeld(s.anchorNode) : null; }
    function binnen(node, selector, veld) {
      var n = node && (node.nodeType === 3 ? node.parentNode : node);
      var x = n && n.closest ? n.closest(selector) : null;
      return x && veld.contains(x) ? x : null;
    }
    function gewijzigd(veld) { veld.dispatchEvent(new win.InputEvent('input', { bubbles: true })); }

    /** Het blok (alinea, kop, citaat, of het lijstitem) waarin de cursor staat. */
    function blok(veld) {
      var s = sel();
      var n = s.anchorNode && (s.anchorNode.nodeType === 3 ? s.anchorNode.parentNode : s.anchorNode);
      while (n && n !== veld && n.parentNode !== veld) { if (n.tagName === 'LI') return n; n = n.parentNode; }
      return n === veld ? null : n;
    }
    function huidigeSoort(veld) {
      var s = sel();
      if (binnen(s.anchorNode, 'ul', veld)) return 'ul';
      if (binnen(s.anchorNode, 'ol', veld)) return 'ol';
      if (binnen(s.anchorNode, 'blockquote', veld)) return 'blockquote';
      if (binnen(s.anchorNode, 'h1,h2,h3,h4', veld)) return 'h3';
      return 'p';
    }

    /** Een blok een ander element maken; de tekst (en dus de cursor) blijft dezelfde. */
    function vervang(el, tag) {
      var s = sel();
      var r = s.rangeCount ? s.getRangeAt(0).cloneRange() : null;
      var nieuw = doc.createElement(tag);
      while (el.firstChild) nieuw.appendChild(el.firstChild);
      if (!nieuw.firstChild) nieuw.appendChild(doc.createElement('br'));
      el.parentNode.replaceChild(nieuw, el);
      try { if (r) { s.removeAllRanges(); s.addRange(r); } } catch (err) { /* cursor kwijt: geen ramp */ }
      return nieuw;
    }

    function zetSoort(key) {
      var veld = huidigVeld();
      if (!veld) return;
      veld.focus();
      var s = sel();
      var lijst = binnen(s.anchorNode, 'ul,ol', veld);
      if (key === 'hr') {
        doc.execCommand('insertHorizontalRule');
        gewijzigd(veld);
        return;
      }
      if (key === 'ul' || key === 'ol') {
        if (lijst && lijst.tagName.toLowerCase() === key) return;
        var b = blok(veld);
        if (!lijst && b && /^(H\d|BLOCKQUOTE)$/.test(b.tagName)) vervang(b, 'p');
        doc.execCommand(key === 'ul' ? 'insertUnorderedList' : 'insertOrderedList');
        return;
      }
      if (lijst) doc.execCommand(lijst.tagName === 'UL' ? 'insertUnorderedList' : 'insertOrderedList');
      var bl = blok(veld);
      if (!bl || bl.tagName === 'LI') { doc.execCommand('formatBlock', false, 'p'); bl = blok(veld); }
      if (bl && bl.tagName.toLowerCase() !== key) vervang(bl, key);
      gewijzigd(veld);
    }

    function opmaak(wat) {
      var veld = huidigVeld();
      if (!veld) return;
      if (wat === 'link') { toonLink(); return; }
      doc.execCommand(wat === 'vet' ? 'bold' : wat === 'cursief' ? 'italic' : 'strikeThrough');
      tekenBalk();
    }

    // ─── De balk bij een selectie ────────────────────────────────────────
    function sluitBalk() { if (balk) balk.remove(); balk = null; linkRange = null; }

    function plaats(el, rect, boven) {
      var sx = win.scrollX, sy = win.scrollY;
      var w = el.offsetWidth, h = el.offsetHeight;
      var x = Math.max(8, Math.min(doc.documentElement.clientWidth - w - 8, rect.left + rect.width / 2 - w / 2 + sx));
      // Boven de selectie als er plaats is (de balk), anders eronder (het menu).
      var y = boven && rect.top - h - 10 > 0 ? rect.top - h - 10 : rect.bottom + 10;
      el.style.left = x + 'px';
      el.style.top = (y + sy) + 'px';
    }

    function tekenBalk() {
      var veld = huidigVeld(), s = sel();
      if (!veld || !s.rangeCount || s.isCollapsed || rijkVeld(s.focusNode) !== veld || menu) { if (!linkRange) sluitBalk(); return; }
      var r = s.getRangeAt(0);
      var rect = r.getBoundingClientRect();
      if (!rect.width && !rect.height) return;
      var soort = SOORTEN.find(function (x) { return x.key === huidigeSoort(veld); }) || SOORTEN[0];
      var aan = function (cmd) { try { return doc.queryCommandState(cmd); } catch (err) { return false; } };
      var inLink = !!binnen(s.anchorNode, 'a', veld);
      var knop = function (wat, ik, titel, actief) {
        return '<button type="button" data-nbo="' + wat + '" title="' + titel + '"' + (actief ? ' class="nbo-aan"' : '') + '>' + ikoon(ik) + '</button>';
      };
      if (!balk || !balk.isConnected) { balk = doc.createElement('div'); balk.className = 'nbo-balk'; doc.body.appendChild(balk); }
      balk.innerHTML = '<button type="button" data-nbo="soort" title="Soort tekst">' + e(soort.label) + ikoon('neer', 14) + '</button>'
        + '<span class="nbo-scheid"></span>'
        + knop('vet', 'vet', 'Vet (' + MOD + 'B)', aan('bold'))
        + knop('cursief', 'cursief', 'Cursief (' + MOD + 'I)', aan('italic'))
        + knop('door', 'door', 'Doorhalen (' + MOD + 'Shift+X)', aan('strikeThrough'))
        + knop('link', 'link', 'Link (' + MOD + 'K)', inLink)
        + '<span class="nbo-scheid"></span>'
        + knop('ul', 'ul', 'Opsomming (' + MOD + 'Shift+8)', soort.key === 'ul')
        + knop('ol', 'ol', 'Genummerde lijst (' + MOD + 'Shift+7)', soort.key === 'ol')
        + knop('blockquote', 'citaat', 'Citaat', soort.key === 'blockquote');
      plaats(balk, rect, true);
    }

    function toonLink() {
      var veld = huidigVeld(), s = sel();
      if (!veld || !s.rangeCount) return;
      linkRange = s.getRangeAt(0).cloneRange();
      var a = binnen(s.anchorNode, 'a', veld);
      var rect = linkRange.getBoundingClientRect();
      if (!balk || !balk.isConnected) { balk = doc.createElement('div'); balk.className = 'nbo-balk'; doc.body.appendChild(balk); }
      balk.innerHTML = '<input type="url" data-nbo-url placeholder="Plak of typ een link" value="' + e(a ? a.getAttribute('href') || '' : '') + '">'
        + '<button type="button" data-nbo="link-ok" title="Toepassen (Enter)">' + ikoon('vink') + '</button>'
        + (a ? '<button type="button" data-nbo="link-weg" title="Link weghalen">' + ikoon('weg') + '</button>' : '');
      plaats(balk, rect, true);
      var inp = balk.querySelector('input');
      inp.focus(); inp.select();
    }

    function linkToepassen(weg) {
      var inp = balk && balk.querySelector('[data-nbo-url]');
      var url = inp ? inp.value.trim() : '';
      var r = linkRange;
      linkRange = null;
      if (!r) { sluitBalk(); return; }
      var veld = rijkVeld(r.startContainer);
      if (!veld) { sluitBalk(); return; }
      veld.focus();
      var s = sel(); s.removeAllRanges(); s.addRange(r);
      if (weg || !url) doc.execCommand('unlink');
      else {
        if (!/^https?:\/\//i.test(url)) url = /^[^\s@]+@[^\s@]+$/.test(url) ? 'mailto:' + url : 'https://' + url;
        if (/^https?:\/\//i.test(url)) doc.execCommand('createLink', false, url);
      }
      gewijzigd(veld);
      sluitBalk();
      tekenBalk();
    }

    // ─── Het menu (na "/" of via de soortknop) ───────────────────────────
    function sluitMenu() { if (menu) menu.remove(); menu = null; slash = null; }

    function tekenMenu(query, rect, kop) {
      var q = normaal(query);
      var lijst = SOORTEN.filter(function (x) { return !q || normaal(x.label).indexOf(q) >= 0 || x.zoek.indexOf(q) >= 0; });
      if (!menu || !menu.isConnected) { menu = doc.createElement('div'); menu.className = 'nbo-menu'; doc.body.appendChild(menu); menu._actief = 0; }
      menu._lijst = lijst;
      if (menu._actief >= lijst.length) menu._actief = 0;
      menu.innerHTML = '<div class="nbo-menu-kop">' + e(kop || 'Opmaak') + '</div>'
        + (lijst.length ? lijst.map(function (x, i) {
          return '<div class="nbo-item' + (i === menu._actief ? ' nbo-actief' : '') + '" data-nbo-soort="' + x.key + '"><span class="nbo-ik">' + ikoon(x.ikoon, 20) + '</span><span><b>' + e(x.label) + '</b><span class="nbo-uitleg">' + e(x.uitleg) + '</span></span></div>';
        }).join('') : '<div class="nbo-leeg">Niets gevonden</div>')
        + '<div class="nbo-voet"><span><kbd>↑</kbd> <kbd>↓</kbd> kiezen</span><span><kbd>Enter</kbd> toepassen</span><span><kbd>Esc</kbd> sluiten</span></div>';
      if (rect) plaats(menu, rect, false);
      var actief = menu.querySelector('.nbo-actief');
      if (actief && actief.scrollIntoView) actief.scrollIntoView({ block: 'nearest' });
    }

    function kies(key) {
      var veld = huidigVeld();
      if (slash && slash.node && veld) {
        // Het "/zoekwoord" eerst weg, dan de soort.
        var s = sel();
        var eind = s.rangeCount && s.getRangeAt(0).startContainer === slash.node ? s.getRangeAt(0).startOffset : slash.start + 1;
        var r = doc.createRange();
        try { r.setStart(slash.node, slash.start); r.setEnd(slash.node, Math.max(slash.start + 1, eind)); s.removeAllRanges(); s.addRange(r); doc.execCommand('delete'); } catch (err) { /* tekst al weg */ }
      } else if (menu && menu._range) {
        var s2 = sel(); s2.removeAllRanges(); s2.addRange(menu._range);
      }
      sluitMenu();
      zetSoort(key);
      sluitBalk();
    }

    function slashBijwerken() {
      if (!slash) return;
      var s = sel();
      if (!s.rangeCount || !s.isCollapsed) { sluitMenu(); return; }
      var r = s.getRangeAt(0);
      if (r.startContainer !== slash.node || r.startOffset <= slash.start || slash.node.data.charAt(slash.start) !== '/') { sluitMenu(); return; }
      var query = slash.node.data.slice(slash.start + 1, r.startOffset);
      if (query.length > 24 || /\s\s/.test(query) || (/\s$/.test(query) && !SOORTEN.some(function (x) { return x.zoek.indexOf(normaal(query.trim())) >= 0; }))) { sluitMenu(); return; }
      var rect = r.getBoundingClientRect();
      if (!rect.height) rect = slash.node.parentNode.getBoundingClientRect();
      tekenMenu(query, rect);
    }

    // ─── Markdown terwijl je typt ────────────────────────────────────────
    function markdown(veld) {
      var s = sel();
      if (!s.isCollapsed) return false;
      var b = blok(veld);
      if (!b || b.tagName === 'LI' || /^H\d$/.test(b.tagName)) return false;
      var r = s.getRangeAt(0);
      var voor = doc.createRange();
      voor.setStart(b, 0);
      try { voor.setEnd(r.startContainer, r.startOffset); } catch (err) { return false; }
      var tekst = voor.toString().replace(/ /g, ' ');
      var m = /^(-|\*|1\.|#{1,3}|>) $/.exec(tekst);
      if (!m) return false;
      var key = m[1] === '-' || m[1] === '*' ? 'ul' : m[1] === '1.' ? 'ol' : m[1] === '>' ? 'blockquote' : 'h3';
      if (key === 'blockquote' && b.tagName === 'BLOCKQUOTE') return false;
      s.removeAllRanges(); s.addRange(voor); doc.execCommand('delete');
      zetSoort(key);
      return true;
    }

    // ─── Luisteraars ─────────────────────────────────────────────────────
    // De brief vervangt soms zijn inhoud (zonder herladen): balk en menu zijn dan weg.
    doc.addEventListener('selectionchange', function () {
      if (slash) slashBijwerken();
      if (balk && linkRange) return; // het linkveld heeft de focus
      win.requestAnimationFrame(tekenBalk);
    });

    doc.addEventListener('input', function (ev) {
      var veld = rijkVeld(ev.target);
      if (!veld) return;
      if (ev.inputType === 'insertText' && ev.data === '/') {
        var s = sel(), r = s.rangeCount && s.getRangeAt(0);
        if (r && r.startContainer.nodeType === 3) {
          var voor = r.startContainer.data.charAt(r.startOffset - 2);
          if (r.startOffset === 1 || /[\s ]/.test(voor)) {
            slash = { node: r.startContainer, start: r.startOffset - 1 };
            if (menu) menu._actief = 0;
            slashBijwerken();
            return;
          }
        }
      }
      if (ev.inputType === 'insertText' && ev.data === ' ' && markdown(veld)) return;
      if (slash) slashBijwerken();
    });

    // Capture: vóór de Enter-afhandeling van newsletters-edition.js.
    doc.addEventListener('keydown', function (ev) {
      var el = ev.target.closest && ev.target.closest('[data-nb-veld][contenteditable]');
      var mod = MAC ? ev.metaKey : ev.ctrlKey;
      if (ev.target.hasAttribute && ev.target.hasAttribute('data-nbo-url')) {
        if (ev.key === 'Enter') { ev.preventDefault(); linkToepassen(false); }
        else if (ev.key === 'Escape') { ev.preventDefault(); var r0 = linkRange; sluitBalk(); if (r0) { var v0 = rijkVeld(r0.startContainer); if (v0) { v0.focus(); sel().removeAllRanges(); sel().addRange(r0); } } }
        return;
      }
      if (!el) return;
      var veld = el.hasAttribute('data-nb-rijk') ? el : null;
      // Opmaak waar ze niet bewaard kan worden: niet laten beginnen.
      if (!veld) {
        if (mod && /^[biu]$/i.test(ev.key)) ev.preventDefault();
        return;
      }
      if (menu) {
        var n = (menu._lijst || []).length;
        if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
          ev.preventDefault(); ev.stopPropagation();
          if (n) { menu._actief = (menu._actief + (ev.key === 'ArrowDown' ? 1 : n - 1)) % n; tekenMenu(slash ? slash.node.data.slice(slash.start + 1, sel().getRangeAt(0).startOffset) : '', null, menu._kop); }
          return;
        }
        if (ev.key === 'Enter' || ev.key === 'Tab') {
          if (n) { ev.preventDefault(); ev.stopPropagation(); kies(menu._lijst[menu._actief].key); }
          else sluitMenu();
          return;
        }
        if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); sluitMenu(); return; }
      }
      if (mod && ev.key.toLowerCase() === 'u') { ev.preventDefault(); return; }
      if (mod && ev.key.toLowerCase() === 'k') { ev.preventDefault(); if (!sel().isCollapsed) toonLink(); return; }
      if (mod && ev.shiftKey && ev.key.toLowerCase() === 'x') { ev.preventDefault(); opmaak('door'); return; }
      if (mod && ev.shiftKey && (ev.code === 'Digit7' || ev.key === '7' || ev.key === '/')) { ev.preventDefault(); zetSoort('ol'); return; }
      if (mod && ev.shiftKey && (ev.code === 'Digit8' || ev.key === '8' || ev.key === '*')) { ev.preventDefault(); zetSoort('ul'); return; }
      // "---" + Enter = scheidingslijn
      if (ev.key === 'Enter' && !ev.shiftKey) {
        var b = blok(veld);
        if (b && b.tagName === 'P' && /^-{3,}$/.test(b.textContent.trim())) {
          ev.preventDefault(); ev.stopPropagation();
          b.textContent = '';
          var hr = doc.createElement('hr');
          var p = doc.createElement('p'); p.appendChild(doc.createElement('br'));
          b.parentNode.replaceChild(hr, b);
          hr.parentNode.insertBefore(p, hr.nextSibling);
          var r = doc.createRange(); r.setStart(p, 0); r.collapse(true); sel().removeAllRanges(); sel().addRange(r);
          gewijzigd(veld);
        }
      }
    }, true);

    // Knoppen: mousedown zonder de selectie te verliezen.
    doc.addEventListener('mousedown', function (ev) {
      var knop = ev.target.closest && ev.target.closest('[data-nbo]');
      var item = ev.target.closest && ev.target.closest('[data-nbo-soort]');
      if (item) { ev.preventDefault(); ev.stopPropagation(); kies(item.getAttribute('data-nbo-soort')); return; }
      if (knop) {
        ev.preventDefault(); ev.stopPropagation();
        var wat = knop.getAttribute('data-nbo');
        if (wat === 'link-ok') linkToepassen(false);
        else if (wat === 'link-weg') linkToepassen(true);
        else if (wat === 'soort') {
          var s = sel();
          sluitMenu();
          tekenMenu('', knop.getBoundingClientRect(), 'Omzetten naar');
          menu._kop = 'Omzetten naar';
          menu._range = s.rangeCount ? s.getRangeAt(0).cloneRange() : null;
        }
        else if (wat === 'ul' || wat === 'ol' || wat === 'blockquote') { zetSoort(huidigeSoort(huidigVeld() || doc.body) === wat ? 'p' : wat); win.requestAnimationFrame(tekenBalk); }
        else opmaak(wat);
        return;
      }
      if (ev.target.closest && (ev.target.closest('.nbo-balk') || ev.target.closest('.nbo-menu'))) return;
      if (menu) sluitMenu();
    }, true);
    // De klik op een knop van de balk mag geen blok kiezen.
    doc.addEventListener('click', function (ev) {
      if (ev.target.closest && (ev.target.closest('.nbo-balk') || ev.target.closest('.nbo-menu'))) ev.stopPropagation();
    }, true);
    win.addEventListener('blur', function () { if (!linkRange) { sluitBalk(); sluitMenu(); } });
  }

  function e(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  NB.opmaak = { koppel: koppel };
})();
