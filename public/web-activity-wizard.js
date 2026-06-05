/**
 * Web Activiteit Wizard
 *
 * Twee panelen:
 * 1. Web Activiteit op Leads  — verrijkt leads uit de actionsheet query met web activity velden
 * 2. Web Visitors Export      — haal ruwe visitor data op per site en tijdsperiode
 */

// ============================================================================
// STATE
// ============================================================================

const webActivityState = {
  // Panel 1: lead enrichment
  leads: {
    ids: [],            // gevuld vanuit de actionsheet resultaten
    includeTimeline: false,
    includeKpi: false,
    includeBrand: true,
    loading: false,
    results: null,
    error: null,
  },
  // Panel 2: visitors export
  visitors: {
    sourceSite: 'openvme.be',
    dateFrom: (() => {
      const d = new Date();
      d.setMonth(d.getMonth() - 1);
      return d.toISOString().slice(0, 10);
    })(),
    dateTo: new Date().toISOString().slice(0, 10),
    excludeInstantBounce: false,
    excludePossibleBounce: false,
    loading: false,
    results: null,
    error: null,
    meta: null,
  },
};

// ============================================================================
// HELPERS
// ============================================================================

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso.replace(' ', 'T') + (iso.includes('T') ? '' : 'Z'))
    .toLocaleDateString('nl-BE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function daysBetween(from, to) {
  return Math.round((new Date(to) - new Date(from)) / 86400000);
}

function channelBadge(channel) {
  if (!channel) return '';
  if (channel.startsWith('ai:')) {
    return `<span class="badge badge-sm" style="background:#10a37f22;color:#10a37f;border:1px solid #10a37f44;">🤖 ${channel.slice(3)}</span>`;
  }
  if (channel.startsWith('email:')) {
    return `<span class="badge badge-sm" style="background:#0891b222;color:#0891b2;border:1px solid #0891b244;">📧 ${channel.slice(6)}</span>`;
  }
  if (channel.startsWith('social:')) {
    return `<span class="badge badge-sm" style="background:#e1306c22;color:#e1306c;border:1px solid #e1306c44;">📱 ${channel.slice(7)}</span>`;
  }
  return `<span class="badge badge-sm badge-ghost">${channel}</span>`;
}

// ============================================================================
// PANEL 1: LEAD WEB ACTIVITEIT
// ============================================================================

