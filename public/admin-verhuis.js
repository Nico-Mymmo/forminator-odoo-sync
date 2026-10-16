// Beheer -> tabblad Verhuis: Supabase naar de nieuwe databank (D1 om-core).
// Logica op de server: src/lib/verhuis.js. Plan: docs/plan-supabase-uitfaseren.md.
// Eigen bestand naast admin-dashboard.js (dat al groot is); zelfde werkwijze:
// data-action + een centrale listener, geen inline handlers.
(function () {
  'use strict';

  var geladen = false;

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
  }

  function toast(msg, type) {
    if (typeof window.showToast === 'function') window.showToast(msg, type);
    else if (type === 'error') alert(msg);
  }

  async function api(url, method) {
    var res = await fetch(url, { method: method || 'GET', credentials: 'include' });
    if (res.status === 401) { window.location.href = '/'; throw new Error('Niet ingelogd'); }
    var body = await res.json().catch(function () { return {}; });
    if (!res.ok || !body.success) throw new Error(body.error || ('Serverfout (' + res.status + ')'));
    return body.data;
  }

  var STATUS = {
    'nog niet':   { label: 'Nog niet gekopieerd', kleur: 'badge-ghost' },
    'bezig':      { label: 'Bezig met kopi\u00ebren', kleur: 'badge-info' },
    'gekopieerd': { label: 'Gekopieerd, nog niet in gebruik', kleur: 'badge-info' },
    'live':       { label: 'In gebruik in de nieuwe databank', kleur: 'badge-success' },
    'teruggezet': { label: 'Teruggezet naar Supabase', kleur: 'badge-warning' },
    'fout':       { label: 'Fout', kleur: 'badge-error' }
  };

  function knoppen(r) {
    var k = [];
    if (r.status !== 'live') {
      k.push('<button class="btn btn-xs" data-action="verhuisKopieer" data-tabel="' + esc(r.tabel) + '">' +
        (r.status === 'nog niet' ? 'Kopi\u00ebren' : 'Opnieuw kopi\u00ebren') + '</button>');
    }
    if (r.status === 'gekopieerd') {
      k.push('<button class="btn btn-xs btn-primary" data-action="verhuisOverschakelen" data-tabel="' + esc(r.tabel) + '">Overschakelen</button>');
    }
    if (r.status === 'live') {
      k.push('<button class="btn btn-xs btn-ghost text-warning" data-action="verhuisTerugzetten" data-tabel="' + esc(r.tabel) + '">Terugzetten</button>');
    }
    return k.join(' ');
  }

  function render(rijen) {
    var el = document.getElementById('verhuisTable');
    if (!el) return;
    if (!rijen.length) { el.innerHTML = '<p class="text-sm text-base-content/50">Nog geen tabellen op de verhuislijst.</p>'; return; }
    el.innerHTML =
      '<table class="table table-sm"><thead><tr>' +
        '<th>Onderdeel</th><th>Tabel</th><th>Stand</th><th class="text-right">Rijen Supabase</th><th class="text-right">Rijen nieuw</th><th>Laatst</th><th></th>' +
      '</tr></thead><tbody>' +
      rijen.map(function (r) {
        var s = STATUS[r.status] || { label: r.status, kleur: 'badge-ghost' };
        var verschil = r.rijen_supabase != null && r.rijen_core != null && r.rijen_supabase !== r.rijen_core && r.status !== 'live';
        return '<tr>' +
          '<td class="font-medium">' + esc(r.module) + '</td>' +
          '<td class="font-mono text-xs">' + esc(r.tabel) + '</td>' +
          '<td><span class="badge badge-sm whitespace-nowrap ' + s.kleur + '">' + esc(s.label) + '</span>' +
            (r.fout ? '<div class="text-xs text-base-content/60 mt-1 max-w-md">' + esc(r.fout) + '</div>' : '') + '</td>' +
          '<td class="text-right tabular-nums">' + (r.rijen_supabase == null ? '&ndash;' : r.rijen_supabase) + '</td>' +
          '<td class="text-right tabular-nums' + (verschil ? ' text-warning' : '') + '">' + (r.rijen_core == null ? '&ndash;' : r.rijen_core) + '</td>' +
          '<td class="text-xs text-base-content/60">' + (r.gewijzigd ? esc(new Date(r.gewijzigd).toLocaleString('nl-BE')) : '&ndash;') + '</td>' +
          '<td class="text-right whitespace-nowrap">' + knoppen(r) + '</td>' +
        '</tr>';
      }).join('') +
      '</tbody></table>';
  }

  async function laad() {
    geladen = true;
    var el = document.getElementById('verhuisTable');
    try {
      render(await api('/admin/api/verhuis'));
    } catch (e) {
      if (el) el.innerHTML = '<div class="alert alert-error text-sm"><span>Ophalen mislukt: ' + esc(e.message) + '</span></div>';
    }
  }

  async function actie(knop, pad, vraag, gelukt) {
    if (vraag && !confirm(vraag)) return;
    knop.classList.add('btn-disabled');
    try {
      var d = await api('/admin/api/verhuis/' + encodeURIComponent(knop.dataset.tabel) + '/' + pad, 'POST');
      toast(gelukt(d), 'success');
    } catch (e) {
      toast(e.message, 'error');
    }
    await laad();
  }

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    if (!el) return;
    var a = el.dataset.action;
    if (a === 'verhuisVernieuwen') laad();
    else if (a === 'verhuisKopieer') {
      actie(el, 'kopieer', null, function (d) {
        return d.gelijk ? 'Gekopieerd: ' + d.rijen_core + ' rijen, aan beide kanten gelijk.'
          : 'Gekopieerd, maar de aantallen verschillen (' + d.rijen_supabase + ' / ' + d.rijen_core + ').';
      });
    } else if (a === 'verhuisOverschakelen') {
      actie(el, 'overschakelen',
        'Vanaf nu leest en schrijft dit onderdeel in de nieuwe databank. Doorgaan?',
        function () { return 'Overgeschakeld.'; });
    } else if (a === 'verhuisTerugzetten') {
      actie(el, 'terugzetten',
        'Terug naar Supabase? Wat er sinds het overschakelen gewijzigd is, staat enkel in de nieuwe databank en is daarna niet meer zichtbaar.',
        function () { return 'Teruggezet naar Supabase.'; });
    }
  });

  var tab = document.getElementById('tabVerhuis');
  if (tab) tab.addEventListener('change', function (e) { if (e.target.checked && !geladen) laad(); });
})();
