/**
 * Koppelingen — tabblad "Documenten".
 *
 * Toont wat een generate_pdf-stap voor DEZE koppeling in R2 heeft gezet (zie
 * het doc-blok bij fs_v2_generated_documents in pdf-step.js) -- de pdf zelf
 * staat NOOIT in Odoo, enkel hier en, tijdelijk, als ir.attachment op de
 * verzonden mail (mail-attachments.js). Download loopt door de gewone
 * sessie-auth van deze module, dus geen Odoo-toegangsfout meer mogelijk: wie
 * de koppeling kan openen, kan het document zien.
 *
 * Eigen bestand, zelfde afspraak als de rest van de module (export via
 * window.FSV2.*, cross-file calls altijd als window.FSV2.naam()).
 */
(function () {
  'use strict';

  function S()    { return window.FSV2.S; }
  function esc(v) { return window.FSV2.esc(v); }

  function leesbareGrootte(bytes) {
    var n = Number(bytes) || 0;
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return Math.round(n / 1024) + ' kB';
    return (n / 1024 / 1024).toFixed(1) + ' MB';
  }

  function leesbareDatum(iso) {
    try {
      return new Date(iso).toLocaleString('nl-BE', { dateStyle: 'medium', timeStyle: 'short' });
    } catch (_err) {
      return String(iso || '');
    }
  }

  async function renderDetailDocuments() {
    var el = document.getElementById('detailDocuments');
    if (!el) return;
    var integrationId = S().activeId;
    if (!integrationId) return;

    el.innerHTML = '<div class="text-sm text-base-content/40 py-4"><span class="loading loading-spinner loading-xs"></span> Laden…</div>';

    try {
      var res = await window.FSV2.api('/integrations/' + integrationId + '/generated-documents');
      var lijst = (res && res.data) || [];
      teken(el, lijst);
    } catch (err) {
      el.innerHTML = '<div class="text-sm text-error py-4">Laden mislukt: ' + esc(err.message) + '</div>';
    }
  }

  function teken(el, lijst) {
    var rijen = lijst.map(function (d) {
      return '<tr>' +
        '<td class="truncate max-w-xs" title="' + esc(d.filename) + '">' + esc(d.filename) + '</td>' +
        '<td class="whitespace-nowrap text-xs opacity-60">' + esc(leesbareDatum(d.created_at)) + '</td>' +
        '<td class="whitespace-nowrap text-xs opacity-60">' + esc(leesbareGrootte(d.bytes)) + '</td>' +
        '<td class="text-right whitespace-nowrap">' +
          '<a class="btn btn-ghost btn-xs" href="/forminator-v2/api/generated-documents/' + esc(d.id) + '/download" target="_blank" rel="noopener">' +
            '<i data-lucide="download" class="w-3.5 h-3.5"></i></a>' +
          '<button type="button" class="btn btn-ghost btn-xs text-error" data-action="doc-delete" data-id="' + esc(d.id) + '">' +
            '<i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>' +
        '</td>' +
      '</tr>';
    }).join('');

    el.innerHTML =
      '<div class="flex items-center justify-between mb-4">' +
        '<span class="text-xs text-base-content/50">' + lijst.length + ' document' + (lijst.length === 1 ? '' : 'en') + '</span>' +
        '<div class="flex items-center gap-2">' +
          '<span class="text-xs text-base-content/50">Ouder dan</span>' +
          '<input type="number" min="0" id="docCleanupDagen" class="input input-bordered input-xs w-16" value="90">' +
          '<span class="text-xs text-base-content/50">dagen opruimen</span>' +
          '<button type="button" class="btn btn-xs btn-outline" data-action="doc-cleanup">Opruimen</button>' +
        '</div>' +
      '</div>' +
      (lijst.length
        ? '<div class="overflow-x-auto"><table class="table table-sm">' +
            '<thead><tr><th>Bestand</th><th>Aangemaakt</th><th>Grootte</th><th></th></tr></thead>' +
            '<tbody>' + rijen + '</tbody>' +
          '</table></div>'
        : '<div class="text-sm text-base-content/40 py-4">Nog geen gegenereerde documenten voor deze koppeling.</div>');

    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons({ context: el });
  }

  async function verwijderDocument(id) {
    if (!window.confirm('Dit document verwijderen? Dit kan niet ongedaan gemaakt worden.')) return;
    try {
      await window.FSV2.api('/generated-documents/' + id, { method: 'DELETE' });
      window.FSV2.showAlert('Document verwijderd.', 'success');
      renderDetailDocuments();
    } catch (err) {
      window.FSV2.showAlert('Verwijderen mislukt: ' + err.message, 'error');
    }
  }

  async function ruimOp() {
    var integrationId = S().activeId;
    if (!integrationId) return;
    var dagenEl = document.getElementById('docCleanupDagen');
    var dagen = dagenEl ? Number(dagenEl.value) : NaN;
    if (!Number.isFinite(dagen) || dagen < 0) {
      window.FSV2.showAlert('Vul een geldig aantal dagen in.', 'error');
      return;
    }
    if (!window.confirm('Alle documenten van deze koppeling ouder dan ' + dagen + ' dagen verwijderen?')) return;
    try {
      var res = await window.FSV2.api('/integrations/' + integrationId + '/generated-documents/cleanup', {
        method: 'POST',
        body: JSON.stringify({ older_than_days: dagen })
      });
      var aantal = (res && res.data && res.data.verwijderd) || 0;
      window.FSV2.showAlert(aantal + ' document' + (aantal === 1 ? '' : 'en') + ' opgeruimd.', 'success');
      renderDetailDocuments();
    } catch (err) {
      window.FSV2.showAlert('Opruimen mislukt: ' + err.message, 'error');
    }
  }

  document.addEventListener('click', function (e) {
    var delKnop = e.target.closest('[data-action="doc-delete"]');
    if (delKnop) { verwijderDocument(delKnop.dataset.id); return; }
    var cleanupKnop = e.target.closest('[data-action="doc-cleanup"]');
    if (cleanupKnop) { ruimOp(); return; }
  });

  Object.assign(window.FSV2, {
    renderDetailDocuments: renderDetailDocuments
  });
})();
