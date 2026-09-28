/**
 * Koppelingen — composer voor de generate_pdf-stap.
 *
 * Zelfde opzet als de mail- en chatter-composer (eigen IIFE, export via
 * window.FSV2.*, opslaan via de gedeelde voettekstknop van de kaart — zie
 * handleSaveStepMappings in -detail-mapping-tab.js).
 *
 * DE INVULVELDEN VAN HET SJABLOON WORDEN GEWOON fs_v2_mappings-RIJEN, met
 * odoo_field = het pad in de "gegevens" van het sjabloon (bv. "gebouw.adres")
 * i.p.v. een echt Odoo-veld. Dat is bewust: zo hergebruikt deze stap dezelfde
 * bron-soorten (formulierveld / vorige stap / vaste tekst) als de rest van de
 * pipeline, in plaats van een derde mapping-mechanisme te verzinnen. Een veld
 * dat niet gemapt wordt, houdt gewoon de standaardwaarde van het sjabloon.
 *
 * DE CONTACTPERSOON IS GEEN GEGEVENS-VELD. Die komt uit `hr.employee` (vast
 * gekozen, of dynamisch via het record-id dat een vorige stap opleverde) en
 * wordt server-side ingevuld — zie pdf-step.js. De "Contactpersoon"-groep uit
 * het sjabloon wordt daarom bewust NIET in de gegevens-lijst hieronder getoond.
 */
