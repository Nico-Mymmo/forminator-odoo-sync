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

  /* knopje om deze rij weg te halen (staat er alleen in de bewerkstand) */
  function wegKnop(lijstPad, index) {
    return '<button type="button" class="ov-rijknop ov-rijknop--weg" data-action="rij-weg"' +
      ' data-lijst="' + esc(lijstPad) + '" data-index="' + index + '" title="Deze rij verwijderen">&times;</button>';
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
  function blad1() {
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

    return blad(1,
      '<div class="ov-panel ov-hero">' +
        T('copy.hero.titel', { tag: 'h1', klasse: 'ov-hero-titel' }) +
        T('copy.hero.tekst', { tag: 'div', klasse: 'ov-hero-tekst ov-tekst', blok: true }) +
      '</div>' +

      '<div class="ov-kolommen">' +
        '<div class="ov-contact">' +
          T('copy.contact.titel', { tag: 'h2', klasse: 'ov-h2' }) +
          '<img class="ov-contact-foto" src="' + esc(g.contact.foto) + '" alt="' + esc(g.contact.naam) + '">' +
          '<div class="ov-contact-naam">' + esc(g.contact.naam) + '</div>' +
          '<div class="ov-contact-mail">' + esc(g.contact.email) + '</div>' +
        '</div>' +
        '<div>' +
          T('copy.offerte.titel', { tag: 'h2', klasse: 'ov-h2' }) +
          '<div class="ov-gegevens">' + gegevensRijen + '</div>' +
          erbijKnop('copy.offerte.rijen', 'gegeven') +
        '</div>' +
      '</div>' +

      '<div class="ov-inleiding ov-tekst">' +
        T('copy.inleiding.titel', { tag: 'div', klasse: 'ov-inleiding-titel' }) +
        T('copy.inleiding.tekst', { tag: 'div', blok: true }) +
      '</div>' +

      '<div class="ov-vergelijking">' +
        T('copy.vergelijking.titel', { tag: 'h2', klasse: 'ov-h2' }) +
        '<div class="ov-vgl-tabel">' + vglKop + '<div class="ov-vgl-body">' + vglRijen + '</div></div>' +
        erbijKnop('copy.vergelijking.rijen') +
      '</div>' +

      '<div class="ov-platform">' +
        T('copy.platform.titel', { tag: 'h2', klasse: 'ov-h2' }) +
        '<div class="ov-platform-raster">' +
          T('copy.platform.tekst', { tag: 'div', klasse: 'ov-tekst', blok: true }) +
          '<img class="ov-platform-beeld ov-bleed-rechts" src="' + esc(g.beeld.platform) + '" alt="">' +
        '</div>' +
      '</div>'
    );
  }

  /* --- pagina 2 --------------------------------------------------------- */
  function blad2() {
    var c = staat.copy;

    var kaarten = c.kosten.kaarten.map(function (kaart, i) {
      var p = 'copy.kosten.kaarten.' + i;
      var punten = kaart.punten.map(function (_, j) {
        return '<li>' + T(p + '.punten.' + j) + wegKnop(p + '.punten', j) + '</li>';
      }).join('');

      return '<div class="ov-kaart ov-kaart--' + esc(kaart.stijl === 'roze' ? 'roze' : 'blauw') + '">' +
        '<div class="ov-kaart-links">' +
          T(p + '.label', { tag: 'div', klasse: 'ov-h3' }) +
          T(p + '.bedrag', { tag: 'div', klasse: 'ov-kaart-bedrag' }) +
          T(p + '.voetnoot', { tag: 'div', klasse: 'ov-kaart-voetnoot' }) +
        '</div>' +
        '<div class="ov-kaart-rechts">' +
          T(p + '.inhoudtitel', { tag: 'div', klasse: 'ov-h3' }) +
          '<ul class="ov-punten">' + punten + '</ul>' +
          erbijKnop(p + '.punten', 'punt') +
        '</div>' +
      '</div>';
    }).join('');

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

    return blad(2,
      '<div class="ov-prijzen">' +
        T('copy.kosten.titel', { tag: 'h2', klasse: 'ov-h2' }) +
        kaarten +
        '<div class="ov-strook">' +
          T('copy.kosten.strook.bedrag', { tag: 'div', klasse: 'ov-strook-bedrag' }) +
          '<div>' +
            T('copy.kosten.strook.titel', { tag: 'div', klasse: 'ov-strook-titel' }) +
            T('copy.kosten.strook.voetnoot', { tag: 'div', klasse: 'ov-strook-voetnoot' }) +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div class="ov-extra">' +
        T('copy.extra.titel', { tag: 'h2', klasse: 'ov-h2' }) +
        T('copy.extra.tekst', { tag: 'div', klasse: 'ov-tekst', blok: true }) +
        '<div class="ov-extra-tabel">' + extraRijen + '</div>' +
        erbijKnop('copy.extra.rijen') +
        '<div class="ov-voetnoten ov-mini">' + voetnoten + '</div>' +
      '</div>'
    );
  }

  /* --- pagina 3 --------------------------------------------------------- */
  function blad3() {
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

    return blad(3,
      '<div class="ov-stappen">' +
        T('copy.stappen.titel', { tag: 'h2', klasse: 'ov-h2' }) +
        stappen +
        erbijKnop('copy.stappen.items', 'stap') +
        T('copy.stappen.slot', { tag: 'div', klasse: 'ov-stap-slot' }) +
      '</div>' +

      '<div class="ov-vragen">' +
        T('copy.vragen.titel', { tag: 'h2', klasse: 'ov-h2' }) +
        vragen +
        erbijKnop('copy.vragen.items', 'vraag') +
      '</div>' +

      '<div class="ov-panel ov-oproep">' +
        '<div class="ov-oproep-tekst">' +
          T('copy.oproep.titel', { tag: 'h2', klasse: 'ov-h2' }) +
          T('copy.oproep.tekst', { tag: 'div', klasse: 'ov-tekst', blok: true }) +
          T('copy.oproep.contact', { tag: 'p' }) +
        '</div>' +
        '<div class="ov-oproep-beeld">' +
          '<img class="ov-oproep-pijl" src="' + esc(g.beeld.pijl) + '" alt="">' +
          '<img class="ov-oproep-qr" src="' + esc(g.beeld.qr) + '" alt="QR-code om een afspraak te maken">' +
        '</div>' +
      '</div>'
    );
  }

  /* ======================================================================
     Tekenen
     ====================================================================== */

  function teken() {
    var doc = document.getElementById('ovDocument');
    doc.innerHTML = blad1() + blad2() + blad3();
    document.body.classList.toggle('ov-bewerkstand', bewerken);
    var knop = document.getElementById('ovKnopBewerken');
    if (knop) {
      knop.classList.toggle('ov-knop--actief', bewerken);
      knop.textContent = bewerken ? 'Klaar met bewerken' : 'Tekst bewerken';
    }
    controleerOverloop();
  }

  /* Een pagina die overloopt is de klassieke stille fout van een pdf-sjabloon:
     op het scherm zie je het niet, in de pdf is de laatste alinea weg. */
  function controleerOverloop() {
    document.querySelectorAll('.ov-pagina').forEach(function (p) {
      var body = p.querySelector('.ov-body');
      if (!body) return;
      p.classList.toggle('ov-pagina--vol', body.scrollHeight > body.clientHeight + 2);
    });
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
      fetch('/forminator-v2/api/pdf-templates/' + TEMPLATE_ID, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: { gegevens: staat.gegevens, copy: staat.copy, velden: window.OFFERTE_VELDEN } })
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
    fetch('/forminator-v2/api/pdf-templates/' + TEMPLATE_ID, { credentials: 'include' })
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
        serverKlaar = true;
        var titel = document.querySelector('.ov-werkbalk-titel');
        if (titel && json.data.name) titel.textContent = 'Offerte — ' + json.data.name;
        teken();
      })
      .catch(function () {
        melding('Sjabloon kon niet geladen worden — wijzigingen worden NIET bewaard.');
      });
  }

  /* ======================================================================
     Bewerken
     ====================================================================== */

  document.addEventListener('input', function (e) {
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

  function toonGegevens() {
    var body = document.getElementById('ovGegevensBody');
    body.innerHTML = (window.OFFERTE_VELDEN || []).map(function (groep) {
      return '<div class="ov-groepkop">' + esc(groep.groep) + '</div>' +
        groep.velden.map(function (v) {
          return '<label class="ov-veld"><span>' + esc(v[1]) + '</span>' +
            '<input type="text" data-gegeven="' + esc(v[0]) + '" value="' + esc(lees(v[0], staat.gegevens)) + '">' +
          '</label>';
        }).join('');
    }).join('');
    document.getElementById('ovGegevensDialoog').showModal();
  }

  function bewaarGegevens() {
    document.querySelectorAll('#ovGegevensBody [data-gegeven]').forEach(function (input) {
      zet(input.dataset.gegeven, input.value, staat.gegevens);
    });
    document.getElementById('ovGegevensDialoog').close();
    bewaar();
    teken();
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
    if (bewerken) {
      bewerken = false;
      teken();
    }
    setTimeout(function () { window.print(); }, 60);
  }

  /* Eén centrale klikluisteraar, geen handlers in de opmaak. */
  document.addEventListener('click', function (e) {
    var el = e.target.closest && e.target.closest('[data-action]');
    if (!el) return;
    var actie = el.dataset.action;

    if (actie === 'bewerken') {
      bewerken = !bewerken;
      teken();
    } else if (actie === 'afdrukken') {
      afdrukken();
    } else if (actie === 'gegevens') {
      toonGegevens();
    } else if (actie === 'gegevens-bewaren') {
      bewaarGegevens();
    } else if (actie === 'json') {
      toonJson();
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
      try { window.localStorage.removeItem(OPSLAGSLEUTEL); } catch (err) { /* niet erg */ }
      teken();
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
    }
  });

  /* ======================================================================
     Start
     ====================================================================== */

  teken();
  laadVanServer();

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
