/**
 * CX Automations -- tabblad Opvolging: de SEQUENTIE instellen.
 * Server: GET/PUT /cx-automations/api/opvolging/sequentie
 * (src/modules/cx-automations/opvolging/sequentie.js, normaliseerSequentie).
 */
(function () {
  var S = { cfg: null, bezig: false, fout: null };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function dagen(n) { return n === 0 ? 'dezelfde dag' : n === 1 ? '1 werkdag' : n + ' werkdagen'; }

  function stapRij(nr, kleur, icoon, titel, inhoud) {
    return '<li class="flex gap-3">'
      + '<div class="flex flex-col items-center"><span class="w-8 h-8 rounded-full flex items-center justify-center ' + kleur + '"><i data-lucide="' + icoon + '" class="w-4 h-4"></i></span>'
      + '<span class="w-px flex-1 bg-base-content/10 my-1"></span></div>'
      + '<div class="flex-1 pb-4"><div class="text-xs opacity-60">' + esc(nr) + '</div><div class="font-medium text-sm mb-2">' + esc(titel) + '</div>' + inhoud + '</div></li>';
  }
  function velden(pad, titel, na, naLabel) {
    return '<div class="flex flex-wrap items-center gap-2">'
      + '<input class="input input-bordered input-sm w-80 max-w-full" data-seq="' + pad + '.titel" value="' + esc(titel) + '" placeholder="Naam van de taak">'
      + '<input type="number" min="0" max="30" class="input input-bordered input-sm w-20" data-seq="' + pad + '.na_werkdagen" value="' + na + '">'
      + '<span class="text-sm opacity-70">' + esc(naLabel) + '</span></div>';
  }

  function teken() {
    var el = document.getElementById('opvSequentie');
    if (!el) return;
    if (S.fout) { el.innerHTML = '<div class="alert alert-warning text-sm"><span>' + esc(S.fout) + '</span></div>'; return; }
    if (!S.cfg) { el.innerHTML = '<span class="loading loading-spinner"></span>'; return; }
    var c = S.cfg;
    var totaal = 1 + c.pogingen.length;
    var h = '<div class="flex flex-wrap items-center gap-4 mb-4">'
      + '<label class="label cursor-pointer gap-2"><input type="checkbox" class="toggle toggle-sm toggle-success" data-seq="actief"' + (c.actief ? ' checked' : '') + '><span class="text-sm">Sequentie aan</span></label>'
      + '<label class="flex items-center gap-2 text-sm">Geldt voor kansen vanaf <input type="date" class="input input-bordered input-sm" data-seq="actief_vanaf" value="' + esc(c.actief_vanaf) + '"></label>'
      + '</div><ol class="list-none p-0 m-0">';
    h += stapRij('Stap 1 van ' + totaal + ' · elke nieuwe kans', 'bg-info/15 text-info', 'inbox', 'Nieuwe aanvraag: eerste keer bellen',
      '<div class="flex flex-wrap items-center gap-2">'
      + '<input class="input input-bordered input-sm w-80 max-w-full" data-seq="eerste.titel" value="' + esc(c.eerste.titel) + '" placeholder="Naam van de taak">'
      + '<span class="text-sm opacity-70">binnen voor</span>'
      + '<input type="number" min="1" max="23" class="input input-bordered input-sm w-20" data-seq="eerste.middag_uur" value="' + c.eerste.middag_uur + '">'
      + '<span class="text-sm opacity-70">uur op een werkdag: dezelfde dag bellen. Later, of in het weekend: de werkdag erna.</span></div>'
      + '<p class="text-xs opacity-60 mt-1">Type in Odoo: Nieuwe aanvraag - contacteren. Maakt een koppeling deze taak al, dan komt er geen tweede.</p>');
    c.pogingen.forEach(function (p, i) {
      h += stapRij('Stap ' + (i + 2) + ' van ' + totaal + ' · na een oproep zonder contact', 'bg-warning/15 text-warning', 'phone-missed', 'Opnieuw bellen',
        velden('pogingen.' + i, p.titel, p.na_werkdagen, 'werkdagen na die oproep')
        + '<button type="button" class="btn btn-ghost btn-xs mt-1" data-seq-actie="weg" data-i="' + i + '"><i data-lucide="trash-2" class="w-3 h-3"></i> Stap weghalen</button>');
    });
    h += '<li class="flex gap-3 mb-2"><div class="w-8"></div><button type="button" class="btn btn-outline btn-xs" data-seq-actie="erbij"' + (c.pogingen.length >= 8 ? ' disabled' : '') + '><i data-lucide="plus" class="w-3 h-3"></i> Poging erbij</button></li>';
    h += stapRij('Na de laatste poging zonder contact', 'bg-base-content/10', 'flag', 'Beslissen',
      '<label class="label cursor-pointer justify-start gap-2 mb-1"><input type="checkbox" class="checkbox checkbox-sm" data-seq="einde.aan"' + (c.einde.aan ? ' checked' : '') + '><span class="text-sm">Taak aanmaken (To-Do)</span></label>'
      + velden('einde', c.einde.titel, c.einde.na_werkdagen, 'werkdagen na de laatste oproep'));
    h += '</ol>'
      + '<div class="alert text-sm mt-2"><i data-lucide="phone" class="w-4 h-4 text-success"></i><span>Nam de klant op of belde hij zelf terug, dan stopt de sequentie: de verkoper plant zelf de volgende stap. Elke stap wordt een keer gepland; wie een taak wegdoet, krijgt ze niet terug.</span></div>'
      + '<div class="flex items-center gap-3 mt-4"><button type="button" class="btn btn-primary btn-sm" data-seq-actie="bewaar"' + (S.bezig ? ' disabled' : '') + '>Sequentie bewaren</button>'
      + '<span class="text-sm opacity-60">Voorbeeld: binnen voor ' + c.eerste.middag_uur + ' uur = dezelfde dag, daarna ' + c.pogingen.map(function (p) { return esc(dagen(p.na_werkdagen)); }).join(', ') + ' na elke oproep zonder antwoord.</span></div>';
    el.innerHTML = h;
    if (window.lucide) window.lucide.createIcons();
  }

  function zet(pad, waarde) {
    var delen = pad.split('.');
    var o = S.cfg;
    for (var i = 0; i < delen.length - 1; i++) o = o[delen[i]];
    o[delen[delen.length - 1]] = waarde;
  }

  async function laad() {
    if (S.cfg) { teken(); return; }
    teken();
    try {
      var res = await apiFetch('/cx-automations/api/opvolging/sequentie');
      var j = await res.json();
      if (!j.success) throw new Error(j.error || 'onbekende fout');
      S.cfg = j.data;
    } catch (e) { S.fout = 'De sequentie kon niet geladen worden: ' + e.message; }
    teken();
  }

  async function bewaar() {
    S.bezig = true; teken();
    try {
      var res = await apiFetch('/cx-automations/api/opvolging/sequentie', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(S.cfg),
      });
      var j = await res.json();
      if (!j.success) throw new Error(j.error || 'onbekende fout');
      S.cfg = j.data;
      showToast('Sequentie bewaard', 'success');
    } catch (e) { showToast('Bewaren mislukt: ' + e.message, 'error'); }
    S.bezig = false; teken();
  }

  document.addEventListener('change', function (e) {
    var el = e.target.closest('[data-seq]');
    if (!el || !S.cfg) return;
    var v = el.type === 'checkbox' ? el.checked : el.type === 'number' ? Number(el.value) : el.value;
    zet(el.dataset.seq, v);
    teken();
  });
  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-seq-actie]');
    if (!el || !S.cfg) return;
    var a = el.dataset.seqActie;
    if (a === 'erbij') { S.cfg.pogingen.push({ titel: 'Terugbellen (poging ' + (S.cfg.pogingen.length + 2) + ')', na_werkdagen: 2 }); teken(); }
    if (a === 'weg') { S.cfg.pogingen.splice(Number(el.dataset.i), 1); teken(); }
    if (a === 'bewaar') bewaar();
  });

  window.OpvSequentie = { laad: laad };
})();