(function () {
  'use strict';

  function S()    { return window.FSV2.S; }
  function esc(v) { return window.FSV2.esc(v); }

  function stapVolgorde(t) {
    return (t.execution_order != null ? t.execution_order : t.order_index) || 0;
  }

  function voorgaandeStappen(tid, sortedTargets) {
    var lijst = sortedTargets || (S().detail && S().detail.targets) || [];
    var sorted = lijst.slice().sort(function (a, b) { return stapVolgorde(a) - stapVolgorde(b); });
    var huidige = sorted.find(function (t) { return String(t.id) === String(tid); });
    var huidigeOrder = huidige ? stapVolgorde(huidige) : Infinity;
    return sorted.filter(function (t) { return stapVolgorde(t) < huidigeOrder && t.odoo_model; });
  }

  function formulierVelden() {
    var res = window.FSV2.buildDetailFlatFields(S().detailFormFields || []);
    return (res && res.flatFields) || [];
  }

  // ─── Sjabloon-inhoud ophalen (gecached per template-id, niet in S().pdfTemplatesCache:
  //      die lijst bevat bewust geen `data`, zie routes.js) ───────────────────
  function templateCache() {
    if (!window.FSV2._pdfTemplateData) window.FSV2._pdfTemplateData = {};
    return window.FSV2._pdfTemplateData;
  }

  function laadTemplateData(templateId) {
    if (!templateId) return;
    var cache = templateCache();
    if (cache[templateId]) return;
    cache[templateId] = { loading: true };
    window.FSV2.api('/pdf-templates/' + encodeURIComponent(templateId)).then(function (res) {
      cache[templateId] = (res && res.data && res.data.data) || { gegevens: {}, copy: {}, velden: [] };
      if (typeof window.FSV2.renderDetailMappings === 'function') window.FSV2.renderDetailMappings();
    }).catch(function () {
      delete cache[templateId];
    });
  }

  // ─── Renderen ──────────────────────────────────────────────────────────────

  function renderPdfComposer(target, tid, sortedTargets) {
    var el = document.getElementById('det-mc-' + tid);
    if (!el) return;

    var templates  = Array.isArray(S().pdfTemplatesCache) ? S().pdfTemplatesCache : [];
    var templateId = target.pdf_template_id || '';
    var tplData    = templateId ? templateCache()[templateId] : null;
    if (templateId && !tplData) laadTemplateData(templateId);

    var mappings = (S().detail.mappingsByTarget && S().detail.mappingsByTarget[target.id]) || [];
    var mappingByPath = {};
    mappings.forEach(function (m) { if (m.odoo_field) mappingByPath[m.odoo_field] = m; });

    var templateOpties = templates.map(function (t) {
      return '<option value="' + esc(t.id) + '"' + (t.id === templateId ? ' selected' : '') + '>' + esc(t.name) + '</option>';
    }).join('');

    var gegevensHtml;
    if (!templateId) {
      gegevensHtml = '<div class="text-xs text-base-content/50 py-3">Kies eerst een sjabloon.</div>';
    } else if (!tplData || tplData.loading) {
      gegevensHtml = '<div class="text-xs text-base-content/40 py-3"><span class="loading loading-spinner loading-xs"></span> Sjabloon laden…</div>';
    } else {
      var velden = formulierVelden();
      // Per rij een EIGEN lijst bouwen (i.p.v. één gedeelde formOpties-string) --
      // zonder dit kreeg de "Formulierveld"-select bij het heropenen nooit een
      // "selected"-optie mee, dus een al opgeslagen koppeling toonde altijd
      // opnieuw "— kies een formulierveld —". Sla je de stap dan zonder eerst
      // opnieuw te kiezen op, dan leest leesGegevensMappings() een lege waarde en
      // verdwijnt de koppeling stil -- dat is precies wat "het wordt niet
      // opgeslagen, weg bij page reload" veroorzaakte.
      function buildFormOpties(selectedId) {
        return '<option value="">— kies een formulierveld —</option>' + velden.map(function (f) {
          var id = f.field_id || f.fieldId || f.id || f.name || '';
          return '<option value="' + esc(id) + '"' + (id !== '' && id === selectedId ? ' selected' : '') + '>' + esc(f.label || id) + '</option>';
        }).join('');
      }

      // Contactpersoon: eigen sectie hieronder (hr.employee/res.users, geen
      // sjabloon-gegevens-pad). Beeldmateriaal: bewust NOOIT per koppeling
      // instelbaar -- logo/schermafdruk/QR/pijltje horen bij de opmaak van het
      // SJABLOON zelf (één keer ingesteld in de sjabloonbouwer), niet bij een
      // individuele koppeling. Bedrijf: komt uit één gekozen bedrijfsprofiel
      // hieronder, geen per-veld mapping meer. Zie ook toegestaneGegevenspaden()
      // in pdf-step.js, die dezelfde drie groepen negeert.
      gegevensHtml = (tplData.velden || []).filter(function (groep) {
        return groep && groep.groep !== 'Contactpersoon' && groep.groep !== 'Beeldmateriaal' && groep.groep !== 'Bedrijf';
      }).map(function (groep) {
        var rijen = (groep.velden || []).map(function (paar) {
          var pad = paar[0], label = paar[1];
          var m = mappingByPath[pad];
          var bron = m ? m.source_type : '';
          // Alleen de bronnen die deze stap kent -- een andere source_type
          // (bv. html_form_summary) hoort hier niet en wordt als "vaste tekst" getoond.
          if (bron && bron !== 'form' && bron !== 'previous_step_output' && bron !== 'static' && bron !== 'template'
              && bron !== 'generated_unique_id' && bron !== 'offer_sequence' && bron !== 'offer_validity') bron = 'static';

          return '<div class="flex items-center gap-2 py-1" data-pdf-row data-path="' + esc(pad) + '">' +
            '<label class="text-xs text-base-content/70 w-40 shrink-0" title="' + esc(pad) + '">' + esc(label) + '</label>' +
            '<select class="select select-bordered select-xs" data-pdf-bron data-path="' + esc(pad) + '" data-tid="' + esc(tid) + '">' +
              '<option value=""' + (bron === '' ? ' selected' : '') + '>Sjabloonwaarde</option>' +
              '<option value="form"' + (bron === 'form' ? ' selected' : '') + '>Formulierveld</option>' +
              '<option value="previous_step_output"' + (bron === 'previous_step_output' ? ' selected' : '') + '>Vorige stap</option>' +
              '<option value="template"' + (bron === 'template' ? ' selected' : '') + '>Samengesteld (meerdere velden)</option>' +
              '<option value="static"' + (bron === 'static' ? ' selected' : '') + '>Vaste tekst</option>' +
              '<option value="generated_unique_id"' + (bron === 'generated_unique_id' ? ' selected' : '') + '>Generator (uniek nummer)</option>' +
              '<option value="offer_sequence"' + (bron === 'offer_sequence' ? ' selected' : '') + '>Generator (offertenummer)</option>' +
              '<option value="offer_validity"' + (bron === 'offer_validity' ? ' selected' : '') + '>Automatisch (sjabloon-termijn)</option>' +
            '</select>' +
            '<select class="select select-bordered select-xs flex-1 min-w-0" data-pdf-formfield data-path="' + esc(pad) + '" data-tid="' + esc(tid) + '"' +
              (bron === 'form' ? '' : ' style="display:none"') + '>' + buildFormOpties(bron === 'form' ? (m.source_value || '') : '') + '</select>' +
            '<input type="text" class="input input-bordered input-xs flex-1 min-w-0" data-pdf-stepvalue data-path="' + esc(pad) + '" data-tid="' + esc(tid) + '"' +
              ' list="pdfStepSuggest-' + esc(tid) + '" placeholder="step.2.record_id"' +
              ' value="' + esc(bron === 'previous_step_output' ? (m.source_value || '') : '') + '"' +
              (bron === 'previous_step_output' ? '' : ' style="display:none"') + '>' +
            // Samengesteld: tekst met {veld}-placeholders (source_type 'template',
            // dezelfde bron als in de gewone veldkoppeling). De keuzelijst ernaast
            // voegt een veld in op de plaats van de cursor, zodat niemand de
            // technische veldnamen moet kennen.
            '<span class="flex flex-1 min-w-0 gap-1" data-pdf-templatevalue data-path="' + esc(pad) + '" data-tid="' + esc(tid) + '"' +
              (bron === 'template' ? '' : ' style="display:none"') + '>' +
              '<input type="text" class="input input-bordered input-xs flex-1 min-w-0" data-pdf-templateinput' +
                ' placeholder="{straat} {huisnummer}, {postcode} {gemeente}"' +
                ' value="' + esc(bron === 'template' ? (m.source_value || '') : '') + '">' +
              '<select class="select select-bordered select-xs w-36 shrink-0" data-pdf-insertfield>' +
                '<option value="">+ veld invoegen</option>' +
                velden.map(function (f) {
                  var id = f.field_id || f.fieldId || f.id || f.name || '';
                  return id ? '<option value="' + esc(id) + '">' + esc(f.label || id) + '</option>' : '';
                }).join('') +
              '</select>' +
            '</span>' +
            '<input type="text" class="input input-bordered input-xs flex-1 min-w-0" data-pdf-staticvalue data-path="' + esc(pad) + '" data-tid="' + esc(tid) + '"' +
              ' value="' + esc(bron === 'static' ? (m.source_value || '') : '') + '"' +
              (bron === 'static' ? '' : ' style="display:none"') + '>' +
            '<span class="text-xs text-base-content/40 flex-1 min-w-0" data-pdf-generatorhint data-path="' + esc(pad) + '" data-tid="' + esc(tid) + '"' +
              (bron === 'generated_unique_id' ? '' : ' style="display:none"') + '>Bij elke indiening een nieuw uniek nummer.</span>' +
            '<span class="text-xs text-base-content/40 flex-1 min-w-0" data-pdf-sequencehint data-path="' + esc(pad) + '" data-tid="' + esc(tid) + '"' +
              (bron === 'offer_sequence' ? '' : ' style="display:none"') + '>Volgt het patroon + de teller van het sjabloon.</span>' +
            '<span class="text-xs text-base-content/40 flex-1 min-w-0" data-pdf-validityhint data-path="' + esc(pad) + '" data-tid="' + esc(tid) + '"' +
              (bron === 'offer_validity' ? '' : ' style="display:none"') + '>Vandaag + de geldigheidstermijn van het sjabloon.</span>' +
          '</div>';
        }).join('');
        return '<div class="mb-2"><div class="text-xs font-semibold text-base-content/50 uppercase tracking-wide mb-1">' +
          esc(groep.groep || '') + '</div>' + rijen + '</div>';
      }).join('');

      if (!gegevensHtml) gegevensHtml = '<div class="text-xs text-base-content/50 py-3">Dit sjabloon heeft geen invulvelden.</div>';
    }

    var precedingSteps = voorgaandeStappen(tid, sortedTargets);
    var stepSuggestOpties = precedingSteps.map(function (t) {
      return '<option value="step.' + stapVolgorde(t) + '.record_id">' + esc(t.label || window.FSV2.modelLabel(t.odoo_model)) + '</option>';
    }).join('');

    var resIdOpties = '<option value="">Nergens (geen res_model/res_id op de pdf)</option>' + precedingSteps.map(function (t) {
      var val = 'step.' + stapVolgorde(t) + '.record_id';
      return '<option value="' + esc(val) + '"' + (target.pdf_res_id_source === val ? ' selected' : '') + '>' +
        esc(t.label || window.FSV2.modelLabel(t.odoo_model)) + '</option>';
    }).join('');

    var bedrijfProfielen = Array.isArray(S().bedrijfProfielenCache) ? S().bedrijfProfielenCache : [];
    var bedrijfProfielOpties = bedrijfProfielen.map(function (p) {
      return '<option value="' + esc(p.id) + '"' + (p.id === (target.pdf_bedrijf_profiel_id || '') ? ' selected' : '') + '>' + esc(p.name) + '</option>';
    }).join('');
    var contactSrc = target.pdf_contact_source || '';

    el.innerHTML = `
      <datalist id="pdfStepSuggest-${esc(tid)}">${stepSuggestOpties}</datalist>

      <div class="form-control mb-3">
        <label class="label pt-0 pb-1 flex items-center justify-between">
          <span class="label-text text-sm font-medium">Sjabloon</span>
          <a href="${templateId ? '/offerte.html?template=' + esc(templateId) : '/forminator-v2'}" target="_blank" rel="noopener"
             class="text-xs link link-hover text-base-content/60">Bewerken</a>
        </label>
        <select id="pdfTemplate-${esc(tid)}" class="select select-bordered select-sm w-full">
          <option value="">— kies een sjabloon —</option>
          ${templateOpties}
        </select>
        <label class="label pt-1 pb-0">
          <span class="label-text-alt text-base-content/50">
            Wijzig je het sjabloon, sla dan eerst op om de bijhorende invulvelden te zien.
          </span>
        </label>
      </div>

      <div class="form-control mb-3">
        <label class="label pt-0 pb-1"><span class="label-text text-sm font-medium">Bedrijf</span></label>
        <select id="pdfBedrijfProfiel-${esc(tid)}" class="select select-bordered select-sm w-full">
          <option value="">— sjabloonwaarden gebruiken —</option>
          ${bedrijfProfielOpties}
        </select>
        <label class="label pt-1 pb-0">
          <span class="label-text-alt text-base-content/50">
            Beheer bedrijven (naam, KBO, adres, ...) in de sjabloonbouwer, tabblad "Bedrijf".
          </span>
        </label>
      </div>

      <div class="form-control mb-3">
        <label class="label pt-0 pb-1"><span class="label-text text-sm font-medium">Gegevens</span></label>
        <div class="border border-base-200 rounded-lg px-3 py-2">${gegevensHtml}</div>
        <label class="label pt-1 pb-0">
          <span class="label-text-alt text-base-content/50">
            Ongemapte velden houden de standaardwaarde van het sjabloon.
          </span>
        </label>
      </div>

      <div class="form-control mb-3">
        <label class="label pt-0 pb-1"><span class="label-text text-sm font-medium">Contactpersoon</span></label>
        <select id="pdfContactSource-${esc(tid)}" class="select select-bordered select-sm w-full mb-1.5">
          <option value=""${contactSrc === '' ? ' selected' : ''}>Uit het sjabloon</option>
          <option value="fixed"${contactSrc === 'fixed' ? ' selected' : ''}>Vaste medewerker</option>
          <option value="dynamic"${contactSrc === 'dynamic' ? ' selected' : ''}>Uit een vorige stap</option>
        </select>
        <input type="number" min="1" id="pdfContactEmployeeId-${esc(tid)}"
               class="input input-bordered input-sm w-full mb-1.5"
               placeholder="Medewerker-ID (hr.employee, uit de Odoo-URL)"
               value="${target.pdf_contact_employee_id || ''}"
               ${contactSrc === 'fixed' ? '' : 'style="display:none"'}>
        <select id="pdfContactStepValue-${esc(tid)}"
               class="select select-bordered select-sm w-full"
               ${contactSrc === 'dynamic' ? '' : 'style="display:none"'}>
          ${window.FSV2.buildEmployeeStepOptions(sortedTargets, tid, target.pdf_contact_source_value || '')}
        </select>
        <label class="label pt-1 pb-0">
          <span class="label-text-alt text-base-content/50">
            Naam, e-mailadres en foto komen dan uit die medewerker in Odoo — niet uit getypte tekst.
          </span>
        </label>
      </div>

      <div class="form-control mb-3">
        <label class="label pt-0 pb-1"><span class="label-text text-sm font-medium">Hangt aan</span></label>
        <select id="pdfResIdSource-${esc(tid)}" class="select select-bordered select-sm w-full">
          ${resIdOpties}
        </select>
        <label class="label pt-1 pb-0">
          <span class="label-text-alt text-base-content/50">
            Welk record deze pdf in zijn chatter krijgt. "Nergens" = de pdf bestaat enkel als bijlage bij een mailstap.
          </span>
        </label>
      </div>

      <div class="form-control mb-3">
        <label class="label pt-0 pb-1"><span class="label-text text-sm font-medium">Bestandsnaam</span></label>
        <input type="text" id="pdfFilename-${esc(tid)}" class="input input-bordered input-sm w-full"
               value="${esc(target.pdf_filename_template || 'Offerte-{{offerte.nummer}}.pdf')}"
               placeholder="Offerte-{{offerte.nummer}}.pdf">
      </div>

      <div class="mb-2">
        <div class="flex items-center justify-between mb-1">
          <span class="text-sm font-medium">Testpdf</span>
          <button type="button" class="btn btn-xs" data-pdf-action="test" data-tid="${esc(tid)}">Genereer testpdf</button>
        </div>
        <div id="pdfTestResult-${esc(tid)}" class="text-xs text-base-content/50">
          Genereert de echte stap één keer, met de laatste opgeslagen instellingen — niets wordt naar Odoo geüpload.
        </div>
      </div>
    `;

    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons({ context: el });

    // ── Eén gedelegeerde listener op de composer zelf ───────────────────────
    el.addEventListener('change', function (e) {
      var invoeg = e.target.closest('[data-pdf-insertfield]');
      if (invoeg) {
        var invoer = invoeg.parentNode.querySelector('[data-pdf-templateinput]');
        if (invoer && invoeg.value) {
          var stuk = '{' + invoeg.value + '}';
          var van = invoer.selectionStart != null ? invoer.selectionStart : invoer.value.length;
          var tot = invoer.selectionEnd != null ? invoer.selectionEnd : invoer.value.length;
          invoer.value = invoer.value.slice(0, van) + stuk + invoer.value.slice(tot);
          invoer.focus();
          invoer.setSelectionRange(van + stuk.length, van + stuk.length);
        }
        invoeg.value = '';
        return;
      }
      var bronSel = e.target.closest('[data-pdf-bron]');
      if (bronSel) {
        var rij = bronSel.closest('[data-pdf-row]');
        if (!rij) return;
        rij.querySelectorAll('[data-pdf-formfield],[data-pdf-stepvalue],[data-pdf-staticvalue],[data-pdf-templatevalue],[data-pdf-generatorhint],[data-pdf-sequencehint],[data-pdf-validityhint]').forEach(function (ctl) {
          ctl.style.display = 'none';
        });
        var veldNaam = bronSel.value === 'form' ? 'pdf-formfield'
          : bronSel.value === 'previous_step_output' ? 'pdf-stepvalue'
          : bronSel.value === 'static' ? 'pdf-staticvalue'
          : bronSel.value === 'template' ? 'pdf-templatevalue'
          : bronSel.value === 'generated_unique_id' ? 'pdf-generatorhint'
          : bronSel.value === 'offer_sequence' ? 'pdf-sequencehint'
          : bronSel.value === 'offer_validity' ? 'pdf-validityhint' : null;
        if (veldNaam) {
          var target2 = rij.querySelector('[data-' + veldNaam + ']');
          if (target2) target2.style.display = '';
        }
        return;
      }
      if (e.target.id === 'pdfContactSource-' + tid) {
        var v = e.target.value;
        var empEl  = document.getElementById('pdfContactEmployeeId-' + tid);
        var stepEl = document.getElementById('pdfContactStepValue-' + tid);
        if (empEl)  empEl.style.display  = v === 'fixed'   ? '' : 'none';
        if (stepEl) stepEl.style.display = v === 'dynamic' ? '' : 'none';
        return;
      }
      if (e.target.id === 'pdfTemplate-' + tid) {
        // In-memory bijwerken zodat de gegevenslijst meteen het nieuwe sjabloon
        // toont; pas definitief bij "Stap opslaan". Zie ook het label hierboven.
        target.pdf_template_id = e.target.value || null;
        laadTemplateData(target.pdf_template_id);
        renderPdfComposer(target, tid, sortedTargets);
      }
    });

    el.addEventListener('click', function (e) {
      var knop = e.target.closest('[data-pdf-action="test"]');
      if (!knop) return;
      handlePdfTest(knop.dataset.tid);
    });
  }

  // ─── Testpdf ────────────────────────────────────────────────────────────────

  async function handlePdfTest(tid) {
    var doel = document.getElementById('pdfTestResult-' + tid);
    if (doel) doel.innerHTML = '<span class="text-base-content/40"><span class="loading loading-spinner loading-xs"></span> Bezig — kan enkele seconden duren…</span>';
    try {
      var sample = {};
      formulierVelden().forEach(function (f) {
        var id = f.field_id || f.fieldId || f.id || f.name || '';
        if (id) sample[id] = '[' + (f.label || id) + ']';
      });
      var res = await window.FSV2.api('/targets/' + tid + '/pdf-test', {
        method: 'POST',
        body: JSON.stringify({ sample: sample })
      });
      if (!res || !res.success) throw new Error((res && res.error) || 'Genereren mislukt');

      var data  = res.data;
      var bytes = Uint8Array.from(atob(data.base64), function (c) { return c.charCodeAt(0); });
      var blob  = new Blob([bytes], { type: 'application/pdf' });
      var url   = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url; a.download = data.filename || 'test.pdf';
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 4000);

      if (doel) {
        doel.innerHTML = (data.waarschuwingen && data.waarschuwingen.length)
          ? '<span class="text-warning">' + esc(data.waarschuwingen.join(' ')) + '</span>'
          : '<span class="text-success">Testpdf gedownload.</span>';
      }
    } catch (err) {
      if (doel) doel.innerHTML = '<span class="text-error">' + esc(err.message) + '</span>';
    }
  }

  // ─── Gegevens-mappings uit de DOM lezen ─────────────────────────────────────

  function leesGegevensMappings(tid) {
    var rows = [];
    var orderIdx = 0;
    document.querySelectorAll('[data-pdf-bron][data-tid="' + tid + '"]').forEach(function (sel) {
      var pad = sel.dataset.path;
      var bron = sel.value;
      if (!bron) return; // sjabloonwaarde: geen mapping nodig

      if (bron === 'form') {
        var fEl = document.querySelector('[data-pdf-formfield][data-path="' + pad + '"][data-tid="' + tid + '"]');
        var fVal = fEl ? fEl.value : '';
        if (!fVal) return;
        rows.push({ odoo_field: pad, source_type: 'form', source_value: fVal, is_required: false, order_index: orderIdx++ });
      } else if (bron === 'previous_step_output') {
        var sEl = document.querySelector('[data-pdf-stepvalue][data-path="' + pad + '"][data-tid="' + tid + '"]');
        var sVal = sEl ? sEl.value.trim() : '';
        if (!sVal || !/^step\.[^.]+\.[^.]+$/.test(sVal)) return;
        rows.push({ odoo_field: pad, source_type: 'previous_step_output', source_value: sVal, is_required: false, order_index: orderIdx++ });
      } else if (bron === 'static') {
        var tEl = document.querySelector('[data-pdf-staticvalue][data-path="' + pad + '"][data-tid="' + tid + '"]');
        var tVal = tEl ? tEl.value : '';
        if (!tVal) return;
        // Zelfde regel als de gewone veldkoppeling: een vaste tekst met een
        // {veld} erin IS een samengestelde waarde.
        rows.push({ odoo_field: pad, source_type: /\{[^}]+\}/.test(tVal) ? 'template' : 'static', source_value: tVal, is_required: false, order_index: orderIdx++ });
      } else if (bron === 'template') {
        var wEl = document.querySelector('[data-pdf-templatevalue][data-path="' + pad + '"][data-tid="' + tid + '"] [data-pdf-templateinput]');
        var wVal = wEl ? wEl.value.trim() : '';
        if (!wVal) return;
        rows.push({ odoo_field: pad, source_type: 'template', source_value: wVal, is_required: false, order_index: orderIdx++ });
      } else if (bron === 'generated_unique_id') {
        // Zelfde sentinel-afspraak als de gewone mapping-tabel (zie
        // GENERATED_ID_SENTINEL in forminator-sync-v2-detail-mapping-tab.js):
        // 'uuid_v4' is puur documentatie in de DB. resolveMappingValue() in
        // worker-handler.js negeert deze source_value en genereert zelf een
        // crypto.randomUUID() per indiening -- geen extra server-code nodig,
        // buildPdfGegevens() roept resolveMapping() al generiek aan.
        rows.push({ odoo_field: pad, source_type: 'generated_unique_id', source_value: 'uuid_v4', is_required: false, order_index: orderIdx++ });
      } else if (bron === 'offer_sequence' || bron === 'offer_validity') {
        // Zelfde sentinel-truc: source_value is hier puur documentatie, de
        // echte instellingen (patroon/teller, aantal dagen) staan op het
        // SJABLOON en worden door buildPdfGegevens() in pdf-step.js apart
        // opgelost -- vóór resolveMapping() ooit aangeroepen wordt.
        rows.push({ odoo_field: pad, source_type: bron, source_value: bron, is_required: false, order_index: orderIdx++ });
      }
    });
    return rows;
  }

  // ─── Opslaan ───────────────────────────────────────────────────────────────

  async function handleSavePdfComposer(tid) {
    var targets = (S().detail && S().detail.targets) ? S().detail.targets : [];
    var target  = targets.find(function (t) { return String(t.id) === tid; });
    if (!target) { window.FSV2.showAlert('Stap niet gevonden.', 'error'); return; }
    var integrationId = S().detail && S().detail.integration && S().detail.integration.id;

    var templateSel = document.getElementById('pdfTemplate-' + tid);
    var templateId  = templateSel ? templateSel.value : (target.pdf_template_id || '');
    if (!templateId) { window.FSV2.showAlert('Kies een sjabloon.', 'error'); return; }

    var contactSrc  = (document.getElementById('pdfContactSource-' + tid)     || {}).value || '';
    var contactEmp  = (document.getElementById('pdfContactEmployeeId-' + tid) || {}).value || '';
    var contactStep = (document.getElementById('pdfContactStepValue-' + tid)  || {}).value || '';

    if (contactSrc === 'fixed' && !(Number(contactEmp) > 0)) {
      window.FSV2.showAlert('Vul een geldig medewerker-ID in bij Contactpersoon, of kies een andere bron.', 'error');
      return;
    }
    if (contactSrc === 'dynamic' && !contactStep.trim()) {
      window.FSV2.showAlert('Kies een stap voor de contactpersoon.', 'error');
      return;
    }

    try {
      await window.FSV2.api('/integrations/' + integrationId + '/targets/' + tid, {
        method: 'PUT',
        body: JSON.stringify({
          odoo_model:      target.odoo_model,
          identifier_type: target.identifier_type || 'mapped_fields',
          update_policy:   target.update_policy   || 'always_overwrite',
          operation_type:  'generate_pdf',
          execution_order: target.execution_order,
          order_index:     target.order_index,
          is_enabled:      target.is_enabled !== false,
          pdf_template_id:          templateId,
          pdf_contact_source:       contactSrc || null,
          pdf_contact_employee_id:  contactSrc === 'fixed'   ? Number(contactEmp)   : null,
          pdf_contact_source_value: contactSrc === 'dynamic' ? contactStep.trim()   : null,
          pdf_res_id_source:        (document.getElementById('pdfResIdSource-' + tid) || {}).value || null,
          pdf_filename_template:    (document.getElementById('pdfFilename-' + tid)    || {}).value || null,
          pdf_bedrijf_profiel_id:   (document.getElementById('pdfBedrijfProfiel-' + tid) || {}).value || null,
        }),
      });

      var newMappings = leesGegevensMappings(tid);
      await window.FSV2.api('/targets/' + tid + '/mappings', { method: 'DELETE' });
      for (var i = 0; i < newMappings.length; i++) {
        await window.FSV2.api('/targets/' + tid + '/mappings', { method: 'POST', body: JSON.stringify(newMappings[i]) });
      }

      window.FSV2.showAlert('PDF-stap opgeslagen.', 'success');
      await window.FSV2.openDetail(S().activeId);
    } catch (err) {
      window.FSV2.showAlert(err.message, 'error');
    }
  }

  Object.assign(window.FSV2, {
    renderPdfComposer: renderPdfComposer,
    handleSavePdfComposer: handleSavePdfComposer,
    handlePdfTest: handlePdfTest,
  });
})();
