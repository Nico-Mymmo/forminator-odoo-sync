/**
 * Nieuwsbrieven -- het schrijfscherm van één stukje: links het formulier,
 * rechts het stukje zoals het in de mail komt (dezelfde renderer als de mail),
 * met AI-hulp en opmerkingen. Bewaart vanzelf.
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
      zetBewaarStand('Bewaard om ' + NB.datum(new Date().toISOString(), { hour: '2-digit', minute: '2-digit' }));
      var badge = document.getElementById('stStatus');
      if (badge) badge.innerHTML = NB.statusBadge(s.item.status);
    } catch (err) { zetBewaarStand('Bewaren mislukt'); NB.fout(err); }
  }
  NB.bewaarStukje = bewaar;

  async function laadVoorbeeld() {
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

  function tekeningKeuze() {
    var lijst = NB.state.tekeningen || [];
    var gekozen = lees('content.thingie') || '';
    var t = lijst.find(function (x) { return x.name === gekozen; });
    return '<div class="flex items-end gap-3"><label class="form-control flex-1"><span class="label-text mb-1">Tekening (optioneel)</span>'
      + '<select class="select select-bordered" data-veld="content.thingie"' + (NB.state.stukje.can_edit ? '' : ' disabled') + '><option value="">Geen</option>'
      + lijst.map(function (x) { return '<option value="' + e(x.name) + '"' + (x.name === gekozen ? ' selected' : '') + '>' + e(x.label) + '</option>'; }).join('')
      + '</select></label>' + (t ? '<img class="nb-tekening" src="' + e(t.svg) + '" alt="">' : '') + '</div>';
  }

  function beeldKeuze(pad, label) {
    var url = lees(pad) || '';
    return '<div class="flex flex-col gap-1"><span class="label-text">' + e(label) + '</span>'
      + '<div class="flex gap-2 items-center"><input type="text" class="input input-bordered input-sm flex-1" data-veld="' + pad + '" placeholder="https://… of laad een beeld op" value="' + e(url) + '"' + (NB.state.stukje.can_edit ? '' : ' disabled') + '>'
      + (NB.state.stukje.can_edit ? '<label class="btn btn-sm">Opladen<input type="file" accept="image/*" class="hidden" data-change="beeld-upload" data-pad="' + pad + '"></label>' : '') + '</div>'
      + (url ? '<img src="' + e(url) + '" alt="" class="max-h-32 rounded-lg mt-1 object-contain self-start">' : '') + '</div>';
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
      case 'article':
        return veld('Titel', 'content.title')
          + veld('Tekst', 'content.text', { rijen: 8, uitleg: 'Lege regel = nieuwe alinea. **vet** en [tekst](https://link) mogen.' })
          + tekeningKeuze() + beeldKeuze('content.image_url', 'Foto (optioneel)')
          + '<div class="grid sm:grid-cols-2 gap-3">' + veld('Link (optioneel)', 'content.link_url', { hint: 'https://' }) + veld('Tekst van de link', 'content.link_label', { hint: 'Lees verder' }) + '</div>';
      case 'video':
        return veld('Titel', 'content.title') + veld('Link naar de video', 'content.video_url', { hint: 'https://vimeo.com/… of YouTube' })
          + beeldKeuze('content.thumbnail_url', 'Stilstaand beeld (een mail kan geen video afspelen)')
          + veld('Tekst', 'content.text', { rijen: 4 }) + veld('Tekst op de knop', 'content.button_label', { hint: 'Bekijk de video' });
      case 'link':
      case 'linkedin':
        return '<div class="flex gap-2 items-end">' + veld('Link', 'content.url', { hint: 'https://' }) + (NB.state.stukje.can_edit ? '<button class="btn" data-action="link-ophalen">Ophalen</button>' : '') + '</div>'
          + veld('Titel', 'content.title') + veld('Tekst', 'content.text', { rijen: 4 }) + beeldKeuze('content.image_url', 'Beeld')
          + (kind === 'linkedin' ? veld('Van wie is de post?', 'content.author_name') : veld('Naam van de site', 'content.site_name'));
      case 'quote':
        return veld('Citaat', 'content.quote', { rijen: 4 }) + '<div class="grid sm:grid-cols-2 gap-3">' + veld('Wie', 'content.person') + veld('Functie of gebouw', 'content.role') + '</div>';
      case 'statement':
      case 'question':
      case 'poll':
        return veld(kind === 'statement' ? 'De stelling' : 'De vraag', 'content.question')
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

  function aiBlok() {
    var kind = c().kind;
    if (!NB.state.stukje.can_edit || NB.isAuto(kind) || ['news', 'link', 'linkedin'].indexOf(kind) >= 0) return '';
    return '<div class="card bg-base-100 border border-base-content/10"><div class="card-body p-5 gap-3">'
      + '<label class="form-control"><span class="label-text mb-1 font-semibold">Wat wil je kwijt? <span class="font-normal opacity-60">Steekwoorden mogen, de AI maakt er een stukje van.</span></span>'
      + '<textarea class="textarea textarea-bordered" rows="3" data-veld="raw_notes">' + e(c().raw_notes || '') + '</textarea></label>'
      + '<div class="flex flex-wrap gap-2"><button class="btn btn-sm btn-primary" data-action="ai" data-ai="write"><i data-lucide="sparkles" class="w-4 h-4"></i> Schrijf het voor me</button>'
      + '<button class="btn btn-sm btn-ghost" data-action="ai" data-ai="shorter">Korter</button><button class="btn btn-sm btn-ghost" data-action="ai" data-ai="warmer">Warmer</button><button class="btn btn-sm btn-ghost" data-action="ai" data-ai="spelling">Spelling nakijken</button></div>'
      + '<div id="stVoorstel"></div></div></div>';
  }

  function reeksKeuze() {
    if (NB.state.stukje.item.edition_id) return '';
    var gekozen = c().series_ids || [];
    return '<div class="card bg-base-100 border border-base-content/10"><div class="card-body p-5 gap-2"><span class="font-semibold">Voor welke nieuwsbrief?</span><div class="flex flex-wrap gap-4">'
      + NB.state.boot.series.filter(function (s) { return s.is_active; }).map(function (s) {
        return '<label class="label cursor-pointer gap-2 p-0"><input type="checkbox" class="checkbox checkbox-sm" data-action="reeks-toggle" data-id="' + e(s.id) + '"' + (gekozen.indexOf(s.id) >= 0 ? ' checked' : '') + '><span class="label-text">' + e(s.name) + '</span></label>';
      }).join('') + '</div><p class="text-xs opacity-60">Dit staat in de voorraad. De hoofdredactie neemt het op in een editie.</p></div></div>';
  }

  function knoppenBalk() {
    var s = NB.state.stukje;
    var st = s.item.status;
    var editor = s.series && s.series.is_editor;
    var k = [];
    if (s.can_edit && (st === 'open' || st === 'draft') && s.item.edition_id) k.push('<button class="btn btn-primary" data-action="zet-status" data-status="submitted">Inleveren bij de redactie</button>');
    if (editor && st === 'submitted') {
      k.push('<button class="btn btn-ghost" data-action="zet-status" data-status="draft">Terug naar de schrijver</button>');
      k.push('<button class="btn btn-success" data-action="zet-status" data-status="approved">Goedkeuren</button>');
    }
    if (s.can_edit && st === 'approved' && !NB.isAuto(s.item.kind)) k.push('<button class="btn btn-ghost" data-action="zet-status" data-status="draft">Terug naar concept</button>');
    return '<div class="card bg-base-100 border border-base-content/10 mt-5"><div class="card-body p-4 flex-row flex-wrap items-center gap-3">'
      + '<span id="stBewaard" class="text-sm opacity-60 mr-auto">' + (s.can_edit ? 'Bewaart vanzelf' : 'Alleen lezen') + '</span>' + k.join('') + '</div></div>';
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

  function render() {
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

  NB.views.stukje = async function (params) {
    var d = await NB.api('/api/contributions/' + params.id);
    NB.state.stukje = d;
    NB.state.vuil = false;
    NB.state.concept = {
      kind: d.item.kind, title: d.item.title, content: JSON.parse(JSON.stringify(d.item.content || {})),
      raw_notes: d.item.raw_notes || '', series_ids: (d.item.series_ids || []).slice(),
    };
    var wacht = [NB.laadTekeningen()];
    if (d.item.kind === 'events' && d.edition) {
      wacht.push(NB.api('/api/editions/' + d.edition.id + '/suggestions').then(function (r) { NB.state.stukjeEvents = r.events || []; }).catch(function () { NB.state.stukjeEvents = []; }));
    }
    await Promise.all(wacht);
    render();
  };

  // ─── Invoer en acties ─────────────────────────────────────────────────────

  NB.inputs.veld = function (el) {
    var pad = el.dataset.veld;
    var waarde = el.type === 'checkbox' ? el.checked : el.value;
    zet(pad, waarde);
    if (pad === 'content.thingie' && waarde) {
      NB.zorgVoorPng(waarde).catch(function (err) { NB.toast('PNG van de tekening maken mislukt: ' + err.message, 'warning'); });
      render();
      return;
    }
    gewijzigd();
  };

  NB.changes['beeld-upload'] = async function (el) {
    var bestand = el.files && el.files[0];
    if (!bestand) return;
    try {
      NB.toast('Beeld opladen…', 'info');
      var blob = await NB.naarMailbeeld(bestand);
      var r = await NB.upload('/api/upload', blob);
      zet(el.dataset.pad, r.url);
      gewijzigd();
      render();
    } catch (err) { NB.fout(err); }
  };

  NB.actions['kies-soort'] = function (el) {
    var nieuw = el.dataset.kind;
    var oud = c();
    var behoud = { title: oud.content.title, text: oud.content.text };
    oud.kind = nieuw;
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

  NB.actions['optie-bij'] = function () {
    var lijst = lees('content.options') || [];
    lijst.push({ label: 'Nieuwe knop' });
    zet('content.options', lijst);
    gewijzigd(); render();
  };

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
      if (v.image_url) zet('content.image_url', v.image_url);
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
    gewijzigd(); render();
  };

  NB.actions['zet-status'] = async function (el) {
    await bewaar();
    try {
      var bij = await NB.api('/api/contributions/' + NB.state.stukje.item.id + '/status', { method: 'POST', body: { status: el.dataset.status } });
      NB.state.stukje.item = Object.assign({}, NB.state.stukje.item, bij);
      NB.toast(el.dataset.status === 'submitted' ? 'Ingeleverd. Dank je!' : el.dataset.status === 'approved' ? 'Goedgekeurd.' : 'Terug naar concept.');
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