function renderLeadWebActivity() {
  const s = webActivityState.leads;

  // Haal lead IDs op uit de actionsheet resultaten als die beschikbaar zijn
  const actionsheetLeadIds = getActionsheetLeadIds();
  const hasActionsheetLeads = actionsheetLeadIds.length > 0;

  return `
    <div class="space-y-6">

      <!-- Uitleg -->
      <div class="alert alert-info">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="stroke-current shrink-0 w-5 h-5">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        <div>
          <div class="font-bold">Web activiteit op je leads</div>
          <div class="text-sm">
            Verrijkt de leads uit je actionsheet resultaten met webbezoeker-informatie: heeft de lead een timeline, wat is de merkherkomst, en optioneel de volledige KPI- en timeline-HTML.
          </div>
        </div>
      </div>

      <!-- Lead IDs bron -->
      <div class="card bg-base-100 shadow">
        <div class="card-body pb-4">
          <h3 class="font-bold text-base mb-3 flex items-center gap-2">
            <i data-lucide="users" class="w-4 h-4"></i>
            Leads
          </h3>

          ${hasActionsheetLeads ? `
            <div class="flex items-center gap-3 p-3 bg-success/10 border border-success/30 rounded-lg">
              <i data-lucide="check-circle" class="w-5 h-5 text-success shrink-0"></i>
              <div>
                <div class="font-semibold text-sm">${actionsheetLeadIds.length} leads gevonden uit actionsheet resultaten</div>
                <div class="text-xs text-base-content/60">IDs: ${actionsheetLeadIds.slice(0, 5).join(', ')}${actionsheetLeadIds.length > 5 ? ` + ${actionsheetLeadIds.length - 5} meer` : ''}</div>
              </div>
              <button class="btn btn-xs btn-ghost ml-auto" onclick="webActivityState.leads.ids = []; renderWebActivityPanel();">
                Wissen
              </button>
            </div>
          ` : `
            <div class="space-y-3">
              <div class="text-sm text-base-content/60">
                Voer de actionsheet query eerst uit, of geef lead IDs handmatig in.
              </div>
              <div class="form-control">
                <label class="label py-1">
                  <span class="label-text text-sm">Lead IDs (komma-gescheiden)</span>
                </label>
                <textarea
                  class="textarea textarea-bordered textarea-sm font-mono"
                  rows="2"
                  placeholder="7308, 7309, 7310"
                  id="manualLeadIds"
                  onchange="webActivityState.leads.ids = this.value.split(',').map(v => parseInt(v.trim())).filter(n => !isNaN(n));"
                ></textarea>
              </div>
            </div>
          `}
        </div>
      </div>

      <!-- Opties -->
      <div class="card bg-base-100 shadow">
        <div class="card-body pb-4">
          <h3 class="font-bold text-base mb-3 flex items-center gap-2">
            <i data-lucide="sliders" class="w-4 h-4"></i>
            Opties
          </h3>
          <div class="space-y-3">

            <label class="label cursor-pointer justify-start gap-4 py-1">
              <input type="checkbox" class="checkbox checkbox-primary checkbox-sm"
                ${s.includeBrand ? 'checked' : ''}
                onchange="webActivityState.leads.includeBrand = this.checked;"
              />
              <div>
                <div class="label-text font-semibold">Merkherkomst</div>
                <div class="label-text-alt text-base-content/60">x_studio_brand_origin — hoe de lead voor het eerst op de site belandde</div>
              </div>
            </label>

            <label class="label cursor-pointer justify-start gap-4 py-1">
              <input type="checkbox" class="checkbox checkbox-secondary checkbox-sm"
                ${s.includeKpi ? 'checked' : ''}
                onchange="webActivityState.leads.includeKpi = this.checked;"
              />
              <div>
                <div class="label-text font-semibold">KPI blok <span class="badge badge-xs badge-warning ml-1">HTML</span></div>
                <div class="label-text-alt text-base-content/60">x_studio_merged_kpi_html — bezoeksstatistieken als HTML blok</div>
              </div>
            </label>

            <label class="label cursor-pointer justify-start gap-4 py-1">
              <input type="checkbox" class="checkbox checkbox-accent checkbox-sm"
                ${s.includeTimeline ? 'checked' : ''}
                onchange="webActivityState.leads.includeTimeline = this.checked;"
              />
              <div>
                <div class="label-text font-semibold">Volledige timeline <span class="badge badge-xs badge-warning ml-1">HTML · zwaar</span></div>
                <div class="label-text-alt text-base-content/60">x_studio_merged_timeline_html — volledige bezoekersgeschiedenis als HTML</div>
              </div>
            </label>

          </div>
        </div>
      </div>

      <!-- Actie -->
      <div class="flex justify-end">
        <button
          class="btn btn-primary gap-2 ${s.loading ? 'loading' : ''}"
          onclick="fetchLeadWebActivity();"
          ${(hasActionsheetLeads || (document.getElementById('manualLeadIds')?.value.trim())) && !s.loading ? '' : 'disabled'}
        >
          ${s.loading ? '' : '<i data-lucide="globe" class="w-4 h-4"></i>'}
          Web activiteit ophalen
        </button>
      </div>

      <!-- Error -->
      ${s.error ? `
        <div class="alert alert-error">
          <i data-lucide="alert-circle" class="w-5 h-5 shrink-0"></i>
          <div>
            <div class="font-bold">Fout</div>
            <div class="text-sm">${s.error}</div>
          </div>
        </div>
      ` : ''}

      <!-- Resultaten -->
      ${s.results ? renderLeadResults(s.results) : ''}

    </div>
  `;
}

