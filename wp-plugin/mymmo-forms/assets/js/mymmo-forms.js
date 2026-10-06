/**
 * Mymmo Forms — uitsluitend gemaksverbetering.
 *
 * Het formulier werkt volledig zonder dit bestand: het is een gewone POST naar
 * admin-post.php, server-side gerenderd en server-side gevalideerd. Wat hier
 * staat is alleen wat een bezoeker helpt en wat bij uitval van JavaScript
 * niets kapotmaakt:
 *
 *   1. de meldingenbalk na een redirect focussen, zodat een schermlezer 'm
 *      voorleest en de bezoeker meteen op de juiste plek staat;
 *   2. bij verzenden per veld een foutmelding tonen IN DE TAAL VAN HET
 *      FORMULIER, en naar het eerste foute veld springen;
 *   3. dubbelklikken op verzenden tegenhouden;
 *   4. het token van Cloudflare Turnstile ophalen, als de OM daarom vraagt
 *      (zie maakTurnstile()). Zonder JavaScript is er geen token en beslist de
 *      Worker; dit bestand weigert zelf niets.
 *
 * Over punt 2: het formulier heeft `novalidate`, dus de browser toont zijn eigen
 * ballon niet. Dat is bewust. Die ballon ("Please fill out this field.") staat
 * in de taal van de BROWSER en niet van de pagina -- een Franstalige bezoeker
 * met een Engelse Chrome kreeg Engelse meldingen op een Nederlands formulier --
 * en is bovendien niet te stylen of te positioneren.
 *
 * De constraint-API van de browser wordt wél gebruikt, maar alleen om te WETEN
 * dat er iets mis is (validity.valueMissing en co). De TEKST komt uit de
 * catalogus die met het formulier meekwam, dezelfde die de Operations Manager
 * gebruikt voor haar 422-antwoorden. Zo krijgt een bezoeker met JavaScript
 * letterlijk dezelfde zin als een bezoeker zonder.
 *
 * Er wordt hier NIET gevalideerd op inhoud die de browser niet al kent. Dat
 * gebeurt in de Operations Manager, want die is de enige die telt.
 */

