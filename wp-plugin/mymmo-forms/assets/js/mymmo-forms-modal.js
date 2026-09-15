/**
 * Mymmo Forms — de knop met pop-up ([mymmo_form_button]).
 *
 * Wat hier gebeurt is een UPGRADE van iets dat zonder dit bestand ook werkt:
 *
 *   - zonder JavaScript is de knop een link naar #id en opent het venster via
 *     de CSS-regel op :target; de sluitknop en de achtergrond zijn links terug
 *     naar de knop. De twee delen (formulier en agenda) staan dan onder elkaar,
 *     elk met een eigen kopje.
 *   - dit bestand zet `mymmo-modal-js` op <html>. Daarmee stopt die
 *     :target-regel (anders werken beide mechanismes tegen elkaar in: met de
 *     hash nog in de URL zou het venster niet dicht willen) en neemt het script
 *     het over, mét focusbeheer, Escape, en echte tabbladen.
 *
 * Het formulier zelf staat hier buiten: dat is gewone HTML die naar
 * admin-post.php post, en mymmo-forms.js pakt het op zoals elk ander formulier
 * op de pagina.
 *
 * DRIE MANIEREN OM HET VENSTER TE OPENEN, en dat is met opzet:
 *
 *   1. de eigen knop van de shortcode ([data-mymmo-modal-open]);
 *   2. om het even welke link op de pagina naar #<id van het venster> — zo hang
 *      je het venster achter een knop die het thema of Elementor al maakte,
 *      zonder een regel code: je zet de link van die knop op #mymmo-modal-...;
 *   3. een CSS-selector in het trigger-attribuut van de shortcode, voor knoppen
 *      waarvan je de link niet kan zetten.
 *
 * Nummer 2 en 3 werken ook zonder dit bestand: een link naar #id opent het
 * venster via :target. Voor 3 geldt dat niet — daar is JavaScript het enige
 * bindmiddel — en daarom is 2 de manier die de voorkeur heeft.
 *
 * DE AGENDA is het enige deel dat JavaScript echt nodig heeft: het is een
 * iframe van Calendly. Twee dingen zijn daaraan veranderd ten opzichte van de
 * eerste versie:
 *
 *   - het script wordt al opgehaald zodra iemand met de muis op de knop komt of
 *     hem met het toetsenbord bereikt, en de kalender wordt opgebouwd zodra het
 *     VENSTER opengaat — niet pas bij een klik op het tabblad. Wie dus op
 *     "Plan een gesprek" klikt, kijkt naar een kalender die er al staat.
 *   - bewust NIET bij het laden van de pagina. Dan zou elke bezoeker van die
 *     pagina een verzoek naar Calendly sturen, ook wie nooit op de knop klikt.
 *     Op de knop komen is het eerste moment waarop iemand iets van plan is.
 */