function renderLeadResults(results) {
  const withActivity = results.filter(r => r.x_has_web_activity);
  const without = results.filter(r => !r.x_has_web_activity);

  return `
    <div class="card bg-base-100 shadow">
      <div class="card-body">
        <div class="flex items-center justify-between mb-4">
          <div>
            <h3 class="font-bold text-lg flex items-center gap-2">
              <i data-lucide="activity" class="w-5 h-5 text-primary"></i>
              Web activiteit resultaten
            </h3>
            <p class="text-sm text-base-content/60">
              ${withActivity.length} van ${results.length} leads hebben web activiteit
            </p>
          </div>
          <div class="flex gap-2">
            <button class="btn btn-sm btn-outline gap-2" onclick="exportLeadWebActivity('json')">
              <i data-lucide="download" class="w-3 h-3"></i> JSON
            </button>
          </div>
        </div>

        <!-- Samenvatting pills -->
        <div class="flex gap-3 mb-6 flex-wrap">
          <div class="stat bg-success/10 rounded-lg px-4 py-2 border border-success/20">
            <div class="stat-title text-xs">Met activiteit</div>
            <div class="stat-value text-lg text-success">${withActivity.length}</div>
          </div>
          <div class="stat bg-base-200 rounded-lg px-4 py-2">
            <div class="stat-title text-xs">Zonder activiteit</div>
            <div class="stat-value text-lg">${without.length}</div>
          </div>
          <div class="stat bg-base-200 rounded-lg px-4 py-2">
            <div class="stat-title text-xs">Totaal</div>
            <div class="stat-value text-lg">${results.length}</div>
          </div>
        </div>

        <!-- Tabel -->
        <div class="overflow-x-auto">
          <table class="table table-zebra table-sm w-full">
            <thead>
              <tr>
                <th>Lead ID</th>
                <th>Activiteit</th>
                ${webActivityState.leads.includeBrand ? '<th>Merkherkomst</th>' : ''}
                ${webActivityState.leads.includeKpi ? '<th>KPI</th>' : ''}
                ${webActivityState.leads.includeTimeline ? '<th>Timeline</th>' : ''}
              </tr>
            </thead>
            <tbody>
              ${results.map(r => `
                <tr>
                  <td class="font-mono text-sm">${r.lead_id}</td>
                  <td>
                    ${r.x_has_web_activity
                      ? '<span class="badge badge-success badge-sm gap-1"><i data-lucide="check" class="w-3 h-3"></i> Ja</span>'
                      : '<span class="badge badge-ghost badge-sm">Nee</span>'
                    }
                  </td>
                  ${webActivityState.leads.includeBrand ? `
                    <td>
                      ${r.x_studio_brand_origin
                        ? `<span class="badge badge-outline badge-sm">${r.x_studio_brand_origin}</span>`
                        : '<span class="text-base-content/30 text-xs">—</span>'
                      }
                    </td>
                  ` : ''}
                  ${webActivityState.leads.includeKpi ? `
                    <td>
                      ${r.x_studio_merged_kpi_html
                        ? `<button class="btn btn-xs btn-ghost" onclick="showHtmlModal('KPI — Lead ${r.lead_id}', this.dataset.html)" data-html="${escapeAttr(r.x_studio_merged_kpi_html)}">
                            <i data-lucide="eye" class="w-3 h-3"></i> Bekijken
                          </button>`
                        : '<span class="text-base-content/30 text-xs">—</span>'
                      }
                    </td>
                  ` : ''}
                  ${webActivityState.leads.includeTimeline ? `
                    <td>
                      ${r.x_studio_merged_timeline_html
                        ? `<button class="btn btn-xs btn-ghost" onclick="showHtmlModal('Timeline — Lead ${r.lead_id}', this.dataset.html)" data-html="${escapeAttr(r.x_studio_merged_timeline_html)}">
                            <i data-lucide="eye" class="w-3 h-3"></i> Bekijken
                          </button>`
                        : '<span class="text-base-content/30 text-xs">—</span>'
                      }
                    </td>
                  ` : ''}
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

// ============================================================================
// PANEL 2: WEB VISITORS EXPORT
// ============================================================================

function renderVisitorsExport() {
  const s = webActivityState.visitors;
  const days = s.dateFrom && s.dateTo ? daysBetween(s.dateFrom, s.dateTo) : 0;
  const tooLong = days > 92;

  return `
    <div class="space-y-6">

      <!-- Uitleg -->
      <div class="alert alert-info">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" class="stroke-current shrink-0 w-5 h-5">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
        </svg>
        <div>
          <div class="font-bold">Web visitors ophalen</div>
          <div class="text-sm">
            Haal bezoekersdata op als JSON, inclusief kanaalgegevens en paginagebeurtenissen. Geen HTML — enkel gestructureerde data. Maximum 3 maanden per export.
          </div>
        </div>
      </div>

      <!-- Filters -->
      <div class="card bg-base-100 shadow">
        <div class="card-body pb-4">
          <h3 class="font-bold text-base mb-4 flex items-center gap-2">
            <i data-lucide="filter" class="w-4 h-4"></i>
            Filters
          </h3>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">

            <!-- Site -->
            <div class="form-control">
              <label class="label py-1">
                <span class="label-text font-semibold">Website</span>
              </label>
              <select class="select select-bordered select-sm"
                onchange="webActivityState.visitors.sourceSite = this.value;">
                <option value="openvme.be" ${s.sourceSite === 'openvme.be' ? 'selected' : ''}>openvme.be</option>
                <option value="mymmo.be" ${s.sourceSite === 'mymmo.be' ? 'selected' : ''}>mymmo.be</option>
                <option value="" ${!s.sourceSite ? 'selected' : ''}>Alle sites</option>
              </select>
            </div>

            <!-- Placeholder kolom -->
            <div></div>

            <!-- Datum van -->
            <div class="form-control">
              <label class="label py-1">
                <span class="label-text font-semibold">Vanaf</span>
              </label>
              <input type="date" class="input input-bordered input-sm"
                value="${s.dateFrom}"
                max="${s.dateTo}"
                onchange="webActivityState.visitors.dateFrom = this.value; renderWebActivityPanel();"
              />
            </div>

            <!-- Datum tot -->
            <div class="form-control">
              <label class="label py-1">
                <span class="label-text font-semibold">Tot en met</span>
              </label>
              <input type="date" class="input input-bordered input-sm"
                value="${s.dateTo}"
                min="${s.dateFrom}"
                max="${new Date().toISOString().slice(0, 10)}"
                onchange="webActivityState.visitors.dateTo = this.value; renderWebActivityPanel();"
              />
            </div>

          </div>

          <!-- Periode indicator -->
          <div class="mt-3">
            ${tooLong ? `
              <div class="alert alert-error alert-sm py-2">
                <i data-lucide="alert-triangle" class="w-4 h-4 shrink-0"></i>
                <span class="text-sm"><strong>${days} dagen</strong> — maximaal 92 dagen (3 maanden) toegestaan.</span>
              </div>
            ` : days > 0 ? `
              <div class="flex items-center gap-2 text-sm text-base-content/60">
                <i data-lucide="calendar" class="w-4 h-4"></i>
                Periode: <strong>${days} dagen</strong>
              </div>
            ` : ''}
          </div>

          <!-- Bounce filters -->
          <div class="divider my-3">Bezoekers filteren</div>
          <div class="flex flex-wrap gap-6">
            <label class="label cursor-pointer justify-start gap-3 py-1">
              <input type="checkbox" class="checkbox checkbox-sm"
                ${s.excludeInstantBounce ? 'checked' : ''}
                onchange="webActivityState.visitors.excludeInstantBounce = this.checked;"
              />
              <div>
                <div class="label-text font-semibold">Instant bounces uitsluiten</div>
                <div class="label-text-alt text-base-content/60">Bezoekers die meteen vertrokken</div>
              </div>
            </label>
            <label class="label cursor-pointer justify-start gap-3 py-1">
              <input type="checkbox" class="checkbox checkbox-sm"
                ${s.excludePossibleBounce ? 'checked' : ''}
                onchange="webActivityState.visitors.excludePossibleBounce = this.checked;"
              />
              <div>
                <div class="label-text font-semibold">Mogelijke bounces uitsluiten</div>
                <div class="label-text-alt text-base-content/60">Bezoekers die waarschijnlijk geen interesse hadden</div>
              </div>
            </label>
          </div>

        </div>
      </div>

      <!-- Actie -->
      <div class="flex items-center justify-between">
        <div class="text-sm text-base-content/50">
          Resultaten worden als JSON gedownload of getoond in de tabel hieronder.
        </div>
        <div class="flex gap-2">
          <button
            class="btn btn-outline gap-2 ${s.loading ? 'loading' : ''}"
            onclick="fetchVisitors(false);"
            ${!tooLong && !s.loading ? '' : 'disabled'}
          >
            ${s.loading ? '' : '<i data-lucide="table" class="w-4 h-4"></i>'}
            Tonen
          </button>
          <button
            class="btn btn-primary gap-2 ${s.loading ? 'loading' : ''}"
            onclick="fetchVisitors(true);"
            ${!tooLong && !s.loading ? '' : 'disabled'}
          >
            ${s.loading ? '' : '<i data-lucide="download" class="w-4 h-4"></i>'}
            Download JSON
          </button>
        </div>
      </div>

      <!-- Error -->
      ${s.error ? `
        <div class="alert alert-error">
          <i data-lucide="alert-circle" class="w-5 h-5 shrink-0"></i>
          <div>
            <div class="font-bold">Fout</div>
            <div class="text-sm">${s.error}</div>
          </div>
        </div>
      ` : ''}

      <!-- Resultaten -->
      ${s.results ? renderVisitorResults(s.results, s.meta) : ''}

    </div>
  `;
}

function renderVisitorResults(records, meta) {
  if (!records.length) {
    return `
      <div class="alert">
        <i data-lucide="info" class="w-5 h-5 shrink-0"></i>
        <span>Geen bezoekers gevonden voor de geselecteerde filters.</span>
      </div>
    `;
  }

  const withLeads = records.filter(r => r.has_leads).length;
  const withSummary = records.filter(r => r.summary).length;

  return `
    <div class="card bg-base-100 shadow">
      <div class="card-body">
        <div class="flex items-center justify-between mb-4">
          <div>
            <h3 class="font-bold text-lg flex items-center gap-2">
              <i data-lucide="users" class="w-5 h-5 text-primary"></i>
              Bezoekers
            </h3>
            <p class="text-sm text-base-content/60">
              ${records.length} bezoekers${meta ? ` · ${fmtDate(meta.filters.date_from)} – ${fmtDate(meta.filters.date_to)}` : ''}
            </p>
          </div>
          <button class="btn btn-sm btn-outline gap-2" onclick="exportVisitorsJson()">
            <i data-lucide="download" class="w-3 h-3"></i> Download JSON
          </button>
        </div>

        <!-- Stats -->
        <div class="flex gap-3 mb-6 flex-wrap">
          <div class="stat bg-base-200 rounded-lg px-4 py-2">
            <div class="stat-title text-xs">Bezoekers</div>
            <div class="stat-value text-lg">${records.length}</div>
          </div>
          <div class="stat bg-success/10 rounded-lg px-4 py-2 border border-success/20">
            <div class="stat-title text-xs">Met lead</div>
            <div class="stat-value text-lg text-success">${withLeads}</div>
          </div>
          <div class="stat bg-primary/10 rounded-lg px-4 py-2 border border-primary/20">
            <div class="stat-title text-xs">Met timeline data</div>
            <div class="stat-value text-lg text-primary">${withSummary}</div>
          </div>
        </div>

        <!-- Tabel -->
        <div class="overflow-x-auto">
          <table class="table table-zebra table-sm w-full">
            <thead>
              <tr>
                <th>Eerste bezoek</th>
                <th>Site</th>
                <th>Kanalen</th>
                <th>Sessies</th>
                <th>Email</th>
                <th>Lead</th>
                <th>Bounce</th>
              </tr>
            </thead>
            <tbody>
              ${records.slice(0, 200).map(r => {
                const channels = r.summary?.channels || [];
                return `
                  <tr>
                    <td class="text-sm whitespace-nowrap">${fmtDate(r.first_seen)}</td>
                    <td class="text-xs text-base-content/60">${r.source_site || '—'}</td>
                    <td class="max-w-xs">
                      <div class="flex flex-wrap gap-1">
                        ${channels.length ? channels.slice(0, 3).map(channelBadge).join('') : '<span class="text-base-content/30 text-xs">—</span>'}
                        ${channels.length > 3 ? `<span class="badge badge-xs badge-ghost">+${channels.length - 3}</span>` : ''}
                      </div>
                    </td>
                    <td class="text-center">${r.summary?.total_sessions ?? '—'}</td>
                    <td class="text-xs font-mono">${r.email || '<span class="text-base-content/30">—</span>'}</td>
                    <td>${r.has_leads ? '<span class="badge badge-success badge-xs">Ja</span>' : '<span class="badge badge-ghost badge-xs">Nee</span>'}</td>
                    <td>${r.possible_bounce ? '<span class="badge badge-warning badge-xs">Mogelijk</span>' : r.instant_bounce ? '<span class="badge badge-error badge-xs">Instant</span>' : ''}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
          ${records.length > 200 ? `
            <div class="text-center py-3 text-sm text-base-content/50">
              Toont 200 van ${records.length} bezoekers. Download de JSON voor het volledige bestand.
            </div>
          ` : ''}
        </div>
      </div>
    </div>
  `;
}

// ============================================================================
// API CALLS
// ============================================================================

function getActionsheetLeadIds() {
  // Haal lead IDs op uit de actionsheet resultaten (semantic wizard)
  if (webActivityState.leads.ids.length > 0) return webActivityState.leads.ids;

  // Probeer uit de laatste wizard resultaten te lezen
  try {
    const resultsEl = document.getElementById('results-container');
    if (!resultsEl) return [];
    // Zoek __leads in de wizard resultaten — niet beschikbaar zonder state access
    return [];
  } catch (_) {
    return [];
  }
}

async function fetchLeadWebActivity() {
  const s = webActivityState.leads;
  s.loading = true;
  s.error = null;
  s.results = null;
  renderWebActivityPanel();

  // Verzamel IDs
  let ids = getActionsheetLeadIds();
  if (!ids.length) {
    const manualEl = document.getElementById('manualLeadIds');
    if (manualEl?.value.trim()) {
      ids = manualEl.value.split(',').map(v => parseInt(v.trim())).filter(n => !isNaN(n));
    }
  }

  if (!ids.length) {
    s.error = 'Geen lead IDs beschikbaar. Voer eerst de actionsheet query uit of geef IDs handmatig in.';
    s.loading = false;
    renderWebActivityPanel();
    return;
  }

  try {
    const res = await fetch('/insights/api/sales-insights/leads/web-activity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lead_ids: ids,
        include_timeline: s.includeTimeline,
        include_kpi: s.includeKpi,
        include_brand: s.includeBrand,
      }),
    });

    const data = await res.json();
    if (!data.success) throw new Error(data.error?.message || 'Onbekende fout');

    s.results = data.data.results;
  } catch (e) {
    s.error = e.message;
  } finally {
    s.loading = false;
    renderWebActivityPanel();
    if (window.lucide) lucide.createIcons();
  }
}

async function fetchVisitors(download = false) {
  const s = webActivityState.visitors;
  s.loading = true;
  s.error = null;
  if (!download) { s.results = null; s.meta = null; }
  renderWebActivityPanel();

  const params = new URLSearchParams({
    date_from: s.dateFrom,
    date_to: s.dateTo,
    limit: 'false',
  });
  if (s.sourceSite) params.set('source_site', s.sourceSite);
  if (s.excludeInstantBounce) params.set('exclude_instant_bounce', 'true');
  if (s.excludePossibleBounce) params.set('exclude_possible_bounce', 'true');

  try {
    const res = await fetch(`/insights/api/sales-insights/web-visitors?${params}`);
    const data = await res.json();
    if (!data.success) throw new Error(data.error?.message || 'Onbekende fout');

    if (download) {
      downloadJson(data.data, `web-visitors_${s.sourceSite}_${s.dateFrom}_${s.dateTo}.json`);
    } else {
      s.results = data.data.records;
      s.meta = data.data.meta;
    }
  } catch (e) {
    s.error = e.message;
  } finally {
    s.loading = false;
    renderWebActivityPanel();
    if (window.lucide) lucide.createIcons();
  }
}

function exportVisitorsJson() {
  if (!webActivityState.visitors.results) return;
  const s = webActivityState.visitors;
  downloadJson(
    { records: s.results, meta: s.meta },
    `web-visitors_${s.sourceSite}_${s.dateFrom}_${s.dateTo}.json`
  );
}

function exportLeadWebActivity(format) {
  if (!webActivityState.leads.results) return;
  downloadJson(
    webActivityState.leads.results,
    `lead-web-activity_${new Date().toISOString().slice(0, 10)}.json`
  );
}

function downloadJson(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

// ============================================================================
// HTML MODAL (voor KPI / Timeline preview)
// ============================================================================

function showHtmlModal(title, html) {
  let modal = document.getElementById('webActivityHtmlModal');
  if (!modal) {
    modal = document.createElement('dialog');
    modal.id = 'webActivityHtmlModal';
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-box max-w-4xl max-h-[80vh] overflow-y-auto">
        <div class="flex justify-between items-center mb-4">
          <h3 id="webActivityModalTitle" class="font-bold text-lg"></h3>
          <button class="btn btn-sm btn-circle btn-ghost" onclick="document.getElementById('webActivityHtmlModal').close()">✕</button>
        </div>
        <div id="webActivityModalContent"></div>
      </div>
      <form method="dialog" class="modal-backdrop"><button>Sluiten</button></form>
    `;
    document.body.appendChild(modal);
  }
  document.getElementById('webActivityModalTitle').textContent = title;
  document.getElementById('webActivityModalContent').innerHTML = html;
  modal.showModal();
}

