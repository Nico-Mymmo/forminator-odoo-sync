/* ==========================================================================
   Offerte gebouwbeheer — tekenen, bewerken, afdrukken

   Drie dingen, meer niet:

   1. TEKENEN  — het hele document wordt uit `staat` opgebouwd. Er staat nergens
                 tekst in de HTML; wat je op het blad ziet komt uit
                 offerte-data.js.

   2. BEWERKEN — je typt IN het ontwerp, niet in een lijst met invoervelden
                 ernaast. Dat is dezelfde afspraak als bij de maileditor en de
                 formulierbouwer in deze repo: een tweede bewerkscherm naast
                 het voorbeeld is precies wat die ontwerpen vermijden.

                 In de bewerkstand toont een veld zijn RUWE tekst — dus met
                 {{gebouw.adres}} en **vet** zichtbaar. Anders zou je bij het
                 typen de verwijzing zelf overschrijven met de ingevulde waarde,
                 en dan is het sjabloon stil kapot. Zet je de bewerkstand uit,
                 dan zie je weer wat er op papier komt.

   3. AFDRUKKEN — Ctrl/Cmd+P of de knop. De browser maakt de pdf; er is geen
                 aparte pdf-motor nodig. De bewerkstand gaat eerst vanzelf uit,
                 anders zou er {{gebouw.adres}} in de pdf staan.

   Typen tekent het document NIET opnieuw (dat zou de cursor wegslaan). Alleen
   een STRUCTURELE wijziging — rij erbij, rij weg, bewerkstand aan/uit, gegevens
   opgeslagen — bouwt opnieuw op. Zelfde regel als in de mailstudio.
   ========================================================================== */

