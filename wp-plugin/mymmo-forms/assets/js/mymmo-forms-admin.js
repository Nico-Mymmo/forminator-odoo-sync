/**
 * Mymmo Forms — de shortcode-bouwer in wp-admin.
 *
 * Uitsluitend gemaksverbetering. De pagina werkt zonder dit bestand: de tabel
 * eronder toont van elk formulier de volledige shortcode, klaar om te
 * selecteren en te kopiëren. Wat hier bijkomt is het samenstellen van een
 * shortcode mét opties, en een kopieerknop.
 *
 * Bewust geen bouwstap en geen afhankelijkheden -- dit is één scherm in
 * wp-admin, geen applicatie.
 */

(function () {
  'use strict';

  var TAALNAMEN = { nl: 'Nederlands', fr: 'Frans', en: 'Engels' };

  function talenVanFormulier(keuze) {
    try {
      var kaart = JSON.parse(keuze.getAttribute('data-mymmo-langs') || '{}');
      return kaart[keuze.value] || null;
    } catch (_) {
      return null;
    }
  }

  /**
   * De taalkeuze vullen met de talen die DIT formulier echt heeft.
   *
   * Een vaste lijst nl/fr/en zou je een shortcode met lang="fr" laten maken voor
   * een formulier dat geen Frans kent. Dat geeft geen foutmelding -- de pagina
   * valt stil terug op het Nederlands -- en dat is precies het soort fout dat
   * maanden blijft staan.
   */
  function vulTalen() {
    var keuze = document.getElementById('mymmoFormsPick');
    var taal = document.getElementById('mymmoFormsLang');
    if (!keuze || !taal) return;

    var info = talenVanFormulier(keuze);
    var talen = (info && info.languages) || [];
    var vorige = taal.value;

    taal.innerHTML = '';

    var volgPagina = document.createElement('option');
    volgPagina.value = '';
    volgPagina.textContent = 'Volg de taal van de pagina';
    taal.appendChild(volgPagina);

    talen.forEach(function (code) {
      var optie = document.createElement('option');
      optie.value = code;
      optie.textContent = (TAALNAMEN[code] || code.toUpperCase())
        + (info && code === info.default ? ' (standaard)' : '');
      taal.appendChild(optie);
    });

    // De vorige keuze behouden als het nieuwe formulier die taal ook heeft.
    taal.value = talen.indexOf(vorige) !== -1 ? vorige : '';

    // Eentalig formulier: een keuzelijst met één taal erin is ruis.
    var rij = taal.closest ? taal.closest('tr') : null;
    if (rij) rij.hidden = talen.length < 2;
  }

  /** "inline" (formulier op de pagina) of "knop" (venster met tabbladen). */
  function soort() {
    var gekozen = document.querySelector('input[name="mymmoFormsSoort"]:checked');
    return gekozen && gekozen.value === 'knop' ? 'knop' : 'inline';
  }

  /**
   * Een waarde die veilig tussen aanhalingstekens in een shortcode past.
   *
   * Een " of een ] in een knoptekst hakt de shortcode doormidden, en WordPress
   * toont dan de rest als platte tekst op de pagina. Dat is precies het soort
   * fout dat pas op de live pagina opvalt.
   */
  function schoon(waarde) {
    return String(waarde || '').replace(/["\[\]]/g, '').trim();
  }

  function waardeVan(id) {
    var el = document.getElementById(id);
    return el ? schoon(el.value) : '';
  }

  /**
   * De stand van een tekening: schaal en verschuiving.
   *
   * De velden zijn getallen (percentage, pixels); de shortcode wil een waarde
   * met eenheid. Leeg blijft leeg -- dan valt de weergave terug op de standaard,
   * en bij de tweede tekening op de stand van de eerste.
   *
   * @param {Object<string,string>} atts
   * @param {Array<Array<string>>} paren  [veld-id, attribuut, eenheid]
   */
  function standVan(atts, paren) {
    paren.forEach(function (paar) {
      var el = document.getElementById(paar[0]);
      if (!el) return;
      var waarde = String(el.value || '').trim();
      if (waarde === '') return;
      var getal = parseFloat(waarde);
      if (isNaN(getal)) return;
      atts[paar[1]] = getal + paar[2];
    });
  }

  function aangevinkt(id) {
    var el = document.getElementById(id);
    return !!(el && el.checked);
  }

  /**
   * De opsomming: één punt per regel in het tekstvak, een | in de shortcode.
   *
   * Een echte regelovergang kan niet in een shortcode-attribuut -- WordPress
   * kapt de shortcode daar af en de rest belandt als platte tekst op de pagina.
   * En een komma kan niet als scheidingsteken: "Antwoord binnen 1 werkdag, ook
   * in het weekend" is één punt.
   */
  function puntenVan(id) {
    var el = document.getElementById(id);
    if (!el) return '';

    var uit = [];
    var regels = String(el.value || '').split(/\r?\n/);
    for (var i = 0; i < regels.length; i += 1) {
      var punt = schoon(regels[i]).replace(/\|/g, '');
      if (punt) uit.push(punt);
    }
    return uit.slice(0, 6).join('|');
  }

  /**
   * De link naar de agenda: uit de keuzelijst met de afspraken die de
   * Operations Manager kent, of uit het tekstvak als daar bewust voor gekozen
   * is.
   *
   * De keuzelijst staat er alleen als de OM afspraken teruggaf. Zonder die
   * lijst (niets ingesteld, of de OM was onbereikbaar) blijft het tekstvak
   * de enige weg -- een knop met venster maken mag nooit stukgaan omdat
   * Calendly hier toevallig niet bekend is.
   */
  function agendaWaarde() {
    var keuze = document.getElementById('mymmoFormsCalendlyPick');
    if (!keuze || keuze.value === '__anders__') {
      return waardeVan('mymmoFormsCalendly');
    }
    return schoon(keuze.value);
  }

  /** "eigen" (de shortcode zet de knop) of "bestaand" (aan iets anders hangen). */
  function knopSoort() {
    var gekozen = document.querySelector('input[name="mymmoFormsKnopSoort"]:checked');
    return gekozen && gekozen.value === 'bestaand' ? 'bestaand' : 'eigen';
  }

  /**
   * Het id van het venster, zoals Mymmo_Forms_Shortcodes::modal_id() het maakt.
   *
   * Twee plekken die hetzelfde moeten uitrekenen -- dat kan niet anders, want de
   * bouwer moet het anker tonen VOOR de shortcode ooit gedraaid heeft. Verandert
   * modal_id() ooit, dan hoort dit mee te veranderen.
   */
  function ankerVan(slug) {
    return slug ? '#mymmo-modal-' + slug : '#mymmo-modal-...';
  }

  /** De velden die alleen bij een knop horen tonen of verbergen. */
  function toonRijen() {
    var knop = soort() === 'knop';
    var rijen = document.querySelectorAll('[data-mymmo-alleen="knop"]');
    for (var i = 0; i < rijen.length; i += 1) {
      rijen[i].hidden = !knop;
    }

    // De kleurkiezer heeft pas zin als je een eigen kleur wil; anders volgt de
    // knop het formulier en zou een kleur naast een uitgevinkt vakje enkel
    // verwarren over wat er nu geldt.
    var kleur = document.getElementById('mymmoFormsAccent');
    if (kleur) kleur.hidden = !aangevinkt('mymmoFormsAccentAan');

    var vlak = document.getElementById('mymmoFormsBg');
    if (vlak) vlak.hidden = !aangevinkt('mymmoFormsBgAan');

    var icoon = document.getElementById('mymmoFormsIcon');
    if (icoon) icoon.hidden = !aangevinkt('mymmoFormsIconAan');

    var bestaand = document.getElementById('mymmoFormsBestaand');
    if (bestaand) bestaand.hidden = knopSoort() !== 'bestaand';

    // Het vrije tekstvak hoort bij de keuze "Andere link...". Staat de
    // keuzelijst er niet (geen gekende afspraken), dan blijft het tekstvak
    // gewoon staan -- die stand wordt serverside gezet.
    var agendaKeuze = document.getElementById('mymmoFormsCalendlyPick');
    var agendaVrij = document.getElementById('mymmoFormsCalendly');
    if (agendaKeuze && agendaVrij) agendaVrij.hidden = agendaKeuze.value !== '__anders__';

    // Het anker dat de gebruiker in zijn eigen knop moet plakken.
    var anker = document.getElementById('mymmoFormsAnker');
    var keuze = document.getElementById('mymmoFormsPick');
    if (anker && keuze) anker.textContent = ankerVan(keuze.value);
  }

  /**
   * Alles wat nu ingesteld staat, als attributen-object.
   *
   * DIT IS DE ENIGE PLEK die weet hoe een invoerveld een shortcode-attribuut
   * wordt. bouwShortcode() maakt er de tekenreeks van; het levende voorbeeld
   * (mymmo-forms-preview.js) laat de server er hetzelfde venster mee renderen
   * als de shortcode straks op de pagina doet. Zouden die twee elk hun eigen
   * vertaling maken, dan kan het voorbeeld iets tonen dat de shortcode niet
   * oplevert -- en een voorbeeld dat kan liegen is erger dan geen voorbeeld.
   *
   * Attributen die niet van de standaard afwijken komen er NIET in: een
   * shortcode vol overbodige attributen leest slechter en nodigt uit tot
   * kopiëren-en-aanpassen op de verkeerde plek.
   *
   * @return {{soort:string, atts:Object<string,string>}}
   */
  function attributen() {
    var keuze = document.getElementById('mymmoFormsPick');
    var titel = document.getElementById('mymmoFormsTitle');
    var taal = document.getElementById('mymmoFormsLang');

    var knop = soort() === 'knop';
    var atts = { slug: keuze ? keuze.value : '' };

    if (knop) {
      var label = waardeVan('mymmoFormsLabel');
      var agenda = agendaWaarde();
      var variant = document.getElementById('mymmoFormsVariant');

      if (label) atts.label = label;
      if (agenda) atts.calendly = agenda;

      // De zijkolom.
      var intro = waardeVan('mymmoFormsIntro');
      var punten = puntenVan('mymmoFormsPunten');
      var beeld = waardeVan('mymmoFormsImage');
      var beeldAlt = waardeVan('mymmoFormsImageAlt');
      var beeldCal = waardeVan('mymmoFormsImageCal');
      var beeldCalAlt = waardeVan('mymmoFormsImageCalAlt');
      var watermerk = waardeVan('mymmoFormsWatermark');

      if (intro) atts.intro = intro;
      if (punten) atts.points = punten;
      if (beeld) atts.image = beeld;
      // Een beschrijving zonder afbeelding beschrijft niets.
      if (beeld && beeldAlt) atts.image_alt = beeldAlt;
      if (beeldCal) atts.image_calendly = beeldCal;
      if (beeldCal && beeldCalAlt) atts.image_calendly_alt = beeldCalAlt;
      if (watermerk) atts.watermark = watermerk;

      // De stand van elk beeld apart. Alleen meegeven als er een tekening is:
      // een schaal voor iets dat er niet staat, is ruis in de shortcode.
      if (beeld) {
        standVan(atts, [
          ['mymmoFormsImageScale', 'image_scale', '%'],
          ['mymmoFormsImageX', 'image_x', 'px'],
          ['mymmoFormsImageY', 'image_y', 'px']
        ]);
      }
      if (beeldCal) {
        standVan(atts, [
          ['mymmoFormsImageCalScale', 'image_calendly_scale', '%'],
          ['mymmoFormsImageCalX', 'image_calendly_x', 'px'],
          ['mymmoFormsImageCalY', 'image_calendly_y', 'px']
        ]);
      }
      if (watermerk) {
        standVan(atts, [
          ['mymmoFormsWmScale', 'watermark_scale', '%'],
          ['mymmoFormsWmX', 'watermark_x', 'px'],
          ['mymmoFormsWmY', 'watermark_y', 'px'],
          ['mymmoFormsWmRot', 'watermark_rotate', 'deg']
        ]);
      }

      // De opschriften van de tabbladen alleen meegeven als ze afwijken van de
      // standaard, en alleen als er een tweede tabblad IS: zonder agenda staat
      // er maar een deel in het venster en is er niets om op te schrijven.
      if (agenda) {
        var tabForm = waardeVan('mymmoFormsTabForm');
        var tabAgenda = waardeVan('mymmoFormsTabCalendly');
        if (tabForm && tabForm !== 'Stuur ons een bericht') atts.tab_form = tabForm;
        if (tabAgenda && tabAgenda !== 'Plan een gesprek') atts.tab_calendly = tabAgenda;

        var subForm = waardeVan('mymmoFormsTabFormSub');
        var subAgenda = waardeVan('mymmoFormsTabCalendlySub');
        if (subForm) atts.tab_form_sub = subForm;
        if (subAgenda) atts.tab_calendly_sub = subAgenda;
      }

      if (variant && variant.value === 'outline') atts.variant = 'outline';

      // De kleur alleen meegeven als er bewust voor gekozen is: zonder dit
      // attribuut volgt de knop het formulier, en dat is de bedoeling.
      var kleur = document.getElementById('mymmoFormsAccent');
      if (kleur && aangevinkt('mymmoFormsAccentAan') && kleur.value) {
        atts.accent = schoon(kleur.value);
      }

      var vlak = document.getElementById('mymmoFormsBg');
      if (vlak && aangevinkt('mymmoFormsBgAan') && vlak.value) {
        atts.background = schoon(vlak.value);
      }

      var icoon = document.getElementById('mymmoFormsIcon');
      if (icoon && aangevinkt('mymmoFormsIconAan') && icoon.value) {
        atts.icon_color = schoon(icoon.value);
      }

      // De tekstkleur op de knoppen. Wit is de standaard en hoeft dus niet in
      // de shortcode -- dat scheelt een attribuut op elke plaatsing.
      var knoptekst = document.getElementById('mymmoFormsAccentText');
      if (knoptekst && knoptekst.value && knoptekst.value.toLowerCase() !== '#ffffff') {
        atts.accent_text = schoon(knoptekst.value);
      }

      var dank = waardeVan('mymmoFormsThanksCalendly');
      if (dank) atts.thanks_calendly = dank;

      var doelAgenda = waardeVan('mymmoFormsGoalCalendly');
      if (doelAgenda) atts.goal_calendly = doelAgenda;

      if (knopSoort() === 'bestaand') {
        atts.button = 'no';
        var trigger = waardeVan('mymmoFormsTrigger');
        if (trigger) atts.trigger = trigger;
      }
    }

    // De opvulling geldt voor allebei de soorten: binnen het kaartje van het
    // venster, of rond een formulier dat in een pagina staat.
    var padX = waardeVan('mymmoFormsPadX');
    var padY = waardeVan('mymmoFormsPadY');
    var tussen = waardeVan('mymmoFormsGap');
    if (padX) atts.padding_x = padX;
    if (padY) atts.padding_y = padY;
    if (tussen) atts.gap = tussen;

    // Het pad dat vroeger de bedankpagina was. Geldt voor allebei de soorten:
    // ook een formulier dat gewoon op een pagina staat, hoort meetbaar te zijn.
    var doelForm = waardeVan('mymmoFormsGoalForm');
    if (doelForm) atts.goal_form = doelForm;

    // De kop. Uitgevinkt = geen kop; aangevinkt met een eigen tekst = die
    // tekst; aangevinkt zonder tekst = de naam van het formulier uit de OM.
    var kop = waardeVan('mymmoFormsHeading');
    if (titel && !titel.checked) {
      atts.title = 'no';
    } else if (knop && kop) {
      atts.title = kop;
    }

    if (taal && taal.value) atts.lang = taal.value;

    return { soort: knop ? 'knop' : 'inline', atts: atts };
  }

  /**
   * De shortcode samenstellen -- in de vorm die je hier ECHT wil hebben.
   *
   * Staat er een opstelling open, dan is dat `[... preset="..."]`: die verwijst
   * naar de opstelling, dus een wijziging daar werkt door op elke pagina waar
   * hij staat. Dat is de hele reden dat opstellingen bestaan.
   *
   * De volledige versie met alle attributen is een BEVROREN KOPIE: handig voor
   * een eenmalige plaatsing, maar wie die op vijf pagina's zet heeft vijf
   * kopieën die nergens meer van meekrijgen. Ze blijft bereikbaar, dichtgeklapt,
   * met erbij wat ze betekent.
   */
  function bouwShortcode() {
    var uit = document.getElementById('mymmoFormsShortcode');
    if (!uit) return;

    var resultaat = attributen();
    var los = document.getElementById('mymmoFormsShortcodeLos');
    var losBlok = document.querySelector('[data-mymmo-los]');
    var vorm = document.querySelector('[data-mymmo-vorm]');
    var uitleg = document.querySelector('[data-mymmo-vorm-uitleg]');

    if (!resultaat.atts.slug) {
      uit.value = '';
      if (los) los.value = '';
      return;
    }

    var opening = resultaat.soort === 'knop' ? '[mymmo_form_button' : '[mymmo_form';

    var volledig = opening;
    Object.keys(resultaat.atts).forEach(function (naam) {
      volledig += ' ' + naam + '="' + resultaat.atts[naam] + '"';
    });
    volledig += ']';

    var opstelling = waardeVan('mymmoFormsPresetId');

    if (opstelling) {
      uit.value = opening + ' preset="' + opstelling + '"]';
      if (los) los.value = volledig;
      if (losBlok) losBlok.hidden = false;
      if (vorm) vorm.textContent = '— verwijst naar je opstelling';
      if (uitleg) {
        uitleg.textContent = 'Zet deze op zoveel pagina\'s als je wil. Pas je de opstelling later aan, '
          + 'dan verandert elke pagina mee.';
      }
    } else {
      uit.value = volledig;
      if (los) los.value = '';
      if (losBlok) losBlok.hidden = true;
      if (vorm) vorm.textContent = '';
      if (uitleg) {
        uitleg.textContent = 'Dit is een losse kopie: een latere wijziging hier verandert niets aan pagina\'s '
          + 'waar je hem al plakte. Bewaar het hierboven als opstelling om dat wél te kunnen.';
      }
    }
  }

  /**
   * Een bewaarde opstelling terug in de velden zetten.
   *
   * DE OMGEKEERDE van attributen(): daar wordt een veld een attribuut, hier
   * wordt een attribuut weer een veld. Lopen die twee uit elkaar, dan laadt een
   * opstelling anders terug dan ze bewaard is -- en dat merk je pas wanneer je
   * iets aanpast en opnieuw bewaart, met een verschil dat je niet gemaakt hebt.
   *
   * @param {Object<string,string>} atts
   * @param {string} soort  'knop' of 'inline'
   */
  function vulIn(atts, soort) {
    atts = atts || {};

    var knopKeuze = document.querySelector(
      'input[name="mymmoFormsSoort"][value="' + (soort === 'inline' ? 'inline' : 'knop') + '"]'
    );
    if (knopKeuze) knopKeuze.checked = true;

    var keuze = document.getElementById('mymmoFormsPick');
    if (keuze && atts.slug) {
      keuze.value = atts.slug;
      // De talen van dit formulier opnieuw opbouwen vóór de taal gezet wordt:
      // anders staat de gewenste taal nog niet in de lijst en valt ze weg.
      vulTalen();
    }

    zetVeld('mymmoFormsLabel', atts.label);
    zetVeld('mymmoFormsIntro', atts.intro);
    zetVeld('mymmoFormsPunten', String(atts.points || '').split('|').join('\n'));
    zetVeld('mymmoFormsImage', atts.image);
    zetVeld('mymmoFormsImageAlt', atts.image_alt);
    zetVeld('mymmoFormsImageCal', atts.image_calendly);
    zetVeld('mymmoFormsImageCalAlt', atts.image_calendly_alt);
    zetVeld('mymmoFormsWatermark', atts.watermark);
    zetVeld('mymmoFormsAccentText', atts.accent_text || '#ffffff');

    // De getalvelden: de eenheid eraf, want die staat als label in het scherm.
    [
      ['mymmoFormsImageScale', 'image_scale'], ['mymmoFormsImageX', 'image_x'], ['mymmoFormsImageY', 'image_y'],
      ['mymmoFormsImageCalScale', 'image_calendly_scale'], ['mymmoFormsImageCalX', 'image_calendly_x'],
      ['mymmoFormsImageCalY', 'image_calendly_y'],
      ['mymmoFormsWmScale', 'watermark_scale'], ['mymmoFormsWmX', 'watermark_x'], ['mymmoFormsWmY', 'watermark_y'],
      ['mymmoFormsWmRot', 'watermark_rotate']
    ].forEach(function (paar) {
      var ruw = atts[paar[1]];
      zetVeld(paar[0], ruw ? parseFloat(ruw) : '');
    });

    var eigenIcoon = !!atts.icon_color;
    var icoonAan = document.getElementById('mymmoFormsIconAan');
    if (icoonAan) icoonAan.checked = eigenIcoon;
    if (eigenIcoon) zetVeld('mymmoFormsIcon', atts.icon_color);
    zetVeld('mymmoFormsTabForm', atts.tab_form || 'Stuur ons een bericht');
    zetVeld('mymmoFormsTabCalendly', atts.tab_calendly || 'Plan een gesprek');
    zetVeld('mymmoFormsTabFormSub', atts.tab_form_sub);
    zetVeld('mymmoFormsTabCalendlySub', atts.tab_calendly_sub);
    zetVeld('mymmoFormsTrigger', atts.trigger);
    zetVeld('mymmoFormsPadX', atts.padding_x);
    zetVeld('mymmoFormsPadY', atts.padding_y);
    zetVeld('mymmoFormsGap', atts.gap);
    zetVeld('mymmoFormsThanksCalendly', atts.thanks_calendly);
    zetVeld('mymmoFormsGoalForm', atts.goal_form);
    zetVeld('mymmoFormsGoalCalendly', atts.goal_calendly);

    var eigenVlak = !!atts.background;
    var vlakAan = document.getElementById('mymmoFormsBgAan');
    if (vlakAan) vlakAan.checked = eigenVlak;
    if (eigenVlak) zetVeld('mymmoFormsBg', atts.background);
    zetVeld('mymmoFormsVariant', atts.variant === 'outline' ? 'outline' : 'primary');
    zetVeld('mymmoFormsLang', atts.lang || '');

    // De kop: 'no' is geen kop, iets anders is een eigen kop, niets is de naam
    // van het formulier.
    var titel = document.getElementById('mymmoFormsTitle');
    if (titel) titel.checked = atts.title !== 'no';
    zetVeld('mymmoFormsHeading', atts.title && atts.title !== 'no' ? atts.title : '');

    // De agenda staat in een keuzelijst als de Operations Manager afspraken
    // kent, en anders in een tekstvak. Beide vullen: welke van de twee er staat,
    // hangt af van dit scherm en niet van de opstelling.
    zetVeld('mymmoFormsCalendly', atts.calendly);
    var agendaKeuze = document.getElementById('mymmoFormsCalendlyPick');
    if (agendaKeuze) {
      var bestaat = Array.prototype.some.call(agendaKeuze.options, function (o) {
        return o.value === atts.calendly;
      });
      agendaKeuze.value = bestaat ? (atts.calendly || '') : (atts.calendly ? '__anders__' : '');
    }

    var eigenKleur = !!atts.accent;
    var aan = document.getElementById('mymmoFormsAccentAan');
    if (aan) aan.checked = eigenKleur;
    if (eigenKleur) zetVeld('mymmoFormsAccent', atts.accent);

    var knopSoortKeuze = document.querySelector(
      'input[name="mymmoFormsKnopSoort"][value="' + (atts.button === 'no' ? 'bestaand' : 'eigen') + '"]'
    );
    if (knopSoortKeuze) knopSoortKeuze.checked = true;

    toonRijen();
    bouwShortcode();

    // Het voorbeeld hangt aan de gebeurtenissen van de velden; hier is in één
    // keer alles gewijzigd, dus één sein volstaat.
    document.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function zetVeld(id, waarde) {
    var el = document.getElementById(id);
    if (el) el.value = waarde === undefined || waarde === null ? '' : String(waarde);
  }

  /**
   * De naam waaronder de huidige opstelling geladen is.
   *
   * Nodig om "bijwerken" van "een nieuwe maken" te onderscheiden: zolang de
   * naam deze is, werkt Bewaren de geladen opstelling bij; verander je hem, dan
   * hoort er een nieuwe bij te komen en niet stil een andere overschreven te
   * worden -- die staat mogelijk op pagina's die je niet in beeld hebt.
   */
  var geladenNaam = null;

  /** Bewaren: de huidige stand als JSON in het verborgen veld van het formulier. */
  function vulOpstellingFormulier() {
    var resultaat = attributen();
    zetVeld('mymmoFormsPresetAtts', JSON.stringify(resultaat.atts));
    zetVeld('mymmoFormsPresetSoort', resultaat.soort);
  }

  // Wat het voorbeeldscript nodig heeft. Bewust enkel lezen en opnieuw
  // opbouwen: het canvas schrijft in de invoervelden zelf, zodat die de bron
  // blijven en er geen tweede toestand naast ontstaat.
  window.MymmoFormsBouwer = {
    attributen: attributen,
    herbouw: bouwShortcode,
    vulIn: vulIn
  };

  function kopieer(knop) {
    var uit = document.getElementById(knop.dataset.mymmoCopy);
    if (!uit || !uit.value) return;

    var klaar = function (gelukt) {
      var oud = knop.textContent;
      knop.textContent = gelukt ? 'Gekopieerd' : 'Selecteer en kopieer';
      window.setTimeout(function () { knop.textContent = oud; }, 1600);
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(uit.value).then(
        function () { klaar(true); },
        // Het klembord kan geweigerd worden (geen https, geen permissie). Dan
        // maar selecteren, zodat Ctrl+C nog altijd werkt.
        function () { uit.select(); klaar(false); }
      );
      return;
    }

    uit.select();
    try { document.execCommand('copy'); klaar(true); } catch (_) { klaar(false); }
  }

  function start() {
    var keuze = document.getElementById('mymmoFormsPick');
    var titel = document.getElementById('mymmoFormsTitle');
    var taal = document.getElementById('mymmoFormsLang');
    if (keuze) {
      keuze.addEventListener('change', function () {
        vulTalen();
        // Ook toonRijen(): het anker dat je in je eigen knop plakt bevat de
        // slug, en die hoort mee te veranderen met het gekozen formulier.
        toonRijen();
        bouwShortcode();
      });
    }
    if (titel) titel.addEventListener('change', bouwShortcode);
    if (taal) taal.addEventListener('change', bouwShortcode);

    // Alles wat in de shortcode terechtkomt, opnieuw samenstellen zodra het
    // wijzigt. 'input' en niet 'change': anders zie je je knoptekst pas in de
    // shortcode staan nadat je ergens anders geklikt hebt, en dan heb je de
    // oude al gekopieerd.
    var velden = document.querySelectorAll(
      'input[name="mymmoFormsSoort"], input[name="mymmoFormsKnopSoort"],'
      + ' #mymmoFormsLabel, #mymmoFormsCalendly, #mymmoFormsCalendlyPick,'
      + ' #mymmoFormsTabForm, #mymmoFormsTabCalendly,'
      + ' #mymmoFormsTabFormSub, #mymmoFormsTabCalendlySub,'
      + ' #mymmoFormsHeading, #mymmoFormsIntro, #mymmoFormsPunten,'
      + ' #mymmoFormsImage, #mymmoFormsImageAlt,'
      + ' #mymmoFormsVariant, #mymmoFormsAccentAan, #mymmoFormsAccent, #mymmoFormsTrigger,'
      + ' #mymmoFormsPadX, #mymmoFormsPadY, #mymmoFormsGap,'
      + ' #mymmoFormsBgAan, #mymmoFormsBg, #mymmoFormsIconAan, #mymmoFormsIcon,'
      + ' #mymmoFormsAccentText, #mymmoFormsImageCal, #mymmoFormsImageCalAlt, #mymmoFormsWatermark,'
      + ' #mymmoFormsImageScale, #mymmoFormsImageX, #mymmoFormsImageY,'
      + ' #mymmoFormsImageCalScale, #mymmoFormsImageCalX, #mymmoFormsImageCalY,'
      + ' #mymmoFormsWmScale, #mymmoFormsWmX, #mymmoFormsWmY, #mymmoFormsWmRot,'
      + ' #mymmoFormsThanksCalendly,'
      + ' #mymmoFormsGoalForm, #mymmoFormsGoalCalendly'
    );
    for (var i = 0; i < velden.length; i += 1) {
      velden[i].addEventListener('input', function () {
        toonRijen();
        bouwShortcode();
      });
      velden[i].addEventListener('change', function () {
        toonRijen();
        bouwShortcode();
      });
    }

    toonRijen();
    vulTalen();

    // Net bewaard? Dan die opstelling meteen weer openen, zodat het
    // shortcode-veld de herbruikbare vorm toont in plaats van de losse.
    try {
      var netBewaard = new URLSearchParams(window.location.search).get('mymmo_preset_id');
      if (netBewaard) {
        var knop = document.querySelector('[data-mymmo-preset-load="' + netBewaard + '"]');
        if (knop) knop.click();
      }
    } catch (_) { /* geen URLSearchParams: dan gewoon niets openen */ }

    // Bij het versturen van het opstellingen-formulier pas de stand ophalen:
    // dan is het zeker wat er op dat moment op het scherm staat.
    var opstellingForm = document.getElementById('mymmoFormsPresetForm');
    if (opstellingForm) {
      opstellingForm.addEventListener('submit', vulOpstellingFormulier);
    }

    document.addEventListener('click', function (event) {
      var laden = event.target.closest('[data-mymmo-preset-load]');
      if (laden) {
        event.preventDefault();
        var atts = {};
        try {
          atts = JSON.parse(laden.getAttribute('data-mymmo-preset-atts') || '{}');
        } catch (_) {
          atts = {};
        }
        // De naam en het id EERST: opnieuw bewaren werkt daarmee de bestaande
        // opstelling bij in plaats van er een tweede naast te zetten, én
        // bouwShortcode() (die vulIn hieronder aanroept) kan er dan al de
        // herbruikbare vorm `preset="..."` uit maken. Stond dit erna, dan gaf
        // het veld de losse kopie -- precies degene die je niet wil plakken.
        geladenNaam = laden.getAttribute('data-mymmo-preset-name') || '';
        zetVeld('mymmoFormsPresetName', geladenNaam);
        zetVeld('mymmoFormsPresetId', laden.getAttribute('data-mymmo-preset-load') || '');

        vulIn(atts, laden.getAttribute('data-mymmo-preset-soort') || 'knop');
        var canvas = document.getElementById('mymmoFormsCanvas');
        if (canvas && canvas.scrollIntoView) canvas.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }

      var knop = event.target.closest('[data-mymmo-copy]');
      if (!knop) return;
      event.preventDefault();
      kopieer(knop);
    });

    // Een nieuwe naam typen betekent: een NIEUWE opstelling, niet de geladene
    // bijwerken. Zonder dit overschrijf je stil degene die je net laadde -- en
    // die staat mogelijk op pagina's die je niet in beeld hebt.
    var naamVeld = document.getElementById('mymmoFormsPresetName');
    if (naamVeld) {
      naamVeld.addEventListener('input', function () {
        if (geladenNaam !== null && naamVeld.value !== geladenNaam) {
          zetVeld('mymmoFormsPresetId', '');
        }
      });
    }

    bouwShortcode();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
}());
