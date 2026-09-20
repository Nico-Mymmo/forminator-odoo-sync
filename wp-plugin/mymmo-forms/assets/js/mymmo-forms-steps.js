/**
 * Mymmo Forms — de stappenreeks.
 *
 * Anders dan mymmo-forms.js is dit GEEN gemaksverbetering: zonder dit bestand
 * is er geen reeks. Daarom laat templates/steps.php met een <noscript><style>
 * de HTML-stappen weg en toont het meteen het echte formulier. Wie hier iets
 * wijzigt, houdt die terugval in de gaten.
 *
 * WAT DIT DOET
 * ------------
 * Een stap is een brok HTML uit wp-admin dat een of enkele WAARDEN verzamelt.
 * Die waarden gaan naar de VERBORGEN VELDEN van het formulier uit de Operations
 * Manager, dat de laatste stap van de reeks is. Bij het versturen gaan ze dus
 * mee in dezelfde POST als de zichtbare vragen — er is geen tweede verzendpad
 * en geen tussenopslag.
 *
 * DE WAARDE STAAT METEEN IN HET VERBORGEN VELD, niet pas bij het versturen.
 * Eén bron van waarheid, en dat is de DOM. Zou dit een JavaScript-object
 * bijhouden dat op het einde weggeschreven wordt, dan bestaat er een moment
 * waarop die twee uit elkaar kunnen lopen — en dat merk je niet op het scherm,
 * alleen in Odoo, als een leeg veld.
 *
 * TWEE MANIEREN OM EEN WAARDE AF TE LEVEREN
 * -----------------------------------------
 *   1. Zonder een regel JavaScript: zet `data-mymmo-waarde="sleutel"` op een
 *      input, select of textarea in je stap. De reeks leest hem mee.
 *   2. Met JavaScript, voor een stap die iets anders is dan een invoerveld:
 *
 *        MymmoStappen.stap(document.currentScript, function (api) {
 *          api.zet('aantal_gebouwen', 12);
 *          api.geldig(true);
 *        });
 *
 *      `document.currentScript` wijst naar het <script> dat op dat moment
 *      draait; daaruit weet de reeks bij welke stap je hoort. Dat is nodig
 *      omdat dezelfde stap twee keer op een pagina kan staan (in de tekst en in
 *      een pop-up) en de twee dan niet elkaars waarden mogen overschrijven.
 *
 * Het script van een stap draait tijdens het PARSEN van de pagina, dus voordat
 * dit bestand geladen is. Daarom zet templates/steps.php een klein stukje
 * inline dat de aanmeldingen in een rij bewaart; hieronder wordt die rij
 * afgewerkt.
 *
 * EEN STAP DIE IN DE PAGINA STAAT (de callout)
 * --------------------------------------------
 * Een callout toont de EERSTE stap al in de pagina, in een kaartje met wat
 * flavortekst eromheen. Vult de bezoeker daar iets in en klikt hij de knop, dan
 * gaat het venster open met die vraag al ingevuld.
 *
 * Dat gebeurt door de stap te VERPLAATSEN, niet door zijn waarde te kopieren.
 * Er is dus maar EEN exemplaar van die stap in de pagina: hetzelfde element
 * verhuist van het kaartje naar het venster en terug. Een tweede exemplaar zou
 * betekenen dat de waarde over te dragen valt, maar de STAND van de bediening
 * niet -- een schuifbalk kan je nog kopieren, maar een vinkje dat een stap in
 * zijn eigen script bijhoudt niet. Dan staat er in het venster "nee" terwijl de
 * bezoeker in de pagina "ja" aanklikte, en dat is precies de stille fout waar
 * deze plugin het nergens op laat aankomen.
 *
 * De wikkel met `data-mymmo-stappen` staat bij een callout dus OM het kaartje
 * EN om het venster heen. Alles hieronder werkt daardoor ongewijzigd: het
 * verborgen veld waar de stap in schrijft staat gewoon in dezelfde wikkel.
 *
 *   data-mymmo-dok       het kaartje in de pagina waar de stap woont
 *   data-mymmo-thuis     de plek in het venster waar hij hoort als het openstaat
 *   data-mymmo-dok-stap  welke stap dat is (altijd 0)
 */