(function () {
  'use strict';

  /* ?server=1     -- Browser Rendering (pdf-step.js): geen localStorage, geen
                       bewaren, enkel window.OFFERTE.zet(data) van buitenaf.
     ?template=ID  -- de editor onder Instellingen: laadt/bewaart een sjabloon
                       op de server i.p.v. (enkel) in localStorage. */
  var params = new URLSearchParams(window.location.search);
  var SERVER = params.get('server') === '1';
  var TEMPLATE_ID = params.get('template') || null;
  var OPSLAGSLEUTEL = TEMPLATE_ID ? 'offerte-ontwerp-' + TEMPLATE_ID : 'offerte-ontwerp-v1';
  /* Mag er al naar de server bewaard worden? Pas TRUE nadat het sjabloon
     succesvol is opgehaald -- anders overschrijft de allereerste bewaar() de
     inhoud van het sjabloon met de demo-gegevens uit OFFERTE_DATA. */
  var serverKlaar = !TEMPLATE_ID;

  var staat = laadStaat();
  var bewerken = false;

  /* Sjabloon-instellingen (Nummering & geldigheid) -- horen niet in
     staat.gegevens (dat zijn DEMOWAARDEN), dit bepaalt hoe het ECHTE
     offertenummer/de termijn bij een indiening berekend wordt. */
  var instellingen = { sequence_pattern: '', geldigheid_dagen: '' };

  /* Bedrijfsprofielen (fs_v2_bedrijf_profielen) -- module-breed, niet aan dit
     sjabloon gebonden. `lijst` is null tot de eerste keer geladen. */
  var bedrijven = { lijst: null, bewerkId: null };

  /* contenteditable="plaintext-only" houdt geplakte opmaak buiten de tekst.
     Firefox kent dit pas sinds 136; valt dat weg, dan gewoon "true". */
  var CE = (function () {
    var d = document.createElement('div');
    d.setAttribute('contenteditable', 'plaintext-only');
    return d.contentEditable === 'plaintext-only' ? 'plaintext-only' : 'true';
  })();

  /* ======================================================================
     Kleine helpers
     ====================================================================== */

  function kopie(o) { return JSON.parse(JSON.stringify(o)); }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* 'copy.vragen.items.2.vraag' → de waarde. Werkt ook op arrays: een stukje
     dat een getal is, wordt als index gebruikt. */
  function lees(pad, wortel) {
    var d = wortel || staat;
    var delen = String(pad).split('.');
    for (var i = 0; i < delen.length; i++) {
      if (d == null) return '';
      d = d[delen[i]];
    }
    return d == null ? '' : d;
  }

  function zet(pad, waarde, wortel) {
    var d = wortel || staat;
    var delen = String(pad).split('.');
    for (var i = 0; i < delen.length - 1; i++) {
      if (d[delen[i]] == null) d[delen[i]] = {};
      d = d[delen[i]];
    }
    d[delen[delen.length - 1]] = waarde;
  }

  /* {{pad.naar.waarde}} uit de gegevens. Onbekend → LEEG, niet de naam zelf:
     een gat valt op, een rare tekst in een brief niet. */
  function vul(tekst) {
    return String(tekst == null ? '' : tekst).replace(/\{\{\s*([\w.]+)\s*\}\}/g, function (_, pad) {
      var w = lees(pad, staat.gegevens);
      return (w === null || w === undefined) ? '' : String(w);
    });
  }

  /* **vet**, *cursief*, ==klemtoon==. Op AL GEËSCAPETE tekst, zodat een
     ingevuld gegeven nooit als HTML kan binnenkomen. */
  function opmaak(veilig) {
    return veilig
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
      .replace(/==([^=]+)==/g, '<span class="ov-klem">$1</span>');
  }

  function opmaakInline(ruw) {
    return opmaak(esc(vul(ruw))).replace(/\n/g, '<br>');
  }

  function opmaakBlok(ruw) {
    var veilig = esc(vul(ruw));
    return veilig
      .split(/\n[ \t]*\n/)
      .map(function (alinea) {
        return '<p>' + opmaak(alinea).replace(/\n/g, '<br>') + '</p>';
      })
      .join('');
  }

  /* ======================================================================
     T() — een stuk copy op het blad zetten

     pad      waar de tekst vandaan komt én waar een wijziging heen gaat
     o.tag    welk element (standaard span)
     o.klasse extra klassen
     o.blok   alinea's in plaats van één regel
     ====================================================================== */
  function T(pad, o) {
    o = o || {};
    var tag = o.tag || 'span';
    var klasse = 'ov-bind' + (o.klasse ? ' ' + o.klasse : '') + (bewerken ? ' ov-bewerk' : '');
    var ruw = String(lees(pad));

    if (bewerken) {
      return '<' + tag + ' class="' + klasse + '" data-bind="' + esc(pad) + '"' +
        ' contenteditable="' + CE + '" spellcheck="false">' + esc(ruw) + '</' + tag + '>';
    }
    return '<' + tag + ' class="' + klasse + '" data-bind="' + esc(pad) + '">' +
      (o.blok ? opmaakBlok(ruw) : opmaakInline(ruw)) + '</' + tag + '>';
  }

  /* Knopjes achter een rij: omhoog, omlaag, weg (staan er alleen in de
     bewerkstand). Elke lijst met een wegknop kan zo ook herschikt worden;
     de eerste rij heeft geen "omhoog", de laatste geen "omlaag". */
  function wegKnop(lijstPad, index) {
    var lijst = lees(lijstPad);
    var aantal = Array.isArray(lijst) ? lijst.length : 0;
    var attrs = ' data-lijst="' + esc(lijstPad) + '" data-index="' + index + '"';
    return (index > 0
        ? '<button type="button" class="ov-rijknop ov-rijknop--weg ov-rijknop--pijl" data-action="rij-op"' +
          attrs + ' title="Een plaats omhoog">&uarr;</button>'
        : '') +
      (index < aantal - 1
        ? '<button type="button" class="ov-rijknop ov-rijknop--weg ov-rijknop--pijl" data-action="rij-neer"' +
          attrs + ' title="Een plaats omlaag">&darr;</button>'
        : '') +
      '<button type="button" class="ov-rijknop ov-rijknop--weg" data-action="rij-weg"' +
      attrs + ' title="Deze rij verwijderen">&times;</button>';
  }

  function erbijKnop(lijstPad, label) {
    return '<div class="ov-rijknoppen"><button type="button" class="ov-rijknop" data-action="rij-erbij"' +
      ' data-lijst="' + esc(lijstPad) + '">+ ' + esc(label || 'rij') + '</button></div>';
  }

  /* ======================================================================
     Het blad
     ====================================================================== */

  function kop() {
    var g = staat.gegevens;
    return '<header class="ov-kop">' +
      '<img class="ov-kop-logo" src="' + esc(g.beeld.logo) + '" alt="' + esc(g.bedrijf.naam) + '">' +
      '<div class="ov-kop-rechts">' +
        T('copy.kop.titel', { tag: 'div', klasse: 'ov-kop-titel' }) +
        T('copy.kop.regel', { tag: 'div' }) +
        T('copy.kop.geldig', { tag: 'div' }) +
      '</div>' +
    '</header>';
  }

  function voet() {
    return '<footer class="ov-voet">' +
      T('copy.voet.links', { tag: 'div' }) +
      T('copy.voet.rechts', { tag: 'div' }) +
    '</footer>';
  }

  function blad(nummer, inhoud) {
    return '<section class="ov-pagina" data-pagina="' + nummer + '">' +
      kop() +
      '<div class="ov-body">' + inhoud + '</div>' +
      voet() +
      '<div class="ov-vol-melding">Deze pagina loopt over. Kort de tekst in of verplaats een blok ' +
      '&mdash; wat hieronder valt, staat niet in de pdf.</div>' +
    '</section>';
  }

  /* --- pagina 1 --------------------------------------------------------- */
  function blokkenPagina1() {
    var g = staat.gegevens;
    var c = staat.copy;

    var gegevensRijen = c.offerte.rijen.map(function (r, i) {
      return '<div class="ov-gegevens-rij">' +
        T('copy.offerte.rijen.' + i + '.label', { tag: 'div', klasse: 'ov-gegevens-label' }) +
        '<div class="ov-gegevens-waarde">' +
          T('copy.offerte.rijen.' + i + '.waarde') + wegKnop('copy.offerte.rijen', i) +
        '</div>' +
      '</div>';
    }).join('');

    var vglKop = '<div class="ov-vgl-rij ov-vgl-kop">' +
      c.vergelijking.kop.map(function (_, i) {
        return T('copy.vergelijking.kop.' + i, { tag: 'div', klasse: 'ov-vgl-cel' });
      }).join('') +
    '</div>';

    var vglRijen = c.vergelijking.rijen.map(function (rij, i) {
      return '<div class="ov-vgl-rij">' +
        rij.map(function (_, j) {
          /* De laatste kolom draagt het wegknopje. Dat moet NAAST de tekst staan,
             dus daar is de cel een omhulsel met een span erin in plaats van dat
             de gebonden tekst zelf de cel is. */
          if (j === rij.length - 1) {
            return '<div class="ov-vgl-cel">' +
              T('copy.vergelijking.rijen.' + i + '.' + j) +
              wegKnop('copy.vergelijking.rijen', i) +
            '</div>';
          }
          return T('copy.vergelijking.rijen.' + i + '.' + j, { tag: 'div', klasse: 'ov-vgl-cel' });
        }).join('') +
      '</div>';
    }).join('');

    return {
      hero: '<div class="ov-panel ov-hero">' +
        T('copy.hero.titel', { tag: 'h1', klasse: 'ov-hero-titel' }) +
        T('copy.hero.tekst', { tag: 'div', klasse: 'ov-hero-tekst ov-tekst', blok: true }) +
      '</div>',

      kolommen: '<div class="ov-kolommen">' +
        '<div class="ov-contact">' +
          T('copy.contact.titel', { tag: 'h2', klasse: 'ov-h2' }) +
          '<img class="ov-contact-foto"' + beeldAttr('foto') + ' src="' + esc(g.contact.foto) + '" alt="' + esc(g.contact.naam) + '">' +
          '<div class="ov-contact-naam">' + esc(g.contact.naam) + '</div>' +
          '<div class="ov-contact-mail">' + esc(g.contact.email) + '</div>' +
        '</div>' +
        '<div>' +
          T('copy.offerte.titel', { tag: 'h2', klasse: 'ov-h2' }) +
          '<div class="ov-gegevens">' + gegevensRijen + '</div>' +
          erbijKnop('copy.offerte.rijen', 'gegeven') +
        '</div>' +
      '</div>',

      inleiding: '<div class="ov-inleiding ov-tekst">' +
        T('copy.inleiding.titel', { tag: 'div', klasse: 'ov-inleiding-titel' }) +
        T('copy.inleiding.tekst', { tag: 'div', blok: true }) +
      '</div>',

      vergelijking: '<div class="ov-vergelijking">' +
        T('copy.vergelijking.titel', { tag: 'h2', klasse: 'ov-h2' }) +
        '<div class="ov-vgl-tabel">' + vglKop + '<div class="ov-vgl-body">' + vglRijen + '</div></div>' +
        erbijKnop('copy.vergelijking.rijen') +
      '</div>',

      platform: '<div class="ov-platform">' +
        T('copy.platform.titel', { tag: 'h2', klasse: 'ov-h2' }) +
        '<div class="ov-platform-raster">' +
          T('copy.platform.tekst', { tag: 'div', klasse: 'ov-tekst', blok: true }) +
          '<img class="ov-platform-beeld ov-bleed-rechts"' + beeldAttr('platform') + ' src="' + esc(g.beeld.platform) + '" alt="">' +
        '</div>' +
      '</div>'
    };
  }

  /* --- pagina 2 --------------------------------------------------------- */

  /* Een prijskaart: links het bedrag, rechts "Wat houdt dit in?". EEN
     bouwsteen voor alle drie de kaarten -- de eerste twee komen uit
     copy.kosten.kaarten, de derde (licentie) uit copy.kosten.strook, die om
     historische redenen een eigen sleutel houdt (zie offerte-data.js). Een
     tweede, bijna gelijke tekenfunctie zou betekenen dat een wijziging aan de
     opmaak op twee plekken moet, en dat de derde kaart er stil anders gaat
     uitzien dan de twee erboven.

       pad           waar de copy van deze kaart staat
       stijl         'blauw' | 'roze' | 'mint'
       titelSleutel  'label' (kaarten) of 'titel' (strook) */
  function kaartHtml(pad, kaart, stijl, titelSleutel) {
    var punten = (kaart.punten || []).map(function (_, j) {
      return '<li>' + T(pad + '.punten.' + j) + wegKnop(pad + '.punten', j) + '</li>';
    }).join('');

    return '<div class="ov-kaart ov-kaart--' + esc(stijl) + '">' +
      '<div class="ov-kaart-links">' +
        T(pad + '.' + titelSleutel, { tag: 'div', klasse: 'ov-h3' }) +
        T(pad + '.bedrag', { tag: 'div', klasse: 'ov-kaart-bedrag' }) +
        T(pad + '.voetnoot', { tag: 'div', klasse: 'ov-kaart-voetnoot' }) +
      '</div>' +
      '<div class="ov-kaart-rechts">' +
        T(pad + '.inhoudtitel', { tag: 'div', klasse: 'ov-h3' }) +
        '<ul class="ov-punten">' + punten + '</ul>' +
        erbijKnop(pad + '.punten', 'punt') +
      '</div>' +
    '</div>';
  }

  function blokkenPagina2() {
    var c = staat.copy;

    var kaarten = c.kosten.kaarten.map(function (kaart, i) {
      return kaartHtml('copy.kosten.kaarten.' + i, kaart,
        kaart.stijl === 'roze' ? 'roze' : 'blauw', 'label');
    }).join('');

    /* Een sjabloon dat bewaard werd toen de licentie nog een smalle strook
       was, kent de rechterkolom niet. Aanvullen uit de standaardcopy in plaats
       van leeglaten: zonder de lijst doet "+ punt" niets (rij-erbij slaat een
       niet-array over) en staat er in de editor een lege kolom zonder weg
       terug. Een LEGE lijst blijft leeg -- die heeft iemand zelf leeggemaakt.
       De voetnoot en de titel blijven staan zoals ze bewaard zijn: dat is
       getypte copy, en die overschrijven we nooit. */
    var licentie = c.kosten.strook || (c.kosten.strook = {});
    if (!Array.isArray(licentie.punten) || licentie.inhoudtitel == null) {
      var standaard = (((window.OFFERTE_DATA || {}).copy || {}).kosten || {}).strook || {};
      if (!Array.isArray(licentie.punten)) licentie.punten = kopie(standaard.punten || []);
      if (licentie.inhoudtitel == null) licentie.inhoudtitel = standaard.inhoudtitel || 'Wat houdt dit in?';
    }

    var extraRijen = c.extra.rijen.map(function (_, i) {
      return '<div class="ov-extra-rij">' +
        T('copy.extra.rijen.' + i + '.label', { tag: 'div' }) +
        '<div class="ov-extra-waarde">' +
          T('copy.extra.rijen.' + i + '.waarde') + wegKnop('copy.extra.rijen', i) +
        '</div>' +
      '</div>';
    }).join('');

    var voetnoten = c.extra.voetnoten.map(function (_, i) {
      return T('copy.extra.voetnoten.' + i, { tag: 'p' });
    }).join('');

    return {
      prijzen: '<div class="ov-prijzen">' +
        T('copy.kosten.titel', { tag: 'h2', klasse: 'ov-h2' }) +
        kaarten +
        kaartHtml('copy.kosten.strook', licentie, 'mint', 'titel') +
      '</div>',

      extra: '<div class="ov-extra">' +
        T('copy.extra.titel', { tag: 'h2', klasse: 'ov-h2' }) +
        T('copy.extra.tekst', { tag: 'div', klasse: 'ov-tekst', blok: true }) +
        '<div class="ov-extra-tabel">' + extraRijen + '</div>' +
        erbijKnop('copy.extra.rijen') +
        '<div class="ov-voetnoten ov-mini">' + voetnoten + '</div>' +
      '</div>'
    };
  }

  /* --- pagina 3 --------------------------------------------------------- */
  function blokkenPagina3() {
    var g = staat.gegevens;
    var c = staat.copy;

    var stappen = c.stappen.items.map(function (_, i) {
      return '<div class="ov-stap">' +
        '<div class="ov-stap-nummer">' + (i + 1) + '</div>' +
        '<div class="ov-tekst">' +
          T('copy.stappen.items.' + i + '.titel', { tag: 'div', klasse: 'ov-stap-titel' }) +
          T('copy.stappen.items.' + i + '.tekst', { tag: 'div' }) +
          wegKnop('copy.stappen.items', i) +
        '</div>' +
      '</div>';
    }).join('');

    var vragen = c.vragen.items.map(function (_, i) {
      return '<div class="ov-vraag">' +
        T('copy.vragen.items.' + i + '.vraag', { tag: 'div', klasse: 'ov-vraag-titel' }) +
        '<div class="ov-vraag-antwoord">' +
          T('copy.vragen.items.' + i + '.antwoord') + wegKnop('copy.vragen.items', i) +
        '</div>' +
      '</div>';
    }).join('');

    return {
      stappen: '<div class="ov-stappen">' +
        T('copy.stappen.titel', { tag: 'h2', klasse: 'ov-h2' }) +
        stappen +
        erbijKnop('copy.stappen.items', 'stap') +
        T('copy.stappen.slot', { tag: 'div', klasse: 'ov-stap-slot' }) +
      '</div>',

      vragen: '<div class="ov-vragen">' +
        T('copy.vragen.titel', { tag: 'h2', klasse: 'ov-h2' }) +
        vragen +
        erbijKnop('copy.vragen.items', 'vraag') +
      '</div>',

      oproep: '<div class="ov-panel ov-oproep">' +
        '<div class="ov-oproep-tekst">' +
          T('copy.oproep.titel', { tag: 'h2', klasse: 'ov-h2' }) +
          T('copy.oproep.tekst', { tag: 'div', klasse: 'ov-tekst', blok: true }) +
          T('copy.oproep.contact', { tag: 'p' }) +
        '</div>' +
        '<div class="ov-oproep-beeld">' +
          '<img class="ov-oproep-pijl"' + beeldAttr('pijl') + ' src="' + esc(g.beeld.pijl) + '" alt="">' +
          '<img class="ov-oproep-qr"' + beeldAttr('qr') + ' src="' + esc(g.beeld.qr) + '" alt="QR-code om een afspraak te maken">' +
        '</div>' +
      '</div>'
    };
  }

  /* ======================================================================
     Indeling — welk blok op welke pagina, in welke volgorde, hoe groot

     Staat in staat.copy.indeling, dus reist ze mee met het sjabloon en met
     window.OFFERTE.zet() naar Browser Rendering: de pdf van een echte inzending
     heeft exact de indeling die je hier zet. Geen tweede opmaakbron.

     De MARGE BOVEN elk blok staat hier (basis) en niet meer in offerte.css:
     een blok kan naar een andere pagina of een andere plaats verhuizen, en
     dan moet de ruimte erboven met hem meereizen. Wie ze bijstelt, zet een
     verschil op die basis (ruimte, in mm, ook negatief).

     GROOTTE is CSS-`zoom` op een binnenste doos, niet op de doos met de marge
     -- anders krimpt de marge boven het blok mee en klopt het getal niet dat
     je ziet. Chromium (en dus Browser Rendering) kent zoom; ook Firefox sinds
     126.
     ====================================================================== */

  var BLOKKEN = {
    hero:         { label: 'Intro',             basis: 9 },
    kolommen:     { label: 'Contact & offerte', basis: 9 },
    inleiding:    { label: 'Inleiding',         basis: 10 },
    vergelijking: { label: 'Vergelijking',      basis: 11 },
    platform:     { label: 'Platform',          basis: 11 },
    prijzen:      { label: 'Prijzen',           basis: 4 },
    extra:        { label: 'Bijkomende kosten', basis: 7 },
    stappen:      { label: 'Stappen',           basis: 6 },
    vragen:       { label: 'Vragen',            basis: 10 },
    oproep:       { label: 'Oproep',            basis: 8 }
  };
  var STANDAARD_PAGINAS = [
    ['hero', 'kolommen', 'inleiding', 'vergelijking', 'platform'],
    ['prijzen', 'extra'],
    ['stappen', 'vragen', 'oproep']
  ];
  var BEELDEN = {
    foto:     { label: 'Foto contactpersoon', blok: 'kolommen' },
    platform: { label: 'Schermafbeelding',    blok: 'platform' },
    qr:       { label: 'QR-code',             blok: 'oproep' },
    pijl:     { label: 'Pijl',                blok: 'oproep' }
  };
  /* Welke afbeelding waar in de gegevens staat. De contactfoto staat er
     bewust NIET in: die komt bij een echte inzending van de gekozen
     medewerker, dus vervangen zou enkel het voorbeeld veranderen. */
  var BEELD_PADEN = {
    logo:     'beeld.logo',
    platform: 'beeld.platform',
    qr:       'beeld.qr',
    pijl:     'beeld.pijl'
  };
  var BEELD_LABELS = { logo: 'Logo' };

  var STAP_RUIMTE = 1;      // mm per klik
  var STAP_SCHAAL = 5;      // % per klik
  var STAP_BEELD_SCHAAL = 5;
  var STAP_VERSCHUIF = 2;   // mm per klik

  var opmaakStand = false;

  function getal(w, standaard) {
    var n = Number(w);
    return isFinite(n) ? n : standaard;
  }

  /* Leest en HERSTELT de indeling: elk bekend blok staat er precies een keer
     in. Een sjabloon van voor deze functie heeft er geen, en een blok dat er
     later bijkomt moet ergens verschijnen in plaats van stil te ontbreken --
     het komt dan op zijn standaardpagina achteraan. */
  function indeling() {
    var c = staat.copy;
    var o = c.indeling;
    if (!o || typeof o !== 'object' || Array.isArray(o)) o = c.indeling = {};
    if (!Array.isArray(o.paginas) || !o.paginas.length) o.paginas = kopie(STANDAARD_PAGINAS);
    var gezien = {};
    o.paginas = o.paginas.map(function (p) {
      return (Array.isArray(p) ? p : []).filter(function (k) {
        if (!BLOKKEN[k] || gezien[k]) return false;
        gezien[k] = true;
        return true;
      });
    });
    STANDAARD_PAGINAS.forEach(function (p, i) {
      p.forEach(function (k) {
        if (gezien[k]) return;
        while (o.paginas.length <= i) o.paginas.push([]);
        o.paginas[i].push(k);
      });
    });
    if (!o.blokken || typeof o.blokken !== 'object' || Array.isArray(o.blokken)) o.blokken = {};
    if (!o.beelden || typeof o.beelden !== 'object' || Array.isArray(o.beelden)) o.beelden = {};
    if (!Array.isArray(o.paginaSchaal)) o.paginaSchaal = [];
    return o;
  }

  function blokInst(k) { var o = indeling(); return o.blokken[k] || (o.blokken[k] = {}); }
  function beeldInst(k) { var o = indeling(); return o.beelden[k] || (o.beelden[k] = {}); }

  /* data-beeld + de stijl van een afbeelding. De breedte schaalt via een
     CSS-variabele (offerte.css rekent ze om per afbeelding), verschuiven met
     `translate` -- dat duwt niets anders weg, precies wat je wil als je een
     tekening een paar millimeter wil bijzetten. */
  function beeldAttr(k) {
    var b = indeling().beelden[k] || {};
    var s = getal(b.schaal, 100), x = getal(b.x, 0), y = getal(b.y, 0);
    var stijl = [];
    if (s !== 100) stijl.push('--ov-beeld-schaal:' + (s / 100));
    if (x || y) stijl.push('translate:' + x + 'mm ' + y + 'mm');
    return ' data-beeld="' + k + '"' + (stijl.length ? ' style="' + stijl.join(';') + '"' : '');
  }

  function knopje(doe, attrs, tekst, titel, uit) {
    return '<button type="button" class="ov-ik"' + (uit ? ' disabled' : '') + ' data-action="indeling" data-doe="' + doe + '"' +
      attrs + ' title="' + esc(titel) + '">' + tekst + '</button>';
  }

  /* De balk boven een blok, alleen in de opmaakstand. */
  function blokBalk(k, pagina, positie, aantalOpPagina, aantalPaginas) {
    var inst = indeling().blokken[k] || {};
    var a = ' data-blok="' + k + '"';
    var ruimte = BLOKKEN[k].basis + getal(inst.ruimte, 0);
    var schaal = getal(inst.schaal, 100);
    var html = '<div class="ov-ibalk">' +
      '<span class="ov-ilabel">' + esc(BLOKKEN[k].label) + '</span>' +
      knopje('op', a, '&uarr;', 'Een plaats omhoog', positie === 0) +
      knopje('neer', a, '&darr;', 'Een plaats omlaag', positie === aantalOpPagina - 1) +
      '<span class="ov-isep"></span>' +
      knopje('vorige-pagina', a, '&#8676; p.', 'Naar de vorige pagina', pagina === 0) +
      '<span class="ov-iwaarde">p. ' + (pagina + 1) + '</span>' +
      knopje('volgende-pagina', a, 'p. &#8677;', pagina === aantalPaginas - 1 ? 'Naar een nieuwe pagina' : 'Naar de volgende pagina') +
      '<span class="ov-isep"></span>' +
      '<span class="ov-inaam">ruimte boven</span>' +
      knopje('ruimte-min', a, '&minus;', 'Minder ruimte boven dit blok') +
      '<span class="ov-iwaarde">' + ruimte + ' mm</span>' +
      knopje('ruimte-plus', a, '+', 'Meer ruimte boven dit blok') +
      '<span class="ov-isep"></span>' +
      '<span class="ov-inaam">grootte</span>' +
      knopje('klein', a, '&minus;', 'Blok kleiner (tekst en beelden)', schaal <= 50) +
      '<span class="ov-iwaarde">' + schaal + '%</span>' +
      knopje('groot', a, '+', 'Blok groter', schaal >= 150) +
      '<span class="ov-isep"></span>' +
      knopje('verberg', a, inst.verborgen ? 'Tonen' : 'Verbergen',
        inst.verborgen ? 'Dit blok weer in de offerte zetten' : 'Dit blok niet in de offerte zetten') +
      knopje('blok-herstel', a, '&#8634;', 'Ruimte, grootte en zichtbaarheid terugzetten') +
    '</div>';

    Object.keys(BEELDEN).forEach(function (bk) {
      if (BEELDEN[bk].blok !== k) return;
      var b = indeling().beelden[bk] || {};
      var ba = ' data-beeld="' + bk + '"';
      html += '<div class="ov-ibalk ov-ibalk--beeld">' +
        '<span class="ov-ilabel">' + esc(BEELDEN[bk].label) + '</span>' +
        knopje('beeld-klein', ba, '&minus;', 'Kleiner', getal(b.schaal, 100) <= 20) +
        '<span class="ov-iwaarde">' + getal(b.schaal, 100) + '%</span>' +
        knopje('beeld-groot', ba, '+', 'Groter', getal(b.schaal, 100) >= 250) +
        '<span class="ov-isep"></span>' +
        '<span class="ov-inaam">verschuif</span>' +
        knopje('beeld-links', ba, '&larr;', STAP_VERSCHUIF + ' mm naar links') +
        knopje('beeld-rechts', ba, '&rarr;', STAP_VERSCHUIF + ' mm naar rechts') +
        knopje('beeld-op', ba, '&uarr;', STAP_VERSCHUIF + ' mm omhoog') +
        knopje('beeld-neer', ba, '&darr;', STAP_VERSCHUIF + ' mm omlaag') +
        '<span class="ov-iwaarde">' + getal(b.x, 0) + ' / ' + getal(b.y, 0) + ' mm</span>' +
        knopje('beeld-herstel', ba, '&#8634;', 'Grootte en plaats terugzetten') +
        (BEELD_PADEN[bk]
          ? '<span class="ov-isep"></span>' + knopje('beeld-vervang', ba, 'Vervangen&hellip;', 'Een andere afbeelding kiezen')
          : '') +
      '</div>';
    });
    return html;
  }

  function blokHtml(k, stukken, pagina, positie, aantalOpPagina, aantalPaginas) {
    var inst = indeling().blokken[k] || {};
    if (inst.verborgen && !opmaakStand) return '';
    var marge = BLOKKEN[k].basis + getal(inst.ruimte, 0);
    var schaal = getal(inst.schaal, 100);
    return '<div class="ov-blok' + (inst.verborgen ? ' ov-blok--verborgen' : '') + '" data-blok="' + k + '"' +
        ' style="margin-top:' + marge + 'mm">' +
      (opmaakStand ? blokBalk(k, pagina, positie, aantalOpPagina, aantalPaginas) : '') +
      '<div class="ov-blok-inhoud"' + (schaal !== 100 ? ' style="zoom:' + (schaal / 100) + '"' : '') + '>' +
        (stukken[k] || '') +
      '</div>' +
    '</div>';
  }

  function paginaBalk(i, aantal, leeg) {
    var schaal = getal(indeling().paginaSchaal[i], 100);
    var a = ' data-pagina="' + i + '"';
    return '<div class="ov-pbalk">' +
      '<span class="ov-ilabel">Pagina ' + (i + 1) + '</span>' +
      '<span class="ov-inaam">alles op deze pagina</span>' +
      knopje('pagina-klein', a, '&minus;', 'Hele pagina kleiner', schaal <= 50) +
      '<span class="ov-iwaarde">' + schaal + '%</span>' +
      knopje('pagina-groot', a, '+', 'Hele pagina groter', schaal >= 150) +
      '<span class="ov-isep"></span>' +
      knopje('beeld-vervang', ' data-beeld="logo"', 'Logo vervangen&hellip;', 'Het logo in de kop van elke pagina vervangen') +
      (leeg ? knopje('pagina-weg', a, 'Lege pagina weg', 'Deze lege pagina verwijderen') : '') +
      (i === aantal - 1 ? knopje('pagina-erbij', a, '+ lege pagina', 'Een lege pagina achteraan toevoegen') : '') +
    '</div>';
  }

  function tekenPaginas() {
    var o = indeling();
    var stukken = {};
    [blokkenPagina1(), blokkenPagina2(), blokkenPagina3()].forEach(function (s) {
      Object.keys(s).forEach(function (k) { stukken[k] = s[k]; });
    });
    var aantal = o.paginas.length;
    return o.paginas.map(function (sleutels, i) {
      var schaal = getal(o.paginaSchaal[i], 100);
      var inhoud = sleutels.map(function (k, j) {
        return blokHtml(k, stukken, i, j, sleutels.length, aantal);
      }).join('');
      if (opmaakStand && !sleutels.length) {
        inhoud = '<div class="ov-leeg">Lege pagina &mdash; zet hier een blok met &ldquo;p. &#8677;&rdquo;.</div>';
      }
      var html = blad(i + 1,
        '<div class="ov-body-inhoud"' + (schaal !== 100 ? ' style="zoom:' + (schaal / 100) + '"' : '') + '>' + inhoud + '</div>');
      return opmaakStand ? html.replace('<section class="ov-pagina"', paginaBalk(i, aantal, !sleutels.length) + '<section class="ov-pagina"') : html;
    }).join('');
  }

  function beweegBlok(k, doe) {
    var o = indeling();
    var p = -1, j = -1;
    o.paginas.forEach(function (lijst, i) { var x = lijst.indexOf(k); if (x !== -1) { p = i; j = x; } });
    if (p === -1) return;
    var lijst = o.paginas[p];
    if (doe === 'op' && j > 0) { lijst.splice(j, 1); lijst.splice(j - 1, 0, k); }
    if (doe === 'neer' && j < lijst.length - 1) { lijst.splice(j, 1); lijst.splice(j + 1, 0, k); }
    if (doe === 'vorige-pagina' && p > 0) { lijst.splice(j, 1); o.paginas[p - 1].push(k); }
    if (doe === 'volgende-pagina') {
      lijst.splice(j, 1);
      if (p === o.paginas.length - 1) o.paginas.push([]);
      o.paginas[p + 1].unshift(k);
    }
  }

  function klem(w, min, max) { return Math.max(min, Math.min(max, w)); }

  function indelingActie(el) {
    var doe = el.dataset.doe;
    var o = indeling();
    var k = el.dataset.blok, bk = el.dataset.beeld, pi = Number(el.dataset.pagina);
    if (doe === 'beeld-vervang') { toonBeeldKiezer(bk); return; }

    if (k && BLOKKEN[k]) {
      var inst = blokInst(k);
      if (doe === 'op' || doe === 'neer' || doe === 'vorige-pagina' || doe === 'volgende-pagina') beweegBlok(k, doe);
      else if (doe === 'ruimte-min') inst.ruimte = getal(inst.ruimte, 0) - STAP_RUIMTE;
      else if (doe === 'ruimte-plus') inst.ruimte = getal(inst.ruimte, 0) + STAP_RUIMTE;
      else if (doe === 'klein') inst.schaal = klem(getal(inst.schaal, 100) - STAP_SCHAAL, 50, 150);
      else if (doe === 'groot') inst.schaal = klem(getal(inst.schaal, 100) + STAP_SCHAAL, 50, 150);
      else if (doe === 'verberg') inst.verborgen = !inst.verborgen;
      else if (doe === 'blok-herstel') delete o.blokken[k];
      /* Nooit minder dan nul ruimte in totaal: dan schuift het blok over het
         vorige heen, en dat ziet er in de pdf uit als een fout. */
      if (o.blokken[k] && BLOKKEN[k].basis + getal(o.blokken[k].ruimte, 0) < 0) o.blokken[k].ruimte = -BLOKKEN[k].basis;
    } else if (bk && BEELDEN[bk]) {
      var b = beeldInst(bk);
      if (doe === 'beeld-klein') b.schaal = klem(getal(b.schaal, 100) - STAP_BEELD_SCHAAL, 20, 250);
      else if (doe === 'beeld-groot') b.schaal = klem(getal(b.schaal, 100) + STAP_BEELD_SCHAAL, 20, 250);
      else if (doe === 'beeld-links') b.x = getal(b.x, 0) - STAP_VERSCHUIF;
      else if (doe === 'beeld-rechts') b.x = getal(b.x, 0) + STAP_VERSCHUIF;
      else if (doe === 'beeld-op') b.y = getal(b.y, 0) - STAP_VERSCHUIF;
      else if (doe === 'beeld-neer') b.y = getal(b.y, 0) + STAP_VERSCHUIF;
      else if (doe === 'beeld-herstel') delete o.beelden[bk];
    } else if (isFinite(pi)) {
      var s = getal(o.paginaSchaal[pi], 100);
      if (doe === 'pagina-klein') o.paginaSchaal[pi] = klem(s - STAP_SCHAAL, 50, 150);
      else if (doe === 'pagina-groot') o.paginaSchaal[pi] = klem(s + STAP_SCHAAL, 50, 150);
      else if (doe === 'pagina-erbij') o.paginas.push([]);
      else if (doe === 'pagina-weg' && !(o.paginas[pi] || []).length && o.paginas.length > 1) {
        o.paginas.splice(pi, 1);
        o.paginaSchaal.splice(pi, 1);
      }
    } else if (doe === 'alles-herstel') {
      if (!window.confirm('De hele indeling terugzetten: blokken naar hun standaardpagina, alle ruimtes, groottes en afbeeldingen?')) return;
      delete staat.copy.indeling;
    }
    bewaar();
    teken();
  }

  /* ======================================================================
     Afbeelding vervangen

     Kiezen uit de Asset Manager, of een link plakken. Via
     /forminator-v2/api/mail-assets -- dezelfde route en DEZELFDE RECHTEN als
     de bijlagekiezer van de mailstap (zie routes.js). Bewust geen uploadveld:
     uploaden gebeurt in de Asset Manager, anders staan er twee versies van
     hetzelfde beeld waarvan er één veroudert. Zelfde afspraak als bij de
     mailbijlagen.

     De keuze gaat in staat.gegevens.beeld.*, dus in het sjabloon: elke
     volgende offerte van dit sjabloon krijgt het nieuwe beeld.
     ====================================================================== */

  var beeldKiezer = { sleutel: null, prefix: '' };

  function isAfbeelding(f) {
    return /^image\//.test(f.contentType || '') || /\.(png|jpe?g|gif|webp|svg)$/i.test(f.name || '');
  }

  function toonBeeldKiezer(sleutel) {
    if (!BEELD_PADEN[sleutel]) return;
    beeldKiezer.sleutel = sleutel;
    var huidig = String(lees(BEELD_PADEN[sleutel], staat.gegevens) || '');
    document.getElementById('ovBeeldTitel').textContent =
      (BEELD_LABELS[sleutel] || (BEELDEN[sleutel] && BEELDEN[sleutel].label) || 'Afbeelding') + ' vervangen';
    document.getElementById('ovBeeldUrl').value = huidig;
    toonBeeldVoorbeeld(huidig);
    laadBeeldMap('');
    document.getElementById('ovBeeldDialoog').showModal();
  }

  function toonBeeldVoorbeeld(url) {
    var vak = document.getElementById('ovBeeldVoorbeeld');
    vak.innerHTML = url ? '<img src="' + esc(url) + '" alt="">' : '<span>Geen afbeelding</span>';
  }

  function laadBeeldMap(prefix) {
    beeldKiezer.prefix = prefix;
    var lijst = document.getElementById('ovBeeldLijst');
    lijst.innerHTML = '<div class="ov-veld-hint">Laden&hellip;</div>';
    apiFetch('/forminator-v2/api/mail-assets?prefix=' + encodeURIComponent(prefix), { credentials: 'include' })
      .then(function (res) {
        if (res.status === 401) { window.location.href = '/'; return null; }
        return res.json();
      })
      .then(function (json) {
        if (!json) return;
        if (!json.success) throw new Error(json.error || 'onbekende fout');
        var d = json.data || {};
        var html = '';
        if (prefix) {
          var ouder = prefix.replace(/[^/]+\/$/, '');
          html += '<button type="button" class="ov-beeld-map" data-action="beeld-map" data-prefix="' + esc(ouder) + '">&larr; terug</button>';
          html += '<div class="ov-veld-hint">' + esc(prefix) + '</div>';
        }
        (d.folders || []).forEach(function (f) {
          html += '<button type="button" class="ov-beeld-map" data-action="beeld-map" data-prefix="' + esc(f.prefix) + '">&#128193; ' + esc(f.name) + '</button>';
        });
        var beelden = (d.files || []).filter(isAfbeelding);
        if (beelden.length) {
          html += '<div class="ov-beeld-raster">' + beelden.map(function (f) {
            return '<button type="button" class="ov-beeld-tegel" data-action="beeld-kies" data-url="' + esc(f.url) + '" title="' + esc(f.name) + '">' +
              '<img src="' + esc(f.url) + '" alt="" loading="lazy"><span>' + esc(f.name) + '</span></button>';
          }).join('') + '</div>';
        } else if (prefix) {
          html += '<div class="ov-veld-hint">Geen afbeeldingen in deze map.</div>';
        }
        if (!prefix && d.readable === false) {
          html = '<div class="ov-veld-hint">Je hebt geen toegang tot mappen in de Asset Manager. Plak hierboven een link.</div>';
        }
        lijst.innerHTML = html;
      })
      .catch(function (err) {
        lijst.innerHTML = '<div class="ov-veld-hint">Asset Manager niet bereikbaar (' + esc(err.message) + '). Plak hierboven een link.</div>';
      });
  }

  function beeldToepassen() {
    var url = document.getElementById('ovBeeldUrl').value.trim();
    if (!url) { window.alert('Kies een afbeelding of plak een link.'); return; }
    zet(BEELD_PADEN[beeldKiezer.sleutel], url, staat.gegevens);
    document.getElementById('ovBeeldDialoog').close();
    bewaar();
    teken();
    melding('Afbeelding vervangen.');
  }

  /* ======================================================================
     Tekenen
     ====================================================================== */

  /* Licentietotaal = tarief per hoofdkavel x aantal kavels, boven de 60 kavels
     een ONDERGRENS ("Vanaf") op basis van 60. Draait bij ELKE tekening, want
     het is een afgeleide: het aantal kavels of het tarief wijzigen moet het
     bedrag op de licentiekaart meteen meenemen. Daarom staan deze drie ook
     niet in OFFERTE_VELDEN -- het zijn geen invoervelden.

     TWEEDE KOPIE van berekenLicentiePrijs() in pdf-step.js, met opzet: de
     Worker kan niets uit public/ importeren, en de editor moet dit zonder
     server kunnen. Wijzig je de regel, wijzig ze op BEIDE plekken -- anders
     toont de editor een ander bedrag dan de pdf die de pipeline maakt.
     Zelfde afweging als CHATTER_KNOP_STIJLEN.

     Onleesbare kavels of een onleesbaar tarief laten de sjabloonwaarde staan,
     zelfde keuze als de server: liever het bedrag uit het sjabloon dan een
     leeg vak of "NaN" op een offerte. */
  function herberekenLicentie() {
    var g = staat && staat.gegevens;
    if (!g || !g.prijs) return;
    var match = String((g.gebouw && g.gebouw.kavels) || '').match(/\d+/);
    var kavels = match ? parseInt(match[0], 10) : NaN;
    var tarief = parseFloat(String(g.prijs.licentie == null ? '' : g.prijs.licentie).replace(',', '.'));
    if (!isFinite(kavels) || kavels <= 0 || !isFinite(tarief)) return;

    var vanaf = kavels > 60;
    var basis = vanaf ? 60 : kavels;
    var totaal = tarief * basis;
    g.prijs.licentie_totaal = Number.isInteger(totaal) ? String(totaal) : totaal.toFixed(2).replace('.', ',');
    g.prijs.licentie_totaal_label = vanaf ? 'Vanaf ' : '';
    g.prijs.licentie_basis = String(basis);
  }

  function teken() {
    herberekenLicentie();
    var doc = document.getElementById('ovDocument');
    doc.innerHTML = tekenPaginas();
    document.body.classList.toggle('ov-bewerkstand', bewerken);
    document.body.classList.toggle('ov-opmaakstand', opmaakStand);
    var knopOpmaak = document.getElementById('ovKnopOpmaak');
    if (knopOpmaak) {
      knopOpmaak.classList.toggle('ov-knop--actief', opmaakStand);
      knopOpmaak.textContent = opmaakStand ? 'Klaar met opmaak' : 'Opmaak';
    }
    var knopAllesHerstel = document.getElementById('ovKnopIndelingHerstel');
    if (knopAllesHerstel) knopAllesHerstel.hidden = !opmaakStand;
    var knop = document.getElementById('ovKnopBewerken');
    if (knop) {
      knop.classList.toggle('ov-knop--actief', bewerken);
      knop.textContent = bewerken ? 'Klaar met bewerken' : 'Tekst bewerken';
    }
    controleerOverloop();
    meetLaterOpnieuw(doc);
  }

  /* Een pagina die overloopt is de klassieke stille fout van een pdf-sjabloon:
     op het scherm zie je het niet, in de pdf is de laatste alinea weg.

     Gemeten als: waar eindigt de INHOUD van de blokken, tegenover de onderkant
     van het vlak tussen kop en voet. NIET met scrollHeight: dat telt alles mee
     wat uitsteekt, ook de knoppenbalk van de opmaakstand die onder een blok
     hangt -- dan meldt een pagina altijd "loopt over", hoe klein je ook maakt.
     Een verschoven afbeelding (translate) telt hier ook niet mee; dat is een
     bewuste keuze van wie ze verschoof. */
  function controleerOverloop() {
    document.querySelectorAll('.ov-pagina').forEach(function (p) {
      var body = p.querySelector('.ov-body');
      if (!body) return;
      var grens = body.getBoundingClientRect().bottom;
      var einde = 0;
      p.querySelectorAll('.ov-blok-inhoud, .ov-leeg').forEach(function (el) {
        var onder = el.getBoundingClientRect().bottom;
        if (onder > einde) einde = onder;
      });
      p.classList.toggle('ov-pagina--vol', einde > grens + 2);
    });
  }

  /* Een afbeelding of lettertype dat pas NA het tekenen binnenkomt, verandert
     de hoogte nog. Zonder opnieuw te meten blijft een melding staan (of weg)
     die niet meer klopt. */
  function meetLaterOpnieuw(doc) {
    doc.querySelectorAll('img').forEach(function (img) {
      if (!img.complete) img.addEventListener('load', controleerOverloop, { once: true });
    });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(controleerOverloop);
  }

  /* ======================================================================
     Invulvelden aanvullen uit de copy

     Typ je ergens {{gebouw.situatie}}, dan moet dat ook een INVULVELD worden:
     de koppeling toont enkel velden uit OFFERTE_VELDEN (template.data.velden),
     en de server (toegestaneGegevenspaden in pdf-step.js) weigert elk ander
     pad. Zonder dit bleef zo'n placeholder op elke offerte stil leeg.

     Zelf toegevoegde velden krijgen een derde element `true` ([pad, label,
     true]). Alleen DIE worden bijgewerkt en weer opgeruimd als de placeholder
     nergens meer staat -- anders blijft elk tussenstadium van het typen
     ({{gebouw.situati}}) als veld achter. Velden die in offerte-data.js
     staan, raakt dit nooit aan.

     Het label komt uit de gegevensrij waar de placeholder in staat ("Huidige
     situatie"); anders uit het laatste stuk van het pad.
     ====================================================================== */

  /* Afgeleid of met een eigen bron -- geen invulveld. */
  var GEEN_INVULVELD = /^(prijs\.licentie_totaal|prijs\.licentie_totaal_label|prijs\.licentie_basis)$|^(contact|bedrijf|beeld)\./;

  var GROEP_VOOR = { offerte: 'Offerte', gebouw: 'Gebouw en klant', klant: 'Gebouw en klant', prijs: 'Prijzen' };

  function labelVoorPad(pad) {
    var rijen = (staat.copy && staat.copy.offerte && staat.copy.offerte.rijen) || [];
    var patroon = new RegExp('\\{\\{\\s*' + pad.replace(/\./g, '\\.') + '\\s*\\}\\}');
    for (var i = 0; i < rijen.length; i++) {
      if (rijen[i] && patroon.test(String(rijen[i].waarde || '')) && String(rijen[i].label || '').trim()) {
        return String(rijen[i].label).trim();
      }
    }
    var laatste = pad.split('.').pop().replace(/_/g, ' ');
    return laatste.charAt(0).toUpperCase() + laatste.slice(1);
  }

  /* @returns {boolean} of er iets veranderde */
  function vulVeldenAan() {
    var velden = window.OFFERTE_VELDEN;
    if (!Array.isArray(velden) || !staat || !staat.copy) return false;

    var gebruikt = {};
    JSON.stringify(staat.copy).replace(/\{\{\s*([\w]+(?:\.[\w]+)+)\s*\}\}/g, function (_, pad) {
      if (!GEEN_INVULVELD.test(pad)) gebruikt[pad] = true;
      return '';
    });

    var veranderd = false;
    var bekend = {};
    velden.forEach(function (groep) {
      groep.velden = (groep.velden || []).filter(function (paar) {
        if (paar[2] === true && !gebruikt[paar[0]]) { veranderd = true; return false; }
        if (paar[2] === true) {
          var label = labelVoorPad(paar[0]);
          if (label !== paar[1]) { paar[1] = label; veranderd = true; }
        }
        bekend[paar[0]] = true;
        return true;
      });
    });

    Object.keys(gebruikt).forEach(function (pad) {
      if (bekend[pad]) return;
      var naam = GROEP_VOOR[pad.split('.')[0]] || 'Eigen velden';
      var groep = velden.filter(function (g) { return g.groep === naam; })[0];
      if (!groep) {
        groep = { groep: naam, velden: [] };
        /* Voor Contactpersoon/Bedrijf/Beeldmateriaal, zodat de nieuwe groep
           bij de andere invulvelden staat en niet achteraan. */
        var voor = velden.map(function (g) { return g.groep; }).indexOf('Contactpersoon');
        if (voor === -1) velden.push(groep); else velden.splice(voor, 0, groep);
      }
      groep.velden.push([pad, labelVoorPad(pad), true]);
      if (lees(pad, staat.gegevens) === '') zet(pad, '', staat.gegevens);
      veranderd = true;
    });

    /* Een lege eigen groep ruimen we op; de vaste groepen blijven staan. */
    window.OFFERTE_VELDEN = velden.filter(function (g) {
      return g.velden.length || g.groep !== 'Eigen velden';
    });
    return veranderd;
  }

  /* ======================================================================
     Opslag in de browser — zodat een verversing je werk niet weggooit
     ====================================================================== */

  function laadStaat() {
    /* Bij ?server=1 of ?template=ID begint elke render vanaf de standaardwaarden
       -- Browser Rendering krijgt zijn data via OFFERTE.zet(), en de
       editor haalt het echte sjabloon hieronder asynchroon op. Zonder deze
       uitzondering zou een oudere localStorage-versie (van een ANDER
       sjabloon-id, of een leftover uit de demo-pagina) heel even doorschijnen. */
    if (!SERVER && !TEMPLATE_ID) {
      try {
        var ruw = window.localStorage.getItem(OPSLAGSLEUTEL);
        if (ruw) {
          var o = JSON.parse(ruw);
          if (o && o.gegevens && o.copy) return o;
        }
      } catch (e) { /* privévenster of opslag geblokkeerd: geen probleem */ }
    }
    return kopie(window.OFFERTE_DATA);
  }

  var bewaarTimer = null;
  function bewaar() {
    if (SERVER) return;   // Browser Rendering: nooit iets bewaren.
    vulVeldenAan();

    clearTimeout(bewaarTimer);
    bewaarTimer = setTimeout(function () {
      try { window.localStorage.setItem(OPSLAGSLEUTEL, JSON.stringify(staat)); }
      catch (e) { /* niet erg */ }
      bewaarNaarServer();
    }, 250);
  }

  /* Gedebouncede PUT naar het sjabloon op de server. Alleen als er een
     template-id is EN het sjabloon succesvol geladen werd (serverKlaar) --
     anders zou de allereerste, nog niet-geladen staat de bewaarde inhoud
     overschrijven. */
  var serverBewaarTimer = null;
  function bewaarNaarServer() {
    if (!TEMPLATE_ID || !serverKlaar) return;
    clearTimeout(serverBewaarTimer);
    serverBewaarTimer = setTimeout(function () {
      apiFetch('/forminator-v2/api/pdf-templates/' + TEMPLATE_ID, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { gegevens: gegevensVoorSjabloon(), copy: staat.copy, velden: window.OFFERTE_VELDEN } })
      }).then(function (res) {
        melding(res.ok ? 'Bewaard.' : 'Bewaren mislukt.');
      }).catch(function () {
        melding('Bewaren mislukt (geen verbinding).');
      });
    }, 1000);
  }

  /* Het sjabloon van de server ophalen (bij het opstarten, of na "Herstellen"). */
  function laadVanServer() {
    if (!TEMPLATE_ID) return;
    apiFetch('/forminator-v2/api/pdf-templates/' + TEMPLATE_ID, { credentials: 'include' })
      .then(function (res) {
        if (res.status === 401) { window.location.href = '/'; return null; }
        if (!res.ok) throw new Error('status ' + res.status);
        return res.json();
      })
      .then(function (json) {
        if (!json) return;
        if (!json.success || !json.data) throw new Error(json.error || 'onbekende fout');
        var data = json.data.data || {};
        window.OFFERTE_VELDEN = data.velden || window.OFFERTE_VELDEN;
        staat = { gegevens: data.gegevens, copy: data.copy };
        contactAuto = false;
        sjabloonContact = null;
        /* Het sjabloon staat weer op zijn voorbeeldnummer; een al genomen
           nummer wordt bij het openen of de pdf opnieuw ingevuld. */
        nummer.toegepast = false;
        instellingen.sequence_pattern = json.data.sequence_pattern || '';
        instellingen.geldigheid_dagen = json.data.geldigheid_dagen || '';
        serverKlaar = true;
        var titel = document.querySelector('.ov-werkbalk-titel');
        if (titel && json.data.name) titel.textContent = 'Offerte — ' + json.data.name;
        teken();
        if (vulVeldenAan()) {
          bewaar();
          melding('Nieuwe invulvelden toegevoegd aan het sjabloon.');
        }
        pasStandaardContactToe();
      })
      .catch(function () {
        melding('Sjabloon kon niet geladen worden — wijzigingen worden NIET bewaard.');
      });
  }

  /* ======================================================================
     Bewerken
     ====================================================================== */

  document.addEventListener('input', function (e) {
    if (e.target && e.target.id === 'ovBeeldUrl') { toonBeeldVoorbeeld(e.target.value.trim()); return; }
    if (e.target && e.target.id === 'ovDocZoek') { tekenDocumenten(); return; }
    if (e.target && e.target.dataset && /^offerte\./.test(e.target.dataset.gegeven || '')) { tekenOfferteKort(); return; }
    if (e.target && e.target.dataset && /^contact\./.test(e.target.dataset.gegeven || '')) {
      contactGewijzigd = true;
      tekenContactKaart();
      return;
    }
    if (!bewerken) return;
    var el = e.target.closest && e.target.closest('[data-bind]');
    if (!el) return;

    var waarde = el.innerText.replace(/ /g, ' ').replace(/\n$/, '');
    zet(el.dataset.bind, waarde);

    /* Kop en voet staan op drie pagina's. Zonder deze regel verandert alleen
       de pagina waarop je typt en lijkt het alsof het niet werkt. */
    document.querySelectorAll('[data-bind="' + el.dataset.bind + '"]').forEach(function (tweeling) {
      if (tweeling !== el) tweeling.textContent = waarde;
    });

    bewaar();
    controleerOverloop();
  });

  function leegAls(voorbeeld) {
    if (Array.isArray(voorbeeld)) return voorbeeld.map(function () { return ''; });
    if (voorbeeld && typeof voorbeeld === 'object') {
      var o = {};
      Object.keys(voorbeeld).forEach(function (k) { o[k] = ''; });
      return o;
    }
    return '';
  }

  /* ======================================================================
     Werkbalk en dialogen
     ====================================================================== */

  /* Staat dit pad in deze groep? Zo weet het dialoog waar de nummerknop en de
     medewerkerkiezer horen, zonder op de GROEPSNAAM te matchen -- die is een
     label dat iemand morgen kan hernoemen. */
  function groepHeeft(groep, pad) {
    return (groep.velden || []).some(function (v) { return v[0] === pad; });
  }

  function toonGegevens() {
    var body = document.getElementById('ovGegevensBody');
    body.innerHTML = (window.OFFERTE_VELDEN || []).map(function (groep) {
      var gewoon = [];
      var contact = [];
      var offerte = [];
      groep.velden.forEach(function (v) {
        (/^contact\./.test(v[0]) ? contact : /^offerte\./.test(v[0]) ? offerte : gewoon).push('<label class="ov-veld"><span>' + esc(v[1]) + '</span>' +
          '<input type="text" data-gegeven="' + esc(v[0]) + '" value="' + esc(lees(v[0], staat.gegevens)) + '">' +
        '</label>');
      });
      var velden = gewoon.join('');

      /* Nummer en datums worden automatisch gezet; ze staan dus kort op een
         regel, en de velden ingeklapt voor wie toch iets wil wijzigen. */
      if (offerte.length) {
        velden = nummerKnopHtml() +
          '<details class="ov-contact-handmatig"><summary>Met de hand aanpassen</summary>' + offerte.join('') + '</details>' +
          velden;
      }
      /* De contactpersoon als kaartje met de kiezers erboven; de ruwe velden
         (met de foto als base64) staan ingeklapt eronder. */
      if (contact.length) {
        velden = contactKiezerHtml() +
          '<details class="ov-contact-handmatig"><summary>Met de hand aanpassen</summary>' + contact.join('') + '</details>' +
          velden;
      }

      return '<div class="ov-groepkop">' + esc(groep.groep) + '</div>' + velden;
    }).join('');

    contactGewijzigd = false;
    tekenContactKaart();
    laadContacten();
    nummerBijOpenen();
    document.getElementById('ovGegevensDialoog').showModal();
  }

  function bewaarGegevens() {
    document.querySelectorAll('#ovGegevensBody [data-gegeven]').forEach(function (input) {
      zet(input.dataset.gegeven, input.value, staat.gegevens);
    });
    if (contactGewijzigd) contactAuto = false;
    if (nummer.data) nummer.toegepast = true;
    document.getElementById('ovGegevensDialoog').close();
    bewaar();
    teken();
  }

  /* ----------------------------------------------------------------------
     Offertenummer + datums genereren

     Het nummer komt van de SERVER: de teller staat op het sjabloon
     (fs_v2_pdf_templates), dezelfde die een echte inzending gebruikt. Een
     tweede reeks in de browser zou ooit twee offertes met hetzelfde nummer
     geven. De datums worden er meteen bij gezet -- vandaag, en vandaag plus de
     ingestelde geldigheidstermijn.

     De waarden gaan in de INVOERVELDEN, niet rechtstreeks in de gegevens: zo
     zie je wat je krijgt voor je op "Invullen" drukt. Het nummer is op dat
     moment wel al opgebruikt; annuleren laat dus een gat in de reeks, en dat
     is de goede kant om op te falen.
     -------------------------------------------------------------------- */

  /* Het nummer wordt AUTOMATISCH genomen: de eerste keer dat "Gegevens
     invullen" opengaat, en anders bij "Pdf maken" -- zo vertrekt er nooit een
     pdf met het voorbeeldnummer van het sjabloon. Een keer per pagina: elke
     keer het dialoog openen zou telkens een nummer opgebruiken. "Nieuw
     nummer" neemt er bewust nog een.

     nummer.data     wat de server gaf (of enkel de datum, zonder patroon)
     nummer.toegepast staat het al in de gegevens (na "Invullen" of bij de
                      pdf)? Dan overschrijft heropenen niets wat je intussen
                      met de hand aanpaste. */
  var nummer = { data: null, bezig: false, toegepast: false };

  function nummerKnopHtml() {
    return '<div class="ov-offerte-kort">' +
      '<span id="ovOfferteKort"></span>' +
      (TEMPLATE_ID && instellingen.sequence_pattern
        ? '<button type="button" class="ov-knop ov-knop--klein" data-action="nummer-genereren">Nieuw nummer</button>'
        : '') +
      '</div>';
  }

  /* De korte regel boven de (ingeklapte) offertevelden. Leest de velden, dus
     klopt ook na met de hand typen. */
  function tekenOfferteKort() {
    var el = document.getElementById('ovOfferteKort');
    if (!el) return;
    var nr = (document.querySelector('#ovGegevensBody [data-gegeven="offerte.nummer"]') || {}).value || '';
    var datum = (document.querySelector('#ovGegevensBody [data-gegeven="offerte.datum"]') || {}).value || '';
    var tot = (document.querySelector('#ovGegevensBody [data-gegeven="offerte.geldig_tot"]') || {}).value || '';
    if (nummer.bezig) { el.innerHTML = 'Nummer ophalen&hellip;'; return; }
    el.innerHTML = '<strong>' + esc(nr || 'zonder nummer') + '</strong>' +
      (datum ? ' &middot; ' + esc(datum) : '') +
      (tot ? ' &middot; geldig tot ' + esc(tot) : '');
  }

  /* Vandaag als DD/MM/JJJJ in Belgische tijd. Zelfde vorm als het sjabloon en
     als formatDatumBrussel() in pdf-step.js. In de browser staat de klok al op
     de tijdzone van de gebruiker, maar de tijdzone expliciet noemen kost niets
     en is juist voor wie van elders inlogt. */
  function vandaag() {
    var d = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Brussels', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(new Date()).reduce(function (acc, deel) { acc[deel.type] = deel.value; return acc; }, {});
    return d.day + '/' + d.month + '/' + d.year;
  }

  function zetGegevenVeld(pad, waarde) {
    var input = document.querySelector('#ovGegevensBody [data-gegeven="' + pad + '"]');
    if (input) input.value = waarde;
  }

  /* Haalt een nummer (en de datums) op. Zonder sjabloon of zonder patroon is
     er geen reeks: dan enkel de datum van vandaag, en dat is geen fout. */
  function haalNummer() {
    if (!TEMPLATE_ID || !instellingen.sequence_pattern) {
      return Promise.resolve({ nummer: null, datum: vandaag(), geldig_tot: null });
    }
    return apiFetch('/forminator-v2/api/pdf-templates/' + TEMPLATE_ID + '/next-number', {
      method: 'POST', credentials: 'include'
    }).then(function (res) { return res.json(); }).then(function (json) {
      if (!json || !json.success) throw new Error((json && json.error) || 'onbekende fout');
      return { nummer: json.data.nummer, datum: json.data.datum || vandaag(), geldig_tot: json.data.geldig_tot || null };
    });
  }

  function nummerInInvoer(data) {
    if (data.nummer) zetGegevenVeld('offerte.nummer', data.nummer);
    zetGegevenVeld('offerte.datum', data.datum);
    if (data.geldig_tot) zetGegevenVeld('offerte.geldig_tot', data.geldig_tot);
    tekenOfferteKort();
  }

  function nummerInGegevens(data) {
    if (data.nummer) zet('offerte.nummer', data.nummer, staat.gegevens);
    zet('offerte.datum', data.datum, staat.gegevens);
    if (data.geldig_tot) zet('offerte.geldig_tot', data.geldig_tot, staat.gegevens);
    nummer.toegepast = true;
  }

  /* opnieuw = de knop "Nieuw nummer"; anders enkel als er nog geen is. */
  function genereerNummer(opnieuw) {
    /* Het sjabloon (en dus het patroon) is nog niet binnen: nu nemen zou
       enkel een datum opleveren, en daarna nooit meer een nummer. */
    if (TEMPLATE_ID && !serverKlaar) return Promise.resolve(null);
    if (nummer.bezig) return Promise.resolve(nummer.data);
    if (nummer.data && !opnieuw) return Promise.resolve(nummer.data);
    nummer.bezig = true;
    tekenOfferteKort();
    return haalNummer().then(function (data) {
      nummer.data = data;
      nummer.toegepast = false;
      return data;
    }).catch(function (err) {
      window.alert('Nummer genereren mislukt: ' + err.message);
      return null;
    }).then(function (data) {
      nummer.bezig = false;
      if (data) {
        nummerInInvoer(data);
        if (data.nummer) melding('Nummer ' + data.nummer + ' genomen.');
      } else {
        tekenOfferteKort();
      }
      return data;
    });
  }

  /* Bij het openen van het dialoog: een nummer dat al genomen maar nog niet
     bewaard is, staat terug in de velden (anders is het na Annuleren kwijt en
     neemt de volgende keer een tweede). */
  function nummerBijOpenen() {
    tekenOfferteKort();
    if (nummer.data && !nummer.toegepast) { nummerInInvoer(nummer.data); return; }
    if (!nummer.data) genereerNummer(false);
  }

  /* Voor "Pdf maken": zorgt dat er een nummer in de GEGEVENS staat. */
  function zorgVoorNummer() {
    if (nummer.toegepast) return Promise.resolve();
    return genereerNummer(false).then(function (data) {
      if (!data) return;
      nummerInGegevens(data);
      bewaar();
      teken();
    });
  }

  /* ----------------------------------------------------------------------
     Contactpersoon uit Odoo (hr.employee)

     Naam, e-mailadres en pasfoto komen uit hetzelfde record en op dezelfde
     manier als buildPdfGegevens() bij een echte inzending doet -- anders
     levert een offerte uit de editor iets anders op dan een uit de pipeline.
     De foto is een data-URI en dus lang; ze staat in het gewone
     contact.foto-veld, zodat je ze nog met de hand kan vervangen door een pad.
     In het dialoog zie je daarom een KAARTJE (foto, naam, adres) en staan de
     ruwe velden ingeklapt onder "Met de hand aanpassen".

     Standaard staat de INGELOGDE medewerker op de offerte (contactAuto). Dat
     is een keuze voor dit scherm, niet voor het sjabloon: zolang niemand zelf
     een contactpersoon koos, gaat bij het bewaren naar de server het contact
     van het sjabloon mee (sjabloonContact). Anders zet elke collega die de
     editor opent zichzelf in het sjabloon -- en daarmee in de pdf van elke
     koppeling zonder eigen contactbron.
     -------------------------------------------------------------------- */

  var contacten = { lijst: null, bezig: false, mij: undefined, gekozenId: null };
  var contactAuto = false;
  var sjabloonContact = null;
  var contactGewijzigd = false;   // in het dialoog dat nu openstaat

  /* In Odoo staat iedereen op @mymmo.com, maar een offerte vertrekt onder een
     MERK. De domeinkiezer vervangt enkel het deel na de @ -- de naam en de
     foto blijven die van de gekozen medewerker. */
  var MAIL_DOMEINEN = ['mymmo.com', 'openvme.be', 'syndicoach.be'];
  var HOOFDDOMEIN = 'mymmo.com';

  function domeinVan(email) {
    var i = String(email || '').lastIndexOf('@');
    return i < 0 ? '' : String(email).slice(i + 1).toLowerCase();
  }

  function metDomein(email, domein) {
    var i = String(email || '').lastIndexOf('@');
    if (i < 0 || !domein) return email;
    return String(email).slice(0, i + 1) + domein;
  }

  /* Zelfde regel als bedrijfsdomein()/emailOpBedrijfsdomein() in pdf-step.js:
     een adres op het hoofddomein krijgt het domein van het bedrijf op de
     offerte (uit bedrijf.email, anders bedrijf.website). */
  function bedrijfsdomein() {
    var b = (staat.gegevens && staat.gegevens.bedrijf) || {};
    var d = domeinVan(b.email);
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) {
      d = String(b.website || '').trim().toLowerCase()
        .replace(/^[a-z]+:\/\//, '').replace(/^www\./, '').split(/[\/?#:]/)[0];
    }
    return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d) ? d : null;
  }

  function opMerkdomein(email) {
    if (domeinVan(email) !== HOOFDDOMEIN) return email;
    var d = bedrijfsdomein();
    return d ? metDomein(email, d) : email;
  }

  function contactKiezerHtml() {
    return '<div id="ovContactKaart"></div>' +
      '<div class="ov-contact-rij">' +
        '<label class="ov-veld"><span>Medewerker</span>' +
          '<select id="ovContactKiezer" data-change="contact-kiezen">' +
            '<option value="">Medewerkers laden&hellip;</option>' +
          '</select></label>' +
        '<label class="ov-veld"><span>E-maildomein</span>' +
          '<select id="ovDomeinKiezer" data-change="contact-domein"></select></label>' +
      '</div>';
  }

  function domeinOptiesHtml(huidig) {
    var opties = MAIL_DOMEINEN.map(function (d) {
      return '<option value="' + esc(d) + '"' + (d === huidig ? ' selected' : '') + '>@' + esc(d) + '</option>';
    }).join('');
    if (huidig && MAIL_DOMEINEN.indexOf(huidig) < 0) {
      opties = '<option value="" selected>@' + esc(huidig) + '</option>' + opties;
    }
    return opties;
  }

  function contactInput(pad) {
    return document.querySelector('#ovGegevensBody [data-gegeven="' + pad + '"]');
  }

  /* Leest de (ingeklapte) velden, dus toont altijd wat er bij "Invullen"
     bewaard wordt -- ook na met de hand typen. */
  function tekenContactKaart() {
    var kaart = document.getElementById('ovContactKaart');
    if (!kaart) return;
    var naam = (contactInput('contact.naam') || {}).value || '';
    var email = (contactInput('contact.email') || {}).value || '';
    var foto = (contactInput('contact.foto') || {}).value || '';
    var bron = (contactAuto && !contactGewijzigd) ? 'Je bent aangemeld, dus je staat standaard op de offerte.' : '';
    kaart.innerHTML = '<div class="ov-contact-kaart">' +
      (foto ? '<img src="' + esc(foto) + '" alt="">' : '<div class="ov-contact-kaart-leeg"></div>') +
      '<div>' +
        '<div class="ov-contact-kaart-naam">' + esc(naam || 'Nog geen contactpersoon') + '</div>' +
        (email ? '<div class="ov-contact-kaart-mail">' + esc(email) + '</div>' : '') +
        (bron ? '<div class="ov-contact-kaart-bron">' + esc(bron) + '</div>' : '') +
      '</div></div>';
    var sel = document.getElementById('ovDomeinKiezer');
    if (sel) sel.innerHTML = domeinOptiesHtml(domeinVan(email));
  }

  function tekenContactKiezer() {
    var sel = document.getElementById('ovContactKiezer');
    if (!sel) return;
    if (!contacten.lijst) {
      sel.innerHTML = '<option value="">Medewerkers laden&hellip;</option>';
      return;
    }
    sel.innerHTML = '<option value="">- kies een medewerker -</option>' +
      contacten.lijst.map(function (m) {
        return '<option value="' + esc(m.id) + '"' + (String(m.id) === String(contacten.gekozenId) ? ' selected' : '') + '>' + esc(m.naam) + '</option>';
      }).join('');
  }

  function laadContacten() {
    if (contacten.lijst || contacten.bezig) { tekenContactKiezer(); return; }
    contacten.bezig = true;
    apiFetch('/forminator-v2/api/pdf-contacten', { credentials: 'include' })
      .then(function (res) { return res.json(); })
      .then(function (json) {
        if (!json || !json.success) throw new Error((json && json.error) || 'onbekende fout');
        contacten.lijst = json.data || [];
        tekenContactKiezer();
      })
      .catch(function () {
        var sel = document.getElementById('ovContactKiezer');
        if (sel) sel.innerHTML = '<option value="">Lijst kon niet geladen worden - pas hieronder met de hand aan</option>';
      })
      .then(function () { contacten.bezig = false; });
  }

  function kiesContact(id) {
    if (!id) return;
    apiFetch('/forminator-v2/api/pdf-contacten/' + encodeURIComponent(id), { credentials: 'include' })
      .then(function (res) { return res.json(); })
      .then(function (json) {
        if (!json || !json.success) throw new Error((json && json.error) || 'onbekende fout');
        /* Het gekozen domein blijft staan bij een andere medewerker; staat er
           geen van de drie, dan volgt het de regel van de pipeline. */
        var sel = document.getElementById('ovDomeinKiezer');
        var email = json.data.email || '';
        if (domeinVan(email) === HOOFDDOMEIN) email = (sel && sel.value) ? metDomein(email, sel.value) : opMerkdomein(email);
        zetGegevenVeld('contact.naam', json.data.naam || '');
        zetGegevenVeld('contact.email', email);
        /* Geen foto in Odoo? Dan blijft de bestaande staan -- een offerte
           zonder gezicht is erger dan een offerte met de vorige foto, en je
           ziet meteen dat er nog iets te doen is. */
        if (json.data.foto) zetGegevenVeld('contact.foto', json.data.foto);
        contacten.gekozenId = id;
        contactGewijzigd = true;
        tekenContactKaart();
        melding(json.data.foto ? 'Contactpersoon ingevuld.' : 'Contactpersoon ingevuld (geen foto in Odoo).');
      })
      .catch(function (err) {
        window.alert('Medewerker ophalen mislukt: ' + err.message);
      });
  }

  function kiesDomein(domein) {
    var input = contactInput('contact.email');
    if (!input || !domein) return;
    input.value = metDomein(input.value, domein);
    contactGewijzigd = true;
    tekenContactKaart();
  }

  /* De medewerker van de aangemelde gebruiker, een keer per pagina opgehaald.
     null = er hoort geen medewerker bij dit account; dan blijft alles zoals
     het was. */
  function haalMij(klaar) {
    if (contacten.mij !== undefined) { klaar(contacten.mij); return; }
    apiFetch('/forminator-v2/api/pdf-contacten/mij', { credentials: 'include' })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (json) {
        contacten.mij = (json && json.success && json.data) || null;
        klaar(contacten.mij);
      })
      .catch(function () { contacten.mij = null; klaar(null); });
  }

  function pasStandaardContactToe() {
    if (SERVER) return;
    haalMij(function (mij) {
      if (!mij || !staat.gegevens) return;
      var huidig = staat.gegevens.contact || null;
      /* Zonder sjabloon komt de staat uit localStorage: staat daar al iemand
         anders dan de demo, dan koos deze browser dat bewust. */
      if (!TEMPLATE_ID && huidig) {
        var demo = ((window.OFFERTE_DATA || {}).gegevens || {}).contact || {};
        if (huidig.naam && huidig.naam !== demo.naam) return;
      }
      sjabloonContact = huidig ? kopie(huidig) : null;
      staat.gegevens.contact = {
        naam: mij.naam || '',
        email: opMerkdomein(mij.email || ''),
        foto: mij.foto || (huidig && huidig.foto) || ''
      };
      contactAuto = true;
      contacten.gekozenId = mij.id;
      teken();
    });
  }

  /* Wat er naar het SJABLOON gaat: de gegevens zoals op het scherm, behalve
     een contactpersoon die enkel automatisch ingevuld werd. */
  function gegevensVoorSjabloon() {
    if (!contactAuto) return staat.gegevens;
    var g = kopie(staat.gegevens);
    if (sjabloonContact) g.contact = sjabloonContact; else delete g.contact;
    return g;
  }

  /* ----------------------------------------------------------------------
     Pdf maken op de server -- en bewaren

     Dezelfde renderPdf() als de generate_pdf-stap, met exact wat hier op het
     scherm staat. De pdf komt in fs_v2_generated_documents en is 30 dagen
     terug te vinden onder "Recente pdf's", net als de pdf's die een
     koppeling automatisch maakte. "Afdrukken" (window.print) blijft voor wie
     enkel even op papier wil kijken, maar bewaart niets.
     -------------------------------------------------------------------- */

  var pdfBezig = false;

  function maakPdf() {
    if (pdfBezig) return;
    if (bewerken || opmaakStand) {
      bewerken = false;
      opmaakStand = false;
      teken();
    }
    pdfBezig = true;
    var knop = document.getElementById('ovKnopPdf');
    if (knop) { knop.disabled = true; knop.textContent = 'Pdf maken…'; }
    /* Het venster METEEN openen, nog in de klik: pas na de fetch openen houdt
       de popupblokker tegen. */
    var venster = window.open('', '_blank');
    zorgVoorNummer()
      .then(function () {
        return apiFetch('/forminator-v2/api/offerte-pdf', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ template_id: TEMPLATE_ID, gegevens: staat.gegevens, copy: staat.copy })
        });
      })
      .then(function (res) {
        if (res.status === 401) { window.location.href = '/'; return null; }
        return res.json();
      })
      .then(function (json) {
        if (!json) return;
        if (!json.success || !json.data) throw new Error(json.error || 'onbekende fout');
        var url = '/forminator-v2/api/generated-documents/' + encodeURIComponent(json.data.id) + '/download';
        if (venster) venster.location.href = url; else window.open(url, '_blank');
        documenten.lijst = null;
        melding('Pdf gemaakt en bewaard bij Recente pdf\'s.');
      })
      .catch(function (err) {
        if (venster) venster.close();
        window.alert('Pdf maken mislukt: ' + err.message);
      })
      .then(function () {
        pdfBezig = false;
        if (knop) { knop.disabled = false; knop.textContent = 'Pdf maken'; }
      });
  }

  /* ----------------------------------------------------------------------
     Recente pdf's -- uit de editor EN uit de koppelingen, laatste 30 dagen
     -------------------------------------------------------------------- */

  var documenten = { lijst: null };

  function datumTijd(iso) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString('nl-BE', {
      timeZone: 'Europe/Brussels', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
    });
  }

  function toonDocumenten() {
    document.getElementById('ovDocumentenDialoog').showModal();
    var body = document.getElementById('ovDocumentenBody');
    body.innerHTML = '<div class="ov-doc-leeg">Laden&hellip;</div>';
    apiFetch('/forminator-v2/api/generated-documents', { credentials: 'include' })
      .then(function (res) {
        if (res.status === 401) { window.location.href = '/'; return null; }
        return res.json();
      })
      .then(function (json) {
        if (!json) return;
        if (!json.success) throw new Error(json.error || 'onbekende fout');
        documenten.lijst = json.data || [];
        tekenDocumenten();
      })
      .catch(function (err) {
        body.innerHTML = '<div class="ov-doc-leeg">De lijst kon niet opgehaald worden: ' + esc(err.message) + '</div>';
      });
  }

  function tekenDocumenten() {
    var body = document.getElementById('ovDocumentenBody');
    if (!body || !documenten.lijst) return;
    var zoek = String((document.getElementById('ovDocZoek') || {}).value || '').trim().toLowerCase();
    var enkelMijn = !!(document.getElementById('ovDocMijn') || {}).checked;
    var rijen = documenten.lijst.filter(function (d) {
      if (enkelMijn && !d.mine) return false;
      if (!zoek) return true;
      return [d.filename, d.label, d.integration_name, d.template_name, d.created_by_name]
        .join(' ').toLowerCase().indexOf(zoek) >= 0;
    });
    if (!rijen.length) {
      body.innerHTML = '<div class="ov-doc-leeg">' +
        (documenten.lijst.length ? 'Niets gevonden.' : 'Er zijn de laatste 30 dagen geen pdf\'s gemaakt.') + '</div>';
      return;
    }
    body.innerHTML = '<table class="ov-doc-tabel"><thead><tr>' +
        '<th>Wanneer</th><th>Offerte</th><th>Gemaakt via</th><th></th>' +
      '</tr></thead><tbody>' +
      rijen.map(function (d) {
        var handmatig = d.source === 'manual';
        var bron = handmatig
          ? 'Editor' + (d.created_by_name ? ' · ' + d.created_by_name : '')
          : 'Koppeling' + (d.integration_name ? ' · ' + d.integration_name : '');
        return '<tr>' +
          '<td>' + esc(datumTijd(d.created_at)) + '</td>' +
          '<td><div class="ov-doc-naam">' + esc(d.filename) + '</div>' +
            (d.label ? '<div class="ov-doc-sub">' + esc(d.label) + '</div>' : '') + '</td>' +
          '<td><span class="ov-doc-bron' + (handmatig ? ' ov-doc-bron--manual' : '') + '">' + esc(bron) + '</span></td>' +
          '<td class="ov-doc-actie"><a class="ov-knop" target="_blank" rel="noopener" href="/forminator-v2/api/generated-documents/' +
            encodeURIComponent(d.id) + '/download">Openen</a></td>' +
        '</tr>';
      }).join('') +
      '</tbody></table>';
  }

  function toonJson() {
    document.getElementById('ovJsonVeld').value = JSON.stringify(staat, null, 2);
    document.getElementById('ovJsonDialoog').showModal();
  }

  function pasJsonToe() {
    var veld = document.getElementById('ovJsonVeld');
    try {
      var o = JSON.parse(veld.value);
      if (!o || !o.gegevens || !o.copy) throw new Error('verwacht een object met "gegevens" en "copy"');
      staat = o;
      contactAuto = false;
      document.getElementById('ovJsonDialoog').close();
      bewaar();
      teken();
    } catch (err) {
      window.alert('Deze JSON kan ik niet gebruiken:\n\n' + err.message);
    }
  }

  function kopieerJson() {
    var tekst = JSON.stringify(staat, null, 2);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(tekst).then(function () {
        melding('Gekopieerd naar het klembord.');
      }, function () { toonJson(); });
    } else {
      toonJson();
    }
  }

  /* Elke aanroep naar de Worker loopt hierdoor. Niet (meer) aangemeld = de
     auth-gate stuurt door naar de loginpagina (res.redirected) of antwoordt
     401: dan naar het loginscherm, met deze pagina als `next`, zodat je na
     het aanmelden terug op dezelfde offerte staat. Zonder dit bleef de pagina
     half geladen staan met enkel fouten in de console. */
  function naarLogin() {
    window.location.href = '/?next=' + encodeURIComponent(window.location.pathname + window.location.search);
  }

  function apiFetch(url, opties) {
    return fetch(url, opties).then(function (res) {
      if (res.status === 401 || res.redirected) {
        naarLogin();
        throw new Error('Je bent niet (meer) aangemeld.');
      }
      if (res.status === 403) {
        throw new Error('Je account heeft geen toegang tot Koppelingen, en de offertetool draait daarop. Vraag een beheerder om toegang.');
      }
      return res;
    });
  }

  var meldingTimer = null;
  function melding(tekst) {
    var el = document.getElementById('ovMelding');
    el.textContent = tekst;
    clearTimeout(meldingTimer);
    meldingTimer = setTimeout(function () { el.textContent = ''; }, 2600);
  }

  function afdrukken() {
    /* De bewerkstand toont ruwe tekst met {{...}} erin. Die mag nooit in een
       pdf belanden, dus ze gaat hier vanzelf uit. */
    if (bewerken || opmaakStand) {
      bewerken = false;
      opmaakStand = false;
      teken();
    }
    setTimeout(function () { window.print(); }, 60);
  }

  /* ======================================================================
     Nummering & geldigheid (sequence_pattern / geldigheid_dagen)
     ====================================================================== */

  function toonInstellingen() {
    document.getElementById('ovSequencePattern').value = instellingen.sequence_pattern || '';
    document.getElementById('ovGeldigheidDagen').value = instellingen.geldigheid_dagen || '';
    document.getElementById('ovInstellingenDialoog').showModal();
  }

  function bewaarInstellingen() {
    if (!TEMPLATE_ID) { window.alert('Enkel beschikbaar voor een opgeslagen sjabloon.'); return; }
    var patroon = document.getElementById('ovSequencePattern').value.trim();
    var dagenRuw = document.getElementById('ovGeldigheidDagen').value.trim();
    var dagen = dagenRuw ? Number(dagenRuw) : null;
    apiFetch('/forminator-v2/api/pdf-templates/' + TEMPLATE_ID, {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sequence_pattern: patroon || null, geldigheid_dagen: dagen })
    }).then(function (res) { return res.json(); }).then(function (json) {
      if (!json || !json.success) throw new Error((json && json.error) || 'onbekende fout');
      instellingen.sequence_pattern = patroon;
      instellingen.geldigheid_dagen = dagen;
      document.getElementById('ovInstellingenDialoog').close();
      melding('Bewaard.');
    }).catch(function (err) {
      window.alert('Bewaren mislukt: ' + err.message);
    });
  }

  /* ======================================================================
     Bedrijfsprofielen (fs_v2_bedrijf_profielen)
     ====================================================================== */

  var BEDRIJF_VELDEN = [
    ['naam', 'Naam'], ['product', 'Product'], ['platform', 'Platform'],
    ['kbo', 'KBO-nummer'], ['biv', 'BIV-nummer'], ['adres', 'Adres'],
    ['email', 'E-mailadres'], ['telefoon', 'Telefoon'], ['website', 'Website']
  ];

  function tekenBedrijvenBody(html) {
    document.getElementById('ovBedrijvenBody').innerHTML = html;
  }

  function tekenBedrijvenOverzicht() {
    var rijen = (bedrijven.lijst || []).map(function (b) {
      return '<div class="ov-bedrijf-rij">' +
          '<span class="ov-bedrijf-naam">' + esc(b.name) + '</span>' +
          '<span class="ov-bedrijf-acties">' +
            '<button type="button" class="ov-knop" data-action="bedrijf-bewerken" data-id="' + esc(b.id) + '">Bewerken</button>' +
            '<button type="button" class="ov-knop" data-action="bedrijf-verwijderen" data-id="' + esc(b.id) + '">Verwijderen</button>' +
          '</span>' +
        '</div>';
    }).join('') || '<p class="ov-veld-hint">Nog geen bedrijven.</p>';
    tekenBedrijvenBody(rijen +
      '<div style="margin-top:12px;"><button type="button" class="ov-knop ov-knop--hoofd" data-action="bedrijf-nieuw">+ Nieuw bedrijf</button></div>');
  }

  function laadBedrijvenLijst() {
    tekenBedrijvenBody('<p class="ov-veld-hint">Laden…</p>');
    apiFetch('/forminator-v2/api/bedrijf-profielen', { credentials: 'include' })
      .then(function (res) { return res.json(); })
      .then(function (json) {
        bedrijven.lijst = (json && json.data) || [];
        tekenBedrijvenOverzicht();
      })
      .catch(function () {
        tekenBedrijvenBody('<p class="ov-veld-hint">Laden mislukt.</p>');
      });
  }

  function toonBedrijven() {
    bedrijven.bewerkId = null;
    document.getElementById('ovBedrijvenDialoog').showModal();
    laadBedrijvenLijst();
  }

  function tekenBedrijfForm(bedrijf) {
    var data = (bedrijf && bedrijf.data) || {};
    var velden = BEDRIJF_VELDEN.map(function (v) {
      return '<label class="ov-veld"><span>' + esc(v[1]) + '</span>' +
        '<input type="text" data-bedrijf-veld="' + esc(v[0]) + '" value="' + esc(data[v[0]] || '') + '"></label>';
    }).join('');
    tekenBedrijvenBody(
      '<label class="ov-veld"><span>Naam van dit profiel</span>' +
        '<input type="text" id="ovBedrijfProfielNaam" value="' + esc((bedrijf && bedrijf.name) || '') + '"></label>' +
      '<div class="ov-bedrijf-form-grid">' + velden + '</div>' +
      '<div style="margin-top:12px; display:flex; gap:8px;">' +
        '<button type="button" class="ov-knop ov-knop--hoofd" data-action="bedrijf-bewaren">Bewaren</button>' +
        '<button type="button" class="ov-knop" data-action="bedrijf-terug">Terug</button>' +
      '</div>'
    );
  }

  function toonBedrijfNieuw() {
    bedrijven.bewerkId = 'nieuw';
    tekenBedrijfForm(null);
  }

  /* De lijst geeft enkel id/name/updated_at terug (zelfde afweging als
     listPdfTemplates -- data kan groot zijn), dus voor het bewerkformulier
     wordt het volledige profiel apart opgehaald. */
  function toonBedrijfBewerken(id) {
    bedrijven.bewerkId = id;
    tekenBedrijvenBody('<p class="ov-veld-hint">Laden…</p>');
    apiFetch('/forminator-v2/api/bedrijf-profielen/' + id, { credentials: 'include' })
      .then(function (res) { return res.json(); })
      .then(function (json) { tekenBedrijfForm(json && json.data); })
      .catch(function () {
        window.alert('Bedrijf kon niet geladen worden.');
        tekenBedrijvenOverzicht();
      });
  }

  function bewaarBedrijf() {
    var naam = (document.getElementById('ovBedrijfProfielNaam') || {}).value || '';
    var data = {};
    document.querySelectorAll('#ovBedrijvenBody [data-bedrijf-veld]').forEach(function (input) {
      data[input.dataset.bedrijfVeld] = input.value;
    });
    var isNieuw = bedrijven.bewerkId === 'nieuw';
    var url = '/forminator-v2/api/bedrijf-profielen' + (isNieuw ? '' : '/' + bedrijven.bewerkId);
    apiFetch(url, {
      method: isNieuw ? 'POST' : 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: naam, data: data })
    }).then(function (res) { return res.json(); }).then(function (json) {
      if (!json || !json.success) throw new Error((json && json.error) || 'onbekende fout');
      melding('Bewaard.');
      bedrijven.bewerkId = null;
      laadBedrijvenLijst();
    }).catch(function (err) {
      window.alert('Bewaren mislukt: ' + err.message);
    });
  }

  function verwijderBedrijf(id) {
    if (!window.confirm('Dit bedrijfsprofiel verwijderen?')) return;
    apiFetch('/forminator-v2/api/bedrijf-profielen/' + id, { method: 'DELETE', credentials: 'include' })
      .then(function (res) { return res.json(); })
      .then(function (json) {
        if (!json || !json.success) throw new Error((json && json.error) || 'onbekende fout');
        laadBedrijvenLijst();
      }).catch(function (err) {
        window.alert('Verwijderen mislukt: ' + err.message);
      });
  }

  /* Eén centrale klikluisteraar, geen handlers in de opmaak. */
  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('[data-action]');
    if (!el) return;
    var actie = el.dataset.action;

    if (actie === 'bewerken') {
      bewerken = !bewerken;
      if (bewerken) opmaakStand = false;
      teken();
    } else if (actie === 'opmaak') {
      opmaakStand = !opmaakStand;
      if (opmaakStand) bewerken = false;
      teken();
    } else if (actie === 'indeling') {
      indelingActie(el);
    } else if (actie === 'afdrukken') {
      afdrukken();
    } else if (actie === 'pdf-maken') {
      maakPdf();
    } else if (actie === 'documenten') {
      toonDocumenten();
    } else if (actie === 'gegevens') {
      toonGegevens();
    } else if (actie === 'gegevens-bewaren') {
      bewaarGegevens();
    } else if (actie === 'nummer-genereren') {
      genereerNummer(true);
    } else if (actie === 'instellingen') {
      toonInstellingen();
    } else if (actie === 'instellingen-bewaren') {
      bewaarInstellingen();
    } else if (actie === 'bedrijven') {
      toonBedrijven();
    } else if (actie === 'bedrijf-nieuw') {
      toonBedrijfNieuw();
    } else if (actie === 'bedrijf-bewerken') {
      toonBedrijfBewerken(el.dataset.id);
    } else if (actie === 'bedrijf-bewaren') {
      bewaarBedrijf();
    } else if (actie === 'bedrijf-verwijderen') {
      verwijderBedrijf(el.dataset.id);
    } else if (actie === 'bedrijf-terug') {
      bedrijven.bewerkId = null;
      tekenBedrijvenOverzicht();
    } else if (actie === 'json') {
      toonJson();
    } else if (actie === 'beeld-map') {
      laadBeeldMap(el.dataset.prefix || '');
    } else if (actie === 'beeld-kies') {
      document.getElementById('ovBeeldUrl').value = el.dataset.url || '';
      toonBeeldVoorbeeld(el.dataset.url || '');
    } else if (actie === 'beeld-toepassen') {
      beeldToepassen();
    } else if (actie === 'json-toepassen') {
      pasJsonToe();
    } else if (actie === 'json-kopieren') {
      kopieerJson();
    } else if (actie === 'sluiten') {
      var dlg = el.closest('dialog');
      if (dlg) dlg.close();
    } else if (actie === 'herstellen') {
      if (TEMPLATE_ID) {
        if (!window.confirm('Wijzigingen weggooien en het sjabloon opnieuw van de server laden?')) return;
        laadVanServer();
        return;
      }
      if (!window.confirm('Alle wijzigingen terugzetten naar de oorspronkelijke offerte?')) return;
      staat = kopie(window.OFFERTE_DATA);
      contactAuto = false;
      try { window.localStorage.removeItem(OPSLAGSLEUTEL); } catch (err) { /* niet erg */ }
      teken();
      pasStandaardContactToe();
    } else if (actie === 'rij-erbij') {
      var lijst = lees(el.dataset.lijst);
      if (!Array.isArray(lijst)) return;
      lijst.push(leegAls(lijst[lijst.length - 1]));
      bewaar();
      teken();
    } else if (actie === 'rij-weg') {
      var l = lees(el.dataset.lijst);
      if (!Array.isArray(l)) return;
      l.splice(Number(el.dataset.index), 1);
      bewaar();
      teken();
    } else if (actie === 'rij-op' || actie === 'rij-neer') {
      var rijen = lees(el.dataset.lijst);
      var van = Number(el.dataset.index);
      var naar = actie === 'rij-op' ? van - 1 : van + 1;
      if (!Array.isArray(rijen) || naar < 0 || naar >= rijen.length) return;
      var rij = rijen.splice(van, 1)[0];
      rijen.splice(naar, 0, rij);
      bewaar();
      teken();
    }
  });

  /* Keuzelijsten in de dialogen -- zelfde aanpak als de klikluisteraar. */
  document.addEventListener('change', function (e) {
    var el = e.target.closest && e.target.closest('[data-change]');
    if (!el) return;
    if (el.dataset.change === 'contact-kiezen') kiesContact(el.value);
    if (el.dataset.change === 'contact-domein') kiesDomein(el.value);
    if (el.dataset.change === 'documenten-filter') tekenDocumenten();
  });

  /* ======================================================================
     Start
     ====================================================================== */

  teken();
  laadVanServer();
  if (!TEMPLATE_ID) pasStandaardContactToe();

  /* Beelden veranderen de hoogte pas als ze geladen zijn; daarna opnieuw meten. */
  window.addEventListener('load', controleerOverloop);
  window.addEventListener('resize', controleerOverloop);

  /* handig bij het later inhaken: window.OFFERTE.zet(data) vult het blad */
  window.OFFERTE = {
    staat: function () { return staat; },
    zet: function (nieuw) { staat = kopie(nieuw); teken(); },
    teken: teken
  };
})();