(function () {
  'use strict';

  var CALENDLY_SCRIPT = 'https://assets.calendly.com/assets/external/widget.js';

  /**
   * De namen van de herkomstparameters. Ze staan ook in helpers.php
   * (mymmo_forms_utm_keys) — één bron kan hier niet: dat is PHP op de server en
   * dit draait in de browser. Wijzig je de ene lijst, wijzig dan de andere.
   *
   * De sleutels rechts zijn de namen die Calendly verwacht.
   */
  var UTM_NAMEN = {
    utm_source: 'utmSource',
    utm_medium: 'utmMedium',
    utm_campaign: 'utmCampaign',
    utm_term: 'utmTerm',
    utm_content: 'utmContent'
  };

  var UUID_VORM = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  /** Het venster dat nu openstaat, en de knop waar het vandaan kwam. */
  var openVenster = null;
  var vorigeFocus = null;

  // ── Hulpjes ───────────────────────────────────────────────────────────────

  function cookie(naam) {
    var alles = String(document.cookie || '').split(';');
    for (var i = 0; i < alles.length; i += 1) {
      var stuk = alles[i].trim();
      if (stuk.indexOf(naam + '=') === 0) {
        try {
          return decodeURIComponent(stuk.slice(naam.length + 1));
        } catch (_) {
          return stuk.slice(naam.length + 1);
        }
      }
    }
    return '';
  }

  function urlParam(naam) {
    try {
      return new URLSearchParams(window.location.search).get(naam) || '';
    } catch (_) {
      return '';
    }
  }

  /** inert waar het kan, met het attribuut als terugval voor oudere browsers. */
  function zetInert(el, aan) {
    if ('inert' in el) {
      el.inert = aan;
      return;
    }
    if (aan) {
      el.setAttribute('inert', '');
    } else {
      el.removeAttribute('inert');
    }
  }

  function focusbaar(wortel) {
    var uit = [];
    var alles = wortel.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]'
    );
    for (var i = 0; i < alles.length; i += 1) {
      var el = alles[i];
      if (el.getAttribute('tabindex') === '-1') continue;
      if (el.type === 'hidden' || el.hidden) continue;
      // Een element in een verborgen tabblad of in de honeypot mag geen
      // tussenstop zijn bij het tabben.
      if (!el.offsetWidth && !el.offsetHeight && !el.getClientRects().length) continue;
      // De panelen liggen over elkaar en het verborgen paneel heeft daardoor
      // gewoon afmetingen (visibility:hidden, zie de CSS) -- de controle
      // hierboven ziet het dus NIET. Zonder deze regel tabt een bezoeker vanuit
      // het formulier zo de onzichtbare agenda in.
      var paneel = el.closest ? el.closest('[data-mymmo-paneel]') : null;
      if (paneel
          && paneel.parentNode
          && paneel.parentNode.classList.contains('mymmo-modal-body--tabs')
          && !paneel.classList.contains('is-actief')) {
        continue;
      }
      uit.push(el);
    }
    return uit;
  }

  /** Alles wat dit venster kan openen: de eigen knop, en wat er bijgebonden is. */
  function knoppenVan(venster) {
    return document.querySelectorAll('[data-mymmo-modal-open="' + venster.id + '"]');
  }

  function zetUitgeklapt(venster, aan) {
    var knoppen = knoppenVan(venster);
    for (var i = 0; i < knoppen.length; i += 1) {
      knoppen[i].setAttribute('aria-expanded', aan ? 'true' : 'false');
    }
  }

  // ── Open en dicht ─────────────────────────────────────────────────────────

  function openen(venster, knop) {
    if (openVenster === venster) return;
    if (openVenster) sluiten(openVenster);

    openVenster = venster;
    vorigeFocus = knop || document.activeElement;

    venster.classList.add('is-open');
    document.documentElement.classList.add('mymmo-modal-actief');
    zetUitgeklapt(venster, true);

    var paneel = venster.querySelector('.mymmo-modal-panel');
    if (paneel) {
      // Focus in het venster zetten, niet op de sluitknop: een schermlezer
      // leest dan eerst voor waar je terechtgekomen bent, in plaats van
      // meteen "Sluiten".
      paneel.setAttribute('tabindex', '-1');
      paneel.focus({ preventScroll: true });
    }

    // De agenda opbouwen ZODRA het venster openstaat, ook als het formulier
    // vooraan staat. Pas nu heeft haar vlak een echte breedte -- en dat is
    // precies wat Calendly meet. Klikt de bezoeker straks op het tabblad, dan
    // staat de kalender er al.
    laadAgenda(venster);
  }

  function sluiten(venster) {
    venster.classList.remove('is-open');
    zetUitgeklapt(venster, false);

    if (openVenster === venster) {
      openVenster = null;
      document.documentElement.classList.remove('mymmo-modal-actief');

      // Terug naar waar de bezoeker vandaan kwam. Zonder dit staat de focus na
      // het sluiten bovenaan de pagina en moet iemand met een toetsenbord de
      // hele pagina opnieuw door.
      if (vorigeFocus && typeof vorigeFocus.focus === 'function') {
        vorigeFocus.focus({ preventScroll: true });
      }
      vorigeFocus = null;
    }
  }

  /**
   * Tab en Shift+Tab binnen het venster houden.
   *
   * Zonder dit tabt een bezoeker vanuit het venster de pagina erachter in — die
   * hij niet ziet, want het venster ligt eroverheen. Hij is dan met een
   * toetsenbord letterlijk kwijt waar hij is.
   */
  function vangTab(event) {
    if (!openVenster || event.key !== 'Tab') return;

    var lijst = focusbaar(openVenster);
    if (lijst.length === 0) {
      event.preventDefault();
      return;
    }

    var eerste = lijst[0];
    var laatste = lijst[lijst.length - 1];
    var hier = document.activeElement;

    if (event.shiftKey && (hier === eerste || !openVenster.contains(hier))) {
      event.preventDefault();
      laatste.focus();
    } else if (!event.shiftKey && hier === laatste) {
      event.preventDefault();
      eerste.focus();
    }
  }

  // ── Tabbladen ─────────────────────────────────────────────────────────────

  function tabbladen(venster) {
    var balk = venster.querySelector('[data-mymmo-tablist]');
    return balk ? balk.querySelectorAll('.mymmo-modal-tab') : [];
  }

  function toon(venster, naam) {
    var tabs = tabbladen(venster);

    for (var i = 0; i < tabs.length; i += 1) {
      var tab = tabs[i];
      var actief = tab.getAttribute('data-mymmo-tab') === naam;
      tab.classList.toggle('is-active', actief);
      tab.setAttribute('aria-selected', actief ? 'true' : 'false');
      // Roving tabindex: met Tab spring je de tabbalk in en uit, met de pijlen
      // ga je van tabblad naar tabblad. Dat is het patroon dat een schermlezer
      // verwacht bij role="tablist".
      tab.setAttribute('tabindex', actief ? '0' : '-1');
    }

    var panelen = venster.querySelectorAll('[data-mymmo-paneel]');
    for (var j = 0; j < panelen.length; j += 1) {
      // GEEN hidden en geen display:none: de panelen liggen over elkaar en het
      // verborgen paneel houdt zijn afmetingen (zie het blok over de agenda in
      // de CSS). inert houdt het buiten de schermlezer en buiten het tabben.
      var aan = panelen[j].getAttribute('data-mymmo-paneel') === naam;
      panelen[j].classList.toggle('is-actief', aan);
      zetInert(panelen[j], !aan);
    }

    // Vangnet: kon de kalender eerder niet opgebouwd worden (het venster stond
    // nog dicht, dus geen breedte), dan is dit alsnog het moment.
    if (naam === 'calendly') laadAgenda(venster);
  }

  function tabToets(venster, event) {
    var tabs = tabbladen(venster);
    if (tabs.length < 2) return;

    var namen = [];
    var huidig = 0;
    for (var i = 0; i < tabs.length; i += 1) {
      namen.push(tabs[i].getAttribute('data-mymmo-tab'));
      if (tabs[i] === document.activeElement) huidig = i;
    }

    var doel = -1;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') doel = (huidig + 1) % tabs.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') doel = (huidig - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') doel = 0;
    else if (event.key === 'End') doel = tabs.length - 1;

    if (doel === -1) return;

    event.preventDefault();
    toon(venster, namen[doel]);
    tabs[doel].focus();
  }

  // ── De agenda (Calendly) ──────────────────────────────────────────────────

  var scriptBezig = null;

  function laadScript() {
    if (scriptBezig) return scriptBezig;

    scriptBezig = new Promise(function (klaar, mislukt) {
      if (window.Calendly) {
        klaar();
        return;
      }
      var el = document.createElement('script');
      el.src = CALENDLY_SCRIPT;
      el.async = true;
      el.onload = function () { klaar(); };
      el.onerror = function () { mislukt(new Error('Calendly kon niet geladen worden')); };
      document.head.appendChild(el);
    });

    return scriptBezig;
  }

  /**
   * De herkomst van deze bezoeker, voor Calendly.
   *
   * BEWUST hier en niet server-side in de HTML: de pagina kan gecached zijn, en
   * dan zou de UUID van de vorige bezoeker in de HTML gebakken zitten en met het
   * gesprek van de volgende meegaan. Dat geeft geen foutmelding — er komt gewoon
   * een afspraak, aan de verkeerde persoon gehangen. Hier draait de code per
   * bezoeker.
   *
   * Volgorde zoals bij een inzending: de URL wint van de cookie, want die is
   * recenter.
   */
  function herkomst() {
    var utm = {};

    for (var sleutel in UTM_NAMEN) {
      if (!Object.prototype.hasOwnProperty.call(UTM_NAMEN, sleutel)) continue;
      var waarde = urlParam(sleutel) || cookie(sleutel);
      if (waarde) utm[UTM_NAMEN[sleutel]] = waarde;
    }

    // De bezoeker-UUID uit het tracking-script. salesforceUuid is het ENIGE
    // vrije doorgeefveld dat Calendly kent; het komt in hun webhook terug als
    // tracking.salesforce_uuid. Zonder dit staat een geboekt gesprek los van
    // alles wat we van die bezoeker weten (paginaweergaves, campagne, eerdere
    // inzendingen) — en dat merk je niet, want er komt gewoon een afspraak.
    //
    // Hij MAG leeg zijn: het tracking-script zet geen cookie voor wie het als
    // bot herkent, en daar zitten echte mensen tussen.
    var uuid = cookie('ovme_uuid');
    if (UUID_VORM.test(uuid)) utm.salesforceUuid = uuid.toLowerCase();

    return utm;
  }

  /**
   * De Calendly-URL met onze eigen voorkeuren erbij.
   *
   * hide_gdpr_banner: die balk gaat in een venster van deze hoogte over de
   * knoppen van de kalender heen, en de site vraagt haar toestemming al zelf.
   * primary_color volgt de accentkleur van het formulier, zodat de kalender niet
   * de enige plek in het venster is met een andere kleur -- Calendly wil die
   * zonder #.
   *
   * Wat de beheerder zelf in de link zette wint altijd: die heeft er dan over
   * nagedacht.
   */
  function agendaUrl(vlak, basis) {
    try {
      var url = new URL(basis, window.location.href);
      if (!url.searchParams.has('hide_gdpr_banner')) {
        url.searchParams.set('hide_gdpr_banner', '1');
      }
      var kleur = vlak.getAttribute('data-mymmo-calendly-kleur') || '';
      if (kleur && !url.searchParams.has('primary_color')) {
        url.searchParams.set('primary_color', kleur);
      }
      return url.toString();
    } catch (_) {
      return basis;
    }
  }

  function laadAgenda(venster) {
    var vlak = venster.querySelector('[data-mymmo-calendly]');
    if (!vlak || vlak.getAttribute('data-mymmo-geladen') === '1') return;

    var url = vlak.getAttribute('data-mymmo-calendly');
    if (!url) return;

    // Heeft het vlak nog geen breedte, dan is dit het verkeerde moment: Calendly
    // MEET die breedte bij het opbouwen, en bouwt bij nul een kalender voor een
    // vlak van niets -- afgeknepen en half afgesneden, en pas recht te trekken
    // door het venster van grootte te veranderen. Niets doen dus; het openen van
    // het venster of het tabblad komt hier straks opnieuw langs.
    if (!vlak.offsetWidth) return;

    vlak.setAttribute('data-mymmo-geladen', '1');
    vlak.classList.add('is-laden');

    laadScript().then(
      function () {
        if (!window.Calendly || typeof window.Calendly.initInlineWidget !== 'function') {
          throw new Error('Calendly-widget ontbreekt');
        }
        window.Calendly.initInlineWidget({
          url: agendaUrl(vlak, url),
          parentElement: vlak,
          prefill: {},
          utm: herkomst()
        });
      },
      function () {
        // Adblocker, storing, geen netwerk. De link die er al stond blijft dan
        // staan: die werkt zonder script en brengt de bezoeker gewoon naar
        // dezelfde agenda. Een leeg vlak met een draaiend wieltje zou hier het
        // slechtste antwoord zijn.
        vlak.classList.remove('is-laden');
        vlak.removeAttribute('data-mymmo-geladen');
      }
    );
  }

  /** Heeft dit venster een agenda? Dan loont het om het script vast te halen. */
  function heeftAgenda(venster) {
    return !!venster.querySelector('[data-mymmo-calendly]');
  }

  // ── Knoppen die niet van ons zijn ─────────────────────────────────────────

  /**
   * De selector uit trigger="..." omzetten naar echte openknoppen.
   *
   * Ze krijgen dezelfde data-attributen als onze eigen knop, zodat de rest van
   * dit bestand er niets van hoeft te weten. aria-haspopup en aria-controls gaan
   * mee: voor een schermlezer is dit vanaf nu een knop die een venster opent, en
   * dat hoort hij te horen vóór hij erop drukt.
   */
  function bindTriggers(venster) {
    var selector = venster.getAttribute('data-mymmo-trigger');
    if (!selector) return;

    var doelen;
    try {
      doelen = document.querySelectorAll(selector);
    } catch (_) {
      // Een typefout in de selector mag niet de rest van het script meeslepen.
      return;
    }

    for (var i = 0; i < doelen.length; i += 1) {
      var el = doelen[i];
      // Nooit een knop van onszelf overnemen, en nooit iets binnen het venster:
      // trigger=".btn" op een pagina waar ook de verzendknop zo heet zou het
      // venster laten sluiten en heropenen bij elke klik.
      if (el.hasAttribute('data-mymmo-modal-open')) continue;
      if (venster.contains(el)) continue;

      el.setAttribute('data-mymmo-modal-open', venster.id);
      el.setAttribute('aria-haspopup', 'dialog');
      el.setAttribute('aria-expanded', 'false');
      el.setAttribute('aria-controls', venster.id);
    }
  }

  /** Het venster waar deze link naartoe wijst, als het er een van ons is. */
  function vensterVanLink(link) {
    var href = link.getAttribute('href') || '';
    if (href.charAt(0) !== '#' || href.length < 2) return null;

    var doel;
    try {
      doel = document.getElementById(decodeURIComponent(href.slice(1)));
    } catch (_) {
      doel = document.getElementById(href.slice(1));
    }
    return doel && doel.hasAttribute('data-mymmo-modal') ? doel : null;
  }

  // ── Opstarten ─────────────────────────────────────────────────────────────

  function start() {
    var vensters = document.querySelectorAll('[data-mymmo-modal]');
    if (vensters.length === 0) return;

    // Vanaf hier neemt dit script het over van de :target-regel in de CSS.
    document.documentElement.classList.add('mymmo-modal-js');

    var ietsMetAgenda = false;

    for (var i = 0; i < vensters.length; i += 1) {
      var venster = vensters[i];
      var balk = venster.querySelector('[data-mymmo-tablist]');

      bindTriggers(venster);
      if (heeftAgenda(venster)) ietsMetAgenda = true;

      if (balk) {
        balk.hidden = false;
        var actief = balk.querySelector('.mymmo-modal-tab.is-active');
        toon(venster, actief ? actief.getAttribute('data-mymmo-tab') : 'form');
      }

      // Meteen openen na een inzending: de bezoeker komt terug op deze pagina
      // en moet zijn bevestiging (of zijn foutmelding) zien staan. Het anker in
      // de URL komt uit Mymmo_Forms_Submit::finish().
      if (venster.getAttribute('data-mymmo-modal-open-now') === '1'
          || window.location.hash === '#' + venster.id) {
        openen(venster, null);
      }
    }

    // Het script van Calendly vast ophalen zodra iemand op een openknop komt.
    // Niet bij het laden van de pagina: dan stuurt elke bezoeker een verzoek
    // naar een derde partij, ook wie nooit klikt. En niet pas bij een klik op
    // het tabblad: dan sta je naar een leeg vlak te kijken.
    if (ietsMetAgenda) {
      var warm = function (event) {
        var opener = event.target.closest ? event.target.closest('[data-mymmo-modal-open]') : null;
        if (!opener) return;
        var doel = document.getElementById(opener.getAttribute('data-mymmo-modal-open'));
        if (doel && heeftAgenda(doel)) laadScript().catch(function () {});
      };
      document.addEventListener('pointerover', warm);
      document.addEventListener('focusin', warm);
    }

    document.addEventListener('click', function (event) {
      var opener = event.target.closest('[data-mymmo-modal-open]');
      if (opener) {
        var doel = document.getElementById(opener.getAttribute('data-mymmo-modal-open'));
        if (doel) {
          event.preventDefault();
          openen(doel, opener);
        }
        return;
      }

      var sluiter = event.target.closest('[data-mymmo-modal-close]');
      if (sluiter) {
        var venster = sluiter.closest('[data-mymmo-modal]');
        if (venster) {
          event.preventDefault();
          sluiten(venster);
        }
        return;
      }

      var tab = event.target.closest('.mymmo-modal-tab');
      if (tab) {
        var eigenaar = tab.closest('[data-mymmo-modal]');
        if (eigenaar) {
          event.preventDefault();
          toon(eigenaar, tab.getAttribute('data-mymmo-tab'));
        }
        return;
      }

      // Een gewone link op de pagina naar #<id van een venster>. Zo hangt een
      // knop van het thema of van Elementor aan dit venster zonder een regel
      // code -- en zonder dit script werkt diezelfde link ook, via :target.
      var link = event.target.closest('a[href]');
      if (link) {
        var vanLink = vensterVanLink(link);
        if (vanLink) {
          event.preventDefault();
          openen(vanLink, link);
        }
      }
    });

    document.addEventListener('keydown', function (event) {
      if (!openVenster) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        sluiten(openVenster);
        return;
      }

      if (event.target && event.target.closest && event.target.closest('.mymmo-modal-tab')) {
        tabToets(openVenster, event);
        return;
      }

      vangTab(event);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
}());
