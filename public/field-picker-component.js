/**
 * OpenVME Field Picker Component
 *
 * Reusable searchable combobox for Odoo field selection.
 * Exposes: window.OpenVME.FieldPicker.{ render, closeAll, filterList, setValue }
 *
 * Dependencies: none (standalone)
 */
(function () {
  'use strict';

  // ── Private escape helper (same logic as FSV2 core) ──────────────────────
  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // ── closeAll ─────────────────────────────────────────────────────────────
  function closeAll() {
    document.querySelectorAll('.fsp-panel:not(.hidden)').forEach(function (p) {
      p.classList.add('hidden');
    });
  }

  // ── filterList ───────────────────────────────────────────────────────────
  function filterList(fspId, query) {
    var list = document.getElementById('fsp-list-' + fspId);
    if (!list) return;
    var q = (query || '').toLowerCase().trim();
    list.querySelectorAll('.fsp-item').forEach(function (li) {
      var name  = (li.dataset.fspName  || '').toLowerCase();
      var label = (li.dataset.fspLabel || '').toLowerCase();
      li.style.display = (!q || name.includes(q) || label.includes(q)) ? '' : 'none';
    });
  }

  // ── setValue ─────────────────────────────────────────────────────────────
  function setValue(fspId, name, label) {
    var valEl  = document.getElementById('fsp-val-' + fspId);
    var dispEl = document.querySelector('#fsp-' + fspId + ' .fsp-display');
    var panel  = document.getElementById('fsp-panel-' + fspId);
    if (valEl) {
      valEl.value = name;
      valEl.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (dispEl) {
      dispEl.textContent = name ? (label || name) : '— kies veld —';
      if (name) { dispEl.classList.remove('text-base-content/50', 'italic'); }
      else      { dispEl.classList.add('text-base-content/50', 'italic'); }
    }
    if (panel) panel.classList.add('hidden');
  }

  // ── render ────────────────────────────────────────────────────────────────
  /**
   * Renders a custom searchable field picker.
   * @param {string} id           - Unique ID for this picker instance.
   * @param {string} inputName    - name attr for the hidden value input ('--unused--' = no name).
   * @param {Array}  allFields    - [{name, label, type}] from Odoo fields cache.
   * @param {string} selectedName - Currently selected field name (or empty string).
   * @returns {string} HTML string
   */
  function render(id, inputName, allFields, selectedName) {
    var sf      = allFields.find(function (f) { return f.name === selectedName; });
    var selLbl  = sf ? (sf.label || sf.name) : (selectedName || '');
    var isEmpty = !selectedName;

    var items = allFields.map(function (f) {
      var isSel = f.name === selectedName;
      return '<li class="fsp-item flex items-center justify-between gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-base-200' +
        (isSel ? ' bg-primary/10 font-semibold' : '') + '"' +
        ' data-fsp-id="' + esc(id) + '" data-fsp-name="' + esc(f.name) + '" data-fsp-label="' + esc(f.label || f.name) + '">' +
        '<div class="min-w-0 truncate">' +
          '<span class="font-medium">' + esc(f.label || f.name) + '</span>' +
          '<span class="font-mono text-xs text-base-content/40 ml-1.5">' + esc(f.name) + '</span>' +
        '</div>' +
        '<span class="badge badge-ghost badge-xs shrink-0">' + esc(f.type || '') + '</span>' +
        '</li>';
    }).join('');

    return (
      '<div class="fsp-wrap relative w-full" id="fsp-' + esc(id) + '">' +
        '<button type="button"' +
          ' class="input input-bordered input-sm w-full flex items-center gap-2 cursor-pointer fsp-trigger text-left"' +
          ' data-fsp-id="' + esc(id) + '">' +
          '<span class="fsp-display flex-1 text-sm truncate' + (isEmpty ? ' text-base-content/50 italic' : '') + '">' +
            esc(isEmpty ? '— kies veld —' : selLbl) +
          '</span>' +
          '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0 opacity-40"><path d="m6 9 6 6 6-6"/></svg>' +
        '</button>' +
        '<input type="hidden"' +
          (inputName !== '--unused--' ? ' name="' + esc(inputName) + '"' : '') +
          ' id="fsp-val-' + esc(id) + '" value="' + esc(selectedName || '') + '" />' +
        '<div class="fsp-panel rounded-lg shadow-xl bg-base-100 border border-base-300 hidden"' +
          ' id="fsp-panel-' + esc(id) + '" data-fsp-panel-id="' + esc(id) + '" style="position:fixed;z-index:9999;min-width:420px;overflow:hidden;">' +
          '<div class="p-2 border-b border-base-200 bg-base-100 sticky top-0">' +
            '<input class="input input-sm input-bordered w-full fsp-search"' +
              ' data-fsp-id="' + esc(id) + '" placeholder="Zoeken op veldnaam of label…" autocomplete="off" />' +
          '</div>' +
          '<ul class="overflow-y-auto overflow-x-hidden" style="max-height:220px;" id="fsp-list-' + esc(id) + '">' +
            '<li class="fsp-item px-3 py-2 text-sm cursor-pointer hover:bg-base-200 text-base-content/50 italic"' +
              ' data-fsp-id="' + esc(id) + '" data-fsp-name="" data-fsp-label="">— niet koppelen —</li>' +
            items +
          '</ul>' +
        '</div>' +
      '</div>'
    );
  }

  // ── Export ────────────────────────────────────────────────────────────────
  window.OpenVME = window.OpenVME || {};
  window.OpenVME.FieldPicker = {
    render:     render,
    closeAll:   closeAll,
    filterList: filterList,
    setValue:   setValue,
  };

}());
