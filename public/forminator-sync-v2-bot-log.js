/**
 * Koppelingen — Instellingen -> Botcontrole.
 *
 * Wat Cloudflare Turnstile tegenhield (FORMS_TURNSTILE_MODE = "on"). Elke
 * geweigerde inzending wordt eerst bewaard (src/modules/forminator-sync-v2/
 * forms/bot-rejections.js); hier bekijk je ze, negeer je de spam, en laat je
 * een echte aanvraag ALSNOG door. Doorlaten loopt door dezelfde koppeling als
 * een gewone inzending, met meta_bot_check = "vrijgegeven".
 *
 * Wat het scherm toont om te beoordelen, en waarom:
 *   - de BEZOEKER-UUID: het tracking-script zet die cookie, en een bot die de
 *     pagina enkel ophaalt en het formulier post, heeft hem niet. Een echte
 *     bezoeker heeft hem bijna altijd -- maar niet altijd (zie CLAUDE.md), dus
 *     het is een aanwijzing, geen regel, en er wordt niets automatisch mee
 *     beslist.
 *   - "later wel verstuurd": wie de foutmelding kreeg, probeert meestal
 *     meteen opnieuw. Die aanvraag staat er dan al; doorlaten maakt er een
 *     tweede lead van.
 *
 * Acties lopen via de centrale listener in forminator-sync-v2-bootstrap.js
 * (prefix `botlog-`, zoekveld via data-botlog-search).
 */
