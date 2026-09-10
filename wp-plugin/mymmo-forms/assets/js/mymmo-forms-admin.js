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

  function bouwShortcode() {
    var keuze = document.getElementById('mymmoFormsPick');
    var titel = document.getElementById('mymmoFormsTitle');
    var taal = document.getElementById('mymmoFormsLang');
    var uit = document.getElementById('mymmoFormsShortcode');
    if (!keuze || !uit) return;

    var slug = keuze.value;
    if (!slug) {
      uit.value = '';
      return;
    }

    var code = '[mymmo_form slug="' + slug + '"';
    // title="no" en lang="..." alleen toevoegen als ze van de standaard
    // afwijken: een shortcode met overbodige attributen leest slechter en
    // nodigt uit tot kopiëren-en-aanpassen op de verkeerde plek.
    if (titel && !titel.checked) code += ' title="no"';
    if (taal && taal.value) code += ' lang="' + taal.value + '"';
    code += ']';

    uit.value = code;
  }

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
        bouwShortcode();
      });
    }
    if (titel) titel.addEventListener('change', bouwShortcode);
    if (taal) taal.addEventListener('change', bouwShortcode);

    vulTalen();

    document.addEventListener('click', function (event) {
      var knop = event.target.closest('[data-mymmo-copy]');
      if (!knop) return;
      event.preventDefault();
      kopieer(knop);
    });

    bouwShortcode();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
}());
