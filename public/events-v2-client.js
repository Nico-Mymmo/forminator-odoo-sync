/**
 * Event Operations v2 — client
 *
 * Vertrekt van de kalenderweergave van de v1-module: FullCalendar in
 * maandweergave (7/12) met een sticky detailpaneel ernaast (5/12).
 *
 * Verschil met v1, en dat is opzettelijk:
 *  - EEN statusbron. De status komt uit de API (publication_state) en
 *    wordt hier nooit herberekend. In v1 bestonden drie afwijkende
 *    berekeningen, waardoor kalender en paneel van elkaar konden
 *    verschillen voor hetzelfde event.
 *  - Geen inline onclick met variabelen: alles via data-action plus een
 *    centrale listener.
 *  - Alle datums in Europe/Brussels, nooit in de browsertijdzone.
 */
(function () {
  'use strict';

  var API = '/events-v2/api';
  var PER_PAGE = 50;

  var state = {
    events: [],
    types: [],
    hosts: [],
    listCache: {},
    typeColorById: {},
    page: 1,
    totalPages: 1,
    total: 0,
    selectedId: null,
    detail: null,
    registrations: { rows: [], total: 0, page: 1, totalPages: 1, loading: false, loadedFor: null },
    bodyEditor: null,
    openSection: 'basis',
    previewEditor: null,
    view: 'calendar',
    calendar: null,
    loading: false
  };

  // ─── Hulpjes ───────────────────────────────────────────────────────────────

  function el(id) { return document.getElementById(id); }

  function esc(value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function toast(message, kind) {
    var wrap = el('toastContainer');
    var node = document.createElement('div');
    node.className = 'alert alert-' + (kind || 'info') + ' py-2 text-sm shadow';
    node.textContent = message;
    wrap.appendChild(node);
    setTimeout(function () { node.remove(); }, kind === 'error' ? 8000 : 3500);
  }

  var BRUSSELS = 'Europe/Brussels';

  function formatWhen(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('nl-BE', {
      timeZone: BRUSSELS, weekday: 'short', day: 'numeric', month: 'short',
      year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).format(d);
  }

  function formatTime(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('nl-BE', {
      timeZone: BRUSSELS, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).format(d);
  }

  /** ISO → waarde voor <input type="datetime-local">, in Brussels-tijd. */
  function isoToLocalInput(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    var parts = new Intl.DateTimeFormat('sv-SE', {
      timeZone: BRUSSELS, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(d);
    var get = function (t) { return (parts.find(function (p) { return p.type === t; }) || {}).value; };
    return get('year') + '-' + get('month') + '-' + get('day') + 'T' + get('hour') + ':' + get('minute');
  }

  /**
   * datetime-local (Brussels) → ISO met Z.
   *
   * De offset van Brussel hangt af van de datum zelf (winter- of
   * zomertijd), dus die wordt bepaald voor de ingevoerde datum en niet
   * voor vandaag.
   */
  function localInputToIso(value) {
    if (!value) return null;
    var naive = new Date(value + 'Z');
    if (isNaN(naive.getTime())) return null;

    var probe = new Intl.DateTimeFormat('en-US', {
      timeZone: BRUSSELS, timeZoneName: 'longOffset'
    }).formatToParts(naive);
    var tzName = (probe.find(function (p) { return p.type === 'timeZoneName'; }) || {}).value || 'GMT+00:00';
    var match = tzName.match(/GMT([+-])(\d{2}):(\d{2})/);

    var offsetMinutes = 0;
    if (match) {
      offsetMinutes = (Number(match[2]) * 60 + Number(match[3])) * (match[1] === '-' ? -1 : 1);
    }
    return new Date(naive.getTime() - offsetMinutes * 60000).toISOString();
  }

  /** De fase komt uit x_studio_stage_id in Odoo; hier alleen de weergave. */
  var STATE_BADGE = {
    draft: { label: 'Concept', cls: 'badge-ghost' },
    published: { label: 'Gepubliceerd', cls: 'badge-success' },
    done: { label: 'Afgerond', cls: 'badge-info' },
    cancelled: { label: 'Geannuleerd', cls: 'badge-error' }
  };

  var FORMAT_META = {
    online: { label: 'Online', cls: 'badge-info', icon: 'monitor' },
    onsite: { label: 'Op locatie', cls: 'badge-warning', icon: 'map-pin' },
    hybrid: { label: 'Hybride', cls: 'badge-accent', icon: 'shuffle' }
  };

  var REASON_TEXT = {
    not_published: 'niet gepubliceerd',
    cancelled: 'geannuleerd',
    event_done: 'event is afgerond',
    disabled: 'inschrijven staat uit',
    not_yet_open: 'inschrijfvenster nog niet open',
    closed: 'inschrijfvenster gesloten',
    event_started: 'event is al begonnen',
    full: 'volzet'
  };

  /**
   * Vaste kleur per event type, in de zachte tint die v1 gebruikt: een
   * lichte vulling met gewone tekstkleur erop. Niet fel, want er staan
   * meerdere chips per dagcel.
   */
  var TYPE_TOKENS = ['--p', '--in', '--su', '--wa', '--a', '--s', '--n'];

  function typeStyle(typeId) {
    var index = state.types.findIndex(function (t) { return t.id === typeId; });
    var token = TYPE_TOKENS[(index < 0 ? TYPE_TOKENS.length - 1 : index) % TYPE_TOKENS.length];
    return {
      bg: 'oklch(var(' + token + ') / 0.15)',
      text: 'oklch(var(--bc))',
      accent: 'oklch(var(' + token + '))'
    };
  }

  /** Status zit in het bolletje, niet in de vulkleur. */
  var STATUS_DOT = {
    draft: 'oklch(var(--n))',
    published: 'oklch(var(--su))',
    done: 'oklch(var(--in))',
    cancelled: 'oklch(var(--er))'
  };

  // ─── API ───────────────────────────────────────────────────────────────────

  async function api(path, options) {
    var opts = options || {};
    var isForm = opts.body instanceof FormData;

    var response = await fetch(API + path, {
      method: opts.method || 'GET',
      headers: isForm ? undefined : { 'Content-Type': 'application/json' },
      body: isForm ? opts.body : (opts.body ? JSON.stringify(opts.body) : undefined)
    });

    // Verlopen sessie: de auth-gate stuurt een redirect naar '/'.
    if (response.redirected || response.type === 'opaqueredirect') {
      window.location.href = '/';
      throw new Error('Sessie verlopen');
    }

    var payload;
    try {
      payload = await response.json();
    } catch (_) {
      throw new Error('Onverwacht antwoord van de server (' + response.status + ')');
    }

    if (!response.ok || payload.success === false) {
      var error = new Error(payload.error || ('Fout ' + response.status));
      error.details = payload.details || null;
      error.status = response.status;
      throw error;
    }

    return {
      payload: payload,
      cache: response.headers.get('X-Cache'),
      duration: response.headers.get('X-Duration-Ms')
    };
  }

  window.__eventsV2 = { state: state, api: api };

  // ─── Laden ─────────────────────────────────────────────────────────────────

  function buildQuery(forceFresh) {
    var params = new URLSearchParams();
    if (forceFresh) params.set('fresh', '1');
    [
      ['state', el('filterState').value],
      ['type', el('filterType').value],
      ['format', el('filterFormat').value],
      ['q', el('filterQ').value.trim()]
    ].forEach(function (pair) { if (pair[1]) params.set(pair[0], pair[1]); });

    if (el('filterArchived').checked) params.set('include_archived', '1');
    params.set('page', String(state.page));
    params.set('per_page', String(PER_PAGE));
    return params.toString();
  }

  /**
   * Events laden.
   *
   * Vragen die we in deze sessie al stelden komen uit het geheugen. Dat maakt
   * heen-en-weer bladeren door de maanden onmiddellijk, want de kalender
   * vraagt telkens hetzelfde venster op. Een schrijfactie of de verversknop
   * gooit het geheugen leeg, dus het kan niet verouderen zonder dat je het
   * zelf veroorzaakt.
   */
  async function loadEvents(forceFresh) {
    if (state.loading) return;

    var query = buildQuery(forceFresh);

    if (forceFresh) {
      state.listCache = {};
    } else if (state.listCache[query]) {
      var hit = state.listCache[query];
      state.events = hit.events;
      state.total = hit.total;
      state.totalPages = hit.totalPages;
      el('cacheBadge').textContent = 'uit geheugen';
      renderCalendar();
      renderList();
      return;
    }

    state.loading = true;

    try {
      var result = await api('/events?' + query);
      state.events = result.payload.data || [];

      var pagination = result.payload.pagination || {};
      state.total = pagination.total || state.events.length;
      state.totalPages = pagination.total_pages || 1;

      state.listCache[query] = {
        events: state.events,
        total: state.total,
        totalPages: state.totalPages
      };

      el('cacheBadge').textContent = (result.cache === 'hit' ? 'uit cache' : 'live uit Odoo') +
        (result.duration ? ' · ' + result.duration + ' ms' : '');

      renderCalendar();
      renderList();
    } catch (error) {
      el('calendarLoadingState').classList.add('hidden');
      el('eventRows').innerHTML =
        '<tr><td colspan="6" class="text-center py-8 text-error">' + esc(error.message) + '</td></tr>';
      el('listSummary').textContent = 'Fout bij laden';
      toast(error.message, 'error');
    } finally {
      state.loading = false;
    }
  }

  // ─── Kalender ──────────────────────────────────────────────────────────────

  function toCalendarEvents() {
    return state.events
      .filter(function (event) { return Boolean(event.starts_at); })
      .map(function (event) {
        var style = typeStyle(event.event_type.id);

        return {
          id: String(event.id),
          title: event.title || '(zonder titel)',
          start: event.starts_at,
          end: event.ends_at || undefined,
          extendedProps: { event: event, style: style }
        };
      });
  }

  var PERSON_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24"'
    + ' fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">'
    + '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>'
    + '<path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';

  /**
   * Chipinhoud zoals v1: het event TYPE als kop, daaronder tijd en aantal
   * inschrijvingen. De volledige titel staat in de tooltip.
   *
   * Bewust niet de titel als kop: die past niet in een dagcel en liep in
   * de eerste versie over de buurcel heen.
   */
  function renderEventContent(arg) {
    var event = arg.event.extendedProps.event;
    var format = FORMAT_META[event.format] || FORMAT_META.online;
    var label = event.event_type.name || event.title || 'Event';

    var count = event.registration.count;
    var full = event.registration.seats_left === 0;
    var seats = event.registration.capacity === null
      ? String(count)
      : count + '/' + event.registration.capacity;

    var wrap = document.createElement('div');
    wrap.className = 'fc-event-card';
    wrap.title = (event.title || '') + ' — ' + format.label
      + (event.location.name ? ' (' + event.location.name + ')' : '');

    wrap.innerHTML =
      '<span class="status-dot"></span>' +
      '<div class="event-type-label">' + esc(label) + '</div>' +
      '<div class="event-detail-row">' +
        '<span class="event-time">' + esc(formatTime(event.starts_at)) + '</span>' +
        (count > 0 || event.registration.capacity !== null
          ? '<span class="event-reg' + (full ? ' is-full' : '') + '">' + PERSON_SVG + esc(seats) + '</span>'
          : '') +
      '</div>';

    return { domNodes: [wrap] };
  }

  /**
   * Vulkleur = event type, bolletje = status. Concept krijgt een stippellijn
   * en geannuleerd een doorhaling, zodat je die twee ook zonder kleur ziet.
   */
  function styleCalendarEvent(arg) {
    var props = arg.event.extendedProps;
    var event = props.event;
    var node = arg.el;

    node.style.setProperty('--event-bg', props.style.bg);
    node.style.setProperty('--event-text', props.style.text);
    node.style.setProperty('--status-dot', STATUS_DOT[event.publication_state] || STATUS_DOT.draft);

    if (event.publication_state === 'draft') {
      node.style.outline = '1px dashed oklch(var(--bc) / 0.35)';
      node.style.outlineOffset = '-1px';
    } else if (event.publication_state === 'cancelled') {
      node.style.textDecoration = 'line-through';
      node.style.opacity = '0.7';
    } else if (event.publication_state === 'done') {
      node.style.opacity = '0.8';
    }

    if (event.active === false) {
      node.style.opacity = '0.45';
    }
    if (event.id === state.selectedId) {
      node.classList.add('evt-selected');
    }
  }

  function renderCalendar() {
    var host = el('fullcalendar');
    if (!host || typeof FullCalendar === 'undefined') return;

    var events = toCalendarEvents();

    if (state.calendar) {
      state.calendar.removeAllEvents();
      state.calendar.addEventSource(events);
      el('calendarLoadingState').classList.add('hidden');
      return;
    }

    state.calendar = new FullCalendar.Calendar(host, {
      initialView: 'dayGridMonth',
      headerToolbar: { left: 'title', center: '', right: 'today prev,next' },
      events: events,
      eventClick: function (info) {
        info.jsEvent.preventDefault();
        selectEvent(Number(info.event.id));
      },
      eventDidMount: styleCalendarEvent,
      eventContent: renderEventContent,
      displayEventTime: false,
      height: 640,
      fixedWeekCount: true,
      dayMaxEvents: 2,
      firstDay: 1,
      locale: 'nl',
      timeZone: BRUSSELS,
      buttonText: { today: 'Vandaag' }
    });

    state.calendar.render();
    el('calendarLoadingState').classList.add('hidden');
  }

  // ─── Lijst ─────────────────────────────────────────────────────────────────

  function renderList() {
    var body = el('eventRows');

    if (state.events.length === 0) {
      body.innerHTML = '<tr><td colspan="6" class="text-center py-8 opacity-60">Geen events gevonden.</td></tr>';
      el('listSummary').textContent = '0 events';
      el('pager').classList.add('hidden');
      return;
    }

    body.innerHTML = state.events.map(function (event) {
      var stateBadge = STATE_BADGE[event.publication_state] || STATE_BADGE.draft;
      var format = FORMAT_META[event.format] || FORMAT_META.online;
      var capacity = event.registration.capacity;
      var seats = capacity === null
        ? String(event.registration.count)
        : event.registration.count + '/' + capacity;
      var full = event.registration.seats_left === 0;

      return '<tr class="hover cursor-pointer ' + (event.id === state.selectedId ? 'row-selected' : '') + '"' +
        ' data-action="select-event" data-event-id="' + event.id + '">' +
        '<td><div class="font-medium">' + esc(event.title || '(zonder titel)') + '</div>' +
          '<div class="text-xs opacity-60 font-mono">' +
            (event.slug ? esc(event.slug) : '<span class="text-warning">geen slug</span>') +
            (event.active === false ? ' &middot; gearchiveerd' : '') +
          '</div></td>' +
        '<td class="text-xs tabular whitespace-nowrap">' + esc(formatWhen(event.starts_at)) +
          '<div class="opacity-60">' + (event.duration_minutes ? event.duration_minutes + ' min' : '—') + '</div></td>' +
        '<td class="text-xs">' + esc(event.event_type.name || '—') + '</td>' +
        '<td><span class="badge badge-sm ' + format.cls + '">' + format.label + '</span></td>' +
        '<td><span class="badge badge-sm ' + stateBadge.cls + '">' + stateBadge.label + '</span></td>' +
        '<td class="text-right text-xs tabular ' + (full ? 'text-error font-medium' : '') + '">' + seats + '</td>' +
        '</tr>';
    }).join('');

    el('listSummary').textContent = state.total + ' event' + (state.total === 1 ? '' : 's');
    el('pagerLabel').textContent = 'pagina ' + state.page + ' van ' + state.totalPages;
    el('pager').classList.toggle('hidden', state.totalPages <= 1);
  }

  function switchView(view) {
    state.view = view;
    var isCalendar = view === 'calendar';

    el('calendarWorkspace').classList.toggle('hidden', !isCalendar);
    el('listWorkspace').classList.toggle('hidden', isCalendar);
    el('btnViewCalendar').classList.toggle('btn-active', isCalendar);
    el('btnViewList').classList.toggle('btn-active', !isCalendar);

    // FullCalendar meet verkeerd als hij in een verborgen container stond.
    if (isCalendar && state.calendar) state.calendar.updateSize();
  }

  // ─── Detailpaneel ──────────────────────────────────────────────────────────

  async function selectEvent(id) {
    if (state.registrations.loadedFor !== id) {
      state.registrations = { rows: [], total: 0, page: 1, totalPages: 1, loading: false, loadedFor: null };
    }
    state.selectedId = id;
    renderList();
    if (state.calendar) state.calendar.render();

    el('panel-empty-state').classList.add('hidden');
    el('panel-content').classList.remove('hidden');
    el('panel-content').innerHTML = '<p class="text-sm opacity-60">Laden…</p>';

    try {
      var result = await api('/events/' + id);
      state.detail = result.payload.data;
      renderDetail();
    } catch (error) {
      el('panel-content').innerHTML = '<p class="text-sm text-error">' + esc(error.message) + '</p>';
    }
  }

  function field(label, name, value, type, attrs) {
    return '<label class="form-control">' +
      '<span class="label-text text-xs opacity-70 mb-1">' + esc(label) + '</span>' +
      '<input type="' + (type || 'text') + '" class="input input-bordered input-sm"' +
      ' data-field="' + name + '" value="' + esc(value === null || value === undefined ? '' : value) + '"' +
      (attrs || '') + ' /></label>';
  }

  /** Eén accordeon-sectie. Onthoudt zelf welke open staat. */
  function section(key, title, subtitle, inner) {
    var open = state.openSection === key;
    return '' +
      '<details class="border border-base-200 rounded-lg mb-2 bg-base-100"' +
        ' data-action="section" data-section="' + key + '"' + (open ? ' open' : '') + '>' +
        '<summary class="cursor-pointer px-3 py-2.5 flex items-center justify-between gap-2">' +
          '<span class="text-sm font-medium">' + esc(title) + '</span>' +
          '<span class="text-xs opacity-50 text-right">' + subtitle + '</span>' +
        '</summary>' +
        '<div class="px-3 pb-3 pt-1">' + inner + '</div>' +
      '</details>';
  }

  function renderDetail() {
    var event = state.detail;
    if (!event) return;

    var stateBadge = STATE_BADGE[event.publication_state] || STATE_BADGE.draft;
    var format = FORMAT_META[event.format] || FORMAT_META.online;
    var status = event.registration.status || {};

    var typeOptions = state.types.map(function (type) {
      return '<option value="' + type.id + '"' +
        (type.id === event.event_type.id ? ' selected' : '') + '>' + esc(type.name) + '</option>';
    }).join('');

    var brandLabels = { both: 'Beide sites', openvme: 'Alleen OpenVME', syndicoach: 'Alleen Syndicoach' };
    var brandOptions = ['both', 'openvme', 'syndicoach'].map(function (value) {
      return '<option value="' + value + '"' +
        ((event.brand || 'both') === value ? ' selected' : '') + '>' + brandLabels[value] + '</option>';
    }).join('');

    // ── Kop: altijd zichtbaar ────────────────────────────────────────────
    var header =
      '<div class="flex items-start justify-between gap-2">' +
        '<div class="min-w-0">' +
          '<h2 class="font-semibold text-lg leading-tight">' + esc(event.title || '(zonder titel)') + '</h2>' +
          '<div class="text-xs opacity-60 font-mono mt-0.5">Odoo #' + event.id +
            (event.slug ? ' · /event/' + esc(event.slug) + '/' : '') + '</div>' +
        '</div>' +
        '<div class="flex flex-col items-end gap-1 shrink-0">' +
          '<span class="badge badge-sm ' + stateBadge.cls + '">' + stateBadge.label + '</span>' +
          '<span class="badge badge-sm ' + format.cls + '">' + format.label + '</span>' +
        '</div>' +
      '</div>' +

      '<div class="stats stats-horizontal w-full bg-base-200 my-3">' +
        '<div class="stat py-2 px-3">' +
          '<div class="stat-title text-xs">Inschrijvingen</div>' +
          '<div class="stat-value text-xl tabular">' + event.registration.count + '</div>' +
          '<div class="stat-desc text-xs">' +
            (event.registration.capacity === null ? 'onbeperkt' : 'van ' + event.registration.capacity) +
          '</div>' +
        '</div>' +
        '<div class="stat py-2 px-3">' +
          '<div class="stat-title text-xs">Inschrijven</div>' +
          '<div class="stat-value text-sm ' + (status.open ? 'text-success' : 'opacity-70') + '">' +
            (status.open ? 'open' : 'dicht') + '</div>' +
          '<div class="stat-desc text-xs">' +
            (status.open ? '&nbsp;' : esc(REASON_TEXT[status.reason] || status.reason || '')) + '</div>' +
        '</div>' +
      '</div>' +

      '<button class="btn btn-sm btn-outline w-full gap-2 mb-3" data-action="open-composer" data-event-id="' + event.id + '">' +
        '<i data-lucide="layout-template" class="w-4 h-4"></i> Pagina opmaken en voorbeeld bekijken' +
      '</button>';

    // ── 1. Basis ─────────────────────────────────────────────────────────
    var basis =
      '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">' +
        field('Titel', 'title', event.title) +
        field('Slug', 'slug', event.slug) +
        field('Start (Brussel)', 'starts_at', isoToLocalInput(event.starts_at), 'datetime-local') +
        field('Duur (min)', 'duration_minutes', event.duration_minutes, 'number', ' min="1" max="1440"') +
        '<label class="form-control"><span class="label-text text-xs opacity-70 mb-1">Event type</span>' +
          '<select class="select select-bordered select-sm" data-field="event_type_id">' +
          '<option value="">—</option>' + typeOptions + '</select></label>' +
        '<label class="form-control"><span class="label-text text-xs opacity-70 mb-1">Merk</span>' +
          '<select class="select select-bordered select-sm" data-field="brand">' + brandOptions + '</select></label>' +
        '<label class="form-control sm:col-span-2">' +
          '<span class="label-text text-xs opacity-70 mb-1">' +
            'Host <span class="opacity-60">— afzender van de mails</span></span>' +
          '<select class="select select-bordered select-sm" data-field="host_id">' +
            '<option value="">— kies een host —</option>' +
            state.hosts.map(function (user) {
              return '<option value="' + user.id + '"' +
                (user.id === event.host.id ? ' selected' : '') + '>' +
                esc(user.name) + (user.email ? ' (' + esc(user.email) + ')' : ' — geen e-mailadres') +
                '</option>';
            }).join('') +
          '</select>' +
          (event.host.id
            ? ''
            : '<span class="label-text-alt text-warning mt-1">Zonder host is de afzender leeg en falen de mails. Nodig om te publiceren.</span>') +
        '</label>' +
      '</div>';

    // ── 2. Waar en inschrijven ───────────────────────────────────────────
    var deelname =
      '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">' +
        field('Locatie (leeg = online)', 'location_name', event.location.name) +
        field('Online link', 'online_url', event.online_url, 'url') +
        field('Capaciteit (0 = onbeperkt)', 'capacity',
          event.registration.capacity === null ? 0 : event.registration.capacity, 'number', ' min="0"') +
        '<div class="sm:col-span-2 flex flex-wrap gap-x-6 gap-y-2 mt-1">' +
          '<label class="label justify-start cursor-pointer gap-2 py-1">' +
            '<input type="checkbox" class="checkbox checkbox-sm" data-field="registration_enabled"' +
            (event.registration.enabled ? ' checked' : '') + ' />' +
            '<span class="label-text text-sm">Inschrijven toegestaan</span></label>' +
          '<label class="label justify-start cursor-pointer gap-2 py-1">' +
            '<input type="checkbox" class="checkbox checkbox-sm" data-field="ask_question"' +
            (event.registration.ask_question ? ' checked' : '') + ' />' +
            '<span class="label-text text-sm">Vraag om een vraag vooraf</span></label>' +
        '</div>' +
        field('Inschrijven opent', 'registration_opens_at', isoToLocalInput(event.registration.opens_at), 'datetime-local') +
        field('Inschrijven sluit', 'registration_closes_at', isoToLocalInput(event.registration.closes_at), 'datetime-local') +
      '</div>' +
      '<p class="text-xs opacity-50 mt-2">De online link komt nooit op de website; die gaat alleen per mail.</p>';

    // ── 3. Website ───────────────────────────────────────────────────────
    var website =
      '<label class="form-control mb-3">' +
        '<span class="label-text text-xs opacity-70 mb-1">Samenvatting (nodig om te publiceren)</span>' +
        '<textarea rows="2" class="textarea textarea-bordered textarea-sm" data-field="summary">' +
        esc(event.summary) + '</textarea></label>' +

      '<div class="mb-3">' +
        '<span class="label-text text-xs opacity-70">Hero-beeld</span>' +
        (event.hero_image_url
          ? '<div class="mt-1 relative group">' +
              '<img src="' + esc(event.hero_image_url) + '" alt="" class="rounded w-full object-cover" style="aspect-ratio:16/7" />' +
              '<div class="flex gap-2 mt-2">' +
                '<label class="btn btn-xs btn-outline">Vervangen' +
                  '<input type="file" accept="image/*" class="hidden"' +
                  ' data-action="hero-upload" data-event-id="' + event.id + '" /></label>' +
                '<button class="btn btn-xs btn-ghost text-error" data-action="hero-remove" data-event-id="' + event.id + '">Verwijderen</button>' +
              '</div>' +
            '</div>'
          : '<div class="mt-1 border border-dashed border-base-200 rounded p-4 text-center">' +
              '<p class="text-xs opacity-60 mb-2">Nog geen beeld. Staand of liggend mag, wordt getoond op 16:7.</p>' +
              '<label class="btn btn-xs btn-outline">Beeld kiezen' +
                '<input type="file" accept="image/*" class="hidden"' +
                ' data-action="hero-upload" data-event-id="' + event.id + '" /></label>' +
            '</div>') +
      '</div>' +

      '<div class="grid grid-cols-1 gap-3">' +
        field('SEO-titel', 'seo_title', event.seo ? event.seo.title : '') +
        '<label class="form-control"><span class="label-text text-xs opacity-70 mb-1">SEO-beschrijving</span>' +
          '<textarea rows="2" class="textarea textarea-bordered textarea-sm" data-field="seo_description">' +
          esc(event.seo ? event.seo.description : '') + '</textarea></label>' +
      '</div>';

    var bodyChars = (event.body_html || '').replace(/<[^>]*>/g, '').trim().length;

    el('panel-content').innerHTML = header +
      section('basis', 'Basis', 'titel, datum, type, merk', basis) +
      section('deelname', 'Waar en inschrijven', esc(format.label) +
        (event.registration.capacity === null ? '' : ' · max ' + event.registration.capacity), deelname) +
      section('website', 'Website en SEO',
        (event.hero_image_url ? 'beeld' : 'geen beeld') +
        ' · ' + (bodyChars > 0 ? bodyChars + ' tekens inhoud' : 'geen inhoud'), website) +
      section('inschrijvingen', 'Inschrijvingen',
        '<span class="badge badge-xs badge-ghost">' + event.registration.count + '</span>',
        '<div id="registrations-section"></div>') +

      '<div class="flex flex-wrap gap-2 mt-4 pt-3 border-t border-base-200">' +
        '<button class="btn btn-sm btn-primary" data-action="save" data-event-id="' + event.id + '">Opslaan</button>' +
        (event.publication_state === 'draft' || event.publication_state === 'done'
          ? '<button class="btn btn-sm btn-success" data-action="publish" data-event-id="' + event.id + '">' +
            (event.publication_state === 'done' ? 'Heropenen' : 'Publiceren') + '</button>'
          : '') +
        (event.publication_state === 'published'
          ? '<button class="btn btn-sm btn-outline" data-action="unpublish" data-event-id="' + event.id + '">Depubliceren</button>' +
            '<button class="btn btn-sm btn-info btn-outline" data-action="done" data-event-id="' + event.id + '">Afronden</button>'
          : '') +
        (event.publication_state === 'cancelled'
          ? '<button class="btn btn-sm btn-outline" data-action="unpublish" data-event-id="' + event.id + '">Terug naar concept</button>'
          : '') +
        (event.slug && event.publication_state === 'published'
          ? '<a class="btn btn-sm btn-ghost" href="' + esc(publicEventUrl(event)) + '" target="_blank" rel="noopener">Bekijk op de site</a>'
          : '') +
        '<div class="dropdown dropdown-top dropdown-end ml-auto">' +
          '<button class="btn btn-sm btn-ghost btn-square" tabindex="0">⋯</button>' +
          '<ul class="dropdown-content menu menu-sm bg-base-100 rounded-box shadow border border-base-200 w-52 z-50">' +
            '<li><a data-action="duplicate" data-event-id="' + event.id + '">Dupliceren</a></li>' +
            '<li><a data-action="show-public" data-event-id="' + event.id + '">Publieke JSON</a></li>' +
            (event.publication_state !== 'cancelled'
              ? '<li><a class="text-error" data-action="cancel-event" data-event-id="' + event.id + '">Annuleren</a></li>'
              : '') +
            '<li><a class="text-error" data-action="delete-event" data-event-id="' + event.id + '">Verwijderen</a></li>' +
          '</ul>' +
        '</div>' +
      '</div>' +

      '<p class="text-xs opacity-50 mt-3">' +
        'Fase in Odoo: <span class="font-mono">' + esc(event.stage ? event.stage.name : '—') + '</span>' +
        ' · laatst gewijzigd ' + esc(formatWhen(event.write_date)) +
      '</p>';

    if (window.lucide) window.lucide.createIcons();

    // Inschrijvingen NIET meteen laden: dat waren drie extra Odoo-rondes bij
    // elke klik op een event, terwijl je die lijst meestal niet nodig hebt.
    // Ze komen als je de sectie opent — of meteen als die al open stond.
    if (state.openSection === 'inschrijvingen') {
      loadRegistrations(event.id, 1);
    } else {
      var host = el('registrations-section');
      if (host) {
        host.innerHTML = '<p class="text-sm opacity-60 py-2">' +
          'Open deze sectie om de inschrijvingen te laden.</p>';
      }
    }
  }

  /** De publieke URL van een event, voor de "bekijk op de site"-knop. */
  function publicEventUrl(event) {
    var base = (window.MYMMO_SITE_URL || 'https://openvme.be').replace(/\/$/, '');
    return base + '/event/' + encodeURIComponent(event.slug) + '/';
  }

  // ─── Opmaakvenster ─────────────────────────────────────────────────────────

  /**
   * De pagina-inhoud opmaken in een venster, met daarnaast een voorbeeld dat
   * toont hoe de eventpagina er echt uitziet — hero, labels, feiten en de
   * blokken erin.
   *
   * Waarom een venster en geen veld in het paneel: opmaken is een aparte taak
   * met eigen aandacht. In de zijkolom was het een smal vakje onderaan een
   * lange stapel, en zag je niet wat je maakte.
   */
  function openComposer(eventId) {
    var event = state.detail;
    if (!event || event.id !== eventId) return;

    el('composerSave').setAttribute('data-event-id', String(event.id));
    el('composerTitle').textContent = event.title || '(zonder titel)';
    el('composerUrl').textContent = event.slug ? '/event/' + event.slug + '/' : '(nog geen slug)';

    var host = el('composerEditor');
    host.innerHTML = '';

    state.bodyEditor = new Quill(host, {
      theme: 'snow',
      placeholder: 'Waar gaat dit event over? Dit is wat bezoekers op de eventpagina lezen.',
      modules: {
        toolbar: [
          [{ header: [2, 3, false] }],
          ['bold', 'italic', 'underline'],
          [{ list: 'ordered' }, { list: 'bullet' }],
          ['link', 'blockquote'],
          ['clean']
        ]
      }
    });

    if (event.body_html) {
      state.bodyEditor.clipboard.dangerouslyPasteHTML(event.body_html);
    }

    // Live voorbeeld, met een rustige vertraging zodat het niet bij elke
    // toetsaanslag opnieuw opbouwt.
    var timer = null;
    state.bodyEditor.on('text-change', function () {
      clearTimeout(timer);
      timer = setTimeout(renderComposerPreview, 250);
    });

    renderComposerPreview();
    el('composerDialog').showModal();
  }

  /** Het voorbeeld: dezelfde opbouw als de publieke pagina. */
  function renderComposerPreview() {
    var event = state.detail;
    if (!event) return;

    var format = FORMAT_META[event.format] || FORMAT_META.online;
    var type = event.event_type || {};
    var status = event.registration.status || {};
    var body = state.bodyEditor ? state.bodyEditor.root.innerHTML : (event.body_html || '');
    var isEmpty = body.replace(/<[^>]*>/g, '').trim() === '';

    var when = event.starts_at
      ? new Intl.DateTimeFormat('nl-BE', {
        timeZone: BRUSSELS, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
      }).format(new Date(event.starts_at))
      : '—';

    var timeRange = event.starts_at
      ? formatTime(event.starts_at) + (event.ends_at ? ' – ' + formatTime(event.ends_at) : '')
      : '';

    el('composerPreview').innerHTML =
      '<div class="prev-page">' +
        '<h1 class="prev-title">' + esc(event.title || '(zonder titel)') + '</h1>' +
        (event.hero_image_url
          ? '<div class="prev-hero"><img src="' + esc(event.hero_image_url) + '" alt="" /></div>'
          : '<div class="prev-hero prev-hero--empty">geen hero-beeld</div>') +
        '<div class="prev-labels">' +
          (type.name ? '<span class="prev-pill">' + esc(type.name) + '</span>' : '') +
          '<span class="prev-tag">' + esc(format.label) + '</span>' +
        '</div>' +
        '<div class="prev-facts">' +
          '<div><span>Wanneer</span><b>' + esc(when) + '</b><i>' + esc(timeRange) + '</i></div>' +
          '<div><span>Waar</span><b>' + esc(event.location.name || 'Online') + '</b>' +
            (event.location.name ? '' : '<i>Je krijgt de deelnamelink per e-mail</i>') + '</div>' +
          (event.registration.capacity !== null
            ? '<div><span>Plaatsen</span><b>' +
              (event.registration.seats_left === 0 ? 'Volzet' : 'Nog ' + event.registration.seats_left + ' vrij') +
              '</b><i>van ' + event.registration.capacity + '</i></div>'
            : '') +
        '</div>' +
        '<div class="prev-body">' +
          (isEmpty
            ? '<p class="prev-empty">' +
              (event.summary
                ? esc(event.summary) + ' <em>(dit is de samenvatting; er is nog geen inhoud)</em>'
                : 'Nog geen inhoud.') +
              '</p>'
            : body) +
        '</div>' +
        '<div class="prev-facts" style="margin-bottom:0">' +
          '<div><span>Afzender van de mails</span><b>' +
            (event.host.name ? esc(event.host.name) : 'nog niet gekozen') + '</b></div>' +
        '</div>' +
        '<div class="prev-form">' +
          '<b>Schrijf je in</b>' +
          '<p>Het inschrijfformulier komt hier' +
            (event.registration.ask_question ? ', met een veld voor een vraag vooraf' : ', zonder vraagveld') + '. ' +
            (status.open ? 'Staat nu open.' : 'Staat nu dicht: ' + esc(REASON_TEXT[status.reason] || '—') + '.') +
          '</p>' +
        '</div>' +
      '</div>';
  }

  /** De inhoud uit de editor, of undefined als het venster nooit open was. */
  function bodyHtmlFromEditor() {
    if (!state.bodyEditor) return undefined;

    var html = state.bodyEditor.root.innerHTML.trim();
    if (html === '' || html === '<p><br></p>' || html === '<p></p>') return null;
    return html;
  }

  /** Alleen de inhoud wegschrijven, niet het hele formulier. */
  async function saveComposer(eventId) {
    var body = bodyHtmlFromEditor();

    try {
      var result = await api('/events/' + eventId, {
        method: 'PATCH',
        body: { body_html: body === undefined ? null : body }
      });
      state.detail = result.payload.data;
      el('composerDialog').close();
      renderDetail();
      toast('Opmaak bewaard', 'success');
    } catch (error) {
      reportError(error);
    }
  }

  async function removeHero(eventId) {
    if (!window.confirm('Hero-beeld verwijderen?')) return;

    try {
      var result = await api('/events/' + eventId + '/hero-image', { method: 'DELETE' });
      state.detail = result.payload.data;
      renderDetail();
      toast('Beeld verwijderd', 'success');
    } catch (error) {
      reportError(error);
    }
  }

  async function deleteEvent(id) {
    var event = state.detail;
    var name = event ? event.title : 'dit event';

    if (!window.confirm('Event "' + name + '" definitief verwijderen uit Odoo?\n\nDit kan niet ongedaan gemaakt worden.')) {
      return;
    }

    try {
      await api('/events/' + id, { method: 'DELETE' });
      toast('Event verwijderd', 'success');

      state.selectedId = null;
      state.detail = null;
      el('panel-content').classList.add('hidden');
      el('panel-empty-state').classList.remove('hidden');

      await loadEvents();
    } catch (error) {
      reportError(error);
    }
  }

  function collectFields() {
    var payload = {};
    el('panel-content').querySelectorAll('[data-field]').forEach(function (input) {
      var name = input.getAttribute('data-field');
      var value;

      if (input.type === 'checkbox') {
        value = input.checked;
      } else if (input.type === 'number') {
        value = input.value === '' ? null : Number(input.value);
      } else if (input.type === 'datetime-local') {
        value = localInputToIso(input.value);
      } else if (name === 'event_type_id') {
        value = input.value ? Number(input.value) : null;
      } else {
        value = input.value.trim() === '' ? null : input.value.trim();
      }
      payload[name] = value;
    });

    // body_html loopt via het opmaakvenster, niet via Opslaan: anders zou
    // een nooit-geopend venster de inhoud kunnen wissen.
    return payload;
  }

  // ─── Inschrijvingen ────────────────────────────────────────────────────────

  var REG_STATE_BADGE = {
    registered: { label: 'Ingeschreven', cls: 'badge-success' },
    waitlisted: { label: 'Wachtlijst', cls: 'badge-warning' },
    cancelled: { label: 'Afgemeld', cls: 'badge-ghost' }
  };

  async function loadRegistrations(eventId, page) {
    var host = el('registrations-section');
    if (!host) return;

    state.registrations.loading = true;
    host.innerHTML = '<p class="text-sm opacity-60 py-2">Inschrijvingen laden…</p>';

    try {
      var result = await api('/events/' + eventId + '/registrations?page=' + page + '&per_page=25');
      var pagination = result.payload.pagination || {};

      state.registrations = {
        rows: result.payload.data || [],
        total: pagination.total || 0,
        page: pagination.page || 1,
        totalPages: pagination.total_pages || 1,
        loading: false,
        loadedFor: eventId
      };

      renderRegistrations(eventId);
    } catch (error) {
      state.registrations.loading = false;
      host.innerHTML = '<p class="text-sm text-error py-2">Inschrijvingen laden mislukt: ' + esc(error.message) + '</p>';
    }
  }

  function renderRegistrations(eventId) {
    var host = el('registrations-section');
    if (!host) return;

    var reg = state.registrations;
    var attended = reg.rows.filter(function (row) { return row.attended; }).length;

    var rows = reg.rows.map(function (row) {
      var badge = REG_STATE_BADGE[row.state] || REG_STATE_BADGE.registered;
      var lead = row.lead;

      return '<tr class="hover">' +
        '<td>' +
          '<div class="font-medium">' + esc(row.partner.name || row.name || '—') + '</div>' +
          '<div class="text-xs opacity-60">' + esc(row.submitted_email || '') + '</div>' +
        '</td>' +
        '<td class="text-xs">' + esc(row.source || '—') +
          '<div class="opacity-60">' + esc(formatWhen(row.created_at)) + '</div></td>' +
        '<td>' +
          (lead && lead.id
            ? '<span class="badge badge-sm badge-outline" title="' + esc(lead.name || '') + '">' +
              esc(lead.resolved_lead_status || '') + '</span>'
            : '<span class="text-xs opacity-40">—</span>') +
        '</td>' +
        '<td><span class="badge badge-sm ' + badge.cls + '">' + badge.label + '</span></td>' +
        '<td class="text-center">' +
          '<input type="checkbox" class="checkbox checkbox-sm"' +
            ' data-action="toggle-attendance" data-registration-id="' + row.id + '"' +
            (row.attended ? ' checked' : '') +
            (row.state === 'cancelled' ? ' disabled' : '') + ' />' +
        '</td>' +
        '</tr>' +
        (row.questions
          ? '<tr><td colspan="5" class="text-xs opacity-70 pt-0 pb-3">' +
            '<span class="font-medium">Vraag:</span> ' + esc(row.questions) + '</td></tr>'
          : '');
    }).join('');

    host.innerHTML =
      '<details class="border border-base-200 rounded" open>' +
        '<summary class="cursor-pointer px-3 py-2 text-sm font-medium flex items-center justify-between">' +
          '<span>Inschrijvingen <span class="badge badge-sm badge-ghost ml-1">' + reg.total + '</span></span>' +
          '<span class="text-xs opacity-60 font-normal">' + attended + ' van ' + reg.rows.length + ' aanwezig op deze pagina</span>' +
        '</summary>' +
        '<div class="px-3 pb-3">' +
          '<div class="flex justify-end gap-2 mb-2">' +
            '<button class="btn btn-xs btn-ghost" data-action="reload-registrations" data-event-id="' + eventId + '">Verversen</button>' +
            '<button class="btn btn-xs btn-outline" data-action="add-registration" data-event-id="' + eventId + '">Handmatig toevoegen</button>' +
          '</div>' +
          (reg.rows.length === 0
            ? '<p class="text-sm opacity-60 py-3">Nog geen inschrijvingen.</p>'
            : '<div class="overflow-x-auto"><table class="table table-xs">' +
              '<thead><tr><th>Deelnemer</th><th>Bron</th><th>Lead</th><th>Toestand</th>' +
              '<th class="text-center">Aanwezig</th></tr></thead>' +
              '<tbody>' + rows + '</tbody></table></div>') +
          (reg.totalPages > 1
            ? '<div class="flex items-center justify-between mt-2">' +
              '<button class="btn btn-xs btn-ghost" data-action="reg-prev" data-event-id="' + eventId + '"' +
                (reg.page <= 1 ? ' disabled' : '') + '>Vorige</button>' +
              '<span class="text-xs opacity-60 tabular">pagina ' + reg.page + ' van ' + reg.totalPages + '</span>' +
              '<button class="btn btn-xs btn-ghost" data-action="reg-next" data-event-id="' + eventId + '"' +
                (reg.page >= reg.totalPages ? ' disabled' : '') + '>Volgende</button>' +
              '</div>'
            : '') +
        '</div>' +
      '</details>';
  }

  /**
   * Aanwezigheid omzetten.
   *
   * Optimistisch: het vinkje staat al goed, dus we laten het staan en
   * draaien alleen terug bij een fout. Anders knippert het.
   */
  async function toggleAttendance(registrationId, attended, checkbox) {
    try {
      await api('/registrations/' + registrationId + '/attendance', {
        method: 'POST',
        body: { attended: attended, origin: 'events_v2_panel' }
      });

      var row = state.registrations.rows.find(function (r) { return r.id === registrationId; });
      if (row) row.attended = attended;

      if (state.detail) renderRegistrations(state.detail.id);
    } catch (error) {
      if (checkbox) checkbox.checked = !attended;
      reportError(error);
    }
  }

  async function addRegistration(eventId) {
    var email = window.prompt('E-mailadres van de deelnemer');
    if (!email) return;

    var first = window.prompt('Voornaam') || '';
    var last = window.prompt('Naam') || '';

    try {
      await api('/events/' + eventId + '/registrations', {
        method: 'POST',
        body: { email: email, first_name: first, last_name: last }
      });
      toast('Deelnemer toegevoegd', 'success');
      await loadRegistrations(eventId, 1);
      await loadEvents();
    } catch (error) {
      reportError(error);
    }
  }

  // ─── Acties ────────────────────────────────────────────────────────────────

  function reportError(error) {
    var text = error.message;
    if (error.details && error.details.length) text += ' (' + error.details.join(', ') + ')';
    toast(text, 'error');
  }

  async function afterMutation(detail, message) {
    state.detail = detail;
    renderDetail();
    // Het geheugen is nu verouderd: leeggooien zodat de lijst de wijziging
    // laat zien.
    state.listCache = {};
    await loadEvents();
    toast(message, 'success');
  }

  async function saveEvent(id) {
    try {
      var result = await api('/events/' + id, { method: 'PATCH', body: collectFields() });
      await afterMutation(result.payload.data, 'Opgeslagen');
    } catch (error) { reportError(error); }
  }

  async function transition(id, action, message) {
    try {
      var result = await api('/events/' + id + '/' + action, { method: 'POST' });
      await afterMutation(result.payload.data, message);
    } catch (error) { reportError(error); }
  }

  async function duplicate(id) {
    try {
      var result = await api('/events/' + id + '/duplicate', { method: 'POST' });
      toast('Kopie aangemaakt', 'success');
      await loadEvents();
      await selectEvent(result.payload.data.id);
    } catch (error) { reportError(error); }
  }

  async function uploadHero(id, file) {
    var form = new FormData();
    form.append('file', file);
    try {
      var result = await api('/events/' + id + '/hero-image', { method: 'POST', body: form });
      state.detail = result.payload.data.event;
      renderDetail();
      toast('Beeld opgeslagen', 'success');
    } catch (error) { reportError(error); }
  }

  /**
   * De publieke respons ophalen zoals de WordPress-plugin die krijgt, en
   * meteen nakijken of de online link niet lekt. Dat is de belangrijkste
   * eigenschap van die API, dus die maken we hier zichtbaar.
   */
  /**
   * De publieke respons bekijken zoals de WordPress-plugin die krijgt.
   *
   * Gaat via de beheer-route /public-preview, die dezelfde serializer
   * gebruikt. Zo hoeft de sitesleutel niet in de browser te staan — die
   * hoort daar ook niet.
   */
  async function showPublic(id) {
    var event = state.detail;
    if (!event) return;

    var box = el('publicJson');
    var check = el('publicLeakCheck');
    box.textContent = 'Laden…';
    check.innerHTML = '';
    el('publicDialog').showModal();

    try {
      var result = await api('/events/' + id + '/public-preview');
      var data = result.payload.data;
      var text = JSON.stringify(data.event, null, 2);
      box.textContent = text;

      var messages = [];

      var link = event.online_url;
      var leaked = Boolean(link) && text.indexOf(link) !== -1;
      messages.push(leaked
        ? '<div class="alert alert-error py-2 text-sm">De online link staat in de publieke respons.</div>'
        : '<div class="alert alert-success py-2 text-sm">De online link komt niet voor in de publieke respons.'
          + (link ? '' : ' Let op: dit event heeft geen link, dus dit bewijst nog niets.') + '</div>');

      if (!data.published) {
        messages.push('<div class="alert alert-warning py-2 text-sm">Dit event staat niet op gepubliceerd, '
          + 'dus de echte publieke API geeft er een 404 op.</div>');
      }

      messages.push('<p class="text-xs opacity-60 mt-2">' + esc(data.note) + '</p>');
      check.innerHTML = messages.join('');
    } catch (error) {
      box.textContent = '';
      check.innerHTML = '<div class="alert alert-error py-2 text-sm">' + esc(error.message) + '</div>';
    }
  }

  async function createEvent() {
    var errorBox = el('createError');
    errorBox.classList.add('hidden');

    var body = {
      title: el('newTitle').value.trim(),
      starts_at: localInputToIso(el('newStartsAt').value),
      duration_minutes: Number(el('newDuration').value) || 60,
      capacity: Number(el('newCapacity').value) || 0,
      summary: el('newSummary').value.trim() || null,
      location_name: el('newLocation').value.trim() || null,
      online_url: el('newOnlineUrl').value.trim() || null,
      registration_enabled: true,
      ask_question: true
    };
    if (el('newType').value) body.event_type_id = Number(el('newType').value);
    if (el('newBrand')) body.brand = el('newBrand').value;
    if (el('newHost') && el('newHost').value) body.host_id = Number(el('newHost').value);

    try {
      var result = await api('/events', { method: 'POST', body: body });
      el('createDialog').close();
      toast('Event aangemaakt', 'success');
      await loadEvents();
      await selectEvent(result.payload.data.id);
    } catch (error) {
      errorBox.textContent = error.message + (error.details ? ': ' + error.details.join(', ') : '');
      errorBox.classList.remove('hidden');
    }
  }

  // ─── Centrale listeners ────────────────────────────────────────────────────
  // Projectregel: geen inline onclick met variabelen. Identiteit zit in
  // data-event-id, gedrag in data-action.

  var searchTimer = null;

  document.addEventListener('click', function (domEvent) {
    var trigger = domEvent.target.closest('[data-action]');
    if (!trigger) return;

    // Formuliervelden houden hun eigen gedrag: geen preventDefault op een
    // checkbox of file-input, want dan vuurt het change-event niet meer.
    var tag = trigger.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

    var action = trigger.getAttribute('data-action');
    var id = Number(trigger.getAttribute('data-event-id'));

    switch (action) {
      case 'select-event': selectEvent(id); break;
      case 'save': saveEvent(id); break;
      case 'publish': transition(id, 'publish', 'Gepubliceerd'); break;
      case 'unpublish': transition(id, 'unpublish', 'Terug naar concept'); break;
      case 'done': transition(id, 'done', 'Afgerond'); break;
      case 'cancel-event': transition(id, 'cancel', 'Geannuleerd'); break;
      case 'duplicate': duplicate(id); break;
      case 'show-public': showPublic(id); break;
      case 'reload-registrations': loadRegistrations(id, state.registrations.page); break;
      case 'add-registration': addRegistration(id); break;
      case 'delete-event': deleteEvent(id); break;
      case 'open-composer': openComposer(id); break;
      case 'composer-save': saveComposer(id); break;
      case 'composer-close': el('composerDialog').close(); break;
      case 'hero-remove': removeHero(id); break;
      case 'reg-prev':
        if (state.registrations.page > 1) loadRegistrations(id, state.registrations.page - 1);
        break;
      case 'reg-next':
        if (state.registrations.page < state.registrations.totalPages) {
          loadRegistrations(id, state.registrations.page + 1);
        }
        break;
      case 'public-close': el('publicDialog').close(); break;
      case 'reload': loadEvents(true); break;
      case 'view-calendar': switchView('calendar'); break;
      case 'view-list': switchView('list'); break;
      case 'new-event':
        el('createError').classList.add('hidden');
        el('createDialog').showModal();
        break;
      case 'create-cancel': el('createDialog').close(); break;
      case 'create-submit': createEvent(); break;
      case 'page-prev':
        if (state.page > 1) { state.page -= 1; loadEvents(); }
        break;
      case 'page-next':
        if (state.page < state.totalPages) { state.page += 1; loadEvents(); }
        break;
      default: break;
    }
  });

  // Onthouden welke accordeon-sectie open staat, zodat een herrender hem
  // niet dichtklapt.
  document.addEventListener('toggle', function (domEvent) {
    var node = domEvent.target;
    if (!node || node.tagName !== 'DETAILS' || node.getAttribute('data-action') !== 'section') return;
    if (!node.open) return;

    var key = node.getAttribute('data-section');
    state.openSection = key;

    // Pas nu ophalen, en alleen als het nog niet gebeurd is.
    if (key === 'inschrijvingen' && state.detail && !state.registrations.loadedFor) {
      loadRegistrations(state.detail.id, 1);
    }
  }, true);

  document.addEventListener('change', function (domEvent) {
    var trigger = domEvent.target.closest('[data-action]');
    if (!trigger) return;

    var action = trigger.getAttribute('data-action');

    if (action === 'filter-change') {
      state.page = 1;
      loadEvents();
      return;
    }

    // De centrale click-handler slaat INPUT al over, dus het change-event
    // vuurt gewoon. Precies dit ging in v1 mis: daar deed de click-handler
    // preventDefault() op de checkbox, waardoor het vinkje terugdraaide en
    // er nooit een change kwam.
    if (action === 'toggle-attendance') {
      toggleAttendance(
        Number(trigger.getAttribute('data-registration-id')),
        trigger.checked,
        trigger
      );
      return;
    }

    if (action === 'hero-upload') {
      var file = trigger.files && trigger.files[0];
      if (file) uploadHero(Number(trigger.getAttribute('data-event-id')), file);
    }
  });

  document.addEventListener('input', function (domEvent) {
    if (!domEvent.target.closest('[data-action="filter-search"]')) return;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(function () { state.page = 1; loadEvents(); }, 350);
  });

  // ─── Start ─────────────────────────────────────────────────────────────────

  async function loadTypes() {
    try {
      var result = await api('/event-types');
      state.types = result.payload.data || [];

      var options = state.types.map(function (type) {
        return '<option value="' + type.id + '">' + esc(type.name) + '</option>';
      }).join('');

      el('filterType').insertAdjacentHTML('beforeend', options);
      el('newType').innerHTML = '<option value="">—</option>' + options;
    } catch (error) {
      toast('Event types laden mislukt: ' + error.message, 'error');
    }
  }

  async function loadHosts() {
    try {
      var result = await api('/hosts');
      state.hosts = result.payload.data || [];

      var options = state.hosts.map(function (user) {
        return '<option value="' + user.id + '">' + esc(user.name) + '</option>';
      }).join('');
      if (el('newHost')) {
        el('newHost').innerHTML = '<option value="">— kies een host —</option>' + options;
      }
    } catch (error) {
      toast('Hosts laden mislukt: ' + error.message, 'error');
    }
  }

  async function loadHealth() {
    try {
      var result = await api('/health');
      el('healthBadge').className = 'badge badge-ghost badge-xs gap-1';
      el('healthBadge').textContent = 'verbonden';
      el('healthBadge').title = result.payload.data.phase;
    } catch (_) {
      el('healthBadge').className = 'badge badge-error badge-xs';
      el('healthBadge').textContent = 'module niet bereikbaar';
    }
  }

  async function initNavbar() {
    try {
      var response = await fetch('/api/auth/me');
      if (!response.ok) { window.location.href = '/'; return; }
      var data = await response.json();
      if (window.renderSharedNavbar) window.renderSharedNavbar(data.navbarHtml);
      if (window.lucide) window.lucide.createIcons();
    } catch (_) {
      // Zonder navbar blijft de pagina bruikbaar.
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    initNavbar();
    loadHealth();
    Promise.all([loadTypes(), loadHosts()]).then(loadEvents);
    if (window.lucide) window.lucide.createIcons();
  });
})();
