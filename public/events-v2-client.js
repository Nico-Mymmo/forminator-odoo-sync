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
    typeColorById: {},
    page: 1,
    totalPages: 1,
    total: 0,
    selectedId: null,
    detail: null,
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

  var STATE_BADGE = {
    draft: { label: 'Concept', cls: 'badge-ghost' },
    published: { label: 'Gepubliceerd', cls: 'badge-success' },
    cancelled: { label: 'Geannuleerd', cls: 'badge-error' }
  };

  var FORMAT_META = {
    online: { label: 'Online', cls: 'badge-info', icon: 'monitor' },
    onsite: { label: 'Op locatie', cls: 'badge-warning', icon: 'map-pin' },
    hybrid: { label: 'Hybride', cls: 'badge-accent', icon: 'shuffle' }
  };

  var REASON_TEXT = {
    not_published: 'niet gepubliceerd',
    disabled: 'inschrijven staat uit',
    not_yet_open: 'inschrijfvenster nog niet open',
    closed: 'inschrijfvenster gesloten',
    event_started: 'event is al begonnen',
    full: 'volzet'
  };

  /** Vaste kleur per event type, zodat de kalender herkenbaar blijft. */
  var TYPE_PALETTE = ['--p', '--s', '--a', '--in', '--su', '--wa', '--er'];

  function typeColor(typeId) {
    if (!typeId) return 'oklch(var(--bc) / 0.35)';
    if (!state.typeColorById[typeId]) {
      var index = state.types.findIndex(function (t) { return t.id === typeId; });
      var token = TYPE_PALETTE[(index < 0 ? 0 : index) % TYPE_PALETTE.length];
      state.typeColorById[typeId] = 'oklch(var(' + token + '))';
    }
    return state.typeColorById[typeId];
  }

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

    return { payload: payload, cache: response.headers.get('X-Cache') };
  }

  window.__eventsV2 = { state: state, api: api };

  // ─── Laden ─────────────────────────────────────────────────────────────────

  function buildQuery() {
    var params = new URLSearchParams();
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

  async function loadEvents() {
    if (state.loading) return;
    state.loading = true;

    try {
      var result = await api('/events?' + buildQuery());
      state.events = result.payload.data || [];

      var pagination = result.payload.pagination || {};
      state.total = pagination.total || state.events.length;
      state.totalPages = pagination.total_pages || 1;

      el('cacheBadge').textContent = result.cache === 'hit' ? 'uit cache' : 'live uit Odoo';

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
        var color = typeColor(event.event_type.id);
        var cancelled = event.publication_state === 'cancelled';
        var draft = event.publication_state === 'draft';

        return {
          id: String(event.id),
          title: event.title || '(zonder titel)',
          start: event.starts_at,
          end: event.ends_at || undefined,
          backgroundColor: cancelled ? 'oklch(var(--b3))' : color,
          borderColor: 'transparent',
          textColor: cancelled ? 'oklch(var(--bc) / 0.5)' : 'oklch(var(--b1))',
          extendedProps: { event: event, draft: draft, cancelled: cancelled }
        };
      });
  }

  function renderEventContent(arg) {
    var event = arg.event.extendedProps.event;
    var format = FORMAT_META[event.format] || FORMAT_META.online;
    var capacity = event.registration.capacity;
    var seats = capacity === null
      ? String(event.registration.count)
      : event.registration.count + '/' + capacity;
    var full = event.registration.seats_left === 0;

    var wrap = document.createElement('div');
    wrap.className = 'evt-chip';
    wrap.innerHTML =
      '<div class="evt-chip-title">' + esc(event.title || '(zonder titel)') + '</div>' +
      '<div class="evt-chip-meta">' +
        '<span>' + esc(formatTime(event.starts_at)) + '</span>' +
        '<span>&middot;</span>' +
        '<span title="' + esc(format.label) + '">' + esc(format.label.charAt(0)) + '</span>' +
        '<span>&middot;</span>' +
        '<span' + (full ? ' style="text-decoration:underline"' : '') + '>' + esc(seats) + '</span>' +
      '</div>';

    return { domNodes: [wrap] };
  }

  /**
   * Status zit in de rand, niet in de vulkleur: de vulkleur is het event
   * type. Zo zie je in een oogopslag welk soort event het is EN of het
   * al live staat.
   */
  function styleCalendarEvent(arg) {
    var props = arg.event.extendedProps;
    var node = arg.el;

    if (props.draft) {
      node.style.outline = '1px dashed oklch(var(--bc) / 0.45)';
      node.style.outlineOffset = '-1px';
      node.style.opacity = '0.75';
    } else if (props.cancelled) {
      node.style.outline = '1px solid oklch(var(--er) / 0.6)';
      node.style.outlineOffset = '-1px';
      node.style.textDecoration = 'line-through';
    }

    if (props.event.active === false) {
      node.style.opacity = '0.45';
    }
    if (props.event.id === state.selectedId) {
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
      dayMaxEvents: 3,
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

    el('panel-content').innerHTML =
      '<div class="flex items-start justify-between gap-2 mb-3">' +
        '<div class="min-w-0">' +
          '<h2 class="font-semibold text-lg leading-tight">' + esc(event.title || '(zonder titel)') + '</h2>' +
          '<div class="text-xs opacity-60 font-mono mt-1">Odoo #' + event.id +
            (event.slug ? ' &middot; /events/' + esc(event.slug) : '') + '</div>' +
        '</div>' +
        '<div class="flex flex-col items-end gap-1 shrink-0">' +
          '<span class="badge badge-sm ' + stateBadge.cls + '">' + stateBadge.label + '</span>' +
          '<span class="badge badge-sm ' + format.cls + '">' + format.label + '</span>' +
        '</div>' +
      '</div>' +

      '<div class="bg-base-200 rounded p-2 mb-3 text-xs flex items-center justify-between gap-2">' +
        '<span>Inschrijvingen: <b class="tabular">' + event.registration.count + '</b>' +
          (event.registration.capacity === null
            ? ' <span class="opacity-60">(onbeperkt)</span>'
            : ' van ' + event.registration.capacity) + '</span>' +
        '<span class="' + (status.open ? 'text-success' : 'opacity-70') + '">' +
          (status.open ? 'inschrijven open' : 'dicht — ' + (REASON_TEXT[status.reason] || status.reason || 'onbekend')) +
        '</span>' +
      '</div>' +

      '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">' +
        field('Titel', 'title', event.title) +
        field('Slug', 'slug', event.slug) +
        field('Start (Brussel)', 'starts_at', isoToLocalInput(event.starts_at), 'datetime-local') +
        field('Duur (min)', 'duration_minutes', event.duration_minutes, 'number', ' min="1" max="1440"') +
        '<label class="form-control"><span class="label-text text-xs opacity-70 mb-1">Event type</span>' +
          '<select class="select select-bordered select-sm" data-field="event_type_id">' +
          '<option value="">—</option>' + typeOptions + '</select></label>' +
        field('Capaciteit (0 = onbeperkt)', 'capacity',
          event.registration.capacity === null ? 0 : event.registration.capacity, 'number', ' min="0"') +
        field('Locatie', 'location_name', event.location.name) +
        field('Online link', 'online_url', event.online_url, 'url') +
        field('Inschrijven opent', 'registration_opens_at', isoToLocalInput(event.registration.opens_at), 'datetime-local') +
        field('Inschrijven sluit', 'registration_closes_at', isoToLocalInput(event.registration.closes_at), 'datetime-local') +
        '<label class="form-control sm:col-span-2">' +
          '<span class="label-text text-xs opacity-70 mb-1">Samenvatting (nodig om te publiceren)</span>' +
          '<textarea rows="2" class="textarea textarea-bordered textarea-sm" data-field="summary">' +
          esc(event.summary) + '</textarea></label>' +
        '<label class="label cursor-pointer gap-2 sm:col-span-2">' +
          '<input type="checkbox" class="checkbox checkbox-sm" data-field="registration_enabled"' +
          (event.registration.enabled ? ' checked' : '') + ' />' +
          '<span class="label-text text-sm">Inschrijven toegestaan</span></label>' +
      '</div>' +

      '<details class="mt-3 border border-base-200 rounded">' +
        '<summary class="cursor-pointer px-3 py-2 text-sm font-medium">Website en SEO</summary>' +
        '<div class="px-3 pb-3 grid grid-cols-1 gap-3">' +
          field('SEO-titel', 'seo_title', event.seo ? event.seo.title : '') +
          '<label class="form-control"><span class="label-text text-xs opacity-70 mb-1">SEO-beschrijving</span>' +
            '<textarea rows="2" class="textarea textarea-bordered textarea-sm" data-field="seo_description">' +
            esc(event.seo ? event.seo.description : '') + '</textarea></label>' +
          '<div><span class="label-text text-xs opacity-70">Hero-beeld</span>' +
            (event.hero_image_url
              ? '<img src="' + esc(event.hero_image_url) + '" alt="" class="rounded mt-1 max-h-32 object-cover w-full" />'
              : '<p class="text-xs opacity-60 mt-1">Nog geen beeld.</p>') +
            '<input type="file" accept="image/*" class="file-input file-input-bordered file-input-sm w-full mt-2"' +
            ' data-action="hero-upload" data-event-id="' + event.id + '" /></div>' +
        '</div>' +
      '</details>' +

      '<div class="flex flex-wrap gap-2 mt-4">' +
        '<button class="btn btn-sm btn-primary" data-action="save" data-event-id="' + event.id + '">Opslaan</button>' +
        (event.publication_state === 'published'
          ? '<button class="btn btn-sm btn-outline" data-action="unpublish" data-event-id="' + event.id + '">Depubliceren</button>'
          : '<button class="btn btn-sm btn-success" data-action="publish" data-event-id="' + event.id + '">Publiceren</button>') +
        '<button class="btn btn-sm btn-ghost" data-action="duplicate" data-event-id="' + event.id + '">Dupliceren</button>' +
        (event.publication_state !== 'cancelled'
          ? '<button class="btn btn-sm btn-ghost text-error" data-action="cancel-event" data-event-id="' + event.id + '">Annuleren</button>'
          : '') +
        '<button class="btn btn-sm btn-ghost" data-action="show-public" data-event-id="' + event.id + '"' +
          (event.slug ? '' : ' disabled') + '>Publieke JSON</button>' +
      '</div>';

    if (window.lucide) window.lucide.createIcons();
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
    return payload;
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
      registration_enabled: true
    };
    if (el('newType').value) body.event_type_id = Number(el('newType').value);

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
      case 'cancel-event': transition(id, 'cancel', 'Geannuleerd'); break;
      case 'duplicate': duplicate(id); break;
      case 'show-public': showPublic(id); break;
      case 'public-close': el('publicDialog').close(); break;
      case 'reload': loadEvents(); break;
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

  document.addEventListener('change', function (domEvent) {
    var trigger = domEvent.target.closest('[data-action]');
    if (!trigger) return;

    var action = trigger.getAttribute('data-action');

    if (action === 'filter-change') {
      state.page = 1;
      loadEvents();
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

  async function loadHealth() {
    try {
      var result = await api('/health');
      el('healthBadge').className = 'badge badge-success badge-sm';
      el('healthBadge').textContent = result.payload.data.phase;
    } catch (_) {
      el('healthBadge').className = 'badge badge-error badge-sm';
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
    loadTypes().then(loadEvents);
    if (window.lucide) window.lucide.createIcons();
  });
})();
