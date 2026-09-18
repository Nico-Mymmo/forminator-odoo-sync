/**
 * Mymmo Forms — het stappen-tabblad in wp-admin.
 *
 * Drie dingen, meer niet:
 *   1. de code-editor van WordPress zelf op het HTML-veld zetten;
 *   2. "Voorbeeld invoegen" laten werken;
 *   3. een bevestiging vragen bij verwijderen en bij terugzetten.
 *
 * Het scherm werkt volledig zonder dit bestand: dan is het HTML-veld een gewone
 * textarea en gaan de knoppen meteen door. Dat is geen toeval maar de reden dat
 * het opslaan een gewone formulier-POST is en geen fetch.
 */

(function () {
  'use strict';

  var cfg = window.MymmoFormsStappen || {};

  function el(id) {
    return document.getElementById(id);
  }

  /**
   * De code-editor.
   *
   * CodeMirror wordt met fromTextArea aangezet; die schrijft bij het versturen
   * van het formulier zelf terug naar de textarea. Daarom hoeft er hier geen
   * submit-handler te staan -- en mag er ook geen bijkomen die dat nog eens
   * doet.
   */
  function editor() {
    var veld = el('mymmoStapHtml');
    if (!veld) return null;

    // Geen instellingen meegekregen: de gebruiker zette "Syntaxis markeren" uit
    // in zijn profiel. Dan blijft de gewone textarea staan, en dat is precies
    // wat hij vroeg.
    if (!cfg.editor || !window.wp || !wp.codeEditor) return null;

    try {
      return wp.codeEditor.initialize(veld, cfg.editor);
    } catch (fout) {
      if (window.console && console.warn) console.warn('[Mymmo Forms] code-editor niet gestart:', fout);
      return null;
    }
  }

  function zetHtml(instantie, tekst) {
    var veld = el('mymmoStapHtml');
    if (!veld) return;

    if (instantie && instantie.codemirror) {
      instantie.codemirror.setValue(tekst);
      instantie.codemirror.refresh();
      return;
    }
    veld.value = tekst;
  }

  function leesHtml(instantie) {
    var veld = el('mymmoStapHtml');
    if (instantie && instantie.codemirror) return instantie.codemirror.getValue();
    return veld ? veld.value : '';
  }

  function voorbeelden(instantie) {
    var keuze = el('mymmoStapVoorbeeld');
    var knop  = el('mymmoStapVoorbeeldKnop');
    if (!keuze || !knop) return;

    knop.addEventListener('click', function () {
      var id = keuze.value;
      if (!id) return;

      var lijst = cfg.voorbeelden || [];
      var gevonden = null;
      for (var n = 0; n < lijst.length; n += 1) {
        if (lijst[n].id === id) { gevonden = lijst[n]; break; }
      }
      if (!gevonden) return;

      // Alleen vragen als er iets te verliezen is. Een lege editor overschrijven
      // hoeft geen bevestiging, en elke overbodige bevestiging leert mensen om
      // ze weg te klikken zonder te lezen.
      if (leesHtml(instantie).trim() !== '' &&
          !window.confirm('Dit vervangt de HTML die er nu staat. Doorgaan?')) {
        return;
      }

      zetHtml(instantie, gevonden.html);

      // De naam mee invullen als het veld nog leeg is: negen van de tien keer
      // heet de stap gewoon zoals het voorbeeld.
      var naam = el('mymmoStapNaam');
      if (naam && naam.value.trim() === '') naam.value = gevonden.naam;

      // En de titel en de sleutels, ook alleen als ze nog leeg zijn. Zonder titel
      // begon een ingevoegde stap zonder kop terwijl de stap ervoor er een had;
      // de sleutels moest je anders uit de uitleg in het bestand halen. Wat
      // iemand al getypt had, blijft staan.
      var titel = el('mymmoStapTitel');
      if (titel && titel.value.trim() === '' && gevonden.titel) titel.value = gevonden.titel;
      var sub = el('mymmoStapSub');
      if (sub && sub.value.trim() === '' && gevonden.sub) sub.value = gevonden.sub;
      var velden = el('mymmoStapVelden');
      if (velden && velden.value.trim() === '' && gevonden.velden) velden.value = gevonden.velden;
    });
  }

  /**
   * Bevestigen bij verwijderen en terugzetten.
   *
   * Via een data-attribuut op het formulier en niet met een onsubmit in de
   * HTML: dat laatste is precies wat de plugin op de voorkant ook nergens doet.
   */
  function bevestigingen() {
    document.addEventListener('submit', function (e) {
      var form = e.target;
      if (!form || !form.getAttribute) return;
      var vraag = form.getAttribute('data-mymmo-bevestig');
      if (!vraag) return;
      if (!window.confirm(vraag)) e.preventDefault();
    });
  }

  function start() {
    var instantie = editor();
    voorbeelden(instantie);
    bevestigingen();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
}());