(function () {
  'use strict';

  var NOOD = { back: 'Vorige', next: 'Volgende', step_of: 'Stap {n} van {total}' };

  window.MymmoStappen = window.MymmoStappen || { _rij: [], stap: function (s, f) { this._rij.push([s, f]); } };

  /** De reeksen die al gebouwd zijn, zodat een stap zijn eigen reeks terugvindt. */
  var reeksen = [];

  /**
   * Alleen wat bij DEZE reeks hoort.
   *
   * Een venster kan een tweede reeks bevatten (een derde tabblad met eigen
   * stappen), en bij een callout ligt de wikkel OM het venster heen -- dan zou
   * een gewone querySelectorAll de stappen van die tweede reeks meenemen en zou
   * deze reeks stappen tonen die niet van haar zijn.
   */
  function eigenLijst(wikkel, selector) {
    return [].slice.call(wikkel.querySelectorAll(selector)).filter(function (el) {
      return !el.closest || el.closest('[data-mymmo-stappen]') === wikkel;
    });
  }

  function eigen(wikkel, selector) {
    var lijst = eigenLijst(wikkel, selector);
    return lijst.length ? lijst[0] : null;
  }

  function teksten(wikkel) {
    try {
      var ruw = wikkel.getAttribute('data-mymmo-teksten');
      var uit = ruw ? JSON.parse(ruw) : null;
      if (!uit || typeof uit !== 'object') return NOOD;
      var k;
      for (k in NOOD) {
        if (!uit[k]) uit[k] = NOOD[k];
      }
      return uit;
    } catch (_) {
      return NOOD;
    }
  }

  function vul(sjabloon, vars) {
    return String(sjabloon || '').replace(/\{(\w+)\}/g, function (heel, naam) {
      return Object.prototype.hasOwnProperty.call(vars, naam) ? String(vars[naam]) : heel;
    });
  }

  /**
   * De waarde van een invoerelement als string.
   *
   * Een vinkje levert '1' of '' en niet 'on'/'off': dat is wat de Operations
   * Manager van een boolean verwacht (coerceFieldValue), en het is ook wat een
   * gewoon <input type="checkbox"> in dit formulier meestuurt.
   */
  function waardeVan(el) {
    if (el.type === 'checkbox') return el.checked ? (el.value && el.value !== 'on' ? el.value : '1') : '';
    if (el.type === 'radio') return el.checked ? el.value : null;
    return el.value;
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Eén reeks
  // ───────────────────────────────────────────────────────────────────────────

  function Reeks(wikkel) {
    this.wikkel = wikkel;
    this.t = teksten(wikkel);
    // Op NUMMER, niet op de volgorde in het document. Bij een callout staat het
    // uitgelichte onderdeel in het kaartje, en dat kaartje komt vóór het venster
    // -- licht je het FORMULIER uit (de laatste stap), dan staat dat dus als
    // eerste in de DOM. Zonder deze sortering schuift elke index een plaats op
    // en dokt de reeks de verkeerde sectie: je ziet het formulier met de laatste
    // vraag eronder, en dat leest als een fout in het formulier zelf.
    this.stappen = eigenLijst(wikkel, '[data-mymmo-stap]').sort(function (a, b) {
      return (parseInt(a.getAttribute('data-mymmo-stap'), 10) || 0)
        - (parseInt(b.getAttribute('data-mymmo-stap'), 10) || 0);
    });
    this.bollen = eigenLijst(wikkel, '[data-mymmo-bol]');
    this.teller = eigen(wikkel, '[data-mymmo-teller]');
    // HET FORMULIER VAN DEZE REEKS, niet het eerste dat we tegenkomen.
    //
    // Bij een callout ligt de wikkel om het hele venster heen, en dat kan
    // meerdere formulieren bevatten -- een tabblad "Stuur een bericht" naast
    // het tabblad met de stappen. Het eerste pakken betekende dan dat een stap
    // zijn waarde in het verkeerde formulier schreef, waar die verborgen velden
    // niet bestaan: geen foutmelding, gewoon niets in Odoo.
    //
    // De naakte reeks merkt daarom haar eigen inhoud (templates/steps.php).
    // Staat dat merkteken er niet, dan is dit een gewone reeks en is de wikkel
    // zelf de grens.
    var binnen = eigen(wikkel, '[data-mymmo-stappen-inhoud]');
    this.formulier = binnen ? binnen.querySelector('.mymmo-form') : eigen(wikkel, '.mymmo-form');
    this.nu = parseInt(wikkel.getAttribute('data-mymmo-start'), 10) || 0;
    // Per stap-index: is de stap geldig verklaard door zijn eigen script?
    // `null` betekent "niets gezegd", en dan telt de veldencontrole.
    this.gezegd = {};
    this.haken = {};
    this.zwevend = {};
    // Waarden waarvoor geen verborgen veld bestaat. Ze gaan niet mee in de
    // POST -- dat kan ook niet -- maar ze worden wél onthouden. Zie zet().
    this.los = {};

    // De stap die in de pagina staat (een callout). Zonder dok is dit alles
    // niets: dokIndex blijft -1 en plaats() doet nooit iets.
    this.dok = eigen(wikkel, '[data-mymmo-dok]');
    this.anker = eigen(wikkel, '[data-mymmo-thuis]');
    this.dokIndex = this.dok && this.anker
      ? (parseInt(wikkel.getAttribute('data-mymmo-dok-stap'), 10) || 0)
      : -1;
    this.vensterOpen = false;

    this.koppelKnoppen();
    this.koppelVelden();
    this.koppelVenster();
    this.toon(this.nu, true);
  }

  /**
   * Meeluisteren of het venster in deze wikkel open- of dichtgaat.
   *
   * De gebeurtenis komt uit mymmo-forms-modal.js en borrelt op tot hier. Een
   * gebeurtenis en geen rechtstreekse aanroep: dat bestand hoort niets van
   * stappen te weten, en dit bestand niets van vensters.
   */
  Reeks.prototype.koppelVenster = function () {
    if (this.dokIndex < 0) return;
    var zelf = this;

    this.wikkel.addEventListener('mymmo:venster', function (e) {
      var open = !!(e.detail && e.detail.open);
      if (open === zelf.vensterOpen) return;
      zelf.vensterOpen = open;
      zelf.plaats();
      // De stap komt (opnieuw) in beeld in het venster: dat is precies wat
      // 'tonen' betekent. Zonder dit mist een stap die op dat moment iets meet
      // of een beweging maakt zijn enige aanknopingspunt -- toon() draait hier
      // niet, want het nummer van de stap verandert niet.
      if (open && zelf.nu === zelf.dokIndex) zelf.roep(zelf.nu, 'tonen');
    });
  };

  /**
   * De gedokte stap op zijn plaats zetten.
   *
   * Hij staat IN HET VENSTER zolang het venster openstaat en hij de stap is die
   * aan de beurt is; in alle andere gevallen staat hij in het kaartje in de
   * pagina -- en daar is hij altijd zichtbaar, ook als de bezoeker in het
   * venster al twee vragen verder is. Een leeg kaartje op de pagina leest als
   * een fout, en de bezoeker ziet het toch pas als hij het venster sluit.
   */
  Reeks.prototype.plaats = function () {
    if (this.dokIndex < 0) return;

    var stap = this.stappen[this.dokIndex];
    if (!stap) return;

    if (this.vensterOpen && this.nu === this.dokIndex) {
      if (stap.nextSibling !== this.anker) {
        this.anker.parentNode.insertBefore(stap, this.anker);
      }
    } else if (stap.parentNode !== this.dok) {
      this.dok.appendChild(stap);
    }

    stap.hidden = false;
  };

  Reeks.prototype.stapEl = function (i) {
    return this.stappen[i] || null;
  };

  Reeks.prototype.koppelKnoppen = function () {
    var zelf = this;

    this.wikkel.addEventListener('click', function (e) {
      var verder = e.target.closest ? e.target.closest('[data-mymmo-volgende]') : null;
      if (verder && zelf.wikkel.contains(verder)) {
        e.preventDefault();
        zelf.volgende();
        return;
      }
      var terug = e.target.closest ? e.target.closest('[data-mymmo-vorige]') : null;
      if (terug && zelf.wikkel.contains(terug)) {
        e.preventDefault();
        zelf.vorige();
      }
    });

    // Enter in een stap betekent "volgende", niet "niets". Zonder dit voelt een
    // stap met één invoerveld kapot: je typt, drukt Enter, en er gebeurt niets.
    // Alleen buiten een textarea, waar Enter een nieuwe regel is.
    this.wikkel.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' || e.shiftKey) return;
      var stap = zelf.stapEl(zelf.nu);
      if (!stap || stap.classList.contains('mymmo-stap--formulier')) return;
      var doel = e.target;
      if (doel && (doel.tagName === 'TEXTAREA' || doel.tagName === 'BUTTON' || doel.tagName === 'A')) return;
      if (!stap.contains(doel)) return;
      e.preventDefault();
      zelf.volgende();
    });
  };

  /**
   * Alles met `data-mymmo-waarde` meelezen.
   *
   * Op input én change: een schuifbalk vuurt input tijdens het slepen, een
   * keuzelijst alleen change. Beide afvangen kost niets en scheelt de auteur
   * van een stap een verrassing.
   */
  Reeks.prototype.koppelVelden = function () {
    var zelf = this;

    function oogst(e) {
      var el = e.target;
      if (!el || !el.getAttribute) return;
      var sleutel = el.getAttribute('data-mymmo-waarde');
      if (!sleutel) return;
      var w = waardeVan(el);
      if (w === null) return;
      zelf.zet(sleutel, w);
      zelf.hertekenNav();
    }

    this.wikkel.addEventListener('input', oogst);
    this.wikkel.addEventListener('change', oogst);
  };

  /** De waarden die een stap bij het laden al in zijn HTML had. */
  Reeks.prototype.oogstStap = function (i) {
    var stap = this.stapEl(i);
    if (!stap) return;
    var velden = stap.querySelectorAll('[data-mymmo-waarde]');
    for (var n = 0; n < velden.length; n += 1) {
      var w = waardeVan(velden[n]);
      if (w === null) continue;
      this.zet(velden[n].getAttribute('data-mymmo-waarde'), w);
    }
  };

  /**
   * Een waarde afleveren in het verborgen veld met deze naam.
   *
   * Het zoeken gebeurt binnen het VELDENRASTER van het formulier en niet in het
   * hele <form>: daar staan ook de verborgen velden van WordPress zelf (action,
   * _wpnonce, de redirect). Een stap die per ongeluk 'action' als sleutel
   * gebruikt, zou anders de POST onbruikbaar maken.
   */
  Reeks.prototype.zet = function (sleutel, waarde) {
    if (!sleutel) return;
    var doel = this.formulier
      ? this.formulier.querySelector('.mymmo-form-grid input[type="hidden"][name="' + CSS.escape(sleutel) + '"]')
      : null;

    if (!doel) {
      if (!this.zwevend[sleutel]) {
        this.zwevend[sleutel] = true;
        // Eén keer melden. Dit is de stille fout waar het om gaat: de stap doet
        // zijn werk, het formulier verstuurt, en in Odoo staat er niets.
        if (window.console && console.warn) {
          console.warn('[Mymmo Forms] Geen verborgen veld "' + sleutel + '" in dit formulier — die waarde gaat nergens heen.');
        }
      }
      // Toch onthouden. Zonder dit blijft lees() eeuwig leeg, blijft de stap
      // dus eeuwig "niet klaar", en staat een BEZOEKER vast op een scherm
      // waarvan "Volgende" nooit aangaat — voor een fout die hij niet kan zien
      // en die niet de zijne is. Een ontbrekend verborgen veld hoort een
      // beheerdersprobleem te zijn, geen doodlopende straat. Wat er misgaat
      // (de waarde bereikt Odoo niet) staat boven het formulier en in de
      // console.
      this.los[sleutel] = waarde == null ? '' : String(waarde);
      return;
    }

    doel.value = waarde == null ? '' : String(waarde);
  };

  Reeks.prototype.lees = function (sleutel) {
    var doel = this.formulier
      ? this.formulier.querySelector('.mymmo-form-grid input[type="hidden"][name="' + CSS.escape(sleutel) + '"]')
      : null;
    if (doel) return doel.value;
    return Object.prototype.hasOwnProperty.call(this.los, sleutel) ? this.los[sleutel] : '';
  };

  /** Heeft deze stap alles wat hij beloofde af te leveren? */
  Reeks.prototype.klaar = function (i) {
    if (this.gezegd[i] === true) return true;
    if (this.gezegd[i] === false) return false;

    var stap = this.stapEl(i);
    if (!stap) return true;

    var ruw = stap.getAttribute('data-mymmo-stap-velden') || '';
    var sleutels = ruw.split(',').filter(Boolean);

    for (var n = 0; n < sleutels.length; n += 1) {
      if (String(this.lees(sleutels[n])).trim() === '') return false;
    }
    return true;
  };

  Reeks.prototype.hertekenNav = function () {
    var stap = this.stapEl(this.nu);
    if (!stap) return;
    var knop = stap.querySelector('[data-mymmo-volgende]');
    if (!knop) return;

    var mag = this.klaar(this.nu);
    // aria-disabled en een klasse in plaats van `disabled`: een uitgeschakelde
    // knop is voor een schermlezer niet aan te wijzen en vertelt dus nooit
    // waarom je niet verder kan. Zo blijft hij bereikbaar en meldt de klik het.
    knop.setAttribute('aria-disabled', mag ? 'false' : 'true');
    knop.classList.toggle('is-uit', !mag);
  };

  Reeks.prototype.volgende = function () {
    if (!this.klaar(this.nu)) {
      var stap = this.stapEl(this.nu);
      if (stap) {
        stap.classList.add('mymmo-stap--wacht');
        window.setTimeout(function () { stap.classList.remove('mymmo-stap--wacht'); }, 600);
        var eerste = stap.querySelector('[data-mymmo-waarde]');
        if (eerste && eerste.focus) eerste.focus();
      }
      return;
    }
    this.toon(this.nu + 1);
  };

  Reeks.prototype.vorige = function () {
    this.toon(this.nu - 1);
  };

  Reeks.prototype.toon = function (i, eerste) {
    if (i < 0 || i >= this.stappen.length) return;

    var vorig = this.nu;
    if (!eerste && vorig !== i) this.roep(vorig, 'verlaten');

    for (var n = 0; n < this.stappen.length; n += 1) {
      this.stappen[n].hidden = (n !== i);
    }
    this.nu = i;
    // Na het verbergen, want plaats() bepaalt voor de gedokte stap zelf of hij
    // zichtbaar is -- in het kaartje is hij dat altijd.
    this.plaats();

    for (var b = 0; b < this.bollen.length; b += 1) {
      this.bollen[b].classList.toggle('is-actief', b === i);
      this.bollen[b].classList.toggle('is-gedaan', b < i);
    }

    if (this.teller) {
      this.teller.textContent = vul(this.t.step_of, { n: i + 1, total: this.stappen.length });
    }

    this.oogstStap(i);
    this.hertekenNav();
    this.roep(i, 'tonen');

    if (eerste) return;

    // Naar boven van de reeks, niet naar het midden van de nieuwe stap: de
    // voortgangsbolletjes staan bovenaan en zijn precies wat je wil zien als er
    // net iets veranderde.
    //
    // In een venster ligt het scrollgebied niet in de pagina maar in het
    // paneel zelf. scrollIntoView() op de wikkel zou daar de PAGINA ONDER het
    // venster laten verspringen (de wikkel is bij een callout de hele
    // pagina-plaatsing EN het venster) -- vandaar scrollVensterNaarBoven(), die
    // het echte scrollgebied zoekt en dat teruglegt op 0.
    if (this.vensterOpen) {
      this.scrollVensterNaarBoven();
    } else {
      var rect = this.wikkel.getBoundingClientRect();
      if (rect.top < 0 || rect.top > window.innerHeight * 0.5) {
        this.wikkel.scrollIntoView({ block: 'start', behavior: 'smooth' });
      }
    }

    // De focus mee, anders staat een toetsenbordgebruiker nog op de knop van
    // een stap die niet meer op het scherm staat.
    var doel = this.stapEl(i);
    if (doel) {
      if (!doel.hasAttribute('tabindex')) doel.setAttribute('tabindex', '-1');
      doel.focus({ preventScroll: true });
    }
  };

  /**
   * Het scrollgebied van het VENSTER terug naar boven, niet dat van de pagina.
   *
   * Met tabbladen scrolt `.mymmo-modal-paneel` zelf (het ligt dan
   * position:absolute met overflow-y:auto); zonder tabbladen scrolt
   * `.mymmo-modal-body` erboven. In plaats van een van die twee klassen hard
   * te noemen, wordt hier gewoon de eerste ECHTE scrollende voorouder gezocht
   * -- zo blijft dit werken als die indeling ooit verandert.
   */
  Reeks.prototype.scrollVensterNaarBoven = function () {
    var el = this.wikkel.parentElement;
    while (el) {
      if (el.scrollHeight > el.clientHeight + 1) {
        var overflowY = window.getComputedStyle(el).overflowY;
        if (overflowY === 'auto' || overflowY === 'scroll') {
          el.scrollTop = 0;
          return;
        }
      }
      if (el.classList && el.classList.contains('mymmo-modal')) return;
      el = el.parentElement;
    }
  };

  Reeks.prototype.roep = function (i, naam) {
    var lijst = (this.haken[i] || {})[naam];
    if (!lijst) return;
    for (var n = 0; n < lijst.length; n += 1) {
      try {
        lijst[n]();
      } catch (fout) {
        // Een stap die in zijn eigen haak struikelt mag de reeks niet
        // meesleuren: de bezoeker zit dan vast op een scherm zonder knop.
        if (window.console && console.error) console.error('[Mymmo Forms] stap "' + naam + '":', fout);
      }
    }
  };

  // ───────────────────────────────────────────────────────────────────────────
  // Wat een stap-script te zien krijgt
  // ───────────────────────────────────────────────────────────────────────────

  function bouwApi(reeks, stap, index) {
    return {
      el: stap,
      reeks: reeks.wikkel,
      index: index,
      aantal: reeks.stappen.length,
      taal: reeks.wikkel.closest('[lang]') ? reeks.wikkel.closest('[lang]').getAttribute('lang') : '',
      teksten: reeks.t,

      zet: function (sleutel, waarde) {
        reeks.zet(sleutel, waarde);
        reeks.hertekenNav();
        return this;
      },
      zetAlles: function (obj) {
        var k;
        for (k in obj) {
          if (Object.prototype.hasOwnProperty.call(obj, k)) reeks.zet(k, obj[k]);
        }
        reeks.hertekenNav();
        return this;
      },
      lees: function (sleutel) {
        return reeks.lees(sleutel);
      },

      /**
       * Zelf beslissen of "Volgende" mag. Roep je dit nooit aan, dan telt de
       * veldenlijst van de stap — dat is het geval waarin je niets hoeft te
       * doen.
       */
      geldig: function (ja) {
        reeks.gezegd[index] = (ja !== false);
        reeks.hertekenNav();
        return this;
      },

      volgende: function () { reeks.volgende(); return this; },
      vorige: function () { reeks.vorige(); return this; },
      ga: function (n) { reeks.toon(n); return this; },

      /**
       * 'tonen'   — de stap komt in beeld. Hier meet je afmetingen: tot dat
       *             moment stond de stap op `hidden` en is alles nul breed.
       * 'verlaten'— de bezoeker gaat weg van deze stap.
       */
      bij: function (naam, fn) {
        if (typeof fn !== 'function') return this;
        reeks.haken[index] = reeks.haken[index] || {};
        reeks.haken[index][naam] = reeks.haken[index][naam] || [];
        reeks.haken[index][naam].push(fn);
        // Is de stap al zichtbaar op het moment dat je je aanmeldt, dan is
        // 'tonen' al gebeurd. Meteen uitvoeren, anders wacht een stap die als
        // eerste getoond wordt op een gebeurtenis die niet meer komt.
        if (naam === 'tonen' && reeks.nu === index) {
          try { fn(); } catch (fout) {
            if (window.console && console.error) console.error('[Mymmo Forms] stap "tonen":', fout);
          }
        }
        return this;
      },
    };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Opstarten
  // ───────────────────────────────────────────────────────────────────────────

  function reeksVan(el) {
    var wikkel = el.closest ? el.closest('[data-mymmo-stappen]') : null;
    for (var n = 0; n < reeksen.length; n += 1) {
      if (reeksen[n].wikkel === wikkel) return reeksen[n];
    }
    return null;
  }

  function meldAan(script, fn) {
    if (typeof fn !== 'function') return;
    // Geen currentScript meegekregen (een stap die zijn script async laadt):
    // dan is er niets om de stap uit af te leiden.
    var stap = script && script.closest ? script.closest('[data-mymmo-stap]') : null;
    if (!stap) {
      if (window.console && console.warn) {
        console.warn('[Mymmo Forms] MymmoStappen.stap() zonder document.currentScript — de stap is niet te bepalen.');
      }
      return;
    }

    var reeks = reeksVan(stap);
    if (!reeks) return;

    var index = reeks.stappen.indexOf(stap);
    if (index < 0) return;

    try {
      fn(bouwApi(reeks, stap, index));
    } catch (fout) {
      if (window.console && console.error) console.error('[Mymmo Forms] stap "' + (stap.getAttribute('data-mymmo-stap-naam') || '?') + '":', fout);
    }
  }

  function start() {
    var wikkels = document.querySelectorAll('[data-mymmo-stappen]');
    for (var n = 0; n < wikkels.length; n += 1) {
      reeksen.push(new Reeks(wikkels[n]));
    }

    var rij = window.MymmoStappen._rij || [];
    window.MymmoStappen._rij = [];
    // Vanaf nu meteen uitvoeren; de rij was alleen nodig zolang dit bestand er
    // nog niet was.
    window.MymmoStappen.stap = function (script, fn) { meldAan(script, fn); };

    for (var i = 0; i < rij.length; i += 1) {
      meldAan(rij[i][0], rij[i][1]);
    }

    // Pas NA de aanmeldingen: een stap kan in zijn script al geldig() geroepen
    // hebben, en dan hoort de knop dat te tonen.
    for (var r = 0; r < reeksen.length; r += 1) {
      reeksen[r].hertekenNav();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
}());
