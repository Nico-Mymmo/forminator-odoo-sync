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
 *   3. dubbelklikken op verzenden tegenhouden.
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

  function koppel(form) {
    var knop = form.querySelector('.mymmo-form-submit');
    var t = teksten(form);
    var bezig = false;
    var ooitGevalideerd = false;

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
      if (knop) {
        // aria-disabled en niet disabled: een echt uitgeschakelde knop wordt
        // door de browser niet meegestuurd, en dan mist de POST zijn naam.
        knop.setAttribute('aria-disabled', 'true');
        knop.dataset.mymmoLabel = knop.textContent;
        knop.textContent = t.submitting || 'Bezig met versturen…';
      }

      // Vangnet: gaat er onderweg iets mis en komt er geen redirect, dan mag de
      // bezoeker het na tien seconden opnieuw proberen in plaats van naar een
      // dode knop te kijken.
      window.setTimeout(function () {
        bezig = false;
        if (knop) {
          knop.removeAttribute('aria-disabled');
          if (knop.dataset.mymmoLabel) knop.textContent = knop.dataset.mymmoLabel;
        }
      }, 10000);
    });
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

  function start() {
    focusMelding();
    document.querySelectorAll('.mymmo-form').forEach(koppel);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
}());
