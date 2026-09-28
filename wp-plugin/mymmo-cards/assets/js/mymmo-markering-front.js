/**
 * Kiest per gemarkeerd woord de streep met de best passende LENGTE.
 *
 * Een streep wordt met `preserveAspectRatio="none"` uitgerekt tot de breedte van
 * het woord. Dat rekt ook de textuur uit: een tekening voor drie letters wordt
 * over een lange woordgroep een uitgesmeerde balk waarin de trapjes aan het
 * einde even breed worden als een letter. Daarom bestaan er meerdere tekeningen
 * van dezelfde stift, elk voor een andere woordlengte; dit script meet het woord
 * en zet de dichtstbijzijnde erop.
 *
 * WAT ER GEBEURT ALS DIT SCRIPT NIET DRAAIT: niets bijzonders. De gegenereerde
 * CSS zet per vorm al de MIDDELSTE lengte, dus er staat altijd een streep. Dit
 * script maakt die keuze alleen beter.
 *
 * HET ZET EEN INLINE CSS-VARIABELE, geen klasse. Een klasse per lengte zou
 * betekenen dat de keuze in de opgeslagen inhoud terechtkomt -- en dan staat er
 * in de database een lengte die hoort bij de schermbreedte van de redacteur op
 * het moment van typen. De variabele leeft alleen in de browser die hem zet.
 */

(function () {
  'use strict';

  var VORMEN = window.MymmoMarkeringVormen;
  if (!VORMEN || !VORMEN.length) {
    return;
  }

  var GEBROKEN = 'mymmo-mark--gebroken';

  var perSlug = {};
  VORMEN.forEach(function (vorm) {
    if (vorm && vorm.slug && vorm.varianten && vorm.varianten.length) {
      perSlug[vorm.slug] = vorm.varianten;
    }
  });

  function vormVan(el) {
    var klassen = el.className;
    if (typeof klassen !== 'string') {
      return null;
    }

    var gevonden = null;
    klassen.split(/\s+/).forEach(function (k) {
      if (k.indexOf('mymmo-mark--') !== 0 || k.indexOf('mymmo-mark--kleur-') === 0) {
        return;
      }
      var slug = k.slice('mymmo-mark--'.length);
      if (perSlug[slug]) {
        gevonden = perSlug[slug];
      }
    });

    /* Geen vormklasse: dan geldt de valregel uit de CSS, en die hoort bij de
       eerste vorm. Ook die verdient de juiste lengte. */
    if (!gevonden && VORMEN[0] && VORMEN[0].varianten) {
      gevonden = VORMEN[0].varianten;
    }

    return gevonden;
  }

  function kiesUrl(varianten, ratio) {
    var beste = varianten[0];
    var besteAfstand = Infinity;

    varianten.forEach(function (v) {
      /* Vergelijken in het LOGARITMISCHE domein: 2 tegenover 4 is even ver mis
         als 4 tegenover 8. Lineair meten laat de langste tekening altijd winnen
         zodra een woord lang wordt, ook als ze dan dubbel zo ver mis zit als de
         op een na langste. */
      var afstand = Math.abs(Math.log(ratio / v.ratio));
      if (afstand < besteAfstand) {
        besteAfstand = afstand;
        beste = v;
      }
    });

    return beste.url;
  }

  function pas(el) {
    var varianten = vormVan(el);
    if (!varianten) {
      return;
    }

    /* BREEKT DE MARKERING OVER TWEE REGELS, dan valt de streep weg.
       Het pseudo-element staat absoluut en zou dan de ruimte beslaan van het
       begin van de eerste regel tot het einde van de laatste: een smalle, hoge
       doos, zichtbaar als een verticaal streepje dwars door twee regels. Dat
       leest als een fout in de pagina; geen streep leest als een keuze. */
    var rechthoeken = el.getClientRects();
    if (rechthoeken.length > 1) {
      el.classList.add(GEBROKEN);
      return;
    }
    el.classList.remove(GEBROKEN);

    var doos = rechthoeken.length ? rechthoeken[0] : el.getBoundingClientRect();
    if (!doos.width || !doos.height) {
      return;
    }

    /* MEET HET PSEUDO-ELEMENT ZELF, niet het woord. De streep is breder dan het
       woord en heeft haar eigen vaste hoogte; wie het woord meet, meet iets
       anders dan wat er uitgerekt wordt -- en bij een kort woord scheelt dat een
       hele lengteklasse. `getComputedStyle(el, '::before')` geeft de gebruikte
       maten in pixels. Lukt dat niet, dan is het woord de beste schatting die
       er nog is. */
    var streep = window.getComputedStyle(el, '::before');
    var breedte = parseFloat(streep.width);
    var hoogte = parseFloat(streep.height);

    if (!(breedte > 0) || !(hoogte > 0)) {
      breedte = doos.width;
      hoogte = doos.height;
    }

    var url = kiesUrl(varianten, breedte / hoogte);
    if (el.style.getPropertyValue('--mk-mark-vorm').indexOf(url) !== -1) {
      return; // Al goed -- niets schrijven, anders vuurt de observer eeuwig door.
    }

    el.style.setProperty('--mk-mark-vorm', 'url("' + url + '")');
  }

  function alles() {
    var marks = document.querySelectorAll('.mymmo-mark');
    for (var i = 0; i < marks.length; i++) {
      pas(marks[i]);
    }
  }

  var wacht = null;
  function straks() {
    if (wacht) {
      window.clearTimeout(wacht);
    }
    wacht = window.setTimeout(function () {
      wacht = null;
      alles();
    }, 150);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', alles);
  } else {
    alles();
  }

  window.addEventListener('load', straks);
  window.addEventListener('resize', straks);

  /* Een lettertype dat later binnenkomt verandert de breedte van het woord, en
     dus mogelijk de lengteklasse. */
  if (document.fonts && document.fonts.ready && document.fonts.ready.then) {
    document.fonts.ready.then(alles);
  }

  /* Voor het canvas van de editor: daar verschijnt en verandert tekst terwijl
     iemand typt. Bewust GEEN `attributes` in de opties -- dit script zet zelf
     een style-attribuut, en dat zou zichzelf aan de gang houden. */
  if (window.MutationObserver && document.body) {
    new window.MutationObserver(straks).observe(document.body, {
      childList: true,
      characterData: true,
      subtree: true
    });
  }
}());
