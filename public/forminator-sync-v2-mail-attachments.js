/**
 * Koppelingen — bijlagen kiezen voor de send_mail-stap.
 *
 * DE STAP BEWAART EEN VERWIJZING, NIET HET BESTAND. Je kiest hier een bestand
 * uit de Asset Manager; de koppeling onthoudt alleen de sleutel. Vervang je
 * dat bestand later in de Asset Manager (zelfde naam, "overschrijven" aan),
 * dan dragen de volgende mails vanzelf de nieuwe versie -- er is niets in deze
 * stap dat dan bijgewerkt moet worden. Daarom staat er bij elke bijlage een
 * "Vervangen in Asset Manager"-link en NERGENS een uploadveld hier: uploaden
 * op twee plekken betekent onvermijdelijk twee bestanden waarvan er één
 * veroudert.
 *
 * Eigen bestand omdat -detail-mail-composer.js al 455 regels is; zelfde
 * afspraak als de rest van de module (export via window.FSV2.*, cross-file
 * calls altijd als window.FSV2.naam()).
 */
(function () {
  'use strict';

  function esc(v) { return window.FSV2.esc(v); }

  /** Moet gelijk lopen met MAX_MAIL_ATTACHMENTS / _BYTES in mail-attachments.js. */
  var MAX_FILES = 5;
  var MAX_TOTAL_BYTES = 7 * 1024 * 1024;

  // ─── Toestand ─────────────────────────────────────────────────────────────

  function store() {
    if (!window.FSV2._mailAttachments) window.FSV2._mailAttachments = {};
    return window.FSV2._mailAttachments;
  }

  /** De gekozen bijlagen van een stap, als [{key, name, bytes, missing}]. */
  function getMailAttachments(tid) {
    return store()[String(tid)] || [];
  }

  /** Wat er naar de server gaat: alleen key + name, nooit bytes of status. */
  function mailAttachmentsPayload(tid) {
    return getMailAttachments(tid).map(function (a) {
      return { key: a.key, name: a.name };
    });
  }

  function setMailAttachments(tid, lijst) {
    store()[String(tid)] = lijst;
    hertekenLijst(tid);
  }

  /**
   * De toestand vullen uit de opgeslagen stap. `bytes`/`missing` zijn nog
   * onbekend -- die komen uit het voorbeeld (mail-preview geeft ze mee).
   */
  function initMailAttachments(tid, target) {
    var ruw = (target && Array.isArray(target.mail_attachments)) ? target.mail_attachments : [];
    store()[String(tid)] = ruw.map(function (a) {
      return {
        key: String((a && a.key) || ''),
        name: String((a && a.name) || '').trim() || String((a && a.key) || '').split('/').pop(),
        bytes: null,
        missing: false
      };
    }).filter(function (a) { return a.key !== ''; });
  }

  /**
   * Wat het voorbeeld terugmeldde over de bestanden erin verwerken -- vooral
   * `missing`: zo zie je in de editor al dat een bestand weg is, in plaats van
   * pas bij een mislukte indiening.
   */
  function applyMailAttachmentStatus(tid, gemeld) {
    if (!Array.isArray(gemeld) || gemeld.length === 0) return;
    var perKey = {};
    gemeld.forEach(function (g) { perKey[g.key] = g; });
    setMailAttachments(tid, getMailAttachments(tid).map(function (a) {
      var g = perKey[a.key];
      if (!g) return a;
      return { key: a.key, name: a.name, bytes: g.bytes, missing: !!g.missing };
    }));
  }

  // ─── Weergave ─────────────────────────────────────────────────────────────

  function leesbareGrootte(bytes) {
    if (bytes == null) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' kB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  }

  function totaalBytes(tid) {
    return getMailAttachments(tid).reduce(function (som, a) { return som + (a.bytes || 0); }, 0);
  }

  /** De sectie in de composer. Wordt één keer meegerenderd; de lijst erin ververst apart. */
  function renderMailAttachmentsSection(tid) {
    return `
      <div class="form-control mb-3">
        <label class="label pt-0 pb-1 flex items-center justify-between">
          <span class="label-text text-sm font-medium">Bijlagen</span>
          <span class="flex items-center gap-2">
            <a href="/assets" target="_blank" rel="noopener"
               class="text-xs link link-hover text-base-content/60">Asset Manager openen</a>
            <button type="button" class="btn btn-xs" data-mailatt-action="open-picker" data-tid="${esc(tid)}">
              Bestand kiezen…
            </button>
          </span>
        </label>
        <div id="mailAttachments-${esc(tid)}">${lijstHtml(tid)}</div>
        <label class="label pt-1 pb-0">
          <span class="label-text-alt text-base-content/50">
            De bijlage is een verwijzing naar het bestand in de Asset Manager, geen kopie.
            Vervang je het bestand daar, dan sturen de volgende mails vanzelf de nieuwe versie mee —
            al verstuurde mails houden de versie die ze toen hadden.
            Maximaal ${MAX_FILES} bijlagen en samen ${(MAX_TOTAL_BYTES / 1024 / 1024).toFixed(0)} MB.
          </span>
        </label>
      </div>
    `;
  }

  function lijstHtml(tid) {
    var lijst = getMailAttachments(tid);
    if (lijst.length === 0) {
      return `<div class="text-xs text-base-content/40 border border-dashed border-base-300 rounded-lg px-3 py-2">
        Geen bijlagen. De mail vertrekt met alleen de tekst.
      </div>`;
    }
    var teGroot = totaalBytes(tid) > MAX_TOTAL_BYTES;
    var rijen = lijst.map(function (a, i) {
      return `
        <div class="flex items-center gap-2 px-2 py-1.5 ${i > 0 ? 'border-t border-base-200' : ''}">
          <span class="text-base-content/40">
            ${a.missing
              ? '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-error"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
              : '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>'}
          </span>
          <input type="text" class="input input-bordered input-xs flex-1 min-w-0"
                 value="${esc(a.name)}" data-mailatt-name="${esc(tid)}" data-index="${i}"
                 title="De bestandsnaam die de ontvanger ziet">
          <span class="text-xs text-base-content/40 whitespace-nowrap">${esc(leesbareGrootte(a.bytes))}</span>
          <a href="/assets" target="_blank" rel="noopener"
             class="text-xs link link-hover text-base-content/50 whitespace-nowrap"
             title="${esc(a.key)}">Vervangen</a>
          <button type="button" class="btn btn-ghost btn-xs text-error"
                  data-mailatt-action="remove" data-tid="${esc(tid)}" data-index="${i}">Weg</button>
        </div>`;
    }).join('');

    var waarschuwing = '';
    if (lijst.some(function (a) { return a.missing; })) {
      waarschuwing = `<div class="alert alert-error py-2 text-xs mt-2">
        <span>Een bijlage staat niet meer in de Asset Manager. Zet het bestand terug of haal de bijlage weg —
        zolang dit zo staat, wordt er voor deze stap geen mail klaargezet.</span>
      </div>`;
    } else if (teGroot) {
      waarschuwing = `<div class="alert alert-warning py-2 text-xs mt-2">
        <span>De bijlagen zijn samen ${esc(leesbareGrootte(totaalBytes(tid)))}; boven
        ${(MAX_TOTAL_BYTES / 1024 / 1024).toFixed(0)} MB weigert de mailserver het bericht.</span>
      </div>`;
    }

    return `<div class="border border-base-200 rounded-lg divide-base-200">${rijen}</div>${waarschuwing}`;
  }

  function hertekenLijst(tid) {
    var el = document.getElementById('mailAttachments-' + tid);
    if (el) el.innerHTML = lijstHtml(tid);
  }

  // ─── Kiezer ───────────────────────────────────────────────────────────────

  var picker = { tid: null, prefix: '', data: null, bezig: false };

  function pickerDialog() {
    var dlg = document.getElementById('mailAttachmentPicker');
    if (dlg) return dlg;
    dlg = document.createElement('dialog');
    dlg.id = 'mailAttachmentPicker';
    dlg.className = 'modal';
    dlg.innerHTML = `
      <div class="modal-box max-w-2xl">
        <h3 class="font-bold text-lg mb-1">Bijlage kiezen</h3>
        <p class="text-xs text-base-content/60 mb-3">
          Uit de Asset Manager. Uploaden en vervangen doe je daar —
          <a href="/assets" target="_blank" rel="noopener" class="link">Asset Manager openen</a>.
        </p>
        <div id="mailAttachmentPickerBody" class="min-h-[12rem]"></div>
        <div class="modal-action">
          <button type="button" class="btn btn-sm" data-mailatt-action="close-picker">Sluiten</button>
        </div>
      </div>
      <form method="dialog" class="modal-backdrop"><button>close</button></form>
    `;
    document.body.appendChild(dlg);
    return dlg;
  }

  async function openMailAttachmentPicker(tid) {
    picker.tid = String(tid);
    picker.prefix = '';
    var dlg = pickerDialog();
    dlg.showModal();
    await laadMap('');
  }

  async function laadMap(prefix) {
    picker.prefix = prefix;
    picker.bezig = true;
    tekenPicker();
    try {
      var res = await window.FSV2.api('/mail-assets?prefix=' + encodeURIComponent(prefix));
      picker.data = res.data;
    } catch (err) {
      picker.data = { error: err.message };
    }
    picker.bezig = false;
    tekenPicker();
  }

  function kruimelpad(prefix) {
    var delen = String(prefix || '').split('/').filter(Boolean);
    var stukken = ['<button type="button" class="link link-hover" data-mailatt-action="goto" data-prefix="">Alle mappen</button>'];
    var pad = '';
    delen.forEach(function (deel) {
      pad += deel + '/';
      stukken.push(`<button type="button" class="link link-hover" data-mailatt-action="goto" data-prefix="${esc(pad)}">${esc(deel)}</button>`);
    });
    return stukken.join('<span class="text-base-content/30 mx-1">/</span>');
  }

  function tekenPicker() {
    var body = document.getElementById('mailAttachmentPickerBody');
    if (!body) return;
    if (picker.bezig) {
      body.innerHTML = '<div class="text-sm text-base-content/40 py-8 text-center">Laden…</div>';
      return;
    }
    var d = picker.data || {};
    if (d.error) {
      body.innerHTML = `<div class="alert alert-error py-2 text-sm"><span>${esc(d.error)}</span></div>`;
      return;
    }
    if (d.readable === false) {
      body.innerHTML = `<div class="alert alert-warning py-2 text-sm"><span>
        Je hebt geen leesrechten in de Asset Manager. Vraag een beheerder om de rol
        <code>asset_manager</code>, of zet het bestand in je eigen map.
      </span></div>`;
      return;
    }

    var mappen = (d.folders || []).map(function (f) {
      return `<button type="button" class="flex items-center gap-2 w-full text-left px-3 py-2 hover:bg-base-200 rounded-lg"
                      data-mailatt-action="goto" data-prefix="${esc(f.prefix)}">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="text-base-content/40"><path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/></svg>
        <span class="text-sm">${esc(f.name)}</span>
      </button>`;
    }).join('');

    var gekozen = {};
    getMailAttachments(picker.tid).forEach(function (a) { gekozen[a.key] = true; });

    var bestanden = (d.files || []).map(function (f) {
      var al = !!gekozen[f.key];
      return `<div class="flex items-center gap-2 px-3 py-2 hover:bg-base-200 rounded-lg">
        <span class="text-sm flex-1 min-w-0 truncate" title="${esc(f.key)}">${esc(f.name)}</span>
        <span class="text-xs text-base-content/40 whitespace-nowrap">${esc(leesbareGrootte(f.size))}</span>
        <a href="${esc(f.url)}" target="_blank" rel="noopener" class="text-xs link link-hover text-base-content/50">Bekijk</a>
        <button type="button" class="btn btn-xs ${al ? 'btn-disabled' : 'btn-primary'}"
                ${al ? 'disabled' : ''}
                data-mailatt-action="pick" data-key="${esc(f.key)}" data-name="${esc(f.name)}"
                data-size="${esc(String(f.size || 0))}">${al ? 'Gekozen' : 'Kies'}</button>
      </div>`;
    }).join('');

    var leeg = (!mappen && !bestanden)
      ? '<div class="text-sm text-base-content/40 py-8 text-center">Deze map is leeg.</div>' : '';

    body.innerHTML = `
      <div class="text-xs text-base-content/60 mb-2">${kruimelpad(d.prefix || '')}</div>
      <div class="max-h-80 overflow-y-auto border border-base-200 rounded-lg p-1">
        ${mappen}${bestanden}${leeg}
      </div>
      ${d.truncated ? '<p class="text-xs text-base-content/40 mt-2">Niet alles wordt getoond — open een submap.</p>' : ''}
    `;
  }

  function kiesBestand(key, name, size) {
    var tid = picker.tid;
    var huidig = getMailAttachments(tid);
    if (huidig.some(function (a) { return a.key === key; })) return;
    if (huidig.length >= MAX_FILES) {
      window.FSV2.showAlert('Maximaal ' + MAX_FILES + ' bijlagen per mail.', 'error');
      return;
    }
    setMailAttachments(tid, huidig.concat([{ key: key, name: name, bytes: size || null, missing: false }]));
    tekenPicker();
    window.FSV2.showAlert('Bijlage toegevoegd.', 'success');
  }

  // ─── Eén gedelegeerde listener ────────────────────────────────────────────
  // Op document en niet op de composerkaart: de kiezer is een <dialog> die aan
  // <body> hangt, dus een listener op de kaart zou hem niet zien.

  document.addEventListener('click', function (e) {
    var knop = e.target.closest('[data-mailatt-action]');
    if (!knop) return;
    var actie = knop.dataset.mailattAction;
    if (actie === 'open-picker')  { openMailAttachmentPicker(knop.dataset.tid); return; }
    if (actie === 'close-picker') { var d = document.getElementById('mailAttachmentPicker'); if (d) d.close(); return; }
    if (actie === 'goto')         { laadMap(knop.dataset.prefix || ''); return; }
    if (actie === 'pick')         { kiesBestand(knop.dataset.key, knop.dataset.name, Number(knop.dataset.size) || 0); return; }
    if (actie === 'remove') {
      var tid = knop.dataset.tid;
      var i = Number(knop.dataset.index);
      setMailAttachments(tid, getMailAttachments(tid).filter(function (_a, j) { return j !== i; }));
    }
  });

  // De naam die de ontvanger ziet, bewerkbaar ter plekke. Op 'input' en niet
  // op 'change': anders is een net getypte naam nog niet in de toestand
  // wanneer je meteen op Opslaan klikt.
  document.addEventListener('input', function (e) {
    var veld = e.target.closest('[data-mailatt-name]');
    if (!veld) return;
    var tid = veld.dataset.mailattName;
    var i = Number(veld.dataset.index);
    var lijst = getMailAttachments(tid).slice();
    if (!lijst[i]) return;
    lijst[i] = Object.assign({}, lijst[i], { name: veld.value });
    store()[String(tid)] = lijst;   // bewust NIET hertekenen: dat wist de cursor
  });

  Object.assign(window.FSV2, {
    renderMailAttachmentsSection: renderMailAttachmentsSection,
    initMailAttachments: initMailAttachments,
    getMailAttachments: getMailAttachments,
    mailAttachmentsPayload: mailAttachmentsPayload,
    applyMailAttachmentStatus: applyMailAttachmentStatus,
    openMailAttachmentPicker: openMailAttachmentPicker
  });
})();
