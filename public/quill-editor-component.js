(function () {
  const STYLE_ID = 'eo-quill-component-styles';

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      .eo-quill-card {
        border: 1px solid oklch(var(--bc) / 0.18);
        border-radius: var(--rounded-box, 0.6rem);
        overflow: visible;
        background: oklch(var(--b1));
      }

      .eo-quill-card > .ql-toolbar.ql-snow {
        border: 0 !important;
        border-bottom: 1px solid oklch(var(--bc) / 0.16) !important;
        border-top-left-radius: var(--rounded-box, 0.6rem);
        border-top-right-radius: var(--rounded-box, 0.6rem);
        padding: 0.22rem 0.3rem !important;
        background: oklch(var(--b1));
        background-clip: padding-box;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.35rem;
        position: relative;
        z-index: 40;
        overflow: visible;
      }

      .eo-quill-toolbar-left {
        display: flex;
        align-items: center;
        flex-wrap: nowrap;
        flex: 1;
        min-width: 0;
      }

      .eo-quill-toolbar-left .ql-formats {
        position: relative;
        display: inline-flex;
        align-items: center;
        padding-right: 0.32rem;
        margin-right: 0.24rem !important;
      }

      .eo-quill-toolbar-left .ql-formats:not(:last-child)::after {
        content: '';
        position: absolute;
        right: 0;
        top: 0.16rem;
        bottom: 0.16rem;
        width: 1px;
        background: oklch(var(--bc) / 0.16);
      }

      .eo-quill-card > .ql-container.ql-snow {
        border: 0 !important;
        background: oklch(var(--b1));
        position: relative;
        z-index: 10;
        overflow: hidden;
        border-radius: 0 0 var(--rounded-box, 0.6rem) var(--rounded-box, 0.6rem);
      }

      .eo-quill-card .ql-picker-options,
      .eo-quill-card .ql-tooltip {
        z-index: 80;
      }

      .eo-quill-card .ql-editor {
        min-height: 9.5rem;
        padding: 0.65rem 0.75rem;
        line-height: 1.45;
        border-radius: 0 0 var(--rounded-box, 0.6rem) var(--rounded-box, 0.6rem);
        overflow: hidden;
      }

      .eo-quill-card .ql-snow .ql-formats {
        margin-right: 0.22rem !important;
      }

      .eo-quill-card .ql-snow button:not(.eo-quill-save-btn),
      .eo-quill-card .ql-snow .ql-picker {
        opacity: 0.84;
      }

      .eo-quill-card .ql-snow button:not(.eo-quill-save-btn) {
        width: 1.35rem !important;
        height: 1.35rem !important;
        padding: 0.08rem !important;
      }

      .eo-quill-card .ql-snow button:not(.eo-quill-save-btn),
      .eo-quill-card .ql-snow .ql-picker-label {
        border-radius: var(--rounded-btn, 0.5rem) !important;
        color: oklch(var(--bc) / 0.78) !important;
        transition: background-color 120ms ease, color 120ms ease;
      }

      .eo-quill-card .ql-snow button:not(.eo-quill-save-btn):hover,
      .eo-quill-card .ql-snow button:not(.eo-quill-save-btn):focus-visible,
      .eo-quill-card .ql-snow .ql-picker-label:hover,
      .eo-quill-card .ql-snow .ql-picker.ql-expanded .ql-picker-label {
        background: oklch(var(--p) / 0.14) !important;
        color: oklch(var(--p)) !important;
      }

      .eo-quill-card .ql-snow button:not(.eo-quill-save-btn).ql-active,
      .eo-quill-card .ql-snow .ql-picker-label.ql-active {
        background: oklch(var(--p)) !important;
        color: oklch(var(--pc)) !important;
      }

      .eo-quill-card .ql-snow .ql-stroke {
        stroke: currentColor !important;
      }

      .eo-quill-card .ql-snow .ql-fill {
        fill: currentColor !important;
      }

      .eo-quill-card .ql-snow .ql-picker-options {
        background: oklch(var(--b1)) !important;
        border-color: oklch(var(--bc) / 0.2) !important;
      }

      .eo-quill-card .ql-snow .ql-picker-item {
        color: oklch(var(--bc) / 0.82) !important;
      }

      .eo-quill-card .ql-snow .ql-picker-item:hover {
        background: oklch(var(--p) / 0.14) !important;
        color: oklch(var(--p)) !important;
      }

      .eo-quill-card .ql-snow .ql-picker-item.ql-selected {
        color: oklch(var(--p)) !important;
      }

      .eo-quill-card .ql-snow .ql-picker {
        font-size: 0.72rem !important;
      }

      .eo-quill-card .ql-snow .ql-picker.ql-header {
        width: 4.9rem !important;
      }

      .eo-quill-save-btn {
        width: 1.8rem !important;
        height: 1.8rem !important;
        min-width: 1.8rem !important;
        min-height: 1.8rem !important;
        max-width: 1.8rem !important;
        max-height: 1.8rem !important;
        padding: 0 !important;
        font-size: 0;
        line-height: 0;
        flex-shrink: 0;
        margin-left: auto;
        border-radius: var(--rounded-btn, 0.5rem) !important;
        display: inline-flex !important;
        align-items: center !important;
        justify-content: center !important;
        box-sizing: border-box;
      }

      .eo-quill-save-btn svg,
      .eo-quill-save-btn i {
        display: block;
        width: 0.9rem !important;
        height: 0.9rem !important;
        margin: 0 !important;
      }

      .eo-quill-save-btn .eo-save-icon {
        display: block;
        width: 0.9rem;
        height: 0.9rem;
        pointer-events: none;
      }

      .eo-quill-save-btn.is-clean {
        background-color: oklch(var(--b3)) !important;
        border-color: oklch(var(--bc) / 0.12) !important;
        color: oklch(var(--bc) / 0.45) !important;
      }

      .eo-quill-save-btn.is-dirty {
        background-color: oklch(var(--p)) !important;
        border-color: oklch(var(--p)) !important;
        color: oklch(var(--pc)) !important;
      }

      .eo-quill-save-btn.is-saving {
        opacity: 0.75;
        cursor: wait;
      }

      .eo-quill-save-btn:disabled {
        opacity: 1;
        cursor: default;
      }

      .eo-quill-divider {
        width: 1px;
        height: 1.15rem;
        background: oklch(var(--bc) / 0.16);
        margin: 0 0.35rem 0 0.2rem;
        flex-shrink: 0;
      }
    `;

    document.head.appendChild(style);
  }

  function normalizeHtml(html) {
    const raw = String(html || '').trim();
    return raw === '<p><br></p>' ? '' : raw;
  }

  function convertQuillListsToSemantic(html) {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = html || '';

    wrapper.querySelectorAll('ol').forEach((ol) => {
      const children = Array.from(ol.children).filter((node) => node.tagName === 'LI');
      if (children.length === 0) return;

      const fragment = document.createDocumentFragment();
      let currentList = null;
      let currentType = null;

      for (const li of children) {
        const listType = li.getAttribute('data-list') === 'bullet' ? 'ul' : 'ol';
        if (currentType !== listType) {
          currentType = listType;
          currentList = document.createElement(listType);
          fragment.appendChild(currentList);
        }

        const clonedLi = li.cloneNode(true);
        clonedLi.removeAttribute('data-list');
        currentList.appendChild(clonedLi);
      }

      if (fragment.childNodes.length > 0) {
        ol.replaceWith(fragment);
      }
    });

    return wrapper.innerHTML;
  }

  function exportHtml(html) {
    return convertQuillListsToSemantic(normalizeHtml(html));
  }

  function setToolbarTitles(toolbar) {
    const setTitle = (selector, title) => {
      toolbar.querySelectorAll(selector).forEach((el) => {
        el.setAttribute('title', title);
        el.setAttribute('aria-label', title);
      });
    };

    setTitle('.ql-header', 'Kopstijl');
    setTitle('button.ql-bold', 'Vet');
    setTitle('button.ql-italic', 'Cursief');
    setTitle('button.ql-underline', 'Onderlijnen');
    setTitle('button.ql-list[value="ordered"]', 'Genummerde lijst');
    setTitle('button.ql-list[value="bullet"]', 'Opsomming');
    setTitle('.ql-align', 'Uitlijning');
    setTitle('button.ql-link', 'Link invoegen');
    setTitle('button.ql-image', 'Afbeelding invoegen');
  }

  function create(options) {
    ensureStyles();

    const {
      target,
      initialHtml = '',
      readOnly = false,
      placeholder = '',
      toolbar = [],
      onSave = null,
      saveTooltip = 'Opslaan'
    } = options || {};

    const host = typeof target === 'string' ? document.querySelector(target) : target;
    if (!host || typeof Quill === 'undefined') return null;

    let card = host.parentElement;
    if (!card || !card.classList.contains('eo-quill-card')) {
      card = document.createElement('div');
      card.className = 'eo-quill-card';
      host.parentNode.insertBefore(card, host);
      card.appendChild(host);
    }

    card.querySelectorAll(':scope > .ql-toolbar').forEach((node) => node.remove());
    host.innerHTML = '';

    const quill = new Quill(host, {
      theme: 'snow',
      readOnly,
      placeholder,
      modules: {
        toolbar: readOnly ? false : toolbar
      }
    });

    quill.root.innerHTML = initialHtml || '';

    let lastSaved = exportHtml(quill.root.innerHTML);
    let saveBtn = null;

    const updateSaveState = () => {
      if (!saveBtn) return;
      const current = normalizeHtml(quill.root.innerHTML);
      const exported = exportHtml(current);
      const dirtyExport = exported !== lastSaved;
      saveBtn.disabled = !dirtyExport;
      saveBtn.classList.toggle('is-dirty', dirtyExport);
      saveBtn.classList.toggle('is-clean', !dirtyExport);
    };

    const toolbarModule = quill.getModule('toolbar');
    if (toolbarModule && toolbarModule.container) {
      const toolbarEl = toolbarModule.container;
      card.insertBefore(toolbarEl, host);

      const left = document.createElement('div');
      left.className = 'eo-quill-toolbar-left';
      while (toolbarEl.firstChild) {
        left.appendChild(toolbarEl.firstChild);
      }
      toolbarEl.appendChild(left);

      setToolbarTitles(toolbarEl);

      if (!readOnly && typeof onSave === 'function') {
        saveBtn = document.createElement('button');
        saveBtn.type = 'button';
        saveBtn.className = 'btn btn-xs eo-quill-save-btn is-clean';
        saveBtn.innerHTML = '<svg class="eo-save-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M19 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h11.586a1 1 0 0 1 .707.293l2.414 2.414A1 1 0 0 1 20 6.414V20a1 1 0 0 1-1 1Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M17 21V13H7v8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M7 3v5h8" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        saveBtn.setAttribute('title', saveTooltip);
        saveBtn.setAttribute('aria-label', saveTooltip);
        saveBtn.disabled = true;

        saveBtn.addEventListener('click', async () => {
          if (saveBtn.disabled) return;
          saveBtn.classList.add('is-saving');
          try {
            await onSave(exportHtml(quill.root.innerHTML));
            lastSaved = exportHtml(quill.root.innerHTML);
          } finally {
            saveBtn.classList.remove('is-saving');
            updateSaveState();
          }
        });

        const divider = document.createElement('span');
        divider.className = 'eo-quill-divider';
        toolbarEl.appendChild(divider);
        toolbarEl.appendChild(saveBtn);
      }
    }

    if (!readOnly && saveBtn) {
      quill.on('text-change', updateSaveState);
      updateSaveState();
    }

    return {
      quill,
      getHTML: () => exportHtml(quill.root.innerHTML),
      setHTML: (html, markSaved = true) => {
        quill.root.innerHTML = html || '';
        if (markSaved) {
          lastSaved = exportHtml(quill.root.innerHTML);
        }
        updateSaveState();
      },
      markSaved: () => {
        lastSaved = exportHtml(quill.root.innerHTML);
        updateSaveState();
      },
      getExportHTML: () => exportHtml(quill.root.innerHTML)
    };
  }

  window.EOQuill = { create };
})();
