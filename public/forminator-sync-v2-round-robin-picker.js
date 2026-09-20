/**
 * Koppelingen — round-robin-poulekiezer voor een mapping (source_type
 * 'round_robin_pool'). Kiest een poule hr.employee + kiesmodus (om de beurt /
 * minste actieve objecten) voor ÉÉN celwaarde in de gewone MappingTable — dus
 * een losse <dialog> i.p.v. een volledig composer-paneel (zoals bij
 * create_activity's eigen round-robin-poule): dit moet vanuit één rij in de
 * tabel te openen zijn zonder de tabel te vervangen.
 *
 * Eigen bestand, zelfde afspraak als de rest van de module (export via
 * window.FSV2.*, cross-file calls altijd als window.FSV2.naam()). Structuur
 * gespiegeld op forminator-sync-v2-mail-attachments.js: module-eigen picker-
 * toestand, één <dialog> die aan <body> hangt, één gedelegeerde listener op
 * document (een dialoog buiten de composerkaart wordt door een listener op de
 * kaart zelf niet gezien).
 */
(function () {
  'use strict';

  function esc(v) { return window.FSV2.esc(v); }

  var picker = { odooField: null, current: null, onSave: null, employees: null, bezig: false };

  function pickerDialog() {
    var dlg = document.getElementById('roundRobinPicker');
    if (dlg) return dlg;
    dlg = document.createElement('dialog');
    dlg.id = 'roundRobinPicker';
    dlg.className = 'modal';
    dlg.innerHTML = `
      <div class="modal-box max-w-md">
        <h3 class="font-bold text-lg mb-1">Round robin</h3>
        <p class="text-xs text-base-content/60 mb-3">
          Kies de medewerkers in de poule en hoe de pipeline er bij elke inzending één uit kiest.
        </p>
        <div id="roundRobinPickerBody" class="min-h-[8rem]"></div>
        <div class="modal-action">
          <button type="button" class="btn btn-sm" data-rrp-action="close">Annuleren</button>
          <button type="button" class="btn btn-sm btn-primary" data-rrp-action="save">Opslaan</button>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop"><button>close</button></form>
    `;
    document.body.appendChild(dlg);
    return dlg;
  }

  /**
   * @param {Object} opts
   * @param {string} opts.odooField - enkel voor context/logging, geen gedrag.
   * @param {{pool:number[], mode:string}} [opts.current] - huidige waarde bij bewerken.
   * @param {function({pool:number[], mode:string})} opts.onSave
   */
  async function open(opts) {
    picker.odooField = opts.odooField || '';
    picker.current = {
      pool: (opts.current && Array.isArray(opts.current.pool)) ? opts.current.pool : [],
      mode: (opts.current && opts.current.mode) || 'rotation',
    };
    picker.onSave = typeof opts.onSave === 'function' ? opts.onSave : function () {};

    var dlg = pickerDialog();
    dlg.showModal();

    if (!picker.employees) {
      picker.bezig = true;
      teken();
      try {
        var res = await window.FSV2.api('/odoo/employees');
        picker.employees = res.data || [];
      } catch (err) {
        picker.employees = [];
        window.FSV2.showAlert('Kon medewerkers niet laden: ' + err.message, 'error');
      }
      picker.bezig = false;
    }
    teken();
  }

  function teken() {
    var body = document.getElementById('roundRobinPickerBody');
    if (!body) return;
    if (picker.bezig) {
      body.innerHTML = '<div class="text-sm text-base-content/40 py-8 text-center">Laden…</div>';
      return;
    }

    var employees = picker.employees || [];
    var pool = picker.current.pool || [];
    var lijst = !employees.length
      ? '<div class="px-3 py-2 text-xs text-base-content/40">Geen medewerkers gevonden.</div>'
      : employees.map(function (e) {
          var aan = pool.indexOf(e.id) !== -1;
          return `<label class="flex items-center gap-2 px-3 py-1.5 cursor-pointer hover:bg-base-200/40">
            <input type="checkbox" class="checkbox checkbox-xs" data-rrp-emp value="${esc(String(e.id))}"${aan ? ' checked' : ''}>
            <span class="text-sm">${esc(e.name)}</span>
          </label>`;
        }).join('');

    var mode = picker.current.mode || 'rotation';
    body.innerHTML = `
      <div class="border border-base-200 rounded-lg divide-y divide-base-200 max-h-48 overflow-y-auto mb-3">
        ${lijst}
      </div>
      <div class="form-control gap-1">
        <label class="flex items-center gap-2 cursor-pointer">
          <input type="radio" name="rrp-mode" class="radio radio-xs" value="rotation"${mode === 'rotation' ? ' checked' : ''}>
          <span class="text-sm">Om de beurt</span>
        </label>
        <label class="flex items-center gap-2 cursor-pointer">
          <input type="radio" name="rrp-mode" class="radio radio-xs" value="least_active"${mode === 'least_active' ? ' checked' : ''}>
          <span class="text-sm">Met de minste actieve objecten</span>
        </label>
      </div>
    `;
  }

  function opslaan() {
    var dlg = document.getElementById('roundRobinPicker');
    if (!dlg) return;
    var pool = [];
    dlg.querySelectorAll('[data-rrp-emp]:checked').forEach(function (cb) {
      pool.push(parseInt(cb.value, 10));
    });
    if (!pool.length) {
      window.FSV2.showAlert('Kies minstens één medewerker voor de poule.', 'error');
      return;
    }
    var modeEl = dlg.querySelector('input[name="rrp-mode"]:checked');
    var mode = modeEl ? modeEl.value : 'rotation';
    picker.onSave({ pool: pool, mode: mode });
    dlg.close();
  }

  document.addEventListener('click', function (e) {
    var knop = e.target.closest('[data-rrp-action]');
    if (!knop) return;
    var actie = knop.dataset.rrpAction;
    if (actie === 'close') {
      var d = document.getElementById('roundRobinPicker');
      if (d) d.close();
      return;
    }
    if (actie === 'save') { opslaan(); return; }
  });

  window.FSV2 = Object.assign(window.FSV2 || {}, {
    RoundRobinPicker: { open: open }
  });
})();
