/**
 * Mymmo Forms — postcode herkennen en de gemeente invullen.
 *
 * Een postcodeveld (data-mymmo-postcode="BE") wordt bij elke toetsaanslag
 * opgezocht in de postcodelijst van de plugin (assets/data/postcodes-be.json,
 * gemaakt door build-mymmo-forms.sh uit de lijst van de OM -- een kopie, nooit
 * met de hand bijgehouden). Is de postcode gekend, dan wordt het gemeenteveld
 * eronder ingevuld; heeft ze meerdere plaatsen, dan kiest de bezoeker uit een
 * lijst, met "Andere plaats…" als uitweg naar vrij typen.
 *
 * Wat dit script NIET is: de controle. Die doet de Worker bij elke inzending
 * (validateSubmissionValues() in forms/schema.js), ook voor wie geen
 * JavaScript heeft. Lukt het hier niet (lijst niet geladen, oude browser),
 * dan blokkeren we niets: falen naar "laat door", de server beslist.
 *
 * De melding bij een foute postcode gaat via setCustomValidity(); die toont
 * mymmo-forms.js op hetzelfde moment en op dezelfde plek als elke andere
 * melding (bij het versturen). De teksten komen uit MESSAGES in de OM, via
 * data-mymmo-messages op het formulier.
 *
 * LANDEN spiegelt POSTCODE_LANDEN in
 * src/modules/forminator-sync-v2/forms/postcodes.js. Wijzig ze samen.
 */
