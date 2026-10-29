/**
 * Mymmo Forms — voorstellen in het veld "Straat".
 *
 * Zodra de postcode erboven ingevuld is, worden de straten van die postcode
 * opgehaald (via WordPress, Mymmo_Forms_Straten). Bij het typen staat er een
 * lijstje onder het veld met de straten die erop lijken; een klik (of Enter)
 * zet de straat in het veld en de bezoeker typt er het huisnummer achter.
 *
 * Het HELPT, het houdt niets tegen: een straat die niet in de lijst staat,
 * typt de bezoeker gewoon zelf. Zonder JavaScript of zonder lijst is het een
 * gewoon tekstveld. De Worker zet een herkende straat bij het versturen nog in
 * de officiele schrijfwijze (forms/straten.js in de OM) -- straatSleutel()
 * hieronder volgt dezelfde regel, wijzig ze samen.
 */
(function () {
  'use strict';

  var MAX = 8;
  var lijsten = {};

  function straatSleutel(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/\bstr\.?(?=\s|$)/g, 'straat').replace(/str\.?$/, 'straat')
      .replace(/\bstwg\.?(?=\s|$)/g, 'steenweg').replace(/stwg\.?$/, 'steenweg')
      .replace(/[^a-z0-9]+/g, '');
  }

  function taalVan(el) {
    var w = el.closest ? el.closest('[lang]') : null;
    return w ? String(w.getAttribute('lang') || '').slice(0, 2).toLowerCase() : '';
  }

  function naamIn(item, taal) {
    if (typeof item === 'string') return item;
    return item[taal] || item.nl || item.fr || item.de || '';
  }

  function postcodeVeld(invoer) {
    var naam = invoer.getAttribute('data-mymmo-straat-van');
    if (!naam || !invoer.form) return null;
    var veld = invoer.form.elements[naam];
    return veld && veld.tagName ? veld : null;
  }

  /** De straten van de postcode erboven, of null als die (nog) niet klopt. */
  function laad(invoer) {
    var pc = postcodeVeld(invoer);
    var basis = invoer.getAttribute('data-mymmo-straat-url');
    if (!pc || !basis || typeof window.fetch !== 'function') return Promise.resolve(null);
    var land = pc.getAttribute('data-mymmo-postcode') || 'BE';
    var code = String(pc.value || '').toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/^(B|NL)(?=\d)/, '');
    if (land === 'BE' && !/^[1-9]\d{3}$/.test(code)) return Promise.resolve(null);
    if (land !== 'BE') return Promise.resolve(null);
    var url = basis + encodeURIComponent(code);
    if (!lijsten[url]) {
      lijsten[url] = window.fetch(url, { credentials: 'omit' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) { return j && Array.isArray(j.straten) ? j.straten : []; })
        .catch(function () { delete lijsten[url]; return []; });
    }
    return lijsten[url];
  }

  function lijstVan(invoer) {
    var id = invoer.getAttribute('aria-controls');
    return id ? document.getElementById(id) : null;
  }

  function sluit(invoer) {
    var ul = lijstVan(invoer);
    if (ul) { ul.hidden = true; ul.innerHTML = ''; }
    invoer.setAttribute('aria-expanded', 'false');
    invoer.removeAttribute('aria-activedescendant');
  }

  /** Wat de bezoeker typte, gesplitst in de straat en wat erachter komt (het nummer). */
  function delen(waarde) {
    var m = String(waarde || '').match(/^(.*?)(?:[\s,]+(\d.*))?$/);
    return { straat: (m && m[1]) || '', rest: (m && m[2]) || '' };
  }

  function toon(invoer, straten) {
    var ul = lijstVan(invoer);
    if (!ul) return;
    var d = delen(invoer.value);
    var zoek = straatSleutel(d.straat);
    // Staat er al een nummer, of is er nog niets getypt: geen lijst.
    if (!zoek || d.rest) { sluit(invoer); return; }
    var taal = taalVan(invoer);
    var begin = [];
    var midden = [];
    for (var i = 0; i < straten.length && begin.length < MAX; i += 1) {
      var item = straten[i];
      var namen = typeof item === 'string' ? [item] : Object.keys(item).map(function (k) { return item[k]; });
      var plek = -1;
      for (var j = 0; j < namen.length; j += 1) {
        var p = straatSleutel(namen[j]).indexOf(zoek);
        if (p !== -1 && (plek === -1 || p < plek)) plek = p;
      }
      if (plek === 0) begin.push(item); else if (plek > 0) midden.push(item);
    }
    var gevonden = begin.concat(midden).slice(0, MAX);
    // Exact wat er al staat: niets meer voor te stellen.
    if (!gevonden.length || (gevonden.length === 1 && straatSleutel(naamIn(gevonden[0], taal)) === zoek)) {
      sluit(invoer);
      return;
    }
    ul.innerHTML = '';
    gevonden.forEach(function (item, n) {
      var li = document.createElement('li');
      li.id = ul.id + '-' + n;
      li.className = 'mymmo-form-suggestie';
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', 'false');
      li.textContent = naamIn(item, taal);
      ul.appendChild(li);
    });
    ul.hidden = false;
    invoer.setAttribute('aria-expanded', 'true');
    plaats(invoer, ul);
  }

  /**
   * Waar de lijst zichtbaar mag zijn: het scherm, ingeperkt door elke voorouder
   * die zijn inhoud afknipt of scrolt (het paneel van de pop-up).
   */
  function zichtbaarVlak(el) {
    var boven = 0;
    var onder = window.innerHeight || document.documentElement.clientHeight;
    for (var p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      var o = window.getComputedStyle(p).overflowY;
      if (o === 'auto' || o === 'scroll' || o === 'hidden' || o === 'clip') {
        var r = p.getBoundingClientRect();
        if (r.top > boven) boven = r.top;
        if (r.bottom < onder) onder = r.bottom;
      }
    }
    return { boven: boven, onder: onder };
  }

  /**
   * Past de lijst niet onder het veld, en is er boven meer plaats, dan opent
   * ze naar boven. Anders kreeg het paneel van de pop-up een schuifbalk en
   * stond de helft van de lijst buiten beeld.
   */
  function plaats(invoer, ul) {
    ul.classList.remove('mymmo-form-suggesties--boven');
    ul.style.maxHeight = '';
    var vlak = zichtbaarVlak(invoer);
    var r = invoer.getBoundingClientRect();
    var onder = vlak.onder - r.bottom - 12;
    var boven = r.top - vlak.boven - 12;
    var nodig = Math.min(ul.scrollHeight, 260);
    var ruimte = onder;
    if (nodig > onder && boven > onder) {
      ul.classList.add('mymmo-form-suggesties--boven');
      ruimte = boven;
    }
    ul.style.maxHeight = Math.max(96, Math.min(260, ruimte)) + 'px';
  }

  /** Het vak voor het huisnummer: het tekstveld vlak na de straat, als dat er is. */
  function nummerVeld(invoer) {
    var veld = invoer.closest ? invoer.closest('.mymmo-form-field') : null;
    var volgende = veld ? veld.nextElementSibling : null;
    while (volgende && !volgende.classList.contains('mymmo-form-field')) volgende = volgende.nextElementSibling;
    if (!volgende || !volgende.classList.contains('mymmo-form-field--text')) return null;
    var nr = volgende.querySelector('input[type="text"]');
    return nr && !nr.disabled ? nr : null;
  }

  /**
   * Staat er een huisnummer achter de straat (een browser vult "Kerkstraat 12"
   * in als adresregel, of de bezoeker typte het erbij) en is er een eigen vak
   * voor het nummer, dan verhuist het daarheen. Alleen iets dat op een
   * huisnummer lijkt ("12", "12-16", "12A", "12 bus 3"): "Rue du 9 Novembre"
   * blijft heel.
   */
  function splitsNummer(invoer) {
    var d = delen(invoer.value);
    if (!d.straat || !d.rest) return;
    if (!/^\d+[a-z]?(\s*[-\/]\s*\d+[a-z]?)*(\s*(bus|bte|boite|boîte|b)\.?\s*\w+)?$/i.test(d.rest.trim())) return;
    var nr = nummerVeld(invoer);
    if (!nr) return;
    var huidig = String(nr.value || '').trim();
    if (huidig !== '' && huidig !== d.rest.trim()) return;
    invoer.value = d.straat.trim();
    if (huidig === '') {
      nr.value = d.rest.trim();
      nr.dispatchEvent(new Event('input', { bubbles: true }));
      nr.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }

  function kies(invoer, li) {
    invoer.value = li.textContent + ' ';
    sluit(invoer);
    invoer.focus();
    try { invoer.setSelectionRange(invoer.value.length, invoer.value.length); } catch (e) { /* oude browser */ }
    invoer.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function actief(invoer, stap) {
    var ul = lijstVan(invoer);
    if (!ul || ul.hidden) return null;
    var items = ul.querySelectorAll('li');
    if (!items.length) return null;
    var nu = -1;
    for (var i = 0; i < items.length; i += 1) if (items[i].getAttribute('aria-selected') === 'true') nu = i;
    if (!stap) return nu === -1 ? null : items[nu];
    var nieuw = (nu + stap + items.length) % items.length;
    if (nu === -1 && stap < 0) nieuw = items.length - 1;
    for (var k = 0; k < items.length; k += 1) items[k].setAttribute('aria-selected', k === nieuw ? 'true' : 'false');
    invoer.setAttribute('aria-activedescendant', items[nieuw].id);
    return items[nieuw];
  }

  function isStraat(el) {
    return el && el.matches && el.matches('input[data-mymmo-straat-van]');
  }

  function ververs(invoer) {
    laad(invoer).then(function (straten) {
      if (document.activeElement !== invoer) return;
      if (straten && straten.length) toon(invoer, straten); else sluit(invoer);
    });
  }

  document.addEventListener('input', function (e) {
    if (!isStraat(e.target) || e.isTrusted === false) return;
    // Automatisch invullen door de browser komt zonder inputType binnen.
    if (!e.inputType || e.inputType === 'insertReplacementText') splitsNummer(e.target);
    ververs(e.target);
  });
  document.addEventListener('change', function (e) {
    if (isStraat(e.target)) splitsNummer(e.target);
  });
  document.addEventListener('focusin', function (e) {
    if (isStraat(e.target)) ververs(e.target);
  });
  document.addEventListener('focusout', function (e) {
    if (!isStraat(e.target)) return;
    var invoer = e.target;
    // Na een klik in de lijst: die komt eerst (mousedown voorkomt het verlaten).
    setTimeout(function () { if (document.activeElement !== invoer) sluit(invoer); }, 150);
  });
  document.addEventListener('keydown', function (e) {
    if (!isStraat(e.target)) return;
    var invoer = e.target;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (actief(invoer, e.key === 'ArrowDown' ? 1 : -1)) e.preventDefault();
    } else if (e.key === 'Enter') {
      var li = actief(invoer, 0);
      if (li) { e.preventDefault(); kies(invoer, li); }
    } else if (e.key === 'Escape') {
      var ul = lijstVan(invoer);
      if (ul && !ul.hidden) { e.preventDefault(); sluit(invoer); }
    }
  });
  document.addEventListener('mousedown', function (e) {
    var li = e.target && e.target.closest ? e.target.closest('.mymmo-form-suggestie') : null;
    if (!li) return;
    var ul = li.parentNode;
    var invoer = ul && ul.id ? document.querySelector('[aria-controls="' + ul.id + '"]') : null;
    if (!invoer) return;
    e.preventDefault();
    kies(invoer, li);
  });
})();