(function () {
  'use strict';

  var NOOD = {
    required: '{label} is verplicht.',
    check_fields: 'Kijk de gemarkeerde velden na.',
  };

  function teksten(form) {
    try {
      var ruw = form.getAttribute('data-mymmo-messages');
      if (!ruw) return NOOD;
      var geparsed = JSON.parse(ruw);
      return (geparsed && typeof geparsed === 'object') ? geparsed : NOOD;
    } catch (_) {
      // Kapotte JSON mag geen formulier blokkeren; dan maar de noodtekst.
      return NOOD;
    }
  }

  function vul(sjabloon, vars) {
    return String(sjabloon || '').replace(/\{(\w+)\}/g, function (heel, naam) {
      return Object.prototype.hasOwnProperty.call(vars, naam) ? String(vars[naam]) : heel;
    });
  }

  /**
   * Welke melding hoort bij deze ongeldige invoer?
   *
   * De volgorde is de volgorde waarin een bezoeker ze tegenkomt: eerst "je bent
   * het vergeten", dan pas "wat je typte klopt niet". Één melding per veld --
   * drie tegelijk lezen niemand.
   */
  function meldingVoor(veld, t, label) {
    var v = veld.validity;
    if (!v) return '';

    if (v.valueMissing) return vul(t.required, { label: label });

    // Een eigen melding van een ander script: mymmo-forms-postcode.js zet
    // "We kennen postcode 1005 niet" met setCustomValidity(). Die tekst komt al
    // uit MESSAGES, in de taal van het formulier, dus hij staat er zoals hij is.
    if (v.customError) return veld.validationMessage || vul(t.check_fields, { label: label });

    if (v.typeMismatch) {
      if (veld.type === 'email') return vul(t.email, { label: label });
      return vul(t.required, { label: label });
    }

    if (v.badInput || v.stepMismatch) {
      if (veld.type === 'number') return vul(t.number, { label: label });
      if (veld.type === 'date') return vul(t.date, { label: label });
    }

    if (v.tooShort) return vul(t.minlength, { label: label, n: veld.minLength });
    if (v.tooLong) return vul(t.maxlength, { label: label, n: veld.maxLength });
    if (v.rangeUnderflow) return vul(t.min, { label: label, n: veld.min });
    if (v.rangeOverflow) return vul(t.max, { label: label, n: veld.max });

    // Een validity-vlag die we niet kennen. Liever de algemene zin dan een lege
    // melding onder een rood veld.
    return vul(t.check_fields, { label: label });
  }

  function wikkelVan(veld) {
    return veld.closest ? veld.closest('.mymmo-form-field') : null;
  }

  function toonFout(veld, tekst) {
    var wikkel = wikkelVan(veld);
    if (!wikkel) return;
    var doel = wikkel.querySelector('[data-mymmo-error]');
    if (!doel) return;

    doel.textContent = tekst;
    doel.hidden = false;
    veld.setAttribute('aria-invalid', 'true');
  }

  function wisFout(veld) {
    var wikkel = wikkelVan(veld);
    if (!wikkel) return;
    var doel = wikkel.querySelector('[data-mymmo-error]');
    if (doel) {
      doel.textContent = '';
      doel.hidden = true;
    }
    veld.removeAttribute('aria-invalid');
  }

  function bedienbareVelden(form) {
    var uit = [];
    var alles = form.querySelectorAll('input, select, textarea');
    for (var i = 0; i < alles.length; i += 1) {
      var veld = alles[i];
      if (veld.type === 'hidden' || veld.disabled) continue;
      uit.push(veld);
    }
    return uit;
  }

  /**
   * @returns {Element|null} het eerste foute veld, of null als alles klopt
   */
  function valideer(form, t) {
    var velden = bedienbareVelden(form);
    var eerste = null;

    for (var i = 0; i < velden.length; i += 1) {
      var veld = velden[i];
      if (typeof veld.checkValidity !== 'function' || veld.checkValidity()) {
        wisFout(veld);
        continue;
      }

      var wikkel = wikkelVan(veld);
      var label = (wikkel && wikkel.getAttribute('data-mymmo-label')) || veld.name || '';
      toonFout(veld, meldingVoor(veld, t, label));
      if (!eerste) eerste = veld;
    }

    return eerste;
  }

  // ── Botcontrole: Cloudflare Turnstile, onzichtbaar ─────────────────────────
  //
  // Alleen voor een formulier met data-mymmo-turnstile (de publieke
  // sitesleutel). Die zet de OM in de payload zolang FORMS_TURNSTILE_MODE niet
  // "off" is. De WORKER kijkt het token na en beslist (forms/turnstile.js);
  // lukt het hier niet (script geblokkeerd, fout, te traag), dan gaat de
  // inzending gewoon zonder token, met de reden erbij.
  //
  // Het script laadt pas bij de eerste klik IN het formulier: wie niets
  // invult, haalt niets van Cloudflare op. En dan meteen, zodat het token er
  // bij "Versturen" meestal al is en niemand op iets hoeft te wachten.
  //
  // 'refresh-expired: never': een verlopen token (na 5 minuten) wordt pas bij
  // het versturen vernieuwd. Een formulier in de pop-up of een callout
  // VERHUIST in de DOM, en een iframe dat verhuist laadt opnieuw -- een
  // automatische verversing daarin kan stil blijven hangen. reset() op het
  // moment zelf kan dat niet.

  var TS_SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=mymmoTurnstileGeladen';
  // Hoelang we bij het versturen op een token wachten. Toont Cloudflare een
  // vinkje, dan telt dit niet: dan wachten we op de bezoeker.
  var TS_WACHT_MS = 15000;
  var tsStand = '';
  var tsWachtrij = [];
  var tsAlle = [];

  function laadTurnstile(klaar) {
    if (window.turnstile && typeof window.turnstile.render === 'function') { klaar(true); return; }
    if (tsStand === 'mislukt') { klaar(false); return; }
    tsWachtrij.push(klaar);
    if (tsStand === 'laden') return;
    tsStand = 'laden';

    function klaarMet(ok) {
      tsStand = ok ? 'klaar' : 'mislukt';
      var lijst = tsWachtrij;
      tsWachtrij = [];
      for (var i = 0; i < lijst.length; i += 1) lijst[i](ok);
    }

    // Laadt een andere plugin Turnstile al? Dan niet nog eens: een dubbel
    // api.js geeft Cloudflare-fouten op de hele pagina.
    var bestaand = document.querySelector('script[src*="challenges.cloudflare.com/turnstile/"]');
    if (bestaand) {
      bestaand.addEventListener('load', function () { klaarMet(!!window.turnstile); });
      bestaand.addEventListener('error', function () { klaarMet(false); });
      return;
    }

    window.mymmoTurnstileGeladen = function () { klaarMet(true); };
    var script = document.createElement('script');
    script.src = TS_SCRIPT;
    script.async = true;
    script.onerror = function () { klaarMet(false); };
    document.head.appendChild(script);
  }

  /** @return {object|null} null als dit formulier geen Turnstile heeft */
  function maakTurnstile(form) {
    var sleutel = form.getAttribute('data-mymmo-turnstile') || '';
    if (!sleutel) return null;
    // Het voorbeeld in wp-admin draait in een srcdoc-iframe. Turnstile kent
    // die "site" niet en zou er enkel een fout geven.
    if (!/^https?:$/.test(window.location.protocol)) return null;

    var metTaal = form.closest ? form.closest('[lang]') : null;
    var vak = null;
    var id = null;
    var getekend = false;
    var loopt = false;        // het script of een uitdaging is onderweg
    var interactief = false;  // Cloudflare twijfelt en toont een vinkje
    var token = '';
    var wachters = [];
    var opVinkje = null;

    // Eigen verborgen velden, niet die van Turnstile zelf: zo staat het token
    // er gegarandeerd op het moment dat het formulier vertrekt, ook in de
    // klassieke POST. Namen = Mymmo_Forms_Submit::TURNSTILE_FIELD / _ERROR_FIELD.
    var tokenVeld = verborgenVeld(form, 'mymmo_turnstile');
    var foutVeld = verborgenVeld(form, 'mymmo_turnstile_error');

    function zetToken(waarde) {
      token = waarde || '';
      tokenVeld.value = token;
      if (token) foutVeld.value = '';
    }

    function meld() {
      var lijst = wachters;
      wachters = [];
      for (var i = 0; i < lijst.length; i += 1) lijst[i]();
    }

    function mislukt(code) {
      loopt = false;
      zetToken('');
      foutVeld.value = String(code || 'onbekend').slice(0, 40);
      meld();
    }

    function zichtbaar(aan) {
      interactief = aan;
      if (vak) vak.classList.toggle('mymmo-form-turnstile--zichtbaar', aan);
    }

    var opties = {
      sitekey: sleutel,
      'response-field': false,
      appearance: 'interaction-only',
      size: 'flexible',
      language: (metTaal && metTaal.getAttribute('lang')) || 'auto',
      'refresh-expired': 'never',
      callback: function (nieuw) {
        loopt = false;
        zichtbaar(false);
        zetToken(nieuw);
        meld();
      },
      'expired-callback': function () { loopt = false; zetToken(''); },
      'error-callback': function (code) {
        zichtbaar(false);
        mislukt(code);
        return true; // afgehandeld: geen fout in de console van de bezoeker
      },
      'timeout-callback': function () { zichtbaar(false); mislukt('timeout'); },
      'before-interactive-callback': function () {
        zichtbaar(true);
        if (opVinkje) opVinkje();
      },
      'after-interactive-callback': function () { zichtbaar(false); }
    };

    function render() {
      try {
        id = window.turnstile.render(vak, opties);
      } catch (_) {
        id = null;
      }
      return id !== null && id !== undefined;
    }

    // Een (nieuwe) uitdaging starten. Een tweede keer in hetzelfde vak gaat
    // met reset(), niet met een tweede render.
    function begin() {
      if (getekend) {
        loopt = true;
        zetToken('');
        try { window.turnstile.reset(id); } catch (_) { mislukt('reset'); }
        return;
      }
      if (loopt) return;
      loopt = true;
      laadTurnstile(function (geladen) {
        if (getekend) return;
        if (!geladen) { mislukt('script'); return; }
        vak = document.createElement('div');
        vak.className = 'mymmo-form-turnstile';
        form.appendChild(vak);
        getekend = true;
        if (render()) return;
        // Een taal die Turnstile niet kent, mag de controle niet breken.
        vak.innerHTML = '';
        opties.language = 'auto';
        if (render()) return;
        if (vak.parentNode) vak.parentNode.removeChild(vak);
        getekend = false;
        mislukt('render');
      });
    }

    var ts = {
      voorbereid: function () {
        if (!getekend && !loopt) begin();
      },
      heeftToken: function () { return token !== ''; },
      // Wacht op een token en roep dan `verder` aan -- ook ZONDER token, na een
      // fout of na TS_WACHT_MS. `bijVinkje` loopt als Cloudflare een vinkje
      // toont; dan wachten we zonder tijdslimiet op de bezoeker.
      zorgVoor: function (verder, bijVinkje) {
        if (token) { verder(); return; }
        var gedaan = false;
        var klok = null;
        function eenmaal() {
          if (gedaan) return;
          gedaan = true;
          window.clearTimeout(klok);
          opVinkje = null;
          verder();
        }
        wachters.push(eenmaal);
        opVinkje = bijVinkje || null;
        klok = window.setTimeout(function () {
          if (interactief) return;
          loopt = false; // de volgende poging begint opnieuw, met reset()
          foutVeld.value = foutVeld.value || 'traag';
          eenmaal();
        }, TS_WACHT_MS);

        if (interactief) {
          if (opVinkje) opVinkje();
        } else if (!loopt) {
          begin();
        }
      },
      // Het token is verbruikt (de Worker keek het na) of niet meer te
      // vertrouwen: weg ermee, en meteen een nieuw halen.
      ververs: function () {
        loopt = false;
        zetToken('');
        if (getekend) begin();
      },
      vergeet: function () {
        loopt = false;
        zetToken('');
      }
    };
    tsAlle.push(ts);
    return ts;
  }

  function verborgenVeld(form, naam) {
    var veld = document.createElement('input');
    veld.type = 'hidden';
    veld.name = naam;
    veld.value = '';
    form.appendChild(veld);
    return veld;
  }

  /**
   * Webgedrag (1.22.0): het formulier is gestart of wordt verstuurd, als
   * 'mymmo:track' op document. Zelfde vorm als meldUi() in mymmo-forms-modal.js.
   * Of de inzending echt aankwam, meldt de OM zelf (server-side): dit is de POGING.
   */
  function meldUi(act, form) {
    try {
      var slugEl = form.closest('[data-mymmo-slug]');
      var paneel = form.closest('[data-mymmo-paneel]');
      var venster = form.closest('[data-mymmo-modal]');
      document.dispatchEvent(new CustomEvent('mymmo:track', { detail: {
        act: act,
        venster: venster ? ((venster.id || '').replace(/^mymmo-modal-/, '').replace(/-\d+$/, '') || null) : null,
        tab: paneel ? paneel.getAttribute('data-mymmo-paneel') : null,
        form: slugEl ? slugEl.getAttribute('data-mymmo-slug') : null
      } }));
    } catch (_) { /* meten mag nooit iets tegenhouden */ }
  }

  function koppel(form) {
    var knop = form.querySelector('.mymmo-form-submit');
    var t = teksten(form);
    var bezig = false;
    var ooitGevalideerd = false;
    var bezigTekst = t.submitting || 'Bezig met versturen…';

    var ts = maakTurnstile(form);
    if (ts) form.addEventListener('focusin', ts.voorbereid);

    // Webgedrag: GESTART bij de eerste keer dat de bezoeker zelf iets invult.
    // Verborgen velden niet: die vult een stappenreeks of de plugin zelf.
    var gestart = false;
    var opStart = function (event) {
      var veld = event.target;
      if (gestart || !veld || !veld.name || veld.type === 'hidden') return;
      gestart = true;
      meldUi('start', form);
    };
    form.addEventListener('input', opStart);
    form.addEventListener('change', opStart);

    // Een VERPLICHT VINKJE (verplichte opt-in in de OM): zolang het niet
    // aangevinkt is, is de knop grijs en doet hij niets -- geen foutmelding.
    // aria-disabled en niet disabled: een schermlezer moet de knop nog kunnen
    // aanwijzen, en een klik zet de focus op het vinkje dat nog ontbreekt.
    var toestemmingen = form.querySelectorAll('.mymmo-form-check input[type="checkbox"][required]');
    function ontbrekendeToestemming() {
      for (var i = 0; i < toestemmingen.length; i += 1) {
        if (!toestemmingen[i].checked && !toestemmingen[i].disabled) return toestemmingen[i];
      }
      return null;
    }
    function werkKnopBij() {
      if (!knop || bezig || !toestemmingen.length) return;
      var wacht = !!ontbrekendeToestemming();
      knop.classList.toggle('mymmo-form-submit--wacht', wacht);
      if (wacht) knop.setAttribute('aria-disabled', 'true');
      else knop.removeAttribute('aria-disabled');
    }
    werkKnopBij();
    form.addEventListener('change', werkKnopBij);

    // Pas NA een eerste verzendpoging meelopen met wat de bezoeker typt. Iemand
    // corrigeren terwijl hij zijn e-mailadres nog aan het intypen is ("nico@" is
    // nu eenmaal even ongeldig) is het irritantste wat een formulier kan doen.
    form.addEventListener('input', function (event) {
      if (!ooitGevalideerd) return;
      var veld = event.target;
      if (!veld || typeof veld.checkValidity !== 'function') return;
      if (veld.checkValidity()) wisFout(veld);
    });

    form.addEventListener('change', function (event) {
      if (!ooitGevalideerd) return;
      var veld = event.target;
      if (!veld || typeof veld.checkValidity !== 'function') return;
      if (veld.checkValidity()) wisFout(veld);
    });

    form.addEventListener('submit', function (event) {
      if (bezig) {
        // Tweede klik terwijl de eerste onderweg is. De pipeline dedupliceert
        // op een hash van de payload, dus een dubbele inzending zou geen dubbele
        // lead geven — maar de bezoeker twee keer laten wachten wel.
        event.preventDefault();
        return;
      }

      var mist = ontbrekendeToestemming();
      if (mist) {
        event.preventDefault();
        mist.focus();
        return;
      }

      // Pas hier de klasse zetten: :invalid kleurt anders elk leeg verplicht
      // veld rood zodra de pagina laadt.
      form.classList.add('mymmo-form--validated');
      ooitGevalideerd = true;

      var fout = valideer(form, t);
      if (fout) {
        event.preventDefault();
        fout.scrollIntoView({ block: 'center', behavior: 'smooth' });
        fout.focus({ preventScroll: true });
        return;
      }

      bezig = true;
      zetKnopBezig();

      // Turnstile zonder token (nog niet klaar, verlopen, of pas nu voor het
      // eerst gevraagd): eerst daarop wachten, dan zelf versturen. Meestal staat
      // het er al -- het wordt bij de eerste klik in het formulier opgehaald.
      if (ts && !ts.heeftToken()) {
        event.preventDefault();
        ts.zorgVoor(function () { verstuur(null); }, function () {
          // Cloudflare twijfelt en toont een vinkje. Dan zegt de knop niet
          // langer "bezig" -- de bezoeker moet eerst zelf iets doen. Na het
          // vinkje gaat de inzending vanzelf verder.
          if (knop) {
            if (knop.dataset.mymmoLabel) knop.textContent = knop.dataset.mymmoLabel;
            knop.classList.add('mymmo-form-submit--wacht');
          }
        });
        return;
      }

      verstuur(event);
    });

    function zetKnopBezig() {
      if (!knop) return;
      // aria-disabled en niet disabled: een echt uitgeschakelde knop wordt
      // door de browser niet meegestuurd, en dan mist de POST zijn naam.
      knop.classList.remove('mymmo-form-submit--wacht');
      knop.setAttribute('aria-disabled', 'true');
      if (knop.textContent !== bezigTekst) knop.dataset.mymmoLabel = knop.textContent;
      knop.textContent = bezigTekst;
    }

    function herstel() {
      bezig = false;
      if (knop) {
        knop.removeAttribute('aria-disabled');
        if (knop.dataset.mymmoLabel) knop.textContent = knop.dataset.mymmoLabel;
      }
      werkKnopBij();
    }

    /**
     * Het eigenlijke versturen. `event` is het submit-event als we nog IN de
     * afhandeling zitten -- dan doet de browser de klassieke POST zelf -- of
     * null als we eerst op Turnstile wachtten, en dan versturen we zelf.
     */
    function verstuur(event) {
      zetKnopBezig();
      meldUi('submit', form);

      // In de pop-up: versturen zonder de pagina te herladen, en meteen het
      // dankjewelscherm van dit tabblad tonen. Zie verstuurInVenster().
      if (kanInVenster(form)) {
        if (event) event.preventDefault();
        verstuurInVenster(form, knop, t, function () {
          // Mislukt: het token is verbruikt, een volgende poging heeft een
          // nieuw nodig.
          if (ts) ts.ververs();
          herstel();
        });
      } else if (!event) {
        // Via het prototype: een veld met de naam "submit" zou form.submit
        // anders overschaduwen. Dit vuurt geen submit-event, dus geen lus.
        HTMLFormElement.prototype.submit.call(form);
      }

      // Vangnet: gaat er onderweg iets mis en komt er geen redirect, dan mag de
      // bezoeker het na tien seconden opnieuw proberen in plaats van naar een
      // dode knop te kijken.
      window.setTimeout(herstel, 10000);
    }
  }

  /**
   * Een formulier in een tabblad van de pop-up, met een dankjewelscherm klaar?
   *
   * Alleen dan versturen we met fetch(). Een formulier gewoon in een pagina
   * blijft de klassieke POST met redirect doen: daar is geen venster dat kan
   * flitsen, en die weg werkt ook zonder JavaScript.
   */
  function kanInVenster(form) {
    if (!window.fetch || !window.FormData || !form.closest) return false;
    var paneel = form.closest('[data-mymmo-paneel]');
    return !!(paneel && paneel.querySelector('[data-mymmo-dank-scherm]'));
  }

  /**
   * Versturen zonder de pagina te herladen.
   *
   * WAAROM. De klassieke weg (POST, redirect, pagina opnieuw laden, venster
   * weer openen) gaf een zichtbare flits: het venster ging dicht, de pagina
   * laadde, en het venster sprong weer open op het dankjewelscherm. De server
   * doet exact dezelfde controles en dezelfde inzending; alleen het antwoord is
   * JSON in plaats van een redirect (`mymmo_ajax=1`, zie class-submit.php).
   *
   * Loopt het mis, dan blijft het formulier met alles erin staan, met de
   * foutmelding erboven -- zoals na een klassieke mislukte inzending.
   */
  function verstuurInVenster(form, knop, t, herstel) {
    var data = new FormData(form);
    data.append('mymmo_ajax', '1');

    // Een indiening kan enkele seconden duren (bv. de pdf-stap van een
    // koppeling rendert een offerte via een echte headless browser). De
    // knoptekst alleen ("Bezig met versturen...") is dan te onopvallend --
    // een bezoeker ziet geen duidelijk teken dat er iets gebeurt en probeert
    // soms opnieuw te klikken. Dit overlay-scherm is puur JS/CSS (dezelfde
    // aanpak als de dynamisch aangemaakte foutmelding hieronder), dus geen
    // nieuwe PHP-template nodig.
    toonBezigInVenster(form, t);

    fetch(form.getAttribute('action') || form.action, {
      method: 'POST',
      body: data,
      credentials: 'same-origin',
      headers: { Accept: 'application/json' }
    }).then(function (antwoord) {
      var type = antwoord.headers.get('content-type') || '';
      if (type.indexOf('json') === -1) {
        // Geen JSON terug: de server kende mymmo_ajax niet (oudere PHP met
        // nieuwere JavaScript uit een cache) en deed de gewone redirect. Die
        // inzending is dan al gebeurd -- NIET opnieuw versturen, maar de pagina
        // volgen waar de server heen stuurde.
        if (antwoord.redirected && antwoord.url) {
          window.location.href = antwoord.url;
          return null;
        }
        throw new Error('geen json');
      }
      return antwoord.json();
    }).then(function (uitkomst) {
      if (uitkomst === null) return;
      if (uitkomst && uitkomst.redirect) {
        window.location.href = uitkomst.redirect;
        return;
      }
      if (uitkomst && uitkomst.ok) {
        // Expliciet verbergen i.p.v. erop vertrouwen dat toonDankInVenster()
        // dezelfde wikkel verbergt: "inhoud" daar kan .mymmo-stappen zijn, een
        // KIND van .mymmo-form-wrap, en dan blijft dit overlay-element (dat op
        // .mymmo-form-wrap zelf hangt) zichtbaar boven het dankjewelscherm.
        verbergBezigInVenster(form);
        // Een formulier van de academy: mymmo-forms-academy.js neemt het over
        // (venster dicht, academy open) en zegt dat met preventDefault(). Staat
        // dat script er niet, dan gewoon het dankjewelscherm.
        if (uitkomst.academy_token && meldAcademyBewijs(form, uitkomst.academy_token)) return;
        toonDankInVenster(form);
        return;
      }
      verbergBezigInVenster(form);
      toonFoutInVenster(form, (uitkomst && uitkomst.message) || t.unavailable || 'Er ging iets mis. Probeer het opnieuw.');
      herstel();
    }).catch(function () {
      verbergBezigInVenster(form);
      toonFoutInVenster(form, t.unavailable || 'Er ging iets mis. Probeer het opnieuw.');
      herstel();
    });
  }

  /** @return {boolean} waar als iemand het bewijs overnam (preventDefault). */
  function meldAcademyBewijs(form, bewijs) {
    try {
      var ev = new CustomEvent('mymmo:academy_token', {
        cancelable: true,
        detail: { token: bewijs, form: form }
      });
      document.dispatchEvent(ev);
      return ev.defaultPrevented;
    } catch (_) {
      return false;
    }
  }

  /**
   * Het "bezig"-overlay tonen/verbergen tijdens verstuurInVenster().
   *
   * Wordt dynamisch aangemaakt (zelfde patroon als de foutmelding in
   * toonFoutInVenster hieronder) i.p.v. een vast element in modal.php: dat
   * zou een nieuwe PHP-template + vertaalsleutel vragen voor iets dat puur
   * een voorbijgaande visuele status is, geen door een beheerder getypte
   * tekst. De tekst komt uit MESSAGES (`busy`), met een terugval hier voor
   * een Worker die die sleutel nog niet meestuurt. Na een geslaagde inzending
   * gaat het meteen naar het dankjewelscherm -- geen tussenmelding, anders
   * staat "verzonden" er twee keer.
   */
  var VLIEGER = 'https://link.openvme.be/assets/brand/thingies/thingies_vlieger.svg';

  function toonBezigInVenster(form, t) {
    var wikkel = form.closest('.mymmo-form-wrap') || form.parentNode;
    if (!wikkel) return;
    var overlay = wikkel.querySelector('.mymmo-form-bezig');
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'mymmo-form-bezig';
      overlay.setAttribute('role', 'status');
      overlay.innerHTML = '<img class="mymmo-form-bezig-beeld" src="' + VLIEGER + '" alt="" aria-hidden="true" loading="eager" decoding="async">' +
        '<span class="mymmo-form-bezig-regel"><span class="mymmo-form-bezig-tekst"></span>' +
        '<span class="mymmo-form-bezig-puntjes" aria-hidden="true"><span>.</span><span>.</span><span>.</span></span></span>';
      wikkel.appendChild(overlay);
    }
    // De puntjes zijn CSS-animatie, dus de tekst zelf zonder puntjes. De
    // terugval staat hier voor een Worker die de sleutel `busy` nog niet kent.
    overlay.querySelector('.mymmo-form-bezig-tekst').textContent = t.busy || 'Even geduld';
    // De wikkel krijgt een klasse die de inhoud onzichtbaar maakt: het overlay
    // alleen (half doorzichtig) liet de formuliertekst erdoor schemeren.
    wikkel.classList.add('mymmo-form-wrap--bezig');
    overlay.hidden = false;
  }

  function verbergBezigInVenster(form) {
    var wikkel = form.closest('.mymmo-form-wrap') || form.parentNode;
    var overlay = wikkel && wikkel.querySelector('.mymmo-form-bezig');
    if (overlay) overlay.hidden = true;
    if (wikkel) wikkel.classList.remove('mymmo-form-wrap--bezig');
  }

  function toonDankInVenster(form) {
    var paneel = form.closest('[data-mymmo-paneel]');
    var scherm = paneel ? paneel.querySelector('[data-mymmo-dank-scherm]') : null;
    var wikkel = form.closest('.mymmo-form-wrap');
    if (!paneel || !scherm) return;

    // Wat er in het paneel stond (het formulier, of de hele stappenreeks) gaat
    // weg; het scherm komt in de plaats. De wikkel blijft in de DOM staan: die
    // draagt de slug, het doel en het tabblad voor de conversie.
    var inhoud = form.closest('.mymmo-stappen') || wikkel;
    if (inhoud) inhoud.style.display = 'none';

    scherm.hidden = false;
    scherm.setAttribute('role', 'status');
    scherm.setAttribute('tabindex', '-1');
    if (typeof paneel.scrollTop === 'number') paneel.scrollTop = 0;
    scherm.focus({ preventScroll: true });

    meldVerstuurd(wikkel);
  }

  function toonFoutInVenster(form, bericht) {
    var wikkel = form.closest('.mymmo-form-wrap') || form.parentNode;
    var melding = wikkel.querySelector('.mymmo-form-notice--error');
    if (!melding) {
      melding = document.createElement('div');
      melding.className = 'mymmo-form-notice mymmo-form-notice--error';
      melding.setAttribute('role', 'alert');
      melding.setAttribute('tabindex', '-1');
      wikkel.insertBefore(melding, wikkel.firstChild);
    }
    melding.textContent = bericht;
    melding.focus({ preventScroll: true });
  }

  function focusMelding() {
    var melding = document.querySelector('[data-mymmo-focus]');
    if (!melding) return;

    // Niet scrollen als de melding al in beeld staat: de pagina laten
    // verspringen terwijl je er al naar kijkt is vervelender dan nuttig.
    var rect = melding.getBoundingClientRect();
    if (rect.top < 0 || rect.bottom > window.innerHeight) {
      melding.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    melding.focus({ preventScroll: true });
  }

  /**
   * Vult velden met een `data-mymmo-prefill-param`-attribuut vanuit de
   * gelijknamige URL-queryparameter, bv. `?e=jan%40example.com` vult het veld
   * met `data-mymmo-prefill-param="e"`.
   *
   * Alleen als het veld nog LEEG is: een bezoeker die de pagina ververst nadat
   * hij zelf al iets typte, mag niet zijn eigen invoer kwijtraken. Verborgen
   * velden tellen hier WEL mee (in tegenstelling tot bedienbareVelden()) --
   * juist een verborgen veld vullen vanuit de link is het hele nut van deze
   * functie (bv. een e-mailadres meesturen zonder het zichtbaar te maken).
   */
  function vulVoorafIn(form) {
    var params;
    try {
      params = new URLSearchParams(window.location.search);
    } catch (_) {
      // Oude browser zonder URLSearchParams: geen prefill, geen kapot formulier.
      return;
    }

    var velden = form.querySelectorAll('[data-mymmo-prefill-param]');
    for (var i = 0; i < velden.length; i += 1) {
      var veld = velden[i];
      var naam = veld.getAttribute('data-mymmo-prefill-param');
      if (!naam || veld.value !== '') continue;
      if (!params.has(naam)) continue;
      veld.value = params.get(naam);
    }
  }

  /**
   * Een geslaagde inzending melden.
   *
   * Na het versturen komt de bezoeker terug op dezelfde pagina met een
   * bevestiging -- geen nieuwe URL, dus geen pageview en dus geen conversie in
   * GA. Dat is precies het gat dat een aparte bedankpagina vroeger vulde.
   * `data-mymmo-doel` is het pad dat die bedankpagina wás; met een virtuele
   * pageview in GTM blijft hetzelfde doel werken.
   *
   * Zelfde twee kanalen als bij een geboekt gesprek (zie
   * mymmo-forms-modal.js): dataLayer voor GTM, CustomEvent voor de rest.
   */
  function meldGeslaagdeInzending() {
    // De melding van een formulier in een pagina, of het dankjewelscherm van
    // een tabblad in de pop-up (1.16). Allebei betekenen: verstuurd.
    var bevestigingen = document.querySelectorAll('.mymmo-form-notice--success, [data-mymmo-geslaagd]');

    for (var i = 0; i < bevestigingen.length; i += 1) {
      meldVerstuurd(bevestigingen[i].closest('.mymmo-form-wrap'));
    }
  }

  /** De conversie van EEN formulier melden; de wikkel draagt slug, doel en tabblad. */
  function meldVerstuurd(wikkel) {
    {
      if (!wikkel || wikkel.getAttribute('data-mymmo-gemeld') === '1') return;
      wikkel.setAttribute('data-mymmo-gemeld', '1');

      var doel = wikkel.getAttribute('data-mymmo-doel') || '';
      var gegevens = {
        event: 'mymmo_formulier_verstuurd',
        mymmo_soort: 'formulier_verstuurd',
        mymmo_formulier: wikkel.getAttribute('data-mymmo-slug') || '',
        mymmo_doel: doel,
        // Welk tabblad van de pop-up: 'form' of 'extra'. Leeg voor een
        // formulier gewoon in een pagina. Zo is in GA per tabblad te meten.
        mymmo_tabblad: wikkel.getAttribute('data-mymmo-tabblad') || ''
      };
      if (doel) gegevens.page_path = doel;

      try {
        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push(gegevens);
      } catch (_) { /* geen dataLayer */ }

      try {
        document.dispatchEvent(new CustomEvent('mymmo:formulier_verstuurd', { detail: gegevens }));
      } catch (_) { /* oudere browser */ }
    }
  }

  function start() {
    meldGeslaagdeInzending();

    focusMelding();
    document.querySelectorAll('.mymmo-form').forEach(function (form) {
      vulVoorafIn(form);
      koppel(form);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }

  // Met "terug" uit de back/forward-cache: een token van daarvoor is bij het
  // vorige versturen al verbruikt, en zou de Worker als ongeldig zien.
  window.addEventListener('pageshow', function (event) {
    if (!event.persisted) return;
    for (var i = 0; i < tsAlle.length; i += 1) tsAlle[i].vergeet();
  });
}());