(function () {
  'use strict';

  var LANDEN = {
    BE: {
      patroon: /^[1-9]\d{3}$/,
      sleutel: function (v) { return v; },
      formaat: function (v) { return v; }
    },
    NL: {
      patroon: /^[1-9]\d{3}(?!SA|SD|SS)[A-Z]{2}$/,
      sleutel: function (v) { return v.slice(0, 4); },
      formaat: function (v) { return v.slice(0, 4) + ' ' + v.slice(4); }
    }
  };

  var NOOD = {
    postcode: '{label} is geen geldige postcode.',
    postcode_unknown: 'We kennen postcode {value} niet. Kijk ze even na.',
    city_other: 'Andere plaats…',
    choose: 'Maak een keuze'
  };

  var ANDERS = '__anders__';
  var lijsten = {};

  function laadLijst(url) {
    if (!url || typeof window.fetch !== 'function') return Promise.resolve(null);
    if (!lijsten[url]) {
      lijsten[url] = window.fetch(url, { credentials: 'omit' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .catch(function () { return null; });
    }
    return lijsten[url];
  }

  /** "b-9000 " -> 9000, "nl 1011ab" -> 1011 AB. null als de vorm niet klopt. */
  function normaliseer(land, ruw) {
    var spec = LANDEN[land] || LANDEN.BE;
    var s = String(ruw || '').toUpperCase().trim();
    s = s.replace(/^(?:BE|NL|B)(?=[\s\-–.]*\d)[\s\-–.]*/, '').replace(/[\s.]+/g, '');
    if (!spec.patroon.test(s)) return null;
    return { waarde: spec.formaat(s), sleutel: spec.sleutel(s) };
  }

  /** Een plaats is een naam, of {nl, fr} waar ze officieel tweetalig is. */
  function plaatsNaam(p, lang) {
    if (typeof p === 'string') return p;
    if (!p || typeof p !== 'object') return '';
    if (lang && p[lang]) return p[lang];
    for (var k in p) {
      if (Object.prototype.hasOwnProperty.call(p, k) && p[k]) return String(p[k]);
    }
    return '';
  }

  function teksten(form) {
    try {
      var ruw = form && form.getAttribute('data-mymmo-messages');
      var t = ruw ? JSON.parse(ruw) : null;
      return (t && typeof t === 'object') ? t : NOOD;
    } catch (_) {
      return NOOD;
    }
  }

  function tekst(t, sleutel, vars) {
    var sjabloon = (t && t[sleutel]) || NOOD[sleutel] || '';
    return String(sjabloon).replace(/\{(\w+)\}/g, function (heel, naam) {
      return Object.prototype.hasOwnProperty.call(vars || {}, naam) ? String(vars[naam]) : heel;
    });
  }

  function taalVan(el) {
    var w = el.closest ? el.closest('[lang]') : null;
    return w ? String(w.getAttribute('lang') || '').slice(0, 2).toLowerCase() : '';
  }

  function labelVan(el) {
    var wikkel = el.closest ? el.closest('.mymmo-form-field') : null;
    return (wikkel && wikkel.getAttribute('data-mymmo-label')) || el.name || '';
  }

  /** De zichtbare melding wissen (zelfde als wisFout() in mymmo-forms.js). */
  function wisMelding(el) {
    var wikkel = el.closest ? el.closest('.mymmo-form-field') : null;
    var doel = wikkel && wikkel.querySelector('[data-mymmo-error]');
    if (doel && el.getAttribute('aria-invalid') === 'true') {
      doel.textContent = '';
      doel.hidden = true;
      el.removeAttribute('aria-invalid');
    }
  }

  // ── Het gemeenteveld ──────────────────────────────────────────────────────

  /** De gemeentevelden die bij dit postcodeveld horen (data-mymmo-gemeente-van). */
  function gemeentevelden(pc) {
    var form = pc.form;
    if (!form || !pc.name) return [];
    var uit = [];
    var alle = form.querySelectorAll('[data-mymmo-gemeente-van]');
    for (var i = 0; i < alle.length; i += 1) {
      if (alle[i].getAttribute('data-mymmo-gemeente-van') === pc.name) uit.push(alle[i]);
    }
    return uit;
  }

  function keuzeVan(invoer) {
    var wikkel = invoer.closest('.mymmo-form-field');
    return wikkel ? wikkel.querySelector('[data-mymmo-gemeente-keuze]') : null;
  }

  function labelElement(invoer) {
    var wikkel = invoer.closest('.mymmo-form-field');
    return wikkel ? wikkel.querySelector('label.mymmo-form-label') : null;
  }

  /**
   * EEN van de twee is actief: het tekstvak of de keuzelijst. Alleen het
   * actieve heeft een name (dus er gaat EEN waarde mee), is ingeschakeld (dus
   * mymmo-forms.js kijkt het na) en is waar het label naar wijst.
   */
  function toonTekstvak(invoer, keuze) {
    var naam = invoer.getAttribute('data-mymmo-naam') || invoer.name;
    invoer.setAttribute('data-mymmo-naam', naam);
    invoer.name = naam;
    invoer.disabled = false;
    invoer.hidden = false;
    if (keuze) {
      keuze.removeAttribute('name');
      keuze.disabled = true;
      keuze.hidden = true;
    }
    var label = labelElement(invoer);
    if (label) label.htmlFor = invoer.id;
  }

  function toonKeuzelijst(invoer, keuze) {
    var naam = invoer.getAttribute('data-mymmo-naam') || invoer.name;
    invoer.setAttribute('data-mymmo-naam', naam);
    keuze.name = naam;
    keuze.disabled = false;
    keuze.hidden = false;
    if (invoer.required) {
      keuze.required = true;
      keuze.setAttribute('aria-required', 'true');
    }
    invoer.removeAttribute('name');
    invoer.disabled = true;
    invoer.hidden = true;
    var label = labelElement(invoer);
    if (label) label.htmlFor = keuze.id;
  }

  /**
   * De plaatsen van een postcode in het gemeenteveld zetten.
   *
   * Wat de bezoeker ZELF typte, blijft staan: we vullen enkel een leeg veld,
   * of een veld dat we eerder zelf vulden (data-mymmo-auto). Anders verandert
   * zijn eigen invoer onder zijn handen als hij de postcode nog eens aanraakt.
   */
  function zetGemeente(invoer, plaatsen, t) {
    var keuze = keuzeVan(invoer);
    var auto = invoer.getAttribute('data-mymmo-auto') === '1';
    var huidig = keuze && !keuze.hidden && keuze.value && keuze.value !== ANDERS
      ? keuze.value
      : invoer.value.trim();

    // Onbekend of leeg: terug naar het tekstvak, en wat we zelf invulden weg.
    if (!plaatsen || !plaatsen.length) {
      toonTekstvak(invoer, keuze);
      if (auto) {
        invoer.value = '';
        invoer.removeAttribute('data-mymmo-auto');
      }
      return;
    }

    // De bezoeker koos "Andere plaats" voor deze postcode: niet terugdraaien.
    var sleutel = plaatsen.join('|');
    if (invoer.getAttribute('data-mymmo-vrij') === sleutel) return;
    invoer.removeAttribute('data-mymmo-vrij');

    if (plaatsen.length === 1 || !keuze) {
      toonTekstvak(invoer, keuze);
      if (!huidig || auto) {
        invoer.value = plaatsen[0];
        invoer.setAttribute('data-mymmo-auto', '1');
      }
      return;
    }

    // Meerdere plaatsen: een keuzelijst, met de huidige waarde voorgekozen als
    // die erin staat. Anders bewust GEEN voorkeuze -- de hoofdplaats aanvinken
    // voor iemand uit Hekelgem is een fout die hij niet ziet.
    var gekozen = '';
    for (var g = 0; g < plaatsen.length; g += 1) {
      if (huidig && plaatsen[g].toLowerCase() === huidig.toLowerCase()) gekozen = plaatsen[g];
    }
    // Zelf getypt en niet in de lijst: dat is zijn antwoord, niet wegvegen.
    if (huidig && !auto && !gekozen) {
      invoer.setAttribute('data-mymmo-vrij', sleutel);
      toonTekstvak(invoer, keuze);
      return;
    }

    keuze.textContent = '';
    var leeg = document.createElement('option');
    leeg.value = '';
    leeg.textContent = tekst(t, 'choose');
    keuze.appendChild(leeg);
    for (var i = 0; i < plaatsen.length; i += 1) {
      var o = document.createElement('option');
      o.value = plaatsen[i];
      o.textContent = plaatsen[i];
      keuze.appendChild(o);
    }
    var anders = document.createElement('option');
    anders.value = ANDERS;
    anders.textContent = tekst(t, 'city_other');
    keuze.appendChild(anders);
    keuze.value = gekozen;
    invoer.value = gekozen;
    // Wat uit de lijst komt, mag een andere postcode later vervangen.
    invoer.setAttribute('data-mymmo-auto', '1');
    toonKeuzelijst(invoer, keuze);
  }

  // ── Het postcodeveld ──────────────────────────────────────────────────────

  function verwerk(pc, bijVerlaten) {
    var land = pc.getAttribute('data-mymmo-postcode') || 'BE';
    var form = pc.form;
    var t = teksten(form);
    var lang = taalVan(pc);
    var ruw = pc.value;
    var velden = gemeentevelden(pc);

    // Elke invoer begint zonder melding; ze komt er (asynchroon) weer op als de
    // postcode niet klopt. Zo blijft er nooit een oude melding hangen.
    pc.setCustomValidity('');

    if (!ruw.trim()) {
      for (var i = 0; i < velden.length; i += 1) zetGemeente(velden[i], null, t);
      return;
    }

    var n = normaliseer(land, ruw);
    if (!n) {
      pc.setCustomValidity(tekst(t, 'postcode', { label: labelVan(pc) }));
      for (var j = 0; j < velden.length; j += 1) zetGemeente(velden[j], null, t);
      return;
    }

    laadLijst(pc.getAttribute('data-mymmo-postcode-lijst')).then(function (lijst) {
      if (pc.value !== ruw) return;   // intussen verder getypt
      if (!lijst || !lijst.p) return; // geen lijst: niets blokkeren, de server beslist

      var plaatsen = lijst.p[n.sleutel];
      if (!plaatsen) {
        pc.setCustomValidity(tekst(t, 'postcode_unknown', { label: labelVan(pc), value: ruw.trim() }));
        for (var k = 0; k < velden.length; k += 1) zetGemeente(velden[k], null, t);
        return;
      }

      wisMelding(pc);
      // Bij het verlaten de nette vorm zetten; tijdens het typen niet, anders
      // springt de cursor.
      if (bijVerlaten && pc.value !== n.waarde) pc.value = n.waarde;
      var namen = [];
      for (var m = 0; m < plaatsen.length; m += 1) {
        var naam = plaatsNaam(plaatsen[m], lang);
        if (naam && namen.indexOf(naam) === -1) namen.push(naam);
      }
      for (var v = 0; v < velden.length; v += 1) zetGemeente(velden[v], namen, t);
    });
  }

  function isPostcode(el) {
    return el && el.matches && el.matches('input[data-mymmo-postcode]');
  }

  document.addEventListener('input', function (e) {
    if (isPostcode(e.target)) {
      verwerk(e.target, false);
      return;
    }
    // Zelf iets typen in het gemeenteveld: vanaf nu is het van de bezoeker.
    if (e.target && e.target.matches && e.target.matches('input[data-mymmo-gemeente-van]')) {
      e.target.removeAttribute('data-mymmo-auto');
    }
  });

  document.addEventListener('focusout', function (e) {
    if (isPostcode(e.target)) verwerk(e.target, true);
  });

  // De lijst al ophalen zodra iemand in het veld klikt, zodat de gemeente er
  // staat op het moment dat het laatste cijfer getypt is.
  document.addEventListener('focusin', function (e) {
    if (isPostcode(e.target)) laadLijst(e.target.getAttribute('data-mymmo-postcode-lijst'));
  });

  document.addEventListener('change', function (e) {
    var keuze = e.target;
    if (!keuze || !keuze.matches || !keuze.matches('select[data-mymmo-gemeente-keuze]')) return;
    var wikkel = keuze.closest('.mymmo-form-field');
    var invoer = wikkel && wikkel.querySelector('input[data-mymmo-gemeente-van]');
    if (!invoer) return;

    if (keuze.value === ANDERS) {
      // Vrij typen voor DEZE postcode; een andere postcode zet de lijst terug.
      var sleutel = [];
      for (var i = 0; i < keuze.options.length; i += 1) {
        var w = keuze.options[i].value;
        if (w && w !== ANDERS) sleutel.push(w);
      }
      invoer.setAttribute('data-mymmo-vrij', sleutel.join('|'));
      invoer.removeAttribute('data-mymmo-auto');
      invoer.value = '';
      toonTekstvak(invoer, keuze);
      invoer.focus();
      return;
    }
    // Het tekstvak volgt mee. Een keuze UIT DE LIJST blijft "van ons": tikt de
    // bezoeker daarna een andere postcode, dan volgt de gemeente mee.
    invoer.value = keuze.value;
    invoer.setAttribute('data-mymmo-auto', '1');
  });

  // Na een mislukte inzending of met een postcode uit de link staat er al een
  // waarde: meteen de gemeente erbij zoeken (zonder iets te overschrijven).
  function start() {
    var alle = document.querySelectorAll('input[data-mymmo-postcode]');
    for (var i = 0; i < alle.length; i += 1) {
      if (alle[i].value.trim()) verwerk(alle[i], true);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
}());
