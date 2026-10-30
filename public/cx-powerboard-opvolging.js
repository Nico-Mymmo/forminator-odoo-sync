/**
 * CX Powerboard -- tabblad "Opvolging": alle beltaken uit Odoo van het hele
 * team, met wat er niet klopt, en de open kansen zonder volgende stap.
 * Gegevens: GET /cx-powerboard/api/opvolging (cx-automations/opvolging/overzicht.js).
 */
(function () {
  var S = { data: null, fout: null, laden: false, wie: '', stand: 'tedoen' };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function datum(iso) {
    if (!iso) return '';
    var d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso);
    return d.toLocaleDateString('nl-BE', { day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
  }
  function wanneer(t) {
    if (!t.deadline) return '<span class="badge badge-ghost badge-sm">geen datum</span>';
    if (t.dagen_te_laat > 0) return '<span class="badge badge-error badge-sm whitespace-nowrap">' + t.dagen_te_laat + (t.dagen_te_laat === 1 ? ' dag' : ' dagen') + ' te laat</span>';
    if (t.dagen_te_laat === 0) return '<span class="badge badge-info badge-sm">vandaag</span>';
    return '<span class="text-sm whitespace-nowrap">' + esc(datum(t.deadline)) + '</span>';
  }
  function gesprek(g) {
    if (!g) return '<span class="text-xs opacity-50">nog geen oproep</span>';
    return '<span class="text-xs">' + esc(g.label) + ' · ' + esc(datum(g.datum)) + (g.door ? ' · ' + esc(g.door) : '') + '</span>';
  }
  function kansCel(k) {
    return '<a class="link link-hover font-medium" href="' + esc(k.url) + '" target="_blank" rel="noopener">' + esc(k.naam || 'Kans ' + k.id) + '</a>'
      + '<div class="text-xs opacity-70 flex flex-wrap gap-x-3">'
      + (k.contact ? '<span>' + esc(k.contact) + '</span>' : '')
      + (k.telefoon ? '<a class="link link-hover" href="tel:' + esc(k.telefoon.replace(/\s+/g, '')) + '">' + esc(k.telefoon) + '</a>' : '')
      + (k.fase ? '<span>' + esc(k.fase) + '</span>' : '') + '</div>';
  }

  function zichtbaar() {
    var d = S.data;
    return d.taken.filter(function (t) {
      if (S.wie && String(t.toegewezen_id) !== S.wie) return false;
      if (S.stand === 'tedoen') return !t.deadline || t.dagen_te_laat >= 0;
      if (S.stand === 'signaal') return t.signalen.length > 0;
      return true;
    });
  }

  function teken() {
    var el = document.getElementById('opvolgingContent');
    if (!el) return;
    if (S.fout) { el.innerHTML = '<div class="alert alert-warning"><span>De beltaken konden niet geladen worden: ' + esc(S.fout) + '</span></div>'; return; }
    if (!S.data) { el.innerHTML = '<div class="flex justify-center py-16"><span class="loading loading-spinner loading-lg"></span></div>'; return; }
    var d = S.data;
    var mensen = {};
    d.taken.forEach(function (t) { if (t.toegewezen_id) mensen[t.toegewezen_id] = t.toegewezen_aan; });
    var alleVanWie = d.taken.filter(function (t) { return !S.wie || String(t.toegewezen_id) === S.wie; });
    var tel = { laat: 0, vandaag: 0, later: 0, signaal: 0 };
    alleVanWie.forEach(function (t) {
      if (t.dagen_te_laat > 0) tel.laat++; else if (!t.deadline || t.dagen_te_laat === 0) tel.vandaag++; else tel.later++;
      if (t.signalen.length) tel.signaal++;
    });
    var rijen = zichtbaar();

    var html = '<div class="flex flex-wrap items-center gap-3 mb-4">'
      + '<select class="select select-bordered select-sm" data-opv="wie"><option value="">Iedereen</option>'
      + Object.keys(mensen).sort(function (a, b) { return mensen[a].localeCompare(mensen[b]); }).map(function (k) {
        return '<option value="' + k + '"' + (S.wie === k ? ' selected' : '') + '>' + esc(mensen[k]) + '</option>';
      }).join('') + '</select>'
      + '<div class="join">'
      + [['tedoen', 'Te doen (' + (tel.laat + tel.vandaag) + ')'], ['signaal', 'Klopt niet (' + tel.signaal + ')'], ['alles', 'Alles (' + alleVanWie.length + ')']].map(function (s) {
        return '<button type="button" class="btn btn-sm join-item' + (S.stand === s[0] ? ' btn-primary' : '') + '" data-opv-stand="' + s[0] + '">' + s[1] + '</button>';
      }).join('') + '</div>'
      + '<span class="text-sm opacity-70">' + tel.laat + ' te laat · ' + tel.vandaag + ' vandaag · ' + tel.later + ' later</span>'
      + '<button type="button" class="btn btn-sm btn-ghost ml-auto" data-opv="vernieuw"><i data-lucide="refresh-cw" class="w-4 h-4"></i> Vernieuwen</button>'
      + '</div>';

    html += '<div class="card bg-base-100 border border-base-content/10 shadow-sm mb-6"><div class="overflow-x-auto"><table class="table table-sm">'
      + '<thead><tr><th>Kans</th><th>Voor</th><th>Wanneer</th><th>Taak</th><th>Laatste oproep</th><th>Klopt niet</th></tr></thead><tbody>'
      + (rijen.length ? rijen.map(function (t) {
        return '<tr class="align-top">'
          + '<td class="min-w-[14rem]">' + kansCel(t.kans) + '</td>'
          + '<td class="whitespace-nowrap">' + esc(t.toegewezen_aan) + (t.kans.verkoper && t.kans.verkoper !== t.toegewezen_aan ? '<div class="text-xs opacity-60">verkoper: ' + esc(t.kans.verkoper) + '</div>' : '') + '</td>'
          + '<td>' + wanneer(t) + '</td>'
          + '<td class="text-sm">' + esc(t.type) + (t.samenvatting ? '<div class="text-xs opacity-70">' + esc(t.samenvatting) + '</div>' : '') + '</td>'
          + '<td>' + gesprek(t.laatste_gesprek) + '</td>'
          + '<td>' + t.signalen.map(function (s) { return '<span class="badge badge-warning badge-sm mr-1 mb-1 whitespace-nowrap">' + esc(s.tekst) + '</span>'; }).join('') + '</td>'
          + '</tr>';
      }).join('') : '<tr><td colspan="6" class="text-center py-8 opacity-60">Niets in deze lijst.</td></tr>')
      + '</tbody></table></div></div>';

    var zonder = d.zonder_stap.filter(function (z) { return !S.wie || z.kans.verkoper === mensen[S.wie]; });
    html += '<div class="card bg-base-100 border border-base-content/10 shadow-sm"><div class="card-body p-4">'
      + '<h3 class="font-semibold">Open kansen zonder volgende stap <span class="badge badge-ghost badge-sm">' + zonder.length + '</span></h3>'
      + '<p class="text-xs opacity-70 mb-2">Geen enkele taak en geen komende afspraak. Hier hoort een beltaak of een andere stap op.</p>'
      + (zonder.length ? '<table class="table table-sm"><thead><tr><th>Kans</th><th>Verkoper</th><th>Laatste oproep</th></tr></thead><tbody>'
        + zonder.map(function (z) {
          return '<tr class="align-top"><td>' + kansCel(z.kans) + '</td><td>' + esc(z.kans.verkoper || 'geen verkoper') + '</td><td>' + gesprek(z.laatste_gesprek) + '</td></tr>';
        }).join('') + '</tbody></table>'
        : '<p class="text-sm opacity-60">Op elke open kans staat een volgende stap.</p>')
      + '</div></div>';

    el.innerHTML = html;
    if (window.lucide) window.lucide.createIcons();
  }

  function laad(opnieuw) {
    if (S.laden || (S.data && !opnieuw)) { teken(); return; }
    S.laden = true; S.fout = null;
    if (opnieuw) S.data = null;
    teken();
    fetch('/cx-powerboard/api/opvolging', { credentials: 'include' })
      .then(function (r) {
        if (r.status === 401) { window.location.href = '/'; return null; }
        return r.json().then(function (j) { if (!r.ok || j.success === false) throw new Error(j.error || 'HTTP ' + r.status); return j.data; });
      })
      .then(function (d) { if (d) S.data = d; })
      .catch(function (e) { S.fout = e.message; })
      .then(function () { S.laden = false; teken(); });
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-opv-stand], [data-opv="vernieuw"]');
    if (!b || !document.getElementById('opvolgingContent').contains(b)) return;
    if (b.dataset.opvStand) { S.stand = b.dataset.opvStand; teken(); } else laad(true);
  });
  document.addEventListener('change', function (e) {
    if (e.target.matches('[data-opv="wie"]')) { S.wie = e.target.value; teken(); }
  });

  window.PBOpvolging = { laad: laad };
})();
