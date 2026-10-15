/**
 * Nieuwsbrieven -- het schrijfformulier van één stukje, met AI-hulp en
 * opmerkingen. Bewaart vanzelf. Twee plekken (NB.state.stukjeHost):
 *   'paneel'  naast de brief op de redactietafel (newsletters-edition.js):
 *             wat je typt, staat meteen op zijn plek in de hele brief
 *   'pagina'  een eigen scherm, voor een idee in de voorraad (nog geen editie)
 */
(function () {
  'use strict';
  var NB = window.NB;
  var e = NB.esc;
  NB.inputs = NB.inputs || {};
  NB.changes = NB.changes || {};

  var bewaarTimer = null;
  var voorbeeldTimer = null;

  function c() { return NB.state.concept; }

  function zet(pad, waarde) {
    var delen = pad.split('.');
    var obj = c();
    for (var i = 0; i < delen.length - 1; i++) {
      var k = /^\d+$/.test(delen[i]) ? Number(delen[i]) : delen[i];
      if (obj[k] === undefined || obj[k] === null) obj[k] = /^\d+$/.test(delen[i + 1]) ? [] : {};
      obj = obj[k];
    }
    obj[delen[delen.length - 1]] = waarde;
  }

  function lees(pad) {
    return pad.split('.').reduce(function (o, k) { return o === undefined || o === null ? undefined : o[k]; }, c());
  }

  function gewijzigd() {
    NB.state.vuil = true;
    zetBewaarStand('Niet bewaard');
    clearTimeout(bewaarTimer);
    bewaarTimer = setTimeout(bewaar, 1200);
    clearTimeout(voorbeeldTimer);
    voorbeeldTimer = setTimeout(laadVoorbeeld, 500);
  }

  /** Bewaren zonder de brief opnieuw te tekenen (typen IN de brief, notities). */
  function gewijzigdStil() {
    NB.state.vuil = true;
    zetBewaarStand('Niet bewaard');
    clearTimeout(bewaarTimer);
    bewaarTimer = setTimeout(bewaar, 1200);
  }

  /**
   * Voor de redactietafel: een veld wijzigen van buiten het formulier. `stil`
   * = de brief niet opnieuw tekenen (wie IN de brief typt, houdt zijn cursor).
   */
  NB.stukjeZet = function (pad, waarde, opties) {
    if (!NB.state.stukje || !NB.state.concept) return;
    zet(pad, waarde);
    if (opties && opties.stil) { gewijzigdStil(); return; }
    gewijzigd();
    render();
  };
  NB.stukjeLees = function (pad) { return NB.state.concept ? lees(pad) : undefined; };

  function zetBewaarStand(tekst) {
    var el = document.getElementById('stBewaard');
    if (el) el.textContent = tekst;
  }

  async function bewaar() {
    clearTimeout(bewaarTimer);
    if (!NB.state.vuil || !NB.state.stukje || !NB.state.stukje.can_edit) return;
    var s = NB.state.stukje;
    try {
      var bij = await NB.api('/api/contributions/' + s.item.id, {
        method: 'PUT',
        body: { kind: c().kind, title: c().title, content: c().content, raw_notes: c().raw_notes, series_ids: c().series_ids },
      });
      NB.state.vuil = false;
      s.item = Object.assign({}, s.item, bij);
      if (NB.state.stukjeHost === 'paneel' && NB.stukjeBijgewerkt) NB.stukjeBijgewerkt(s.item);
      zetBewaarStand('Bewaard om ' + NB.datum(new Date().toISOString(), { hour: '2-digit', minute: '2-digit' }));
      var badge = document.getElementById('stStatus');
      if (badge) badge.innerHTML = NB.statusBadge(s.item.status);
    } catch (err) { zetBewaarStand('Bewaren mislukt'); NB.fout(err); }
  }
  NB.bewaarStukje = bewaar;

  async function laadVoorbeeld() {
    if (NB.state.stukjeHost === 'paneel') { if (NB.vernieuwBrief) NB.vernieuwBrief(); return; }
    var frame = document.getElementById('stVoorbeeld');
    if (!frame) return;
    try {
      var r = await NB.api('/api/contributions/' + NB.state.stukje.item.id + '/preview', {
        method: 'POST', body: { kind: c().kind, title: c().title, content: c().content },
      });
      frame.onload = function () {
        var doc = frame.contentDocument;
        if (doc) frame.style.height = (doc.documentElement.scrollHeight + 10) + 'px';
        if (doc) doc.addEventListener('click', function (ev) { ev.preventDefault(); });
      };
      frame.srcdoc = '<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0">' + r.html + '</body></html>';
    } catch (err) { /* voorbeeld mag stil falen tijdens het typen */ }
  }

  // ─── Velden per soort ─────────────────────────────────────────────────────

  function veld(label, pad, opties) {
    opties = opties || {};
    var waarde = lees(pad);
    var uit = NB.state.stukje.can_edit ? '' : ' disabled';
    var invoer = opties.rijen
      ? '<textarea class="textarea textarea-bordered w-full" rows="' + opties.rijen + '" data-veld="' + pad + '"' + uit + ' placeholder="' + e(opties.hint || '') + '">' + e(waarde || '') + '</textarea>'
      : '<input type="' + (opties.type || 'text') + '" class="input input-bordered w-full' + (opties.klein ? ' input-sm' : '') + '" data-veld="' + pad + '" value="' + e(waarde || '') + '"' + uit + ' placeholder="' + e(opties.hint || '') + '">';
    return '<label class="form-control w-full"><span class="label-text mb-1">' + e(label) + '</span>' + invoer
      + (opties.uitleg ? '<span class="label-text-alt opacity-60 mt-1">' + e(opties.uitleg) + '</span>' : '') + '</label>';
  }

  function vinkje(label, pad) {
    var aan = lees(pad) !== false;
    return '<label class="label cursor-pointer justify-start gap-3"><input type="checkbox" class="checkbox checkbox-sm" data-veld="' + pad + '"' + (aan ? ' checked' : '') + (NB.state.stukje.can_edit ? '' : ' disabled') + '><span class="label-text">' + e(label) + '</span></label>';
  }

  /** Wie het woordje vooraf ondertekent: foto, voornaam en functie komen uit Odoo. */
  function ondertekenaarKeuze() {
    var s = NB.state.stukje;
    var gekozen = lees('content.signer_user_id') || '';
    var schrijver = s.item.owner_name ? s.item.owner_name.split(' ')[0] : 'wie het schrijft';
    var users = (NB.state.boot && NB.state.boot.users) || [];
    return '<label class="form-control w-full"><span class="label-text mb-1">Wie ondertekent?</span>'
      + '<select class="select select-bordered w-full" data-veld="content.signer_user_id"' + (s.can_edit ? '' : ' disabled') + '>'
      + '<option value="">' + e(schrijver) + ' (schrijft dit)</option>'
      + users.filter(function (u) { return u.id !== s.item.owner_user_id; }).map(function (u) {
        return '<option value="' + e(u.id) + '"' + (u.id === gekozen ? ' selected' : '') + '>' + e(u.name) + '</option>';
      }).join('')
      + '</select><span class="label-text-alt opacity-60 mt-1">Onder de tekst komen de foto, de voornaam en de functie uit Odoo.</span></label>';
  }

  /**
   * De berichten uit Nieuws & updates. Een fout wordt GETOOND (en niet
   * onthouden): "geen berichten" zeggen terwijl het ophalen mislukte, zette
   * mensen op het verkeerde been.
   */
  function laadBerichten() {
    NB.state.berichtenFout = null;
    return NB.api('/api/snippets').then(function (r) { NB.state.berichten = r || []; })
      .catch(function (err) { NB.state.berichten = null; NB.state.berichtenFout = err.message || String(err); });
  }

  NB.actions['berichten-opnieuw'] = async function () {
    await laadBerichten();
    render();
  };

  /** Welk bericht uit Nieuws & updates: kiezen = alles invullen. */
  function berichtKeuze() {
    if (NB.state.berichtenFout) {
      return '<div class="alert alert-warning text-sm flex-col items-start gap-2"><span><strong>De berichten uit Nieuws &amp; updates konden niet geladen worden.</strong><br>' + e(NB.state.berichtenFout) + '</span>'
        + '<button class="btn btn-sm" data-action="berichten-opnieuw">Opnieuw proberen</button></div>';
    }
    var lijst = NB.state.berichten || [];
    var gekozen = Number(lees('content.snippet_id')) || 0;
    var mag = NB.state.stukje.can_edit;
    var datum = function (d) { return d ? ' · ' + NB.datum(d, { day: 'numeric', month: 'short', year: 'numeric' }) : ''; };
    return '<label class="form-control w-full"><span class="label-text mb-1 font-semibold">Bericht uit Nieuws &amp; updates</span>'
      + '<select class="select select-bordered w-full" data-change="bericht-kies"' + (mag ? '' : ' disabled') + '>'
      + '<option value="">' + (lijst.length ? 'Kies een bericht…' : 'Geen gepubliceerde berichten gevonden') + '</option>'
      + lijst.map(function (b) {
        return '<option value="' + b.id + '"' + (b.id === gekozen ? ' selected' : '') + '>' + e(b.title) + e(datum(b.published_on)) + '</option>';
      }).join('')
      + '</select></label>';
  }

  /**
   * De labels van de ANDERE berichten in deze editie: een nieuw label moet
   * daar niet op lijken (drie keer "Interessant gelezen" onder elkaar).
   */
  function labelsInEditie() {
    var ed = NB.state.editie;
    var mijn = NB.state.stukje && NB.state.stukje.item.id;
    return ((ed && ed.items) || []).filter(function (i) { return i.kind === 'snippet' && i.id !== mijn; })
      .map(function (i) { return (i.content && i.content.tag) || i.title; }).filter(Boolean);
  }

  /** Het label boven het bericht: voorgesteld door Nieuws & updates, aan te passen. */
  function labelVeld() {
    var mag = NB.state.stukje.can_edit;
    return '<label class="form-control w-full"><span class="label-text mb-1">Label boven het bericht</span>'
      + '<div class="flex gap-2"><input type="text" maxlength="40" class="input input-bordered w-full" data-veld="content.tag" value="' + e(lees('content.tag') || '') + '" placeholder="' + e(NB.state.stukje.item.title || 'bv. Goed om te weten') + '"' + (mag ? '' : ' disabled') + '>'
      + (mag ? '<button type="button" class="btn btn-ghost gap-1" data-action="bericht-label" title="Laat Nieuws &amp; updates een ander label voorstellen"><i data-lucide="sparkles" class="w-4 h-4"></i> Ander</button>' : '')
      + '</div><span class="label-text-alt opacity-60 mt-1">Voorgesteld door Nieuws &amp; updates, anders dan de andere berichten in deze brief.</span></label>';
  }

  /** Hoe het bericht in de brief staat (BERICHT_VORMEN, via /api/bootstrap). */
  function vormKeuze() {
    var vormen = (NB.state.boot && NB.state.boot.bericht_vormen) || [];
    if (!vormen.length) return '';
    var nu = lees('content.vorm') || 'klassiek';
    var heeftCitaat = String(lees('content.quote') || '').trim();
    var mag = NB.state.stukje.can_edit;
    return '<div><span class="label-text">Vorm in de brief</span><div class="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-1">'
      + vormen.map(function (v) {
        var kan = v.key !== 'citaat' || heeftCitaat;
        var aan = v.key === nu;
        return '<button type="button" class="btn btn-sm h-auto min-h-0 py-2 flex-col items-start text-left gap-0 normal-case font-normal ' + (aan ? 'btn-primary' : 'btn-outline border-base-content/20') + '"'
          + ' data-action="bericht-vorm" data-vorm="' + e(v.key) + '"' + (mag && kan ? '' : ' disabled')
          + ' title="' + e(kan ? v.uitleg : 'Dit bericht heeft geen citaat uit het artikel.') + '">'
          + '<span class="font-semibold">' + e(v.label) + '</span><span class="text-[11px] leading-tight opacity-70">' + e(v.uitleg) + '</span></button>';
      }).join('')
      + '</div><p class="text-xs opacity-60 mt-1">Wissel af: twee artikels na elkaar lezen beter in een andere vorm.</p></div>';
  }

  /** De tekst aanpassen kan enkel op het bericht zelf. */
  function berichtBron() {
    return '<div class="rounded-xl bg-base-200 p-3 text-sm flex items-start gap-2"><i data-lucide="info" class="w-4 h-4 mt-0.5 shrink-0"></i><span>Titel, tekst, beeld en link komen uit Nieuws &amp; updates en zijn altijd de laatste versie. Iets aanpassen? Doe het op het bericht zelf. '
      + '<a class="link link-primary" href="/content-feed" target="_blank" rel="noopener">Open Nieuws &amp; updates</a></span></div>';
  }

  /** Wie het deelde: komt uit Nieuws & updates (de eigenaar van het bericht). */
  function doorRegel() {
    var door = lees('content.door');
    return '<p class="text-sm opacity-70 flex items-center gap-2"><i data-lucide="user" class="w-4 h-4"></i>'
      + (door && door.name ? 'In de brief: <strong>Gedeeld door ' + e(door.name) + '</strong>' : 'Geen eigenaar in Nieuws &amp; updates: er komt geen naam onder.')
      + '</p>';
  }

  function volgendeVorm() {
    var ed = NB.state.editie;
    var mijn = NB.state.stukje && NB.state.stukje.item.id;
    var gebruikt = ((ed && ed.items) || []).filter(function (i) { return i.kind === 'snippet' && i.id !== mijn && i.content && i.content.snippet_id; })
      .map(function (i) { return i.content.vorm || 'klassiek'; });
    var rij = ['klassiek', 'kaart', 'compact', 'uitgelicht'];
    return rij.find(function (v) { return gebruikt.indexOf(v) < 0; }) || rij[gebruikt.length % rij.length];
  }

  NB.actions['bericht-vorm'] = function (el) {
    zet('content.vorm', el.dataset.vorm);
    gewijzigd();
    render();
  };

  NB.actions['bericht-label'] = async function (el) {
    var id = lees('content.snippet_id');
    if (!id) return;
    el.disabled = true;
    try {
      var huidig = lees('content.tag');
      var r = await NB.api('/api/snippets/' + id + '/label', { method: 'POST', body: { vermijd: labelsInEditie().concat(huidig ? [huidig] : []) } });
      zet('content.tag', r.tag);
      gewijzigd();
      render();
    } catch (err) { NB.fout(err); el.disabled = false; }
  };

  /** Een beeld in het formulier: een miniatuur en EEN knop naar het beeldvenster. */
  function beeldRij(o) {
    var b = NB.beeldVan(c().content, o.fotoVeld, o.vast || 'tekst');
    var t = b && b.thingie ? (NB.state.tekeningen || []).find(function (x) { return x.name === b.thingie; }) : null;
    var src = !b ? '' : b.thingie ? (t ? t.svg : '') : (b.vulling === 'vullen' && b.uitsnede ? b.uitsnede : b.url);
    var mag = NB.state.stukje.can_edit;
    return '<div class="flex flex-col gap-1"><span class="label-text">' + e(o.label) + '</span><div class="flex items-center gap-3">'
      + (src ? '<img src="' + e(src) + '" alt="" class="w-24 h-16 rounded-lg border border-base-content/10 ' + (b.thingie ? 'object-contain' : 'object-cover') + '">'
        : '<div class="w-24 h-16 rounded-lg border-2 border-dashed border-base-content/20 flex items-center justify-center text-xl opacity-50">+</div>')
      + (mag ? '<button class="btn btn-sm" data-action="beeld-paneel" data-fotoveld="' + e(o.fotoVeld) + '" data-vast="' + e(o.vast || '') + '" data-plaatsen="' + (o.plaatsen ? '1' : '') + '">' + (b ? 'Aanpassen' : 'Beeld kiezen') + '</button>' : '')
      + '</div></div>';
  }

  // ─── Vraag aan de lezer: EEN blok, drie soorten ───────────────────────────

  function zelfdeOpties(a, b) {
    var l = function (x) { return (x || []).map(function (o) { return String(o.label || '').trim().toLowerCase(); }).join('|'); };
    return l(a) === l(b);
  }

  /**
   * Een andere soort vraag. De antwoorden die nog de standaard waren, worden
   * de standaard van de nieuwe soort; eigen antwoorden blijven staan. Zo ook
   * het labeltje boven het blok: enkel als niemand het wijzigde.
   */
  NB.wisselVraagSoort = function (kind) {
    var cc = c();
    if (!cc || cc.kind === kind || !NB.state.stukje || !NB.state.stukje.can_edit) return;
    var soorten = NB.state.boot.vraag_soorten || [];
    var oud = soorten.find(function (v) { return v.kind === cc.kind; });
    var nieuw = soorten.find(function (v) { return v.kind === kind; });
    if (!nieuw) return;
    var std = NB.state.boot.default_options || {};
    var huidige = (cc.content && cc.content.options) || [];
    if (!huidige.length || zelfdeOpties(huidige, std[cc.kind])) zet('content.options', JSON.parse(JSON.stringify(std[kind] || [])));
    if (!String(cc.title || '').trim() || (oud && cc.title === oud.titel)) cc.title = nieuw.titel;
    cc.kind = kind;
    gewijzigd();
    render();
  };

  NB.vraagOptieBij = function () {
    var lijst = (lees('content.options') || []).slice();
    if (lijst.length >= 6) return;
    // Meteen een eigen waarde: anders telt de knop in het voorbeeld niet mee
    // tot de server er een gaf.
    var waarde = 'optie-' + Date.now().toString(36);
    lijst.push({ value: waarde, label: 'Nieuw antwoord' });
    zet('content.options', lijst);
    gewijzigd();
    render();
  };

  NB.vraagOptieWeg = function (i) {
    var lijst = (lees('content.options') || []).slice();
    if (lijst.length <= 2 || !lijst[i]) return;
    lijst.splice(i, 1);
    zet('content.options', lijst);
    gewijzigd();
    render();
  };

  NB.actions['vraag-soort'] = function (el) { NB.wisselVraagSoort(el.dataset.kind); };

  function vraagSoortKeuze() {
    var soorten = NB.state.boot.vraag_soorten || [];
    var nu = c().kind;
    var mag = NB.state.stukje.can_edit;
    return '<div><span class="label-text">Soort vraag</span><div class="join w-full mt-1">'
      + soorten.map(function (v) {
        return '<button type="button" class="btn btn-sm join-item flex-1 ' + (v.kind === nu ? 'btn-primary' : '') + '" data-action="vraag-soort" data-kind="' + e(v.kind) + '" title="' + e(v.uitleg) + '"' + (mag ? '' : ' disabled') + '>' + e(v.label) + '</button>';
      }).join('')
      + '</div><p class="text-xs opacity-60 mt-1">Typ de vraag en de antwoorden gerust meteen in de brief. Hoe opvallend en in welke kleur kiest marketing in de opmaakstand.</p></div>';
  }

  function opties() {
    var lijst = lees('content.options') || [];
    var mag = NB.state.stukje.can_edit;
    return '<div><span class="label-text">Antwoordknoppen</span><div class="flex flex-col gap-2 mt-1">'
      + lijst.map(function (o, i) {
        return '<div class="flex gap-2"><input type="text" class="input input-bordered input-sm flex-1" data-veld="content.options.' + i + '.label" value="' + e(o.label) + '"' + (mag ? '' : ' disabled') + '>'
          + (mag && lijst.length > 2 ? '<button class="btn btn-sm btn-ghost" data-action="optie-weg" data-i="' + i + '" aria-label="Weg"><i data-lucide="x" class="w-4 h-4"></i></button>' : '') + '</div>';
      }).join('')
      + (mag && lijst.length < 6 ? '<button class="btn btn-sm btn-ghost self-start" data-action="optie-bij"><i data-lucide="plus" class="w-4 h-4"></i> Knop</button>' : '')
      + '</div><p class="text-xs opacity-60 mt-1">Zodra er antwoorden zijn, verandert enkel nog het opschrift van een knop, niet wat er bewaard wordt.</p></div>';
  }

  function eventsVeld() {
    var events = NB.state.stukjeEvents || [];
    var uit = (lees('content.exclude_ids') || []).map(Number);
    return veld('Kop', 'content.heading')
      + '<div><span class="label-text">Events in deze editie (uit Eventbeheer, vanaf de verzenddag)</span>'
      + (events.length ? events.map(function (ev) {
        var aan = uit.indexOf(Number(ev.id)) < 0;
        return '<label class="label cursor-pointer justify-start gap-3"><input type="checkbox" class="checkbox checkbox-sm" data-action="event-toggle" data-id="' + ev.id + '"' + (aan ? ' checked' : '') + '>'
          + '<span class="label-text">' + e(NB.datum(ev.starts_at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })) + ' · ' + e(ev.title) + '</span></label>';
      }).join('') : '<p class="text-sm opacity-60 mt-1">Geen gepubliceerde events in die periode. Dan valt de agenda weg uit de mail.</p>')
      + '</div>';
  }

  function nieuwsVeld() {
    var items = lees('content.items') || [];
    var sug = lees('content.suggestions') || [];
    var mag = NB.state.stukje.can_edit;
    var gekozen = items.map(function (n) { return n.snippet_id; });
    return veld('Kop', 'content.heading')
      + items.map(function (n, i) {
        return '<div class="border border-base-content/10 rounded-xl p-3 flex flex-col gap-2">'
          + veld('Titel', 'content.items.' + i + '.title', { klein: true })
          + veld('Waarom we dit delen', 'content.items.' + i + '.note', { klein: true })
          + veld('Link', 'content.items.' + i + '.url', { klein: true })
          + (mag ? '<button class="btn btn-xs btn-ghost self-end" data-action="nieuws-weg" data-i="' + i + '">Weghalen</button>' : '') + '</div>';
      }).join('')
      + (mag ? '<div class="flex gap-2"><button class="btn btn-sm btn-ghost" data-action="nieuws-leeg">+ Eigen bericht</button><button class="btn btn-sm btn-ghost" data-action="nieuws-suggesties"><i data-lucide="refresh-cw" class="w-4 h-4"></i> Uit Nieuws &amp; updates</button></div>' : '')
      + (sug.length ? '<div class="bg-base-200 rounded-xl p-3"><div class="text-sm font-semibold mb-1">Gepubliceerd sinds de vorige editie</div>'
        + sug.map(function (n, i) {
          var al = gekozen.indexOf(n.snippet_id) >= 0;
          return '<div class="flex items-center gap-2 py-1"><span class="text-sm flex-1">' + e(n.title) + ' <span class="opacity-50 text-xs">' + e(n.published_on || '') + '</span></span>'
            + (al ? '<span class="text-xs opacity-60">staat erin</span>' : '<button class="btn btn-xs" data-action="nieuws-bij" data-i="' + i + '">Toevoegen</button>') + '</div>';
        }).join('') + '</div>' : '');
  }

  function velden(kind) {
    switch (kind) {
      case 'intro':
        return veld('Titel', 'content.title', { hint: 'Bv. Een nieuw jasje voor je vertrouwde info' })
          + veld('Tekst', 'content.text', { rijen: 8, uitleg: 'Een paar zinnen: wat staat er deze keer in, waarom is het de moeite. Sluit af met je groet (bv. "Veel leesplezier,"); je handtekening met foto komt er vanzelf onder.' })
          + ondertekenaarKeuze()
          + beeldRij({ plaatsen: true, fotoVeld: 'image_url', label: 'Beeld (optioneel)' });
      case 'article':
        return veld('Titel', 'content.title')
          + veld('Tekst', 'content.text', { rijen: 8, uitleg: 'Lege regel = nieuwe alinea. **vet** en [tekst](https://link) mogen.' })
          + beeldRij({ plaatsen: true, fotoVeld: 'image_url', label: 'Beeld (optioneel)' })
          + '<div class="grid sm:grid-cols-2 gap-3">' + veld('Link (optioneel)', 'content.link_url', { hint: 'https://' }) + veld('Tekst van de link', 'content.link_label', { hint: 'Lees verder' }) + '</div>';
      case 'snippet':
        // De tekst is van Nieuws & updates: hier enkel wat van de BRIEF is.
        return berichtKeuze()
          + (lees('content.snippet_id') ? labelVeld() + vormKeuze() + doorRegel() + berichtBron() : '');
      case 'video':
        return veld('Titel', 'content.title') + veld('Link naar de video', 'content.video_url', { hint: 'https://vimeo.com/… of YouTube' })
          + beeldRij({ vast: 'video', fotoVeld: 'thumbnail_url', label: 'Stilstaand beeld (een mail kan geen video afspelen)' })
          + veld('Tekst', 'content.text', { rijen: 4 }) + veld('Tekst op de knop', 'content.button_label', { hint: 'Bekijk de video' });
      case 'link':
      case 'linkedin':
        return '<div class="flex gap-2 items-end">' + veld('Link', 'content.url', { hint: 'https://' }) + (NB.state.stukje.can_edit ? '<button class="btn" data-action="link-ophalen">Ophalen</button>' : '') + '</div>'
          + veld('Titel', 'content.title') + veld('Tekst', 'content.text', { rijen: 4 }) + beeldRij({ vast: 'link', fotoVeld: 'image_url', label: 'Beeld' })
          + (kind === 'linkedin' ? veld('Van wie is de post?', 'content.author_name') : veld('Naam van de site', 'content.site_name'));
      case 'image':
        return beeldRij({ vast: 'vol', fotoVeld: 'image_url', label: 'Afbeelding (over de hele breedte)' })
          + veld('Bijschrift (optioneel)', 'content.bijschrift', { hint: 'Klein onder het beeld' })
          + veld('Link bij een klik (optioneel)', 'content.link_url', { hint: 'https://' });
      case 'quote':
        return veld('Citaat', 'content.quote', { rijen: 4 }) + '<div class="grid sm:grid-cols-2 gap-3">' + veld('Wie', 'content.person') + veld('Functie of gebouw', 'content.role') + '</div>';
      case 'statement':
      case 'question':
      case 'poll':
        return vraagSoortKeuze()
          + veld(kind === 'statement' ? 'De stelling' : 'De vraag', 'content.question')
          + veld('Een zinnetje erbij (optioneel)', 'content.intro', { rijen: 2 })
          + opties() + vinkje('Vraag na de klik om een korte toelichting', 'content.ask_comment') + vinkje('Toon de tussenstand na het antwoorden', 'content.show_results')
          + '<p class="text-xs opacity-60">Elk antwoord gaat naar de koppeling van deze reeks. Daar beslis je wat er in Odoo mee gebeurt (notitie, label, activiteit).</p>';
      case 'events':
        return eventsVeld();
      case 'news':
        return nieuwsVeld();
      case 'toc':
        return '<p class="opacity-70">De inhoudstafel maakt zichzelf uit de titels van de andere stukjes.</p>';
      case 'closing':
        return veld('Tekst', 'content.text', { rijen: 3, hint: 'Een vraag, of een idee voor de volgende editie? Antwoord gewoon op deze mail.' })
          + veld('Zin bij de gezichten', 'content.together_label', { hint: 'Deze editie maakten we samen:' })
          + '<div class="grid sm:grid-cols-2 gap-3">' + veld('Knop (optioneel)', 'content.button_label') + veld('Link van de knop', 'content.button_url', { hint: 'https://' }) + '</div>'
          + '<p class="text-xs opacity-60">De gezichten van iedereen die meeschreef komen er vanzelf bij.</p>';
      default:
        return '';
    }
  }

  function soortKeuze() {
    var kind = c().kind;
    if (NB.isAuto(kind) || !NB.state.stukje.can_edit) return '';
    var kinds = NB.state.boot.kinds;
    var keuzes = Object.keys(kinds).filter(function (k) { return !kinds[k].auto && k !== 'news'; });
    return '<div class="flex flex-wrap gap-2">' + keuzes.map(function (k) {
      return '<button class="btn btn-sm ' + (k === kind ? 'btn-primary' : 'btn-ghost border border-base-content/10') + '" data-action="kies-soort" data-kind="' + k + '">' + e(kinds[k].label) + '</button>';
    }).join('') + '</div>';
  }

  function aiBlok(paneel) {
    var kind = c().kind;
    if (!NB.state.stukje.can_edit || NB.isAuto(kind) || ['news', 'link', 'linkedin', 'image', 'snippet'].indexOf(kind) >= 0) return '';
    var kern = '<label class="form-control"><span class="label-text mb-1 font-semibold">Wat wil je kwijt? <span class="font-normal opacity-60">Steekwoorden mogen, de AI maakt er een stukje van.</span></span>'
      + '<textarea class="textarea textarea-bordered" rows="3" data-veld="raw_notes">' + e(c().raw_notes || '') + '</textarea></label>'
      + '<div class="flex flex-wrap gap-2"><button class="btn btn-sm btn-primary" data-action="ai" data-ai="write"><i data-lucide="sparkles" class="w-4 h-4"></i> Schrijf het voor me</button>'
      + '<button class="btn btn-sm btn-ghost" data-action="ai" data-ai="shorter">Korter</button><button class="btn btn-sm btn-ghost" data-action="ai" data-ai="warmer">Warmer</button><button class="btn btn-sm btn-ghost" data-action="ai" data-ai="spelling">Spelling nakijken</button></div>'
      + '<div id="stVoorstel"></div>';
    if (paneel) return '<div class="bg-base-200 rounded-xl p-3 flex flex-col gap-2">' + kern + '</div>';
    return '<div class="card bg-base-100 border border-base-content/10"><div class="card-body p-5 gap-3">' + kern + '</div></div>';
  }

  function reeksKeuze() {
    if (NB.state.stukje.item.edition_id) return '';
    var gekozen = c().series_ids || [];
    return '<div class="card bg-base-100 border border-base-content/10"><div class="card-body p-5 gap-2"><span class="font-semibold">Voor welke nieuwsbrief?</span><div class="flex flex-wrap gap-4">'
      + NB.state.boot.series.filter(function (s) { return s.is_active; }).map(function (s) {
        return '<label class="label cursor-pointer gap-2 p-0"><input type="checkbox" class="checkbox checkbox-sm" data-action="reeks-toggle" data-id="' + e(s.id) + '"' + (gekozen.indexOf(s.id) >= 0 ? ' checked' : '') + '><span class="label-text">' + e(s.name) + '</span></label>';
      }).join('') + '</div><p class="text-xs opacity-60">Dit staat in de voorraad. De hoofdredactie neemt het op in een editie.</p></div></div>';
  }

  function statusKnoppen(paneel) {
    var s = NB.state.stukje;
    var st = s.item.status;
    var editor = s.series && s.series.is_editor;
    var auto = NB.isAuto(s.item.kind);
    var k = [];
    if (s.can_edit && (st === 'open' || st === 'draft') && s.item.edition_id && !auto) {
      k.push('<button class="btn btn-primary' + (paneel ? ' flex-1' : '') + '" data-action="zet-status" data-status="submitted">' + (paneel ? 'Klaar, geef door aan marketing' : 'Inleveren bij de redactie') + '</button>');
    }
    if (editor && st === 'submitted') {
      k.push('<button class="btn btn-ghost" data-action="zet-status" data-status="draft">Terug naar de schrijver</button>');
      k.push('<button class="btn btn-success' + (paneel ? ' flex-1' : '') + '" data-action="zet-status" data-status="approved">Bevestigen</button>');
    }
    if (paneel && editor && st === 'draft' && !auto) k.push('<button class="btn btn-success btn-outline" data-action="zet-status" data-status="approved">Meteen bevestigen</button>');
    if (s.can_edit && st === 'approved' && !auto) k.push('<button class="btn btn-ghost" data-action="zet-status" data-status="draft">Terug naar concept</button>');
    return k;
  }

  function knoppenBalk() {
    var s = NB.state.stukje;
    return '<div class="card bg-base-100 border border-base-content/10 mt-5"><div class="card-body p-4 flex-row flex-wrap items-center gap-3">'
      + '<span id="stBewaard" class="text-sm opacity-60 mr-auto">' + (s.can_edit ? 'Bewaart vanzelf' : 'Alleen lezen') + '</span>' + statusKnoppen(false).join('') + '</div></div>';
  }

  function opmerkingen() {
    var s = NB.state.stukje;
    return '<div class="card bg-base-100 border border-base-content/10"><div class="card-body p-5 gap-3"><h3 class="font-semibold">Opmerkingen</h3>'
      + (s.comments.length ? s.comments.map(function (m) {
        return '<div class="flex gap-2">' + NB.gezicht(m.user_name) + '<div class="bg-base-200 rounded-xl px-3 py-2 text-sm flex-1"><strong>' + e((m.user_name || '').split(' ')[0]) + '</strong> <span class="opacity-50 text-xs">' + e(NB.datum(m.created_at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })) + '</span><div class="whitespace-pre-line">' + e(m.body) + '</div></div></div>';
      }).join('') : '<p class="text-sm opacity-60">Nog geen opmerkingen.</p>')
      + '<textarea id="stOpmerking" class="textarea textarea-bordered" rows="2" placeholder="Reageer…"></textarea>'
      + '<button class="btn btn-sm self-end" data-action="plaats-opmerking">Plaatsen</button></div></div>';
  }

  // ─── In het paneel naast de brief ─────────────────────────────────────────

  var STAND_ZIN = {
    open: 'Nog in te vullen',
    draft: 'Bezig, nog niet doorgegeven',
    submitted: 'Doorgegeven, wacht op bevestiging van marketing',
    approved: 'Bevestigd, gaat zo mee',
  };

  /**
   * Het woordje vooraf schrijf je IN de brief (newsletters-edition.js maakt
   * titel en tekst daar bewerkbaar, met bovenaan het blok AI en een beeld).
   * Het paneel houdt enkel de instellingen.
   */
  /**
   * Blokken die je IN de brief invult: rechts staat enkel nog wat geen tekst
   * is (instellingen, wat je kiest uit Nieuws & updates). De tekst, AI en het
   * beeld zitten in de brief zelf.
   */
  var IN_DE_BRIEF = { article: 1, heading: 1, question: 1, statement: 1, poll: 1, news: 1 };

  function typUitleg(tekst) {
    return NB.state.stukje.can_edit
      ? '<div class="flex gap-2 text-sm bg-base-200 rounded-xl p-3"><i data-lucide="mouse-pointer-click" class="w-4 h-4 shrink-0 mt-0.5"></i><span>' + tekst + '</span></div>'
      : '';
  }

  function inBriefInstellingen(kind) {
    switch (kind) {
      case 'article':
        return typUitleg('Typ de titel en de tekst <strong>rechtstreeks in de brief</strong>. Bovenaan het blok staan <strong>Schrijf met AI</strong> en <strong>+ Tekening of foto</strong>.')
          + '<div class="grid sm:grid-cols-2 gap-3">' + veld('Link (optioneel)', 'content.link_url', { hint: 'https://' }) + veld('Tekst van de link', 'content.link_label', { hint: 'Lees verder' }) + '</div>';
      case 'heading':
        return typUitleg('Typ de titel <strong>rechtstreeks in de brief</strong>. Ze komt als kopje in de inhoudstafel, met de blokken eronder.');
      case 'question':
      case 'statement':
      case 'poll':
        return typUitleg('Kies bovenaan het blok de <strong>soort vraag</strong> en typ de vraag en de antwoorden <strong>rechtstreeks in de brief</strong>. Een antwoord weg? Klik op het kruisje ernaast.')
          + vraagStijlKeuze()
          + vinkje('Vraag na de klik om een korte toelichting', 'content.ask_comment') + vinkje('Toon de tussenstand na het antwoorden', 'content.show_results')
          + '<p class="text-xs opacity-60">Elk antwoord gaat naar de koppeling van deze reeks. Daar beslis je wat er in Odoo mee gebeurt.</p>';
      case 'news':
        return kortNieuwsKeuze();
      default:
        return velden(kind);
    }
  }

  /** Hoe opvallend de vraag staat (klein tot groot) en in welke kleur. */
  function vraagStijlKeuze() {
    var boot = NB.state.boot;
    var std = (boot.vraag_standaard || {})[c().kind] || {};
    var stijl = lees('content.stijl') || std.stijl;
    var kleur = lees('content.kleur') || std.kleur;
    var mag = NB.state.stukje.can_edit;
    var stijlen = (boot.vraag_stijlen || []).map(function (s) {
      return '<button type="button" class="btn btn-sm h-auto min-h-0 py-2 flex-col items-start text-left gap-0 normal-case font-normal ' + (s.key === stijl ? 'btn-primary' : 'btn-outline border-base-content/20') + '" data-action="vraag-stijl-zet" data-stijl="' + e(s.key) + '"' + (mag ? '' : ' disabled') + '>'
        + '<span class="font-semibold">' + e(s.label) + '</span><span class="text-[11px] leading-tight opacity-70">' + e(s.uitleg) + '</span></button>';
    }).join('');
    var kleuren = Object.keys(boot.vraag_kleuren || {}).map(function (k) {
      var v = boot.vraag_kleuren[k];
      return '<button type="button" style="width:30px;height:30px;border-radius:50%;background:' + e(v.sterk) + ';border:3px solid #fff;box-shadow:0 0 0 ' + (k === kleur ? '2px #0284c7' : '1px rgba(0,0,0,.2)') + '" data-action="vraag-kleur-zet" data-kleur="' + e(k) + '" title="' + e(v.label) + '" aria-label="' + e(v.label) + '"' + (mag ? '' : ' disabled') + '></button>';
    }).join('');
    return '<div><span class="label-text">Stijl: van klein en subtiel tot groot en opvallend</span><div class="grid grid-cols-3 gap-2 mt-1">' + stijlen + '</div></div>'
      + '<div><span class="label-text">Kleur</span><div class="flex gap-2 mt-1">' + kleuren + '</div></div>';
  }

  NB.actions['vraag-stijl-zet'] = function (el) { zet('content.stijl', el.dataset.stijl); gewijzigd(); render(); };
  NB.actions['vraag-kleur-zet'] = function (el) { zet('content.kleur', el.dataset.kleur); gewijzigd(); render(); };

  /** Kort nieuws: welke berichten (2 of 3) en hoe ze naast elkaar staan. */
  function kortNieuwsKeuze() {
    if (NB.state.berichtenFout) return berichtKeuze();
    var boot = NB.state.boot;
    var max = boot.nieuws_max || 3;
    var items = lees('content.items') || [];
    var lijst = NB.state.berichten || [];
    var mag = NB.state.stukje.can_edit;
    var nu = lees('content.vorm') || 'tekst';
    var vormen = (boot.nieuws_vormen || []).map(function (v) {
      return '<button type="button" class="btn btn-sm h-auto min-h-0 py-2 flex-col items-start text-left gap-0 normal-case font-normal ' + (v.key === nu ? 'btn-primary' : 'btn-outline border-base-content/20') + '" data-action="nieuws-vorm" data-vorm="' + e(v.key) + '"' + (mag ? '' : ' disabled') + '>'
        + '<span class="font-semibold">' + e(v.label) + '</span><span class="text-[11px] leading-tight opacity-70">' + e(v.uitleg) + '</span></button>';
    }).join('');
    var gekozen = items.map(function (n) { return Number(n.snippet_id); });
    var keuze = function (i) {
      var huidig = items[i] ? Number(items[i].snippet_id) : 0;
      return '<div class="flex gap-2 items-center"><select class="select select-bordered select-sm flex-1 min-w-0" data-change="nieuws-kies" data-i="' + i + '"' + (mag ? '' : ' disabled') + '>'
        + '<option value="">' + (lijst.length ? 'Kies een bericht…' : 'Geen gepubliceerde berichten gevonden') + '</option>'
        + lijst.map(function (b) {
          var al = b.id !== huidig && gekozen.indexOf(b.id) >= 0;
          return '<option value="' + b.id + '"' + (b.id === huidig ? ' selected' : '') + (al ? ' disabled' : '') + '>' + e(b.title) + '</option>';
        }).join('') + '</select>'
        + (mag && items[i] ? '<button class="btn btn-sm btn-ghost px-2" data-action="nieuws-weg" data-i="' + i + '" aria-label="Weghalen"><i data-lucide="x" class="w-4 h-4"></i></button>' : '') + '</div>';
    };
    var rijen = [];
    for (var i = 0; i < Math.min(max, items.length + 1); i++) rijen.push(keuze(i));
    return '<div><span class="label-text">Vorm</span><div class="grid grid-cols-3 gap-2 mt-1">' + vormen + '</div></div>'
      + '<div class="flex flex-col gap-2"><span class="label-text">Berichten uit Nieuws &amp; updates (twee of drie)</span>' + rijen.join('') + '</div>'
      + berichtBron();
  }

  NB.actions['nieuws-vorm'] = function (el) { zet('content.vorm', el.dataset.vorm); gewijzigd(); render(); };

  NB.changes['nieuws-kies'] = async function (el) {
    var i = Number(el.dataset.i);
    var id = el.value;
    var items = (lees('content.items') || []).slice();
    if (!id) { items.splice(i, 1); zet('content.items', items); gewijzigd(); render(); return; }
    el.disabled = true;
    try {
      var kaart = await NB.api('/api/snippets/' + id + '/kort', { method: 'POST' });
      items[i] = kaart;
      zet('content.items', items);
      gewijzigd();
      render();
    } catch (err) { NB.fout(err); el.disabled = false; }
  };

  function introInstellingen() {
    var uitleg = NB.state.stukje.can_edit
      ? '<div class="flex gap-2 text-sm bg-base-200 rounded-xl p-3"><i data-lucide="mouse-pointer-click" class="w-4 h-4 shrink-0 mt-0.5"></i><span>Typ de titel en de tekst <strong>rechtstreeks in de brief</strong>. Bovenaan het blok staan <strong>Schrijf met AI</strong> en <strong>+ Tekening of foto</strong>.</span></div>'
      : '';
    return uitleg + ondertekenaarKeuze();
  }

  function renderPaneel() {
    var bak = document.getElementById('nbPaneel');
    if (!bak) return;
    var s = NB.state.stukje;
    var it = s.item;
    var ed = s.edition;
    var editor = s.series && s.series.is_editor;
    var auto = NB.isAuto(c().kind);
    var actiefEd = ed && ['collecting', 'review'].indexOf(ed.status) >= 0;
    var mijn = it.owner_user_id === NB.state.boot.me.id;
    var wie = it.owner_name ? (mijn ? 'Voor jou' : 'Van ' + it.owner_name) : 'Nog aan niemand toegewezen';
    var tegen = actiefEd && !auto && (it.status === 'open' || it.status === 'draft')
      ? '<div class="text-xs opacity-70">Inleveren tegen ' + e(NB.datum(ed.deadline_at, { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })) + ' · ' + e(NB.tellerTekst(ed.deadline_at)) + '</div>' : '';
    var stand = auto ? 'Vult zichzelf' : (STAND_ZIN[it.status] || '');
    var hint = s.hint ? '<div class="flex gap-2 text-sm bg-primary/5 border border-primary/20 rounded-xl p-3"><i data-lucide="lightbulb" class="w-4 h-4 shrink-0 mt-0.5 text-primary"></i><span>' + e(s.hint) + '</span></div>' : '';
    var knoppen = s.can_edit || editor ? statusKnoppen(true) : [];
    var beheer = editor && actiefEd
      ? '<details class="collapse collapse-arrow bg-base-100 border border-base-content/10"><summary class="collapse-title font-semibold text-sm min-h-0 py-3">Hoofdredactie</summary><div class="collapse-content flex flex-col gap-3">'
        + (auto ? '' : '<label class="form-control"><span class="label-text text-xs mb-1">Wie schrijft het?</span><select class="select select-bordered select-sm" data-change="eigenaar" data-id="' + e(it.id) + '">' + NB.gebruikersOpties(it.owner_user_id, true) + '</select></label>')
        + '<div class="flex flex-wrap gap-1"><button class="btn btn-sm btn-ghost" data-action="verplaats" data-id="' + e(it.id) + '" data-richting="-1"><i data-lucide="arrow-up" class="w-4 h-4"></i> Hoger</button>'
        + '<button class="btn btn-sm btn-ghost" data-action="verplaats" data-id="' + e(it.id) + '" data-richting="1"><i data-lucide="arrow-down" class="w-4 h-4"></i> Lager</button>'
        + '<button class="btn btn-sm btn-ghost text-error ml-auto" data-action="blok-weg" data-id="' + e(it.id) + '"><i data-lucide="trash-2" class="w-4 h-4"></i> Uit de brief</button></div>'
        + (auto ? '' : '<div><span class="label-text text-xs">Soort blok</span><div class="mt-1">' + soortKeuze() + '</div></div>')
        + '</div></details>'
      : '';
    var n = s.comments.length;
    var praat = '<details class="collapse collapse-arrow bg-base-100 border border-base-content/10"' + (n ? ' open' : '') + '><summary class="collapse-title font-semibold text-sm min-h-0 py-3">Opmerkingen' + (n ? ' (' + n + ')' : '') + '</summary><div class="collapse-content flex flex-col gap-3">'
      + s.comments.map(function (m) {
        return '<div class="flex gap-2">' + NB.gezicht(m.user_name) + '<div class="bg-base-200 rounded-xl px-3 py-2 text-sm flex-1"><strong>' + e((m.user_name || '').split(' ')[0]) + '</strong> <span class="opacity-50 text-xs">' + e(NB.datum(m.created_at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })) + '</span><div class="whitespace-pre-line">' + e(m.body) + '</div></div></div>';
      }).join('')
      + '<textarea id="stOpmerking" class="textarea textarea-bordered textarea-sm" rows="2" placeholder="Vraag of reageer…"></textarea>'
      + '<button class="btn btn-sm self-end" data-action="plaats-opmerking">Plaatsen</button></div></details>';

    bak.innerHTML = '<div class="flex flex-col gap-3">'
      + '<div class="card bg-base-100 border border-primary/40"><div class="card-body p-4 gap-3">'
      + '<div class="flex items-center gap-2"><button class="btn btn-ghost btn-sm px-2" data-action="paneel-sluit"><i data-lucide="arrow-left" class="w-4 h-4"></i> Overzicht</button>'
      + '<span id="stBewaard" class="text-xs opacity-60 ml-auto">' + (s.can_edit ? 'Bewaart vanzelf' : 'Alleen lezen') + '</span></div>'
      + '<div>' + (c().kind === 'intro' || c().kind === 'heading'
        ? '<div class="text-lg font-bold px-1">' + e(NB.soort(c().kind)) + '</div>'
        : '<input class="input input-ghost input-sm text-lg font-bold px-1 w-full" data-veld="title" value="' + e(c().title) + '" placeholder="' + e(NB.soort(c().kind)) + ' (zonder labeltje)" aria-label="Naam boven het blok" title="Het labeltje boven het blok in de mail"' + (s.can_edit ? '' : ' disabled') + '>')
      + '<div class="flex flex-wrap items-center gap-2 text-sm mt-1 px-1"><span id="stStatus">' + (auto ? '<span class="badge badge-sm badge-ghost">Automatisch</span>' : NB.statusBadge(it.status)) + '</span><span class="opacity-70">' + e(stand) + '</span></div>'
      + '<div class="text-xs opacity-70 px-1 mt-1">' + e(wie) + '</div>' + (tegen ? '<div class="px-1">' + tegen + '</div>' : '') + '</div>'
      + hint
      + (c().kind === 'intro'
        ? introInstellingen()
        : IN_DE_BRIEF[c().kind]
          ? '<div class="flex flex-col gap-4">' + inBriefInstellingen(c().kind) + '</div>'
          : aiBlok(true) + '<div class="flex flex-col gap-4">' + velden(c().kind) + '</div>')
      + '</div></div>'
      + (knoppen.length ? '<div class="sticky bottom-0 z-10 bg-base-100 border border-base-content/10 rounded-xl p-3 flex flex-wrap gap-2 shadow-sm">' + knoppen.join('') + '</div>' : '')
      + beheer + praat
      + '</div>';
    NB.ikons();
  }

  function render() {
    if (NB.state.stukjeHost === 'paneel') { renderPaneel(); return; }
    var s = NB.state.stukje;
    var app = document.getElementById('app');
    var ed = s.edition;
    var deadline = ed && ['collecting', 'review'].indexOf(ed.status) >= 0
      ? '<span class="badge badge-warning">Inleveren ' + e(NB.datum(ed.deadline_at)) + ' · ' + e(NB.tellerTekst(ed.deadline_at)) + '</span>' : '';
    app.innerHTML = '<div class="text-sm opacity-70 mb-1"><a class="hover:underline" href="#/">Nieuwsbrieven</a>'
      + (ed ? ' / <a class="hover:underline" href="#/editie/' + e(ed.id) + '">' + e(s.series ? s.series.name : '') + ' ' + e(ed.title) + '</a>' : ' / Voorraad') + '</div>'
      + '<div class="flex flex-wrap items-center gap-3 mb-2">'
      + '<input class="input input-ghost text-2xl font-bold px-1 h-auto" data-veld="title" value="' + e(c().title) + '" aria-label="Naam van de rubriek"' + (s.can_edit ? '' : ' disabled') + '>'
      + '<span id="stStatus">' + NB.statusBadge(s.item.status) + '</span>' + deadline + '</div>'
      + '<div class="text-sm opacity-70 mb-4">' + (s.item.owner_name ? 'Geschreven door ' + e(s.item.owner_name) : 'Nog aan niemand toegewezen') + (s.hint ? ' · ' + e(s.hint) : '') + '</div>'
      + '<div class="flex flex-wrap gap-5 items-start">'
      + '<div class="flex-[999_1_520px] min-w-0 flex flex-col gap-4">'
      + soortKeuze()
      + '<div class="card bg-base-100 border border-base-content/10"><div class="card-body p-5 gap-4">' + velden(c().kind) + '</div></div>'
      + aiBlok() + reeksKeuze()
      + '</div>'
      + '<div class="flex-[1_1_380px] min-w-0 flex flex-col gap-4">'
      + '<div class="card bg-base-100 border border-base-content/10"><div class="card-body p-4 gap-2"><h3 class="font-semibold">Zo komt het in de mail</h3><iframe id="stVoorbeeld" class="nb-voorbeeld" style="min-height:240px" title="Voorbeeld van dit stukje"></iframe></div></div>'
      + opmerkingen()
      + '</div></div>'
      + knoppenBalk();
    NB.ikons();
    laadVoorbeeld();
  }

  function zetStukje(d) {
    NB.state.stukje = d;
    NB.state.vuil = false;
    NB.state.concept = {
      kind: d.item.kind, title: d.item.title, content: JSON.parse(JSON.stringify(d.item.content || {})),
      raw_notes: d.item.raw_notes || '', series_ids: (d.item.series_ids || []).slice(),
    };
    // Een inleiding heeft geen rubrieknaam (er staat geen label boven in de
    // mail). Een blok dat er een werd, draagt nog de oude naam: rechtzetten.
    if (d.item.kind === 'intro' && d.item.title !== NB.soort('intro') && d.can_edit) {
      NB.state.concept.title = NB.soort('intro');
      NB.state.vuil = true;
      setTimeout(bewaar, 0);
    }
  }

  function laadExtra(d) {
    var wacht = [NB.laadTekeningen()];
    if ((d.item.kind === 'snippet' || d.item.kind === 'news') && !NB.state.berichten) wacht.push(laadBerichten());
    if (d.item.kind === 'events' && d.edition) {
      wacht.push(NB.api('/api/editions/' + d.edition.id + '/suggestions').then(function (r) { NB.state.stukjeEvents = r.events || []; }).catch(function () { NB.state.stukjeEvents = []; }));
    }
    return Promise.all(wacht);
  }

  /** Een stukje van een editie opent op de redactietafel, naast de brief. */
  NB.views.stukje = async function (params) {
    var d = await NB.api('/api/contributions/' + params.id);
    if (d.edition && NB.views.editie) { await NB.views.editie({ id: d.edition.id, stukje: d }); return; }
    NB.state.stukjeHost = 'pagina';
    zetStukje(d);
    await laadExtra(d);
    render();
  };

  NB.stukjeInPaneel = async function (d) {
    zetStukje(d);
    NB.state.stukjeHost = 'paneel';
    await laadExtra(d);
    render();
  };

  // ─── Invoer en acties ─────────────────────────────────────────────────────

  NB.inputs.veld = function (el) {
    var pad = el.dataset.veld;
    var waarde = el.type === 'checkbox' ? el.checked : el.value;
    zet(pad, waarde);
    // Notities voor de AI staan niet in de mail: de brief hoeft niet opnieuw.
    if (pad === 'raw_notes') { gewijzigdStil(); return; }
    if (pad === 'content.thingie' && waarde) {
      NB.zorgVoorPng(waarde).catch(function (err) { NB.toast('PNG van de tekening maken mislukt: ' + err.message, 'warning'); });
      gewijzigd();
      render();
      return;
    }
    gewijzigd();
  };

  NB.changes['bericht-kies'] = async function (el) {
    var id = el.value;
    if (!id) return;
    var heeftTekst = String(lees('content.title') || lees('content.text') || '').trim();
    if (heeftTekst && Number(lees('content.snippet_id')) !== Number(id) && !window.confirm('De titel, tekst, link en het beeld worden vervangen door die van het gekozen bericht. Doorgaan?')) {
      el.value = lees('content.snippet_id') || '';
      return;
    }
    el.disabled = true;
    try {
      var r = await NB.api('/api/snippets/' + id + '/overnemen', { method: 'POST', body: { vermijd: labelsInEditie() } });
      var inhoud = r.inhoud;
      // Een WebP-beeld: hier omzetten naar JPEG en opladen (mail kent geen WebP).
      if (!inhoud.beeld && r.beeld_data) {
        try {
          var blob = await (await fetch(r.beeld_data)).blob();
          var jpg = await NB.naarMailbeeld(new File([blob], 'bericht.webp', { type: 'image/webp' }));
          var up = await NB.upload('/api/upload', jpg);
          inhoud.beeld = { url: up.url, plaats: 'tekst', na_alinea: 0, vulling: 'heel' };
        } catch (err) { NB.toast('Het beeld van het bericht kon niet omgezet worden; kies er zelf een.', 'warning'); }
      }
      ['snippet_id', 'tag', 'title', 'text', 'quote', 'source', 'link_url', 'link_label', 'beeld', 'beeld_versie', 'door'].forEach(function (k) { zet('content.' + k, inhoud[k]); });
      // Een nieuwe brief krijgt afwisseling: de vorm na die van het vorige bericht.
      if (!lees('content.vorm')) zet('content.vorm', volgendeVorm());
      zet('content.image_url', '');
      gewijzigd();
      render();
      NB.toast('Ingevuld uit Nieuws & updates.');
    } catch (err) { NB.fout(err); el.disabled = false; }
  };

  NB.actions['beeld-paneel'] = function (el) {
    var fotoVeld = el.dataset.fotoveld;
    var vast = el.dataset.vast || null;
    NB.beeld.open({
      beeld: NB.beeldVan(c().content, fotoVeld, vast || 'tekst'),
      plaatsen: el.dataset.plaatsen === '1',
      vast: vast,
      opslaan: function (b) {
        // Het beeld-object neemt het over van de oude losse velden.
        zet('content.beeld', b);
        zet('content.' + fotoVeld, '');
        zet('content.thingie', '');
        gewijzigd();
        render();
      },
    });
  };

  NB.actions['kies-soort'] = function (el) {
    var nieuw = el.dataset.kind;
    var oud = c();
    var behoud = { title: oud.content.title, text: oud.content.text };
    oud.kind = nieuw;
    if (nieuw === 'intro') oud.title = NB.soort('intro');
    if (NB.isVraag(nieuw)) {
      oud.content = { question: oud.content.question || behoud.title || '', intro: oud.content.intro || '', options: oud.content.options || [], ask_comment: true, show_results: true };
    } else if (nieuw === 'quote') {
      oud.content = { quote: oud.content.quote || behoud.text || '' };
    } else {
      oud.content = Object.assign({}, { title: behoud.title || oud.content.question || '', text: behoud.text || oud.content.intro || '' });
    }
    gewijzigd();
    render();
  };

  NB.actions['optie-bij'] = function () { NB.vraagOptieBij(); };

  NB.actions['optie-weg'] = function (el) {
    var lijst = lees('content.options') || [];
    lijst.splice(Number(el.dataset.i), 1);
    zet('content.options', lijst);
    gewijzigd(); render();
  };

  NB.actions['event-toggle'] = function (el) {
    var uit = (lees('content.exclude_ids') || []).map(Number);
    var id = Number(el.dataset.id);
    uit = el.checked ? uit.filter(function (x) { return x !== id; }) : uit.concat([id]);
    zet('content.exclude_ids', uit);
    gewijzigd();
  };

  NB.actions['reeks-toggle'] = function (el) {
    var lijst = c().series_ids || [];
    c().series_ids = el.checked ? lijst.concat([el.dataset.id]) : lijst.filter(function (x) { return x !== el.dataset.id; });
    gewijzigd();
  };

  NB.actions['nieuws-weg'] = function (el) {
    var items = lees('content.items') || [];
    items.splice(Number(el.dataset.i), 1);
    gewijzigd(); render();
  };

  NB.actions['nieuws-leeg'] = function () {
    var items = lees('content.items') || [];
    if (items.length >= 4) { NB.toast('Hoogstens vier berichten.', 'warning'); return; }
    items.push({ title: '', note: '', url: '' });
    zet('content.items', items);
    render();
  };

  NB.actions['nieuws-bij'] = function (el) {
    var sug = (lees('content.suggestions') || [])[Number(el.dataset.i)];
    var items = lees('content.items') || [];
    if (!sug) return;
    if (items.length >= 4) { NB.toast('Hoogstens vier berichten.', 'warning'); return; }
    items.push({ snippet_id: sug.snippet_id, title: sug.title, note: sug.note, url: sug.url });
    zet('content.items', items);
    gewijzigd(); render();
  };

  NB.actions['nieuws-suggesties'] = async function () {
    try {
      await bewaar();
      var bij = await NB.api('/api/contributions/' + NB.state.stukje.item.id + '/refresh-news', { method: 'POST' });
      zet('content.suggestions', (bij.content && bij.content.suggestions) || []);
      render();
    } catch (err) { NB.fout(err); }
  };

  NB.actions['link-ophalen'] = async function (el) {
    var adres = lees('content.url');
    if (!adres) { NB.toast('Plak eerst een link.', 'warning'); return; }
    el.disabled = true;
    try {
      var v = await NB.api('/api/link-preview', { method: 'POST', body: { url: adres } });
      zet('content.url', v.url);
      if (v.title) zet('content.title', v.title);
      if (v.text) zet('content.text', v.text);
      // Een nieuwe link = een nieuw beeld: het oude (bijgesneden) beeld valt weg.
      if (v.image_url) { zet('content.image_url', v.image_url); zet('content.beeld', null); }
      if (v.site_name) zet('content.site_name', v.site_name);
      if (v.author_name) zet('content.author_name', v.author_name);
      gewijzigd(); render();
    } catch (err) { NB.fout(err); }
    el.disabled = false;
  };

  NB.actions['ai'] = async function (el) {
    var bak = document.getElementById('stVoorstel');
    bak.innerHTML = '<span class="loading loading-dots loading-sm"></span>';
    try {
      var v = await NB.api('/api/contributions/' + NB.state.stukje.item.id + '/ai', {
        method: 'POST', body: { action: el.dataset.ai, kind: c().kind, title: c().title, content: c().content, notes: c().raw_notes },
      });
      NB.state.aiVoorstel = v;
      var kern = v.question !== undefined
        ? '<div class="font-semibold">' + e(v.question) + '</div><div class="text-sm">' + e(v.intro) + '</div><div class="flex flex-wrap gap-1 mt-1">' + (v.options || []).map(function (o) { return '<span class="badge">' + e(o) + '</span>'; }).join('') + '</div>'
        : v.quote !== undefined ? '<div class="italic">' + e(v.quote) + '</div>'
          : '<div class="font-semibold">' + e(v.title) + '</div><div class="text-sm whitespace-pre-line mt-1">' + e(v.text) + '</div>';
      bak.innerHTML = '<div class="bg-success/10 border border-success/30 rounded-xl p-4"><div class="text-xs font-bold uppercase tracking-wide opacity-70 mb-2">Voorstel</div>' + kern
        + '<div class="flex gap-2 mt-3"><button class="btn btn-sm btn-success" data-action="ai-overnemen">Overnemen</button><button class="btn btn-sm btn-ghost" data-action="ai" data-ai="' + e(el.dataset.ai) + '">Nog een voorstel</button></div></div>';
    } catch (err) {
      bak.innerHTML = '';
      NB.fout(err);
    }
  };

  NB.actions['ai-overnemen'] = function () {
    var v = NB.state.aiVoorstel;
    if (!v) return;
    if (v.question !== undefined) {
      zet('content.question', v.question);
      zet('content.intro', v.intro);
      if ((v.options || []).length >= 2) {
        var oud = lees('content.options') || [];
        zet('content.options', v.options.map(function (label, i) {
          // De waarde van een bestaande knop blijft staan; enkel het opschrift wijzigt.
          return oud[i] ? { value: oud[i].value, label: label } : { label: label };
        }));
      }
    } else if (v.quote !== undefined) {
      zet('content.quote', v.quote);
    } else {
      zet('content.title', v.title);
      zet('content.text', v.text);
    }
    NB.state.aiVoorstel = null;
    var dlg = document.getElementById('dlgAI');
    if (dlg && dlg.open) dlg.close();
    gewijzigd(); render();
  };

  NB.actions['zet-status'] = async function (el) {
    await bewaar();
    try {
      var bij = await NB.api('/api/contributions/' + NB.state.stukje.item.id + '/status', { method: 'POST', body: { status: el.dataset.status } });
      NB.state.stukje.item = Object.assign({}, NB.state.stukje.item, bij);
      NB.toast(el.dataset.status === 'submitted' ? 'Doorgegeven aan marketing. Dank je!' : el.dataset.status === 'approved' ? 'Bevestigd.' : 'Terug naar concept.');
      if (NB.state.stukjeHost === 'paneel' && NB.stukjeBijgewerkt) NB.stukjeBijgewerkt(NB.state.stukje.item);
      render();
    } catch (err) { NB.fout(err); }
  };

  NB.actions['plaats-opmerking'] = async function () {
    var veldEl = document.getElementById('stOpmerking');
    var tekst = veldEl.value.trim();
    if (!tekst) return;
    try {
      var r = await NB.api('/api/contributions/' + NB.state.stukje.item.id + '/comments', { method: 'POST', body: { body: tekst } });
      NB.state.stukje.comments.push(r);
      await bewaar();
      render();
    } catch (err) { NB.fout(err); }
  };
})();