// ============================================================================
// ESCAPE HELPERS
// ============================================================================

function escapeAttr(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ============================================================================
// HOOFD RENDER — TAB NAVIGATIE
// ============================================================================

let webActivityActiveTab = 'leads';

function renderWebActivityWizard() {
  const container = document.getElementById('web-activity-container');
  if (!container) return;

  container.innerHTML = `
    <div class="space-y-6">

      <!-- Tab navigatie -->
      <div role="tablist" class="tabs tabs-boxed bg-base-200">
        <button
          role="tab"
          class="tab gap-2 ${webActivityActiveTab === 'leads' ? 'tab-active' : ''}"
          onclick="webActivityActiveTab = 'leads'; renderWebActivityPanel();"
        >
          <i data-lucide="link" class="w-4 h-4"></i>
          Web activiteit op leads
        </button>
        <button
          role="tab"
          class="tab gap-2 ${webActivityActiveTab === 'visitors' ? 'tab-active' : ''}"
          onclick="webActivityActiveTab = 'visitors'; renderWebActivityPanel();"
        >
          <i data-lucide="globe" class="w-4 h-4"></i>
          Web visitors export
        </button>
      </div>

      <!-- Tab inhoud -->
      <div id="web-activity-panel"></div>

    </div>
  `;

  renderWebActivityPanel();
  if (window.lucide) lucide.createIcons();
}

function renderWebActivityPanel() {
  const panel = document.getElementById('web-activity-panel');
  if (!panel) return;

  panel.innerHTML = webActivityActiveTab === 'leads'
    ? renderLeadWebActivity()
    : renderVisitorsExport();

  if (window.lucide) lucide.createIcons();
}

// ============================================================================
// INIT
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
  renderWebActivityWizard();
});