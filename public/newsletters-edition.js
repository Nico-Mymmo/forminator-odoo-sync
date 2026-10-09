/**
 * Nieuwsbrieven -- de redactietafel van één editie: teller, rubrieken,
 * voorbeeld, antwoorden, en de testmail.
 */
(function () {
  'use strict';
  var NB = window.NB;
  var e = NB.esc;
  NB.changes = NB.changes || {};

  function tellerKaart(d) {
    var ed = d.edition;
    var editor = d.series.is_editor;
    var t = NB.teller(ed.deadline_at);
    var actief = ['collecting', 'review'].indexOf(ed.status) >= 0;
    var p = d.progress;
    var binnen = p.goedgekeurd + p.ingeleverd;
    var vakje = function (n, label) {
      return '<div class="bg-primary/10 rounded-xl px-3 py-2 text-center min-w-[64px]"><div class="nb-teller text-3xl font-semibold text-primary leading-none">' + n + '</div><div class="text-xs opacity-60 mt-1">' + label + '</div></div>';
    };
    var teller = !actief ? '<div class="text-lg font-semibold">' + e((NB.EDITIE_STATUS[ed.status] || {}).label || ed.status) + '</div>'
      : t.voorbij ? '<div><div class="text-lg font-semibold">Inleverdatum voorbij</div><div class="text-sm opacity-70">Tijd om na te lezen en goed te keuren.</div></div>'
        : '<div class="flex gap-2">' + vakje(t.d, 'dagen') + vakje(String(t.u).padStart(2, '0'), 'uur') + vakje(String(t.m).padStart(2, '0'), 'min') + '</div>'
          + '<div class="text-sm mt-2"><strong>tot inleveren</strong> · ' + e(NB.datum(ed.deadline_at)) + '</div>';

    var testKnop = editor && ed.status !== 'sent'
      ? '<button class="btn btn-sm btn-outline btn-primary" data-action="test-versturen"><i data-lucide="send" class="w-4 h-4"></i> Testmail naar ' + e((d.test_emails || []).join(', ') || 'mij') + '</button>'
      : '';
    var inplannen = editor && actief
      ? (d.send_mode === 'live'
        ? '<button class="btn btn-sm btn-error" data-action="open-inplannen">Bevestigen en inplannen</button>'
        : '<span class="text-xs opacity-60">Teststand: er vertrekt enkel een testmail.</span>')
      : '';
    var herinner = editor && actief && d.series.chat_channel
      ? '<button class="btn btn-sm btn-ghost" data-action="herinner">Herinner in de chat</button>' : '';

    var datums = editor && actief
      ? '<div class="flex flex-wrap gap-2 items-end">'
        + '<label class="form-control"><span class="label-text text-xs">Inleveren</span><input id="edDeadline" type="datetime-local" class="input input-bordered input-sm" value="' + e(NB.lokaal(ed.deadline_at)) + '"></label>'
        + '<label class="form-control"><span class="label-text text-xs">Verzenden</span><input id="edSend" type="datetime-local" class="input input-bordered input-sm" value="' + e(NB.lokaal(ed.send_at)) + '"></label>'
        + '<button class="btn btn-sm btn-ghost" data-action="bewaar-datums">Bewaren</button></div>'
      : '<div class="text-sm opacity-70">Verzenden ' + e(NB.datum(ed.send_at)) + (actief ? ', pas na bevestiging' : '') + '</div>';

    return '<div class="card bg-base-100 border border-base-content/10 mb-5"><div class="card-body p-5 flex flex-wrap flex-row gap-6 items-center">'
      + '<div>' + teller + '</div>'
      + '<div class="flex-1 min-w-[240px]"><div class="flex justify-between text-sm mb-2"><strong>' + binnen + ' van ' + p.totaal + ' stukjes binnen</strong><span class="opacity-60">' + p.goedgekeurd + ' goedgekeurd</span></div>'
      + NB.balk(d.items) + '<div class="mt-3">' + datums + '</div></div>'
      + '<div class="flex flex-col gap-2 items-start">' + testKnop + herinner + inplannen + '</div>'
      + '</div></div>';
  }

  function stukjeKaart(it, i, d) {
    var editor = d.series.is_editor;
    var auto = NB.isAuto(it.kind);
    var leeg = !it.has_content;
    var eigenaar = editor && !auto
      ? '<select class="select select-bordered select-xs max-w-[160px]" data-change="eigenaar" data-id="' + e(it.id) + '">' + NB.gebruikersOpties(it.owner_user_id, true) + '</select>'
      : (it.owner_name ? '<span class="flex items-center gap-2 text-sm">' + NB.gezicht(it.owner_name) + e(it.owner_name.split(' ')[0]) + '</span>' : '');
    var knoppen = [];
    knoppen.push('<a class="btn btn-xs btn-ghost" href="#/stukje/' + e(it.id) + '">' + (auto ? 'Bekijken' : 'Openen') + '</a>');
    if (editor && it.status === 'submitted') knoppen.push('<button class="btn btn-xs btn-success" data-action="keur-goed" data-id="' + e(it.id) + '">Goedkeuren</button>');
    if (editor) {
      knoppen.push('<button class="btn btn-xs btn-ghost" data-action="verplaats" data-id="' + e(it.id) + '" data-richting="-1" aria-label="Omhoog"><i data-lucide="arrow-up" class="w-3 h-3"></i></button>');
      knoppen.push('<button class="btn btn-xs btn-ghost" data-action="verplaats" data-id="' + e(it.id) + '" data-richting="1" aria-label="Omlaag"><i data-lucide="arrow-down" class="w-3 h-3"></i></button>');
      knoppen.push('<button class="btn btn-xs btn-ghost" data-action="verwijder-stukje" data-id="' + e(it.id) + '" aria-label="Verwijderen"><i data-lucide="trash-2" class="w-3 h-3"></i></button>');
    }
    var rand = it.status === 'submitted' && editor ? 'border-info' : (leeg && !auto ? 'border-dashed border-base-content/20' : 'border-base-content/10');
    return '<div class="bg-base-100 rounded-xl border ' + rand + ' p-4 flex gap-3 items-start">'
      + '<div class="w-7 h-7 rounded-full bg-base-200 text-xs font-bold flex items-center justify-center shrink-0">' + (i + 1) + '</div>'
      + '<div class="flex-1 min-w-0">'
      + '<div class="flex flex-wrap items-center gap-2"><strong>' + e(it.title) + '</strong>' + (auto ? '<span class="badge badge-sm badge-ghost">Automatisch</span>' : NB.statusBadge(it.status)) + '<span class="text-xs opacity-50">' + e(NB.soort(it.kind)) + '</span></div>'
      + '<div class="text-sm opacity-70 mt-1 truncate">' + (it.heading ? e(it.heading) : (auto ? 'Vult zichzelf.' : 'Nog niets.')) + '</div>'
      + (it.comment_count ? '<div class="text-xs opacity-60 mt-1">' + it.comment_count + ' opmerking' + (it.comment_count === 1 ? '' : 'en') + '</div>' : '')
      + '<div class="flex flex-wrap gap-1 mt-2">' + knoppen.join('') + '</div>'
      + '</div>'
      + '<div class="shrink-0">' + eigenaar + '</div>'
      + '</div>';
  }

  function onderwerpKaart(d) {
    if (!d.series.is_editor) return '';
    var ed = d.edition;
    return '<div class="card bg-base-100 border border-base-content/10"><div class="card-body p-4 gap-2">'
      + '<h3 class="font-semibold">Onderwerp en voorbeeldtekst</h3>'
      + '<input id="edOnderwerp" class="input input-bordered input-sm" maxlength="200" placeholder="Onderwerp" value="' + e(ed.subject) + '">'
      + '<input id="edPreheader" class="input input-bordered input-sm" maxlength="200" placeholder="Voorbeeldtekst (grijze regel in de inbox)" value="' + e(ed.preheader) + '">'
      + '<div id="edVoorstellen" class="flex flex-col gap-1"></div>'
      + '<div class="flex gap-2"><button class="btn btn-sm btn-ghost" data-action="ai-onderwerp"><i data-lucide="sparkles" class="w-4 h-4"></i> Stel voor</button>'
      + '<button class="btn btn-sm btn-primary ml-auto" data-action="bewaar-onderwerp">Bewaren</button></div>'
      + '</div></div>';
  }

  function linkKaart() {
    return '<div class="card bg-base-100 border border-base-content/10"><div class="card-body p-4 gap-2">'
      + '<h3 class="font-semibold">Link of LinkedIn-post toevoegen</h3>'
      + '<p class="text-xs opacity-60">Plak de link. Titel, tekst en beeld worden opgehaald.</p>'
      + '<div class="join w-full"><input id="edLink" class="input input-bordered input-sm join-item flex-1" placeholder="https://"><button class="btn btn-sm join-item" data-action="voeg-link-toe">Toevoegen</button></div>'
      + '</div></div>';
  }

  function voorraadKaart(d) {
    var pool = (d.suggesties && d.suggesties.pool) || [];
    if (!d.series.is_editor) return '';
    return '<div class="card bg-base-100 border border-base-content/10"><div class="card-body p-4 gap-1">'
      + '<h3 class="font-semibold">Voorraad</h3>'
      + (pool.length ? pool.map(function (p) {
        return '<div class="flex items-center gap-2 py-1"><div class="flex-1 min-w-0"><a class="text-sm font-medium hover:underline" href="#/stukje/' + e(p.id) + '">' + e(p.title) + '</a></div>'
          + '<button class="btn btn-xs btn-primary" data-action="neem-op" data-id="' + e(p.id) + '">Opnemen</button></div>';
      }).join('') : '<p class="text-sm opacity-60">Leeg.</p>')
      + '</div></div>';
  }

  function activiteitKaart(d) {
    return '<div class="card bg-base-100 border border-base-content/10"><div class="card-body p-4 gap-1">'
      + '<h3 class="font-semibold">Wat er gebeurde</h3>'
      + (d.activity.length ? d.activity.slice(0, 12).map(function (a) {
        return '<div class="text-sm py-1 border-b border-base-content/10 last:border-0">' + (a.user_name ? '<strong>' + e(a.user_name.split(' ')[0]) + '</strong>: ' : '') + e(a.text) + ' <span class="opacity-50 text-xs">' + e(NB.datum(a.created_at, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })) + '</span></div>';
      }).join('') : '<p class="text-sm opacity-60">Nog niets.</p>')
      + '</div></div>';
  }

  function redactie(d) {
    return '<div class="flex flex-wrap gap-5 items-start">'
      + '<div class="flex-[999_1_560px] min-w-0 flex flex-col gap-2">'
      + '<div class="flex items-center justify-between"><h2 class="font-semibold">Rubrieken, in de volgorde van de mail</h2>'
      + (d.series.is_editor ? '<button class="btn btn-sm btn-ghost" data-action="open-stukje-toevoegen"><i data-lucide="plus" class="w-4 h-4"></i> Stukje</button>' : '') + '</div>'
      + d.items.map(function (it, i) { return stukjeKaart(it, i, d); }).join('')
      + '</div>'
      + '<div class="flex-[1_1_320px] min-w-0 flex flex-col gap-4">' + onderwerpKaart(d) + linkKaart() + voorraadKaart(d) + activiteitKaart(d) + '</div>'
      + '</div>';
  }

  function voorbeeld() {
    var stand = NB.state.voorbeeldStand || 'preview';
    return '<div class="flex flex-wrap items-center gap-3 mb-3">'
      + '<div role="tablist" class="tabs tabs-boxed w-fit">'
      + '<button role="tab" class="tab' + (stand === 'preview' ? ' tab-active' : '') + '" data-action="voorbeeld-stand" data-stand="preview">Met wat nog open staat</button>'
      + '<button role="tab" class="tab' + (stand === 'test' ? ' tab-active' : '') + '" data-action="voorbeeld-stand" data-stand="test">Zoals de testmail</button>'
      + '</div><span class="text-xs opacity-60">Klik op een stukje om het te openen.</span></div>'
      + '<div class="max-w-[740px] mx-auto"><iframe id="edVoorbeeld" class="nb-voorbeeld" title="Voorbeeld van de nieuwsbrief"></iframe></div>';
  }

  async function laadVoorbeeld() {
    var frame = document.getElementById('edVoorbeeld');
    if (!frame) return;
    var stand = NB.state.voorbeeldStand || 'preview';
    try {
      var r = await NB.api('/api/editions/' + NB.state.editie.edition.id + '/preview' + (stand === 'test' ? '?mode=test' : ''));
      frame.onload = function () {
        var doc = frame.contentDocument;
        if (!doc) return;
        frame.style.height = (doc.documentElement.scrollHeight + 20) + 'px';
        doc.addEventListener('click', function (ev) {
          ev.preventDefault();
          var blok = ev.target.closest('[data-nb-id]');
          if (blok) NB.ga('#/stukje/' + blok.getAttribute('data-nb-id'));
        });
        var stijl = doc.createElement('style');
        stijl.textContent = '[data-nb-id]{cursor:pointer}[data-nb-id]:hover{outline:2px solid #38bdf8;outline-offset:-2px}';
        doc.head ? doc.head.appendChild(stijl) : doc.documentElement.appendChild(stijl);
      };
      frame.srcdoc = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head><body style="margin:0">' + r.html + '</body></html>';
    } catch (err) { NB.fout(err); }
  }

  async function antwoorden() {
    var bak = document.getElementById('edAntwoorden');
    if (!bak) return;
    try {
      var r = await NB.api('/api/editions/' + NB.state.editie.edition.id + '/answers');
      if (!r.questions.length) { bak.innerHTML = '<p class="opacity-60">Deze editie heeft geen vragen.</p>'; return; }
      var vragen = r.questions.map(function (q) {
        var max = Math.max(1, q.total);
        return '<div class="card bg-base-100 border border-base-content/10"><div class="card-body p-5 gap-2">'
          + '<div class="text-xs font-bold uppercase tracking-wide text-primary">' + e(q.title) + '</div>'
          + '<div class="text-lg font-semibold">' + e(q.question) + '</div>'
          + q.options.map(function (o) {
            var n = q.counts[o.value] || 0;
            var pct = Math.round((n / max) * 100);
            return '<div><div class="flex justify-between text-sm"><span>' + e(o.label) + '</span><span class="opacity-60">' + n + ' · ' + pct + '%</span></div>'
              + '<progress class="progress progress-primary w-full" value="' + pct + '" max="100"></progress></div>';
          }).join('')
          + '<div class="text-xs opacity-60">' + q.total + ' antwoorden · ' + q.with_comment + ' met toelichting · ' + q.anonymous + ' anoniem</div>'
          + '</div></div>';
      }).join('');
      var titels = {};
      r.questions.forEach(function (q) { titels[q.id] = q; });
      var rijen = r.answers.map(function (a) {
        var q = titels[a.contribution_id] || { options: [] };
        var opt = (q.options || []).find(function (o) { return o.value === a.option_value; });
        var odoo = !a.verified ? 'anoniem, niet naar Odoo' : a.push_error ? 'fout: ' + a.push_error : a.pushed_at ? 'naar de koppeling' : 'wacht (10 min)';
        return '<tr><td>' + (a.contact ? '<div class="font-medium">' + e(a.contact.name) + '</div><div class="text-xs opacity-60">' + e(a.contact.email) + '</div>' : '<span class="opacity-60">Anoniem</span>') + '</td>'
          + '<td>' + e(q.title || '') + '</td><td><span class="badge badge-sm">' + e(opt ? opt.label : a.option_value) + '</span></td>'
          + '<td class="max-w-xs">' + e(a.comment || '') + '</td><td class="text-xs whitespace-nowrap">' + e(NB.datum(a.updated_at)) + '</td><td class="text-xs">' + e(odoo) + '</td></tr>';
      }).join('');
      bak.innerHTML = '<div class="grid gap-4 md:grid-cols-2 mb-5">' + vragen + '</div>'
        + (r.integration_id ? '<p class="text-sm mb-3">Antwoorden gaan naar de koppeling van deze reeks (<a class="link" href="/forminator-v2">Koppelingen</a>, "Nieuwsbrief-antwoorden …"). Zolang die uit staat, worden ze bewaard maar gebeurt er niets in Odoo.</p>' : '<p class="text-sm mb-3 opacity-70">Bij het eerste antwoord maakt de OM een koppeling voor deze reeks aan (uitgeschakeld).</p>')
        + '<div class="overflow-x-auto bg-base-100 rounded-xl border border-base-content/10"><table class="table table-sm"><thead><tr><th>Wie</th><th>Vraag</th><th>Antwoord</th><th>Toelichting</th><th>Wanneer</th><th>Odoo</th></tr></thead><tbody>'
        + (rijen || '<tr><td colspan="6" class="opacity-60">Nog geen antwoorden.</td></tr>') + '</tbody></table></div>';
    } catch (err) { NB.fout(err); }
  }

  NB.views.editie = async function (params) {
    var app = document.getElementById('app');
    var d = await NB.api('/api/editions/' + params.id);
    NB.state.editie = d;
    if (d.series.is_editor) {
      try { d.suggesties = await NB.api('/api/editions/' + params.id + '/suggestions'); } catch (err) { d.suggesties = null; }
    }
    var tab = NB.state.editieTab || 'redactie';
    var tabKnop = function (naam, label) {
      return '<button role="tab" class="tab' + (tab === naam ? ' tab-active' : '') + '" data-action="editie-tab" data-tab="' + naam + '">' + label + '</button>';
    };
    var stats = d.edition.stats;
    app.innerHTML = '<div class="text-sm opacity-70 mb-1"><a class="hover:underline" href="#/">Nieuwsbrieven</a> / ' + e(d.series.name) + '</div>'
      + '<div class="flex flex-wrap items-center gap-3 mb-4"><h1 class="text-2xl font-bold">' + e(d.edition.title) + '</h1>' + NB.editieBadge(d.edition.status)
      + (stats ? '<span class="text-sm opacity-70">' + (stats.sent || 0) + ' verzonden · ' + Math.round(stats.opened_ratio || 0) + '% geopend · ' + Math.round(stats.clicks_ratio || 0) + '% geklikt</span>' : '')
      + (d.series.is_editor && ['collecting', 'review'].indexOf(d.edition.status) >= 0 ? '<button class="btn btn-xs btn-ghost ml-auto" data-action="annuleer-editie">Editie annuleren</button>' : '')
      + '</div>'
      + tellerKaart(d)
      + '<div role="tablist" class="tabs tabs-boxed mb-5 w-fit">' + tabKnop('redactie', 'Redactie') + tabKnop('voorbeeld', 'Voorbeeld') + tabKnop('antwoorden', 'Antwoorden') + '</div>'
      + '<div id="edTab">' + (tab === 'voorbeeld' ? voorbeeld() : tab === 'antwoorden' ? '<div id="edAntwoorden"><span class="loading loading-spinner"></span></div>' : redactie(d)) + '</div>';
    NB.ikons();
    if (tab === 'voorbeeld') laadVoorbeeld();
    if (tab === 'antwoorden') antwoorden();
  };

  function herlaad() { NB.views.editie({ id: NB.state.editie.edition.id }).catch(NB.fout); }

  // ─── Acties ───────────────────────────────────────────────────────────────

  NB.actions['editie-tab'] = function (el) { NB.state.editieTab = el.dataset.tab; herlaad(); };
  NB.actions['voorbeeld-stand'] = function (el) { NB.state.voorbeeldStand = el.dataset.stand; herlaad(); };

  NB.actions['test-versturen'] = async function (el) {
    el.disabled = true;
    try {
      var r = await NB.api('/api/editions/' + NB.state.editie.edition.id + '/test', { method: 'POST' });
      NB.toast('Testmail ' + (r.queued ? 'in de wachtrij van Odoo' : 'verstuurd') + ' naar ' + r.to.join(', ') + '.');
      if (!r.token_field) NB.toast('Het Studio-veld x_studio_om_token ontbreekt: antwoorden op vragen tellen als anoniem.', 'warning');
      herlaad();
    } catch (err) { NB.fout(err); el.disabled = false; }
  };

  NB.actions['herinner'] = async function () {
    try {
      await NB.api('/api/editions/' + NB.state.editie.edition.id + '/remind', { method: 'POST' });
      NB.toast('Herinnering in de chat gezet.');
    } catch (err) { NB.fout(err); }
  };

  NB.actions['bewaar-datums'] = async function () {
    try {
      await NB.api('/api/editions/' + NB.state.editie.edition.id, {
        method: 'PUT',
        body: { deadline_at: NB.vanLokaal(document.getElementById('edDeadline').value), send_at: NB.vanLokaal(document.getElementById('edSend').value) },
      });
      NB.toast('Datums bewaard.');
      herlaad();
    } catch (err) { NB.fout(err); }
  };

  NB.actions['bewaar-onderwerp'] = async function () {
    try {
      await NB.api('/api/editions/' + NB.state.editie.edition.id, {
        method: 'PUT',
        body: { subject: document.getElementById('edOnderwerp').value, preheader: document.getElementById('edPreheader').value },
      });
      NB.toast('Onderwerp bewaard.');
    } catch (err) { NB.fout(err); }
  };

  NB.actions['ai-onderwerp'] = async function (el) {
    el.disabled = true;
    var bak = document.getElementById('edVoorstellen');
    bak.innerHTML = '<span class="loading loading-dots loading-sm"></span>';
    try {
      var r = await NB.api('/api/editions/' + NB.state.editie.edition.id + '/ai-subject', { method: 'POST' });
      NB.state.onderwerpVoorstel = r;
      bak.innerHTML = r.subjects.map(function (s, i) {
        return '<button class="btn btn-xs btn-ghost justify-start h-auto py-1 text-left normal-case font-normal" data-action="kies-onderwerp" data-i="' + i + '">' + e(s) + '</button>';
      }).join('') + (r.preheader ? '<div class="text-xs opacity-60">Voorbeeldtekst: ' + e(r.preheader) + '</div>' : '');
    } catch (err) { bak.innerHTML = ''; NB.fout(err); }
    el.disabled = false;
  };

  NB.actions['kies-onderwerp'] = function (el) {
    var r = NB.state.onderwerpVoorstel;
    document.getElementById('edOnderwerp').value = r.subjects[Number(el.dataset.i)] || '';
    if (r.preheader && !document.getElementById('edPreheader').value) document.getElementById('edPreheader').value = r.preheader;
  };

  NB.actions['keur-goed'] = async function (el) {
    try {
      await NB.api('/api/contributions/' + el.dataset.id + '/status', { method: 'POST', body: { status: 'approved' } });
      herlaad();
    } catch (err) { NB.fout(err); }
  };

  NB.actions['verplaats'] = async function (el) {
    var ids = NB.state.editie.items.map(function (i) { return i.id; });
    var i = ids.indexOf(el.dataset.id);
    var j = i + Number(el.dataset.richting);
    if (i < 0 || j < 0 || j >= ids.length) return;
    ids.splice(j, 0, ids.splice(i, 1)[0]);
    try {
      await NB.api('/api/editions/' + NB.state.editie.edition.id + '/order', { method: 'POST', body: { ids: ids } });
      herlaad();
    } catch (err) { NB.fout(err); }
  };

  NB.actions['verwijder-stukje'] = async function (el) {
    if (!window.confirm('Dit stukje verwijderen?')) return;
    try {
      await NB.api('/api/contributions/' + el.dataset.id, { method: 'DELETE' });
      if (el.dataset.terug) NB.ga(el.dataset.terug); else herlaad();
    } catch (err) { NB.fout(err); }
  };

  NB.actions['neem-op'] = async function (el) {
    try {
      await NB.api('/api/editions/' + NB.state.editie.edition.id + '/contributions', { method: 'POST', body: { from_pool_id: el.dataset.id } });
      NB.toast('Opgenomen in deze editie.');
      herlaad();
    } catch (err) { NB.fout(err); }
  };

  NB.actions['voeg-link-toe'] = async function (el) {
    var adres = document.getElementById('edLink').value.trim();
    if (!adres) return;
    el.disabled = true;
    try {
      var v = await NB.api('/api/link-preview', { method: 'POST', body: { url: adres } });
      var kind = v.is_linkedin ? 'linkedin' : 'link';
      var rij = await NB.api('/api/editions/' + NB.state.editie.edition.id + '/contributions', {
        method: 'POST',
        body: {
          kind: kind, title: v.is_linkedin ? 'Op LinkedIn' : 'Uit het nieuws', source: (v.is_linkedin ? 'linkedin:' : 'link:') + v.url,
          content: { url: v.url, title: v.title, text: v.text, image_url: v.image_url, site_name: v.site_name, author_name: v.author_name },
        },
      });
      NB.ga('#/stukje/' + rij.id);
    } catch (err) { NB.fout(err); el.disabled = false; }
  };

  NB.actions['open-stukje-toevoegen'] = function () {
    var kinds = NB.state.boot.kinds;
    document.getElementById('stukjeSoort').innerHTML = Object.keys(kinds).filter(function (k) { return ['toc', 'closing'].indexOf(k) < 0; }).map(function (k) {
      return '<option value="' + k + '">' + e(kinds[k].label) + '</option>';
    }).join('');
    document.getElementById('stukjeTitel').value = '';
    document.getElementById('stukjeEigenaar').innerHTML = NB.gebruikersOpties(NB.state.boot.me.id, true);
    NB.dialoog('dlgStukje').showModal();
  };

  NB.actions['voeg-stukje-toe'] = async function () {
    var kind = document.getElementById('stukjeSoort').value;
    try {
      var rij = await NB.api('/api/editions/' + NB.state.editie.edition.id + '/contributions', {
        method: 'POST',
        body: { kind: kind, title: document.getElementById('stukjeTitel').value || NB.soort(kind), owner_user_id: document.getElementById('stukjeEigenaar').value || null },
      });
      NB.dialoog('dlgStukje').close();
      NB.ga('#/stukje/' + rij.id);
    } catch (err) { NB.fout(err); }
  };

  NB.actions['annuleer-editie'] = async function () {
    if (!window.confirm('Deze editie annuleren? De stukjes blijven bewaard bij de editie.')) return;
    try {
      await NB.api('/api/editions/' + NB.state.editie.edition.id + '/cancel', { method: 'POST' });
      NB.ga('#/');
    } catch (err) { NB.fout(err); }
  };

  NB.actions['open-inplannen'] = function () {
    var d = NB.state.editie;
    document.getElementById('inplannenTekst').textContent = 'De editie gaat op ' + NB.datum(d.edition.send_at) + ' naar de Odoo-lijst(en) '
      + (d.series.odoo_list_ids || []).join(', ') + ' van ' + d.series.name + '. Dit kan je in de OM niet terugdraaien.';
    document.getElementById('inplannenBevestig').value = '';
    NB.dialoog('dlgInplannen').showModal();
  };

  NB.actions['bevestig-inplannen'] = async function () {
    try {
      await NB.api('/api/editions/' + NB.state.editie.edition.id + '/schedule', {
        method: 'POST', body: { confirm: document.getElementById('inplannenBevestig').value.trim() },
      });
      NB.dialoog('dlgInplannen').close();
      NB.toast('Ingepland in Odoo.');
      herlaad();
    } catch (err) { NB.fout(err); }
  };

  NB.changes['eigenaar'] = async function (el) {
    try {
      await NB.api('/api/contributions/' + el.dataset.id, { method: 'PUT', body: { owner_user_id: el.value || null } });
      NB.toast('Toegewezen.');
    } catch (err) { NB.fout(err); }
  };
})();