(function () {
  'use strict';

  var esc = function (v) { return window.FSV2.esc(v); };

  var STATUS_LABELS = {
    open: 'Te bekijken',
    released: 'Doorgelaten',
    dismissed: 'Genegeerd',
    all: 'Alles',
  };

  var UITKOMST_LABELS = {
    geen_token: 'geen token',
    ongeldig: 'ongeldig token',
  };

  var st = {
    filter: 'open',
    enkelUuid: false,
    zoek: '',
    data: null,
    fout: '',
    laden: false,
    open: {},
    bezig: false,
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // LADEN
  // ═══════════════════════════════════════════════════════════════════════════

  async function laadBotLog() {
    st.laden = true;
    st.fout = '';
    render();
    try {
      var res = await window.FSV2.api('/bot-rejections?status=' + encodeURIComponent(st.filter));
      st.data = res.data || null;
    } catch (err) {
      st.fout = err.message;
    }
    st.laden = false;
    render();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // AFLEIDEN
  // ═══════════════════════════════════════════════════════════════════════════

  function koppelingVan(rij) {
    return (st.data && st.data.integrations && st.data.integrations[rij.integration_id]) || { name: '', fields: [], bestaat: false, is_active: false };
  }

  function waardeTekst(rij, sleutel) {
    var waarde = rij.body && rij.body.form_data ? rij.body.form_data[sleutel] : undefined;
    if (waarde === undefined || waarde === null || waarde === '') return '';
    var labels = (rij.body && rij.body.value_labels && rij.body.value_labels[sleutel]) || {};
    var naarLabel = function (w) { return labels[String(w)] || String(w); };
    if (Array.isArray(waarde)) return waarde.map(naarLabel).join(', ');
    if (typeof waarde === 'boolean') return waarde ? 'ja' : 'nee';
    return naarLabel(waarde);
  }

  function eersteVeld(koppeling, test) {
    return (koppeling.fields || []).find(test) || null;
  }

  function samenvatting(rij) {
    var k = koppelingVan(rij);
    var naamVeld = eersteVeld(k, function (f) { return f.type === 'text' && /naam|name/i.test(f.key + ' ' + f.label); })
      || eersteVeld(k, function (f) { return f.type === 'text'; });
    var mailVeld = eersteVeld(k, function (f) { return f.type === 'email'; });
    var tekstVeld = eersteVeld(k, function (f) { return f.type === 'textarea'; });
    return {
      naam: naamVeld ? waardeTekst(rij, naamVeld.key) : '',
      email: mailVeld ? waardeTekst(rij, mailVeld.key) : '',
      bericht: tekstVeld ? waardeTekst(rij, tekstVeld.key) : '',
    };
  }

  function meta(rij) {
    return (rij.body && rij.body.meta) || {};
  }

  function heeftUuid(rij) {
    return !!meta(rij).ovme_uuid;
  }

  function zichtbareRijen() {
    var items = (st.data && st.data.items) || [];
    var zoek = st.zoek.trim().toLowerCase();
    return items.filter(function (rij) {
      if (st.enkelUuid && !heeftUuid(rij)) return false;
      if (!zoek) return true;
      var hooi = [
        rij.form_name, rij.site, koppelingVan(rij).name,
        JSON.stringify((rij.body && rij.body.form_data) || {}),
        meta(rij).page_url || '',
      ].join(' ').toLowerCase();
      return hooi.indexOf(zoek) !== -1;
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // TEKENEN
  // ═══════════════════════════════════════════════════════════════════════════

  function render() {
    var host = document.getElementById('botLogHost');
    if (!host) return;

    // Het zoekveld niet opnieuw tekenen terwijl iemand typt: dan springt de
    // cursor weg. Enkel de lijst eronder wordt vervangen.
    var lijstHost = document.getElementById('botLogLijst');
    if (lijstHost && st._alleenLijst) {
      st._alleenLijst = false;
      lijstHost.innerHTML = renderLijst();
      if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
      return;
    }

    host.innerHTML = `${renderStand()}
      ${renderTabs()}
      ${renderToolbar()}
      <div id="botLogLijst">${renderLijst()}</div>`;
    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();
  }

  function renderStand() {
    if (!st.data) return '';
    var modus = st.data.mode;
    var dagen = st.data.retention_days || 30;
    var config;
    if (modus === 'on') {
      config = {
        klasse: 'text-success', icoon: 'shield-check',
        tekst: `Turnstile staat AAN. Een inzending zonder geldig token wordt geweigerd en ${dagen} dagen hier bewaard. De bezoeker zag de melding dat we niet konden nagaan of hij geen robot is.`,
      };
    } else if (modus === 'log') {
      config = {
        klasse: 'text-warning', icoon: 'shield-alert',
        tekst: 'Turnstile staat op "log": er wordt niets geweigerd, dus hier komt niets bij. Wat geweigerd zou worden, zie je in Indieningen aan meta_bot_check.',
      };
    } else {
      config = {
        klasse: 'text-base-content/60', icoon: 'shield-off',
        tekst: 'Turnstile staat uit: er wordt niets nagekeken en niets geweigerd.',
      };
    }
    return `<div class="flex items-start gap-2 text-sm ${config.klasse} bg-base-200/40 rounded-lg px-3 py-2 mb-5">
      <i data-lucide="${esc(config.icoon)}" class="w-4 h-4 shrink-0 mt-0.5"></i>
      <span>${esc(config.tekst)}</span>
    </div>`;
  }

  function renderTabs() {
    var tellingen = (st.data && st.data.counts) || {};
    var knoppen = ['open', 'released', 'dismissed', 'all'].map(function (sleutel) {
      var aantal = sleutel === 'all'
        ? (tellingen.open || 0) + (tellingen.released || 0) + (tellingen.dismissed || 0)
        : (tellingen[sleutel] || 0);
      return `<button role="tab" type="button" class="tab${st.filter === sleutel ? ' tab-active' : ''}"
        data-action="botlog-filter" data-filter="${sleutel}">${esc(STATUS_LABELS[sleutel])}
        <span class="ml-1.5 text-xs opacity-60">${aantal}</span></button>`;
    }).join('');
    return `<div role="tablist" class="tabs tabs-boxed mb-4 w-fit">${knoppen}</div>`;
  }

  function renderToolbar() {
    return `<div class="flex flex-wrap items-center gap-2 mb-4">
      <label class="input input-sm input-bordered flex items-center gap-2 w-full sm:w-72">
        <i data-lucide="search" class="w-3.5 h-3.5 opacity-50"></i>
        <input type="search" class="grow" placeholder="Zoek op naam, e-mail, inhoud…"
          data-botlog-search value="${esc(st.zoek)}">
      </label>
      <button type="button" class="btn btn-sm ${st.enkelUuid ? 'btn-primary' : 'btn-ghost border border-base-content/20'}"
        data-action="botlog-toggle-uuid"
        title="Enkel inzendingen met een bezoeker-UUID. Een bot die enkel het formulier post, heeft er geen; een echte bezoeker bijna altijd -- maar niet altijd.">
        <i data-lucide="fingerprint" class="w-3.5 h-3.5"></i> Enkel met bezoeker-UUID
      </button>
      <button type="button" class="btn btn-sm btn-ghost border border-base-content/20" data-action="botlog-refresh">
        <i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i> Vernieuwen
      </button>
    </div>`;
  }

  function renderLijst() {
    if (st.laden && !st.data) {
      return `<div class="flex justify-center py-16"><span class="loading loading-spinner loading-md"></span></div>`;
    }
    if (st.fout) {
      return `<div class="alert alert-error text-sm"><i data-lucide="alert-triangle" class="w-4 h-4"></i><span>${esc(st.fout)}</span></div>`;
    }
    var rijen = zichtbareRijen();
    var totaal = ((st.data && st.data.items) || []).length;
    if (!rijen.length) {
      var leeg = totaal
        ? 'Niets dat aan je zoekopdracht of filter voldoet.'
        : (st.filter === 'open' ? 'Niets te bekijken. Alles wat tegengehouden werd, is al behandeld.' : 'Hier staat niets.');
      return `<div class="text-sm text-base-content/55 py-10 text-center">${esc(leeg)}</div>`;
    }
    var voet = totaal >= 300
      ? `<p class="text-xs text-base-content/45 mt-3">Toont de 300 nieuwste.</p>`
      : '';
    // Bij de LIJST en niet in de werkbalk: het aantal volgt het zoekveld, en
    // tijdens het typen wordt enkel de lijst hertekend.
    var negeerbaar = rijen.filter(function (r) { return r.status === 'open'; }).length;
    var kop = `<div class="flex flex-wrap items-center justify-between gap-2 mb-2">
      <span class="text-xs text-base-content/50">${rijen.length} van ${totaal}</span>
      ${negeerbaar ? `<button type="button" class="btn btn-xs btn-ghost border border-base-content/20" data-action="botlog-dismiss-visible">
        <i data-lucide="eye-off" class="w-3 h-3"></i> Negeer wat je ziet (${negeerbaar})
      </button>` : ''}
    </div>`;
    return `${kop}<div class="space-y-2">${rijen.map(renderRij).join('')}</div>${voet}`;
  }

  function renderSignalen(rij) {
    var m = meta(rij);
    var badges = [];
    badges.push(heeftUuid(rij)
      ? `<span class="badge badge-sm badge-success badge-outline gap-1" title="Bezoeker-UUID ${esc(m.ovme_uuid)}"><i data-lucide="fingerprint" class="w-3 h-3"></i>bezoeker-UUID</span>`
      : `<span class="badge badge-sm badge-ghost gap-1" title="Geen tracking-cookie meegestuurd. Typisch voor een bot, maar ook mogelijk bij een echte bezoeker."><i data-lucide="fingerprint" class="w-3 h-3 opacity-50"></i>geen UUID</span>`);
    if (m.utm_source || m.utm_campaign) {
      badges.push(`<span class="badge badge-sm badge-ghost" title="${esc([m.utm_source, m.utm_medium, m.utm_campaign].filter(Boolean).join(' / '))}">UTM</span>`);
    }
    var codes = (rij.codes || []).join(', ');
    badges.push(`<span class="badge badge-sm badge-warning badge-outline" title="${esc(codes ? 'Turnstile: ' + codes : 'Turnstile')}${rij.hostname ? esc(' · ' + rij.hostname) : ''}">${esc(UITKOMST_LABELS[rij.outcome] || rij.outcome)}</span>`);
    if (rij.later_submission) {
      badges.push(`<span class="badge badge-sm badge-info gap-1" title="Op ${esc(window.FSV2.fmt(rij.later_submission.created_at))} kwam van hetzelfde adres een inzending op deze koppeling binnen (${esc(rij.later_submission.status || '')}).">
        <i data-lucide="check-check" class="w-3 h-3"></i>later wel verstuurd</span>`);
    }
    return badges.join('');
  }

  function renderStatusRegel(rij, koppeling) {
    if (rij.status === 'released') {
      return `<div class="text-xs text-success flex items-center gap-1.5 mt-1.5">
        <i data-lucide="check" class="w-3 h-3"></i>
        Doorgelaten${rij.handled_by ? ` door ${esc(rij.handled_by)}` : ''} op ${esc(window.FSV2.fmt(rij.handled_at))}
        ${koppeling.bestaat ? `<button type="button" class="link link-hover ml-1" data-action="open-detail" data-id="${esc(rij.integration_id)}">naar de koppeling</button>` : ''}
      </div>`;
    }
    if (rij.status === 'dismissed') {
      return `<div class="text-xs text-base-content/50 mt-1.5">Genegeerd${rij.handled_by ? ` door ${esc(rij.handled_by)}` : ''} op ${esc(window.FSV2.fmt(rij.handled_at))}</div>`;
    }
    if (rij.release_error) {
      return `<div class="text-xs text-error mt-1.5">Doorlaten mislukte: ${esc(rij.release_error)}</div>`;
    }
    return '';
  }

  function renderRij(rij) {
    var k = koppelingVan(rij);
    var s = samenvatting(rij);
    var uitgeklapt = !!st.open[rij.id];
    var titel = s.naam || s.email || '(geen naam)';

    var acties = [];
    acties.push(`<button type="button" class="btn btn-xs btn-ghost" data-action="botlog-toggle" data-id="${esc(rij.id)}">
      <i data-lucide="${uitgeklapt ? 'chevron-up' : 'chevron-down'}" class="w-3 h-3"></i>Details</button>`);
    if (rij.status !== 'released' && k.bestaat) {
      acties.push(`<button type="button" class="btn btn-xs btn-primary" data-action="botlog-release" data-id="${esc(rij.id)}">
        <i data-lucide="send" class="w-3 h-3"></i>Doorlaten</button>`);
    }
    if (rij.status === 'open') {
      acties.push(`<button type="button" class="btn btn-xs btn-ghost border border-base-content/20" data-action="botlog-dismiss" data-id="${esc(rij.id)}">Negeren</button>`);
    }
    if (rij.status === 'dismissed') {
      acties.push(`<button type="button" class="btn btn-xs btn-ghost border border-base-content/20" data-action="botlog-undismiss" data-id="${esc(rij.id)}">Terugzetten</button>`);
    }

    return `<div class="border border-base-content/20 rounded-box p-3 bg-base-100">
      <div class="flex flex-col md:flex-row md:items-start gap-3">
        <div class="min-w-0 flex-1">
          <div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span class="font-semibold truncate max-w-full">${esc(titel)}</span>
            ${s.email && s.naam ? `<span class="text-sm text-base-content/60 truncate">${esc(s.email)}</span>` : ''}
          </div>
          <div class="text-xs text-base-content/50 mt-0.5">
            ${esc(window.FSV2.fmt(rij.created_at))} · ${esc(k.name || rij.form_name || rij.form_slug)}${rij.site ? ` · ${esc(rij.site)}` : ''}${k.bestaat ? '' : ' · koppeling bestaat niet meer'}
          </div>
          ${s.bericht ? `<p class="text-sm text-base-content/75 mt-1.5 line-clamp-2 break-words">${esc(s.bericht)}</p>` : ''}
          <div class="flex flex-wrap gap-1.5 mt-2">${renderSignalen(rij)}</div>
          ${renderStatusRegel(rij, k)}
        </div>
        <div class="flex flex-wrap gap-1.5 md:justify-end shrink-0">${acties.join('')}</div>
      </div>
      ${uitgeklapt ? renderDetails(rij, k) : ''}
    </div>`;
  }

  function renderDetails(rij, k) {
    var m = meta(rij);
    var bekend = {};
    var regels = (k.fields || []).map(function (f) {
      bekend[f.key] = true;
      var w = waardeTekst(rij, f.key);
      if (!w) return '';
      return `<tr><td class="align-top text-base-content/55 pr-4 py-1 w-48">${esc(f.label || f.key)}</td><td class="py-1 break-words whitespace-pre-wrap">${esc(w)}</td></tr>`;
    });
    // Een veld dat intussen uit het formulier verdween: toch tonen, met de sleutel.
    Object.keys((rij.body && rij.body.form_data) || {}).forEach(function (sleutel) {
      if (bekend[sleutel]) return;
      var w = waardeTekst(rij, sleutel);
      if (w) regels.push(`<tr><td class="align-top text-base-content/55 pr-4 py-1 w-48">${esc(sleutel)}</td><td class="py-1 break-words whitespace-pre-wrap">${esc(w)}</td></tr>`);
    });

    var herkomst = [
      // De pagina-URL komt van de site -- bij een bot dus van de bot. Enkel
      // http(s) wordt een link; al de rest staat er als tekst.
      ['Pagina', !m.page_url ? '' : (/^https?:\/\//i.test(m.page_url)
        ? `<a class="link" href="${esc(m.page_url)}" target="_blank" rel="noopener noreferrer">${esc(m.page_url)}</a>`
        : esc(m.page_url))],
      ['Verwijzer', esc(m.referrer || '')],
      ['Taal', esc(m.lang || '')],
      ['UTM', esc([m.utm_source, m.utm_medium, m.utm_campaign, m.utm_term, m.utm_content].filter(Boolean).join(' / '))],
      ['Bezoeker-UUID', esc(m.ovme_uuid || '')],
      ['Verstuurd', m.submitted_at ? esc(window.FSV2.fmt(m.submitted_at)) : ''],
      ['Turnstile', esc([UITKOMST_LABELS[rij.outcome] || rij.outcome, (rij.codes || []).join(', '), rij.hostname].filter(Boolean).join(' · '))],
    ].filter(function (r) { return r[1]; }).map(function (r) {
      return `<tr><td class="align-top text-base-content/55 pr-4 py-1 w-48">${r[0]}</td><td class="py-1 break-all">${r[1]}</td></tr>`;
    });

    return `<div class="mt-3 pt-3 border-t border-base-content/20 grid gap-4 lg:grid-cols-2 text-sm">
      <div>
        <p class="text-xs font-semibold uppercase tracking-wide text-base-content/50 mb-1">Ingevuld</p>
        <table class="w-full"><tbody>${regels.join('') || '<tr><td class="text-base-content/50 py-1">Niets ingevuld.</td></tr>'}</tbody></table>
      </div>
      <div>
        <p class="text-xs font-semibold uppercase tracking-wide text-base-content/50 mb-1">Herkomst</p>
        <table class="w-full"><tbody>${herkomst.join('')}</tbody></table>
      </div>
    </div>`;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // ACTIES
  // ═══════════════════════════════════════════════════════════════════════════

  function rijMetId(id) {
    return ((st.data && st.data.items) || []).find(function (r) { return r.id === id; }) || null;
  }

  async function handleBotLogAction(action, btn) {
    if (action === 'botlog-filter') {
      st.filter = btn.dataset.filter || 'open';
      st.open = {};
      await laadBotLog();
      return;
    }
    if (action === 'botlog-refresh') {
      await laadBotLog();
      return;
    }
    if (action === 'botlog-toggle-uuid') {
      st.enkelUuid = !st.enkelUuid;
      render();
      return;
    }
    if (action === 'botlog-toggle') {
      var id = btn.dataset.id;
      st.open[id] = !st.open[id];
      render();
      return;
    }
    if (st.bezig) return;

    if (action === 'botlog-release') {
      await doorlaten(btn.dataset.id, btn);
      return;
    }
    if (action === 'botlog-dismiss' || action === 'botlog-undismiss') {
      await metKnop(btn, async function () {
        await window.FSV2.api('/bot-rejections/dismiss', {
          method: 'POST',
          body: JSON.stringify({ ids: [btn.dataset.id], undo: action === 'botlog-undismiss' }),
        });
        await laadBotLog();
      });
      return;
    }
    if (action === 'botlog-dismiss-visible') {
      var ids = zichtbareRijen().filter(function (r) { return r.status === 'open'; }).map(function (r) { return r.id; });
      if (!ids.length) return;
      if (!confirm(`${ids.length} inzending${ids.length === 1 ? '' : 'en'} negeren?\n\nZe blijven ${st.data.retention_days || 30} dagen staan onder "Genegeerd" en kunnen daar teruggezet of alsnog doorgelaten worden.`)) return;
      await metKnop(btn, async function () {
        var res = await window.FSV2.api('/bot-rejections/dismiss', { method: 'POST', body: JSON.stringify({ ids: ids }) });
        window.FSV2.showAlert(`${(res.data && res.data.updated) || 0} genegeerd.`, 'success');
        await laadBotLog();
      });
      return;
    }
  }

  async function doorlaten(id, btn) {
    var rij = rijMetId(id);
    if (!rij) return;
    var k = koppelingVan(rij);
    var s = samenvatting(rij);

    var regels = [`Deze inzending alsnog door de koppeling "${k.name || rij.form_name}" laten lopen?`, ''];
    regels.push(k.is_active
      ? `Dat gebeurt exact zoals bij een gewone inzending: records in Odoo, notities en eventuele mails${s.email ? ' naar ' + s.email : ''}.`
      : 'De koppeling staat UIT: de inzending wordt bewaard, maar er gaat niets naar Odoo. Daarvoor zet je de koppeling aan en gebruik je Replay in Indieningen.');
    if (rij.later_submission) {
      regels.push('', 'LET OP: van dit adres kwam daarna al een inzending binnen op deze koppeling. Doorlaten maakt er waarschijnlijk een tweede lead van.');
    }
    if (!heeftUuid(rij)) {
      regels.push('', 'Deze inzending heeft geen bezoeker-UUID. Dat is typisch voor een bot -- kijk de inhoud goed na.');
    }
    if (!confirm(regels.join('\n'))) return;

    await metKnop(btn, async function () {
      var res = await window.FSV2.api(`/bot-rejections/${encodeURIComponent(id)}/release`, { method: 'POST' });
      var d = res.data || {};
      window.FSV2.showAlert(d.status === 'received'
        ? 'Bewaard. De koppeling staat uit, dus er ging niets naar Odoo.'
        : `Doorgelaten. Je vindt ze in Indieningen van "${k.name || rij.form_name}".`, 'success');
      await laadBotLog();
    });
  }

  async function metKnop(btn, fn) {
    st.bezig = true;
    var origineel = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="loading loading-spinner loading-xs"></span>'; }
    try {
      await fn();
    } catch (err) {
      window.FSV2.showAlert(err.message, 'error');
      // Een mislukte doorlating zet de rij terug op "open" met de reden erbij.
      await laadBotLog();
    } finally {
      st.bezig = false;
      if (btn && btn.isConnected) { btn.disabled = false; btn.innerHTML = origineel; }
    }
  }

  function handleBotLogSearch(waarde) {
    st.zoek = String(waarde || '');
    st._alleenLijst = true;
    render();
  }

  Object.assign(window.FSV2, {
    laadBotLog: laadBotLog,
    handleBotLogAction: handleBotLogAction,
    handleBotLogSearch: handleBotLogSearch,
  });
}());
