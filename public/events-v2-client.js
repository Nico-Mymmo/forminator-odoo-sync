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
    loading: false,
    // Odoo-event-id -> info over een nog bestaande oude WP Tribe Events-
    // pagina (v1-publicatie). Enkel een markering, zie loadLegacyWpPages().
    legacyWpPages: {},
    // Staat de titel-inputveld in het detailpaneel open? Zie editTitle().
    editingTitle: false,
    // Lijstweergave: eigen maand- en type-filter, los van de kalenderdata
    // (die blijft alles tonen, FullCalendar filtert zelf visueel per maand).
    // Maand mag nooit voor de huidige staan, zie 'list-month-prev' hieronder.
    list: {
      events: [],
      total: 0,
      totalPages: 1,
      page: 1,
      month: brusselsYearMonth(),
      types: new Set(),
      cache: {},
      loaded: false
    }
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

  /** Jaar/maand (1-12) van een moment, in Brussels-tijd. */
  function brusselsYearMonth(date) {
    var parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: BRUSSELS, year: 'numeric', month: '2-digit'
    }).formatToParts(date || new Date());
    var get = function (t) { return Number((parts.find(function (p) { return p.type === t; }) || {}).value); };
    return { year: get('year'), month: get('month') };
  }

  function monthLabel(year, month) {
    var probe = new Date(Date.UTC(year, month - 1, 15, 12));
    return new Intl.DateTimeFormat('nl-BE', { timeZone: BRUSSELS, month: 'long', year: 'numeric' }).format(probe);
  }

  /** {from, to} in ISO voor de volledige maand in Brussels-tijd, beide grenzen inclusief. */
  function monthRangeIso(year, month) {
    var pad = function (n) { return String(n).padStart(2, '0'); };
    var lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
    return {
      from: localInputToIso(year + '-' + pad(month) + '-01T00:00'),
      to: localInputToIso(year + '-' + pad(month) + '-' + pad(lastDay) + 'T23:59')
    };
  }

  function addMonths(year, month, delta) {
    var total = (year * 12 + (month - 1)) + delta;
    return { year: Math.floor(total / 12), month: (total % 12) + 1 };
  }

  /** Vandaag als 'YYYY-MM-DD', in Brussels-tijd. */
  function todayIsoDate() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: BRUSSELS }).format(new Date());
  }

  /**
   * Losse uren- en kwartierselects i.p.v. één samengevoegde HH:MM-lijst:
   * sneller kiezen, en de browser-eigen datetime-local-picker toont zijn
   * minutenlijst toch altijd per minuut, step of niet -- vandaar eigen
   * selects in plaats van op step te vertrouwen.
   *
   * Events starten en eindigen nooit midden in de nacht, dus de urenlijst
   * begint pas om 08:00.
   */
  function hourOptions(selected) {
    var out = '';
    for (var h = 8; h < 24; h += 1) {
      var v = String(h).padStart(2, '0');
      out += '<option value="' + v + '"' + (v === selected ? ' selected' : '') + '>' + v + '</option>';
    }
    return out;
  }

  function minuteOptions(selected) {
    var out = '';
    for (var m = 0; m < 60; m += 15) {
      var v = String(m).padStart(2, '0');
      out += '<option value="' + v + '"' + (v === selected ? ' selected' : '') + '>' + v + '</option>';
    }
    return out;
  }

  /** Vaste klokslag voor datumvelden zonder eigen tijd-UI, zie dateOnlyField(). */
  var DEFAULT_TIME_FOR_FIELD = {
    registration_opens_at: '09:00',
    registration_closes_at: '17:00'
  };

  /**
   * Datum + uur + kwartier-select samen, voor datumvelden met een eigen
   * tijdstip. Eén rand om het hele groepje i.p.v. losse randen per veld,
   * en de velden krimpen mee (min-width: 0) zodat dit niet meer over de
   * kolom ernaast loopt.
   */
  function dateTimeField(label, name, isoValue) {
    var local = isoToLocalInput(isoValue);
    var datePart = local ? local.slice(0, 10) : '';
    var hourPart = local ? local.slice(11, 13) : '';
    var minutePart = local ? local.slice(14, 16) : '';

    return '<label class="form-control">' +
        '<span class="label-text text-xs opacity-70 mb-1">' + esc(label) + '</span>' +
        '<div class="join w-full border border-base-300 rounded-lg overflow-hidden">' +
          '<input type="date" class="input input-sm join-item flex-1 min-w-[7.5rem] border-0"' +
          ' data-dt-date="' + name + '" value="' + esc(datePart) + '" />' +
          '<select class="select select-sm join-item border-0 border-l border-base-300 w-16 shrink-0"' +
          ' data-dt-hour-for="' + name + '">' +
            '<option value=""' + (hourPart ? '' : ' selected') + '>--</option>' +
            hourOptions(hourPart) +
          '</select>' +
          '<select class="select select-sm join-item border-0 border-l border-base-300 w-16 shrink-0"' +
          ' data-dt-minute-for="' + name + '">' +
            '<option value=""' + (minutePart ? '' : ' selected') + '>--</option>' +
            minuteOptions(minutePart) +
          '</select>' +
        '</div>' +
      '</label>';
  }

  /**
   * Enkel een datum, voor velden waar het uur vast ligt in
   * DEFAULT_TIME_FOR_FIELD (inschrijven opent/sluit): geen tijd-UI nodig,
   * dus ook geen overlap-risico.
   */
  function dateOnlyField(label, name, isoValue) {
    var local = isoToLocalInput(isoValue);
    var datePart = local ? local.slice(0, 10) : '';

    return '<label class="form-control">' +
        '<span class="label-text text-xs opacity-70 mb-1">' + esc(label) + '</span>' +
        '<input type="date" class="input input-bordered input-sm w-full"' +
        ' data-dt-date="' + name + '" value="' + esc(datePart) + '" />' +
      '</label>';
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
    // De filterbalk is weg: events worden op datum opgezocht (kalender),
    // niet meer via status/type/vorm/titel-filters.
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

  /**
   * Na een schrijfactie: kalenderdata altijd verversen, en de lijst erbij
   * zodra die ooit geladen is (anders blijft ze stil verouderd staan tot de
   * volgende maand-/typewissel of handmatige ververs).
   */
  async function refreshEvents() {
    state.listCache = {};
    var tasks = [loadEvents(true)];
    if (state.list.loaded) tasks.push(loadListEvents(true));
    await Promise.all(tasks);
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

  /* Zelfde ster als het badge-warning/lucide "star"-icoontje in de
     lijstweergave (regel ~690 hieronder) -- zelfde icoon voor hetzelfde
     concept, herkenbaar over beide weergaven heen. Puur inline SVG i.p.v.
     een lucide data-attribuut: renderEventContent() draait per
     kalender-event en er zit geen window.lucide.createIcons()-aanroep na
     elke FullCalendar-render (zie PERSON_SVG hierboven, zelfde reden).
     Gevuld (fill) i.p.v. gestroked: leesbaarder op zo'n klein formaat. */
  var STAR_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8" viewBox="0 0 24 24" fill="currentColor">'
    + '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';

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
      (event.highlighted
        ? '<span class="highlight-badge" title="Gehighlight in de aankondiging-widget">' + STAR_SVG + '</span>'
        : '') +
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
      // Industry-standard UX: op een lege dag klikken opent meteen "nieuw
      // event" met die datum al ingevuld. Dagen in het verleden negeren de
      // klik -- daar maak je geen events meer voor aan.
      dateClick: function (info) {
        if (info.dateStr < todayIsoDate()) return;
        openCreateDialog(info.dateStr);
      },
      dayCellClassNames: function (arg) {
        return arg.date.toISOString().slice(0, 10) < todayIsoDate() ? [] : ['fc-day-clickable'];
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
  //
  // Eigen maand- en type-filter, los van de kalenderdata (die blijft alles
  // tonen). De maand mag nooit voor de huidige staan; het type-filter zijn
  // togglebare chips i.p.v. een dropdown, en mag meerdere types tegelijk
  // aan hebben staan.

  function buildListQuery() {
    var params = new URLSearchParams();
    var range = monthRangeIso(state.list.month.year, state.list.month.month);
    params.set('from', range.from);
    params.set('to', range.to);
    // De backend-filter `type` accepteert maar één id. Bij precies één
    // aangevinkte chip sturen we 'm mee (kleinere respons, correcte
    // paginering); bij meerdere chips halen we alles op voor de maand en
    // filteren we hierna client-side, zie loadListEvents().
    if (state.list.types.size === 1) {
      params.set('type', String(Array.from(state.list.types)[0]));
    }
    params.set('page', String(state.list.page));
    params.set('per_page', String(PER_PAGE));
    return params.toString();
  }

  async function loadListEvents(forceFresh) {
    var query = buildListQuery();

    if (forceFresh) {
      state.list.cache = {};
    } else if (state.list.cache[query]) {
      var hit = state.list.cache[query];
      state.list.events = hit.events;
      state.list.total = hit.total;
      state.list.totalPages = hit.totalPages;
      state.list.loaded = true;
      renderList();
      return;
    }

    try {
      var result = await api('/events?' + query);
      var events = result.payload.data || [];
      var pagination = result.payload.pagination || {};

      state.list.events = state.list.types.size > 1
        ? events.filter(function (event) { return state.list.types.has(event.event_type.id); })
        : events;
      // Bij meerdere chips is dit de telling van de huidige pagina na
      // filteren, niet van de hele maand -- zie de opmerking in
      // buildListQuery(). Voor een intern beheertool met een handvol
      // events per maand is dat een aanvaardbare beperking.
      state.list.total = state.list.types.size > 1 ? state.list.events.length : (pagination.total || events.length);
      state.list.totalPages = state.list.types.size > 1 ? 1 : (pagination.total_pages || 1);
      state.list.loaded = true;

      state.list.cache[query] = {
        events: state.list.events,
        total: state.list.total,
        totalPages: state.list.totalPages
      };

      renderList();
    } catch (error) {
      el('eventRows').innerHTML =
        '<tr><td colspan="6" class="text-center py-8 text-error">' + esc(error.message) + '</td></tr>';
      el('listSummary').textContent = 'Fout bij laden';
      toast(error.message, 'error');
    }
  }

  /** Chevrons + maandlabel + type-chips boven de lijst. */
  function renderListToolbar() {
    var my = state.list.month;
    var today = brusselsYearMonth();
    var atCurrentMonth = my.year === today.year && my.month === today.month;

    el('listMonthLabel').textContent = monthLabel(my.year, my.month);
    var prevBtn = el('listMonthPrev');
    if (prevBtn) prevBtn.disabled = atCurrentMonth;

    el('listTypeChips').innerHTML = state.types.map(function (type) {
      var active = state.list.types.has(type.id);
      var style = typeStyle(type.id);
      return '<button type="button" class="btn btn-xs rounded-full gap-1' + (active ? '' : ' btn-outline') + '"' +
        ' style="' + (active ? 'background:' + style.accent + ';border-color:' + style.accent + ';color:oklch(var(--b1));' : 'border-color:' + style.accent + ';color:' + style.accent + ';') + '"' +
        ' data-action="list-type-toggle" data-type-id="' + type.id + '">' +
        esc(type.name) +
        '</button>';
    }).join('');
  }

  function renderList() {
    renderListToolbar();

    var body = el('eventRows');

    if (state.list.events.length === 0) {
      body.innerHTML = '<tr><td colspan="6" class="text-center py-8 opacity-60">Geen events gevonden.</td></tr>';
      el('listSummary').textContent = '0 events';
      el('pager').classList.add('hidden');
      return;
    }

    body.innerHTML = state.list.events.map(function (event) {
      var stateBadge = STATE_BADGE[event.publication_state] || STATE_BADGE.draft;
      var format = FORMAT_META[event.format] || FORMAT_META.online;
      var capacity = event.registration.capacity;
      var seats = capacity === null
        ? String(event.registration.count)
        : event.registration.count + '/' + capacity;
      var full = event.registration.seats_left === 0;

      var legacyPage = state.legacyWpPages[event.id];

      return '<tr class="hover cursor-pointer ' + (event.id === state.selectedId ? 'row-selected' : '') + '"' +
        ' data-action="select-event" data-event-id="' + event.id + '">' +
        '<td><div class="font-medium flex items-center gap-1.5">' + esc(event.title || '(zonder titel)') +
            (event.highlighted
              ? '<span class="badge badge-xs badge-warning gap-1" title="Gehighlight in de aankondiging-widget">' +
                  '<i data-lucide="star" class="w-2.5 h-2.5"></i></span>'
              : '') +
            (legacyPage
              ? '<span class="badge badge-xs badge-outline gap-1" title="Er bestaat nog een oude WP-pagina (' +
                esc(legacyPage.status || '') + ')">' +
                  '<i data-lucide="history" class="w-2.5 h-2.5"></i> oude WP-pagina</span>'
              : '') +
          '</div>' +
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

    el('listSummary').textContent = state.list.total + ' event' + (state.list.total === 1 ? '' : 's');
    el('pagerLabel').textContent = 'pagina ' + state.list.page + ' van ' + state.list.totalPages;
    el('pager').classList.toggle('hidden', state.list.totalPages <= 1);
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

    if (!isCalendar && !state.list.loaded) loadListEvents();
  }

  // ─── Detailpaneel ──────────────────────────────────────────────────────────

  async function selectEvent(id) {
    if (state.registrations.loadedFor !== id) {
      state.registrations = { rows: [], total: 0, page: 1, totalPages: 1, loading: false, loadedFor: null };
    }
    state.selectedId = id;
    state.editingTitle = false;
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

  function field(label, name, value, type, attrs, wrapperClass) {
    return '<label class="form-control' + (wrapperClass ? ' ' + wrapperClass : '') + '">' +
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
    var legacyPage = state.legacyWpPages[event.id];

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
      (legacyPage
        ? '<div class="flex items-center gap-1.5 text-xs mb-2 px-2 py-1 rounded bg-info/10 text-info">' +
            '<i data-lucide="history" class="w-3 h-3 shrink-0"></i>' +
            '<span class="truncate">Oude WP-pagina bestaat nog (' + esc(legacyPage.status || 'onbekend') + ')</span>' +
            '<a class="link link-hover font-medium shrink-0 ml-auto" href="' + esc(legacyPage.edit_url) + '"' +
              ' target="_blank" rel="noopener">WP-admin</a>' +
          '</div>'
        : '') +
      (event.active === false
        ? '<div class="alert alert-warning py-2 text-sm mb-3">' +
            '<i data-lucide="archive" class="w-4 h-4"></i>' +
            '<span>Dit event is gearchiveerd. Het staat niet op de website en niet in de gewone lijst.</span>' +
            '<button class="btn btn-xs" data-action="unarchive" data-event-id="' + event.id + '">Terughalen</button>' +
          '</div>'
        : '') +
      // Sinds kort is een host verplicht om te PUBLICEREN, maar events die al
      // gepubliceerd stonden voor die regel bestond kunnen nog zonder host
      // staan (zie PROMPT-events-v2-dropdown-en-openstaand.md, punt A). Zonder
      // host faalt de Odoo-mailtemplate stil bij verzending -- beter hier
      // zichtbaar dan pas als een mail niet aankomt.
      (event.publication_state === 'published' && !event.host.id
        ? '<div class="alert alert-error py-2 text-sm mb-3">' +
            '<i data-lucide="alert-triangle" class="w-4 h-4"></i>' +
            '<span>Dit event is gepubliceerd maar heeft geen host. ' +
              'De Odoo-mailtemplates hebben een host nodig als afzender en falen zonder een.</span>' +
          '</div>'
        : '') +
      (state.editingTitle
        ? '<input type="text" id="titleInlineInput" data-field="title"' +
            ' class="input input-bordered input-sm font-semibold text-lg w-full"' +
            ' value="' + esc(event.title || '') + '" />'
        : '<h2 class="font-semibold text-lg leading-tight flex items-center gap-1.5 w-full">' +
            '<span class="truncate min-w-0">' + esc(event.title || '(zonder titel)') + '</span>' +
            '<button class="btn btn-ghost btn-xs btn-circle shrink-0" data-action="edit-title" title="Titel aanpassen">' +
              '<i data-lucide="pencil" class="w-3.5 h-3.5"></i></button>' +
          '</h2>') +

      '<div class="bg-base-200 rounded-lg p-3 my-3">' +
        '<div class="flex items-center justify-between gap-2 flex-wrap mb-3">' +
          '<div class="flex items-center gap-1.5">' +
            '<span class="badge badge-sm ' + stateBadge.cls + '">' + stateBadge.label + '</span>' +
            '<span class="badge badge-sm ' + format.cls + '">' + format.label + '</span>' +
          '</div>' +
          (event.slug && event.publication_state === 'published'
            ? '<a class="btn btn-xs btn-outline gap-1" href="' + esc(publicEventUrl(event)) + '" target="_blank" rel="noopener">' +
                '<i data-lucide="external-link" class="w-3 h-3"></i> Bekijk op site</a>'
            : '') +
        '</div>' +
        '<div class="grid grid-cols-2 gap-3">' +
          '<button type="button"' +
            ' class="text-left rounded-md p-2 -m-2 transition-colors hover:bg-base-300' +
            ' focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"' +
            ' data-action="open-registrations" data-event-id="' + event.id + '"' +
            ' title="Bekijk de inschrijvingenlijst">' +
            '<div class="text-xs opacity-60 flex items-center gap-1">' +
              'Inschrijvingen <i data-lucide="chevron-right" class="w-3 h-3 opacity-50"></i>' +
            '</div>' +
            '<div class="text-xl font-semibold tabular">' + event.registration.count + '</div>' +
            '<div class="text-xs opacity-60">' +
              (event.registration.capacity === null ? 'onbeperkt' : 'van ' + event.registration.capacity) +
            '</div>' +
          '</button>' +
          '<div>' +
            '<div class="text-xs opacity-60">Inschrijven</div>' +
            '<div class="text-sm font-semibold ' + (status.open ? 'text-success' : 'opacity-70') + '">' +
              (status.open ? 'open' : 'dicht') + '</div>' +
            '<div class="text-xs opacity-60">' +
              (status.open ? '&nbsp;' : esc(REASON_TEXT[status.reason] || status.reason || '')) + '</div>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<button class="btn btn-sm btn-outline w-full gap-2 mb-2" data-action="open-composer" data-event-id="' + event.id + '">' +
        '<i data-lucide="layout-template" class="w-4 h-4"></i> Pagina opmaken en voorbeeld bekijken' +
      '</button>' +

      // Communicatie-studio: de mailblokken staan in Odoo, niet hier. De
      // dialoog en de logica zitten in events-v2-mail-studio.js.
      '<button class="btn btn-sm btn-outline w-full gap-2 mb-3" data-action="open-mail-studio" data-event-id="' + event.id + '">' +
        '<i data-lucide="mail" class="w-4 h-4"></i> Mails opmaken en klaarzetten' +
      '</button>';

    // ── 1. Basis ─────────────────────────────────────────────────────────
    var basis =
      '<div class="grid grid-cols-1 sm:grid-cols-2 gap-3">' +
        field('Slug', 'slug', event.slug, null, null, 'sm:col-span-2') +
        dateTimeField('Start (Brussel)', 'starts_at', event.starts_at) +
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
        '<label class="form-control sm:col-span-2">' +
          '<span class="label-text text-xs opacity-70 mb-1">Samenvatting (nodig om te publiceren)</span>' +
          '<textarea rows="2" class="textarea textarea-bordered textarea-sm" data-field="summary">' +
          esc(event.summary) + '</textarea>' +
          // Geen samenvatting ingevuld, maar de pagina-inhoud levert er al
          // eentje op (zie summary_from_body, GET /api/events/:id): dat
          // volstaat om te publiceren, maar de admin ziet hier WAAROM het
          // veld niet als "ontbrekend" geldt en WAT er dan gebruikt wordt.
          (!event.summary && event.summary_from_body
            ? '<span class="label-text-alt text-info mt-1">Nog niet ingevuld -- zolang dat zo blijft, gebruiken ' +
              'we het begin van de pagina-inhoud hieronder: “' + esc(event.summary_from_body) + '…”</span>'
            : '') +
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
        dateOnlyField('Inschrijven opent (vanaf 9:00)', 'registration_opens_at', event.registration.opens_at) +
        dateOnlyField('Inschrijven sluit (tot 17:00)', 'registration_closes_at', event.registration.closes_at) +
      '</div>' +
      '<p class="text-xs opacity-50 mt-2">De online link komt nooit op de website; die gaat alleen per mail.</p>';

    // ── 3. Website ───────────────────────────────────────────────────────
    var website =
      '<label class="label justify-start cursor-pointer gap-2 mb-3">' +
        '<input type="checkbox" class="checkbox checkbox-sm" data-field="highlighted"' +
        (event.highlighted ? ' checked' : '') + ' />' +
        '<span class="label-text text-sm">Highlighten' +
          '<span class="opacity-60"> — dit event wordt vooraan getoond in de aankondiging-widget op de website</span>' +
        '</span>' +
      '</label>' +

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
        '<div class="dropdown dropdown-top dropdown-end ml-auto">' +
          '<button class="btn btn-sm btn-ghost btn-square" tabindex="0">⋯</button>' +
          // tabindex="0" is VERPLICHT hier: DaisyUI 4 opent/sluit dit menu puur via
          // CSS op :focus-within van de .dropdown-container. Zonder tabindex is dit
          // <ul>-element (en de <a>'s erin) niet focusbaar, dus verlaat de focus het
          // menu vóór een klik landt en verdwijnt het menu voor de click vuurt. Zie
          // PROMPT-events-v2-dropdown-en-openstaand.md.
          '<ul tabindex="0" class="dropdown-content menu menu-sm bg-base-100 rounded-box shadow border border-base-200 w-52 z-50">' +
            '<li><a data-action="duplicate" data-event-id="' + event.id + '">Dupliceren</a></li>' +
            '<li><a data-action="show-public" data-event-id="' + event.id + '">Publieke JSON</a></li>' +
            (event.publication_state !== 'cancelled'
              ? '<li><a data-action="cancel-event" data-event-id="' + event.id + '">Annuleren</a></li>'
              : '') +
            (event.active === false
              ? '<li><a data-action="unarchive" data-event-id="' + event.id + '">Terughalen uit archief</a></li>'
              : '<li><a data-action="archive" data-event-id="' + event.id + '">Archiveren</a></li>') +
            '<li><a class="text-error" data-action="remove-event" data-event-id="' + event.id + '">Verwijderen…</a></li>' +
          '</ul>' +
        '</div>' +
      '</div>' +

      '<p class="text-xs opacity-50 mt-3">Laatst gesynced ' + esc(formatWhen(event.write_date)) + '</p>';

    if (window.lucide) window.lucide.createIcons();
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

    // Quill's snow-toolbar bouwt zijn eigen <div class="ql-toolbar"> als
    // SIBLING vóór de editor-container, niet erbinnen -- host.innerHTML = ''
    // hierboven ruimt dus wel de vorige editor-inhoud op, maar niet de oude
    // toolbar. Zonder deze regel bleef die bij elke keer openen van dit
    // venster staan, met een nieuwe erbovenop: de toolbar "tekende zich
    // extra" per opening.
    if (host.previousElementSibling && host.previousElementSibling.classList.contains('ql-toolbar')) {
      host.previousElementSibling.remove();
    }

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

  // ─── Verwijderen, archiveren of annuleren ──────────────────────────────────

  /**
   * Eén venster met drie uitkomsten.
   *
   * Waarom geen confirm(): dat kan maar ja of nee. Verwijderen was daardoor
   * de enige zichtbare uitweg, terwijl archiveren bijna altijd het antwoord
   * is — dat is omkeerbaar en het bewaart alles.
   */
  async function openRemoveDialog(eventId) {
    var event = state.detail;
    if (!event || event.id !== eventId) return;

    // Het aantal inschrijvingen bepaalt wat verwijderen betekent.
    var count = event.registration.count || 0;

    el('removeIntro').textContent = count > 0
      ? 'Dit event heeft ' + count + ' inschrijving' + (count === 1 ? '' : 'en') + '. Archiveren is bijna altijd wat je wil: alles blijft bewaard.'
      : 'Dit event heeft nog geen inschrijvingen.';

    el('removeDeleteHint').textContent = count > 0
      ? 'Verwijdert het event én de ' + count + ' inschrijving' + (count === 1 ? '' : 'en') + '. Niet terug te draaien.'
      : 'Niet terug te draaien.';

    var cancelBtn = el('removeCancelBtn');
    cancelBtn.classList.toggle('hidden', event.publication_state === 'cancelled');

    el('removeDialog').setAttribute('data-event-id', String(eventId));
    el('removeDialog').showModal();

    if (window.lucide) window.lucide.createIcons();
  }

  function removeDialogEventId() {
    return Number(el('removeDialog').getAttribute('data-event-id'));
  }

  async function archiveEvent(eventId, archived) {
    try {
      var result = await api('/events/' + eventId + '/' + (archived ? 'archive' : 'unarchive'), { method: 'POST' });
      state.detail = result.payload.data;
      renderDetail();
      await refreshEvents();
      toast(archived ? 'Event gearchiveerd' : 'Event teruggehaald', 'success');
    } catch (error) {
      reportError(error);
    }
  }

  /**
   * Definitief verwijderen. De server weigert met een 409 als er
   * inschrijvingen zijn; die uitkomst vangen we op en vragen dan expliciet
   * om ook de inschrijvingen mee te verwijderen.
   */
  async function deleteEventForGood(eventId) {
    var event = state.detail;
    var name = event ? event.title : 'dit event';
    var count = event ? (event.registration.count || 0) : 0;

    var question = count > 0
      ? 'Event "' + name + '" én ' + count + ' inschrijving' + (count === 1 ? '' : 'en') +
        ' definitief verwijderen uit Odoo?\n\nDit kan niet ongedaan gemaakt worden. ' +
        'Wil je de gegevens bewaren, kies dan Archiveren.'
      : 'Event "' + name + '" definitief verwijderen uit Odoo?\n\nDit kan niet ongedaan gemaakt worden.';

    if (!window.confirm(question)) return;

    try {
      var path = '/events/' + eventId + (count > 0 ? '?cascade=1' : '');
      var result = await api(path, { method: 'DELETE' });
      await afterDelete(result.payload.data.registrations_deleted || 0);
    } catch (error) {
      // Blijkt er toch een inschrijving te zijn die we niet zagen: nog één
      // keer met cascade, expliciet bevestigd.
      var serverCount = error.details && error.details.registrations;

      if (error.status === 409 && serverCount) {
        var retry = 'Er zijn intussen ' + serverCount + ' inschrijving' +
          (serverCount === 1 ? '' : 'en') + '. Die mee verwijderen?';
        if (!window.confirm(retry)) return;

        try {
          var second = await api('/events/' + eventId + '?cascade=1', { method: 'DELETE' });
          await afterDelete(second.payload.data.registrations_deleted || 0);
          return;
        } catch (cascadeError) {
          reportError(cascadeError);
          return;
        }
      }

      reportError(error);
    }
  }

  async function afterDelete(removedRegistrations) {
    el('removeDialog').close();

    toast(
      removedRegistrations
        ? 'Event en ' + removedRegistrations + ' inschrijving(en) verwijderd'
        : 'Event verwijderd',
      'success'
    );

    state.selectedId = null;
    state.detail = null;
    state.listCache = {};
    el('panel-content').classList.add('hidden');
    el('panel-empty-state').classList.remove('hidden');

    await refreshEvents();
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
      } else if (name === 'event_type_id' || name === 'host_id' || name === 'co_host_id') {
        value = input.value ? Number(input.value) : null;
      } else {
        value = input.value.trim() === '' ? null : input.value.trim();
      }
      payload[name] = value;
    });

    // Datum (+ eventueel uur/kwartier): geen data-field, dus niet meegepikt
    // door de lus hierboven. Apart samenvoegen tot één ISO-waarde per
    // veldnaam. Velden zonder eigen uur-selects (dateOnlyField()) krijgen
    // hun vaste klokslag uit DEFAULT_TIME_FOR_FIELD.
    el('panel-content').querySelectorAll('[data-dt-date]').forEach(function (dateInput) {
      var name = dateInput.getAttribute('data-dt-date');
      if (!dateInput.value) { payload[name] = null; return; }
      var hourSelect = el('panel-content').querySelector('[data-dt-hour-for="' + name + '"]');
      var minuteSelect = el('panel-content').querySelector('[data-dt-minute-for="' + name + '"]');
      var time;
      if (hourSelect || minuteSelect) {
        time = ((hourSelect && hourSelect.value) || '08') + ':' + ((minuteSelect && minuteSelect.value) || '00');
      } else {
        time = DEFAULT_TIME_FOR_FIELD[name] || '00:00';
      }
      payload[name] = localInputToIso(dateInput.value + 'T' + time);
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

  /** Snelactie vanaf de inschrijvingen-tegel bovenaan het paneel: popup i.p.v. accordeon. */
  function openRegistrationsDialog(eventId) {
    el('registrationsDialog').showModal();
    if (state.registrations.loadedFor === eventId) {
      renderRegistrations(eventId);
    } else {
      loadRegistrations(eventId, 1);
    }
  }

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

  /**
   * De 'Vraag'-tekst komt soms als (dubbel-geëscapete) HTML binnen --
   * "<pre>Beste,<br><br>...&amp;amp;...</pre>" -- in plaats van platte
   * tekst. Dat gewoon escapen toont de tags letterlijk. Hier ontdoen we het
   * tot platte tekst met echte regeleindes: <br>/<pre> weg, entiteiten
   * (eventueel meerdere keren geëscapeerd) terug decoderen, en pas daarna
   * -- bij het renderen -- opnieuw escapen voor veilige weergave.
   */
  function cleanQuestionText(raw) {
    if (!raw) return '';
    var text = String(raw);
    text = text.replace(/<\/?pre[^>]*>/gi, '').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '');
    var prev;
    do {
      prev = text;
      text = text
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#0?39;/g, "'")
        .replace(/&nbsp;/g, ' ');
    } while (text !== prev);
    return text.trim();
  }

  function registrationMailBadges(row) {
    var mails = row.mails || {};
    var out = [];
    if (mails.confirmation_sent) out.push('<span class="badge badge-xs badge-outline" title="Bevestigingsmail verzonden">Bevestiging</span>');
    if (mails.reminder_sent) out.push('<span class="badge badge-xs badge-outline" title="Herinneringsmail verzonden">Herinnering</span>');
    if (mails.recap_sent) out.push('<span class="badge badge-xs badge-outline" title="Recapmail verzonden">Recap</span>');
    return out;
  }

  function renderRegistrations(eventId) {
    var host = el('registrations-section');
    if (!host) return;

    var reg = state.registrations;
    var attended = reg.rows.filter(function (row) { return row.attended; }).length;

    var rows = reg.rows.map(function (row) {
      var badge = REG_STATE_BADGE[row.state] || REG_STATE_BADGE.registered;
      var lead = row.lead;
      var mailBadges = registrationMailBadges(row);
      var question = cleanQuestionText(row.questions);
      var name = row.partner.name || row.name || '—';

      return '<tr class="hover align-top">' +
        '<td class="max-w-[14rem]">' +
          '<div class="font-medium truncate" title="' + esc(name) + '">' + esc(name) + '</div>' +
          '<div class="text-xs opacity-60 truncate">' + esc(row.submitted_email || '') + '</div>' +
        '</td>' +
        '<td class="text-xs whitespace-nowrap">' + esc(row.source || '—') +
          '<div class="opacity-60">' + esc(formatWhen(row.created_at)) + '</div></td>' +
        '<td class="whitespace-nowrap">' +
          (lead && lead.id
            ? '<span class="badge badge-sm badge-outline" title="' + esc(lead.name || '') + '">' +
              esc(lead.resolved_lead_status || '') + '</span>'
            : '<span class="text-xs opacity-40">—</span>') +
        '</td>' +
        '<td class="whitespace-nowrap"><span class="badge badge-sm ' + badge.cls + '">' + badge.label + '</span></td>' +
        '<td class="whitespace-nowrap">' +
          (mailBadges.length
            ? '<div class="flex flex-wrap gap-1">' + mailBadges.join('') + '</div>'
            : '<span class="text-xs opacity-40">—</span>') +
        '</td>' +
        '<td class="text-center">' +
          '<input type="checkbox" class="checkbox checkbox-sm"' +
            ' data-action="toggle-attendance" data-registration-id="' + row.id + '"' +
            (row.attended ? ' checked' : '') +
            (row.state === 'cancelled' ? ' disabled' : '') + ' />' +
        '</td>' +
        '</tr>' +
        (question
          ? '<tr><td colspan="6" class="text-xs opacity-70 pt-0 pb-3">' +
            '<span class="font-medium">Vraag:</span> <span class="whitespace-pre-wrap">' + esc(question) + '</span></td></tr>'
          : '');
    }).join('');

    host.innerHTML =
      '<div class="flex items-center justify-between gap-3 flex-wrap mb-3">' +
        '<div class="flex items-center gap-2 text-sm">' +
          '<span class="badge badge-ghost">' + reg.total + ' totaal</span>' +
          '<span class="text-xs opacity-60">' + attended + ' van ' + reg.rows.length + ' aanwezig op deze pagina</span>' +
        '</div>' +
        '<div class="flex items-center gap-1.5 flex-wrap">' +
          '<button class="btn btn-xs btn-ghost gap-1" data-action="reload-registrations" data-event-id="' + eventId + '">' +
            '<i data-lucide="refresh-cw" class="w-3 h-3"></i> Verversen</button>' +
          '<button class="btn btn-xs btn-outline gap-1" data-action="add-registration" data-event-id="' + eventId + '">' +
            '<i data-lucide="user-plus" class="w-3 h-3"></i> Handmatig toevoegen</button>' +
          '<div class="w-px h-4 bg-base-300 mx-1"></div>' +
          '<button class="btn btn-xs btn-outline gap-1" data-action="export-registrations" data-format="xlsx" data-event-id="' + eventId + '"' +
            ' title="Volledige lijst downloaden als Excel">' +
            '<i data-lucide="file-spreadsheet" class="w-3 h-3"></i> Excel</button>' +
          '<button class="btn btn-xs btn-outline gap-1" data-action="export-registrations" data-format="pdf" data-event-id="' + eventId + '"' +
            ' title="Volledige lijst downloaden als PDF">' +
            '<i data-lucide="file-text" class="w-3 h-3"></i> PDF</button>' +
        '</div>' +
      '</div>' +
      (reg.rows.length === 0
        ? '<p class="text-sm opacity-60 py-3">Nog geen inschrijvingen.</p>'
        : '<div class="overflow-x-auto"><table class="table table-xs">' +
          '<thead><tr><th>Deelnemer</th><th>Bron</th><th>Lead</th><th>Toestand</th><th>Mails</th>' +
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
        : '');

    if (window.lucide) window.lucide.createIcons();
  }

  /** Haalt ALLE inschrijvingen op (niet enkel de huidige paginagrootte van 25), voor export. */
  async function fetchAllRegistrations(eventId) {
    var page = 1;
    var perPage = 100;
    var all = [];
    while (true) {
      var result = await api('/events/' + eventId + '/registrations?page=' + page + '&per_page=' + perPage);
      all = all.concat(result.payload.data || []);
      var pagination = result.payload.pagination || {};
      if (!pagination.total_pages || page >= pagination.total_pages) break;
      page += 1;
    }
    return all;
  }

  function registrationExportRows(rows) {
    return rows.map(function (row) {
      var badge = REG_STATE_BADGE[row.state] || REG_STATE_BADGE.registered;
      var mails = row.mails || {};
      var sent = [];
      if (mails.confirmation_sent) sent.push('Bevestiging');
      if (mails.reminder_sent) sent.push('Herinnering');
      if (mails.recap_sent) sent.push('Recap');

      return {
        'Deelnemer': row.partner.name || row.name || '',
        'E-mail': row.submitted_email || '',
        'Bron': row.source || '',
        'Datum': formatWhen(row.created_at),
        'Lead status': (row.lead && row.lead.resolved_lead_status) || '',
        'Toestand': badge.label,
        'Aanwezig': row.attended ? 'Ja' : 'Nee',
        'Verzonden mails': sent.join(', ') || '—',
        'Vraag': cleanQuestionText(row.questions)
      };
    });
  }

  function downloadBlob(blob, name) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  var EXPORT_HEADERS = ['Deelnemer', 'E-mail', 'Bron', 'Datum', 'Lead status', 'Toestand', 'Aanwezig', 'Verzonden mails', 'Vraag'];

  async function exportRegistrations(eventId, format, trigger) {
    if (trigger) trigger.disabled = true;
    try {
      var rows = await fetchAllRegistrations(eventId);
      var exportRows = registrationExportRows(rows);
      var eventTitle = (state.detail && state.detail.title) || 'event';
      var filename = 'inschrijvingen-' + eventTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

      if (format === 'xlsx') {
        if (typeof XLSX === 'undefined') { reportError(new Error('Excel-bibliotheek niet geladen.')); return; }
        var ws = XLSX.utils.json_to_sheet(exportRows, { header: EXPORT_HEADERS });
        var wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Inschrijvingen');
        XLSX.writeFile(wb, filename + '.xlsx');
      } else if (format === 'pdf') {
        if (typeof window.jspdf === 'undefined') { reportError(new Error('PDF-bibliotheek niet geladen.')); return; }
        var doc = new window.jspdf.jsPDF({ orientation: 'landscape' });
        doc.setFontSize(12);
        doc.text('Inschrijvingen — ' + eventTitle, 14, 12);
        doc.autoTable({
          startY: 18,
          head: [EXPORT_HEADERS],
          body: exportRows.map(function (r) { return EXPORT_HEADERS.map(function (h) { return r[h]; }); }),
          styles: { fontSize: 8, cellWidth: 'wrap' },
          headStyles: { fillColor: [30, 41, 59] },
          columnStyles: { 8: { cellWidth: 60 } }
        });
        doc.save(filename + '.pdf');
      }
    } catch (error) {
      reportError(error);
    } finally {
      if (trigger) trigger.disabled = false;
    }
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
      await refreshEvents();
    } catch (error) {
      reportError(error);
    }
  }

  // ─── Acties ────────────────────────────────────────────────────────────────

  function reportError(error) {
    var text = error.message;
    // details is soms een lijst (wat er mist om te publiceren) en soms een
    // object (bv. het aantal inschrijvingen). Alleen de lijst hoort in de tekst.
    if (Array.isArray(error.details) && error.details.length) {
      text += ' (' + error.details.join(', ') + ')';
    }
    toast(text, 'error');
  }

  async function afterMutation(detail, message) {
    state.detail = detail;
    state.editingTitle = false;
    renderDetail();
    // Het geheugen is nu verouderd: leeggooien zodat kalender en lijst de
    // wijziging laten zien.
    await refreshEvents();
    toast(message, 'success');
  }

  /**
   * Potloodje naast de titel: zet het detailpaneel in bewerkmodus voor de
   * titel. Er is geen aparte opslaan-actie hiervoor -- het inputveld krijgt
   * data-field="title" mee, dus de gewone "Opslaan"-knop (collectFields())
   * neemt de nieuwe titel gewoon mee, net als elk ander veld.
   */
  function editTitle() {
    state.editingTitle = true;
    renderDetail();
    var input = el('titleInlineInput');
    if (input) { input.focus(); input.select(); }
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
      await refreshEvents();
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

  /** Zelfde standaardkleur als EVENT_TYPE_FALLBACK_COLOR in constants.js. */
  var TYPE_COLOR_FALLBACK = '#475569';

  function openTypeColorsDialog() {
    renderTypeColorsList();
    el('typeColorsDialog').showModal();
  }

  function renderTypeColorsList() {
    el('typeColorsList').innerHTML = state.types.map(function (type) {
      var hex = type.color || TYPE_COLOR_FALLBACK;
      return '<div class="flex items-center gap-2" data-type-row="' + type.id + '">' +
        '<span class="flex-1 text-sm">' + esc(type.name) + '</span>' +
        '<input type="color" class="w-8 h-8 p-0 border-0 rounded cursor-pointer" value="' + hex + '"' +
          ' data-action="type-color-swatch-change" data-type-id="' + type.id + '">' +
        '<input type="text" class="input input-bordered input-xs w-24 font-mono" value="' + esc(hex) + '"' +
          ' data-action="type-color-hex-change" data-type-id="' + type.id + '">' +
        '<button class="btn btn-xs btn-primary" data-action="save-type-color" data-type-id="' + type.id + '">' +
          'Opslaan</button>' +
      '</div>';
    }).join('');
  }

  /**
   * Schrijft naar Odoo (x_studio_type_color_hex) via PATCH
   * /event-types/:id -- zie setEventTypeColor() in de Worker. Geen
   * autosave op elke swatch/hex-wijziging met opzet: dat zou bij het
   * verslepen van de kleurenkiezer tientallen schrijfacties naar Odoo
   * sturen voor één bedoelde wijziging.
   */
  async function saveTypeColor(typeId, trigger) {
    var row = trigger.closest('[data-type-row]');
    var hexInput = row.querySelector('[data-action="type-color-hex-change"]');
    var color = (hexInput.value || '').trim();

    if (!/^#[0-9a-fA-F]{6}$/.test(color)) {
      toast('Ongeldige hex-kleur, bv. #0D9488', 'error');
      return;
    }

    trigger.disabled = true;
    try {
      var result = await api('/event-types/' + typeId, { method: 'PATCH', body: { color: color } });
      state.types = result.payload.data || state.types;
      toast('Kleur bewaard', 'success');
    } catch (error) {
      toast('Kleur bewaren mislukt: ' + error.message, 'error');
    } finally {
      trigger.disabled = false;
    }
  }

  /**
   * Opent "nieuw event". Vanaf een klik op een lege kalenderdag komt die
   * datum al ingevuld mee (industry-standard: klik op een lege cel = nieuw
   * item op die dag), vanaf de knop begint het leeg.
   */
  function openCreateDialog(dateStr) {
    el('createError').classList.add('hidden');
    el('newStartsAtDate').value = dateStr || '';
    el('createDialog').showModal();
  }

  async function createEvent() {
    var errorBox = el('createError');
    errorBox.classList.add('hidden');

    var body = {
      title: el('newTitle').value.trim(),
      starts_at: el('newStartsAtDate').value
        ? localInputToIso(el('newStartsAtDate').value + 'T' +
            ((el('newStartsAtHour').value || '10') + ':' + (el('newStartsAtMinute').value || '00')))
        : null,
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
      await refreshEvents();
      await selectEvent(result.payload.data.id);
    } catch (error) {
      errorBox.textContent = error.message + (error.details ? ': ' + error.details.join(', ') : '');
      errorBox.classList.remove('hidden');
    }
  }

  // ─── Centrale listeners ────────────────────────────────────────────────────
  // Projectregel: geen inline onclick met variabelen. Identiteit zit in
  // data-event-id, gedrag in data-action.

  document.addEventListener('click', function (domEvent) {
    var trigger = domEvent.target.closest('[data-action]');
    if (!trigger) return;

    // Formuliervelden houden hun eigen gedrag: geen preventDefault op een
    // checkbox of file-input, want dan vuurt het change-event niet meer.
    var tag = trigger.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;

    var action = trigger.getAttribute('data-action');
    var id = Number(trigger.getAttribute('data-event-id'));

    // Met tabindex="0" op de dropdown-content (zie renderDetail) blijft de focus
    // na een klik binnen het ⋯-menu staan, dus het menu blijft open. Dat leest
    // als "er gebeurde niets", ook als de actie wel lukte. Eenmalig centraal
    // hier blur()en zodra vaststaat dat het om een item uit zo'n menu gaat -- dit
    // moet VOOR de dialogen (removeDialog/composerDialog) geopend worden, anders
    // pikt de browser de focus-verschuiving van blur() op als sluiting van net
    // die dialoog. blur() zelf raakt <dialog>-elementen niet, dus dat is veilig.
    if (trigger.closest('.dropdown-content') && document.activeElement) {
      document.activeElement.blur();
    }

    switch (action) {
      case 'select-event': selectEvent(id); break;
      case 'edit-title': editTitle(); break;
      case 'save': saveEvent(id); break;
      case 'publish': transition(id, 'publish', 'Gepubliceerd'); break;
      case 'unpublish': transition(id, 'unpublish', 'Terug naar concept'); break;
      case 'done': transition(id, 'done', 'Afgerond'); break;
      case 'cancel-event': transition(id, 'cancel', 'Geannuleerd'); break;
      case 'duplicate': duplicate(id); break;
      case 'show-public': showPublic(id); break;
      case 'open-registrations': openRegistrationsDialog(id); break;
      case 'registrations-close': el('registrationsDialog').close(); break;
      case 'reload-registrations': loadRegistrations(id, state.registrations.page); break;
      case 'export-registrations': exportRegistrations(id, trigger.getAttribute('data-format'), trigger); break;
      case 'add-registration': addRegistration(id); break;
      case 'remove-event': openRemoveDialog(id); break;
      case 'archive': archiveEvent(id, true); break;
      case 'unarchive': archiveEvent(id, false); break;
      case 'remove-close': el('removeDialog').close(); break;
      case 'remove-archive':
        el('removeDialog').close();
        archiveEvent(removeDialogEventId(), true);
        break;
      case 'remove-cancel-event':
        el('removeDialog').close();
        transition(removeDialogEventId(), 'cancel', 'Geannuleerd');
        break;
      case 'remove-delete': deleteEventForGood(removeDialogEventId()); break;
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
      case 'open-type-colors': openTypeColorsDialog(); break;
      case 'type-colors-close': el('typeColorsDialog').close(); break;
      case 'save-type-color':
        saveTypeColor(Number(trigger.getAttribute('data-type-id')), trigger);
        break;
      case 'reload':
        if (state.view === 'list') { loadListEvents(true); } else { loadEvents(true); }
        break;
      case 'view-calendar': switchView('calendar'); break;
      case 'view-list': switchView('list'); break;
      case 'new-event': openCreateDialog(); break;
      case 'create-cancel': el('createDialog').close(); break;
      case 'create-submit': createEvent(); break;
      case 'page-prev':
        if (state.list.page > 1) { state.list.page -= 1; loadListEvents(); }
        break;
      case 'page-next':
        if (state.list.page < state.list.totalPages) { state.list.page += 1; loadListEvents(); }
        break;
      case 'list-month-prev': {
        var prevMonth = addMonths(state.list.month.year, state.list.month.month, -1);
        var thisMonth = brusselsYearMonth();
        // Nooit voor de huidige maand -- de knop staat dan sowieso al
        // disabled, maar dit is de harde grens.
        if (prevMonth.year < thisMonth.year || (prevMonth.year === thisMonth.year && prevMonth.month < thisMonth.month)) break;
        state.list.month = prevMonth;
        state.list.page = 1;
        loadListEvents();
        break;
      }
      case 'list-month-next':
        state.list.month = addMonths(state.list.month.year, state.list.month.month, 1);
        state.list.page = 1;
        loadListEvents();
        break;
      case 'list-type-toggle': {
        var typeId = Number(trigger.getAttribute('data-type-id'));
        if (state.list.types.has(typeId)) { state.list.types.delete(typeId); } else { state.list.types.add(typeId); }
        state.list.page = 1;
        loadListEvents();
        break;
      }
      default: break;
    }
  });

  // Onthouden welke accordeon-sectie open staat, zodat een herrender hem
  // niet dichtklapt.
  document.addEventListener('toggle', function (domEvent) {
    var node = domEvent.target;
    if (!node || node.tagName !== 'DETAILS' || node.getAttribute('data-action') !== 'section') return;
    if (!node.open) return;

    state.openSection = node.getAttribute('data-section');
  }, true);

  document.addEventListener('change', function (domEvent) {
    var trigger = domEvent.target.closest('[data-action]');
    if (!trigger) return;

    var action = trigger.getAttribute('data-action');

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
      return;
    }

    if (action === 'type-color-swatch-change') {
      var hexInput = trigger.closest('[data-type-row]').querySelector('[data-action="type-color-hex-change"]');
      if (hexInput) hexInput.value = trigger.value;
      return;
    }

    if (action === 'type-color-hex-change') {
      var val = trigger.value.trim();
      if (/^#[0-9a-fA-F]{6}$/.test(val)) {
        var swatch = trigger.closest('[data-type-row]').querySelector('[data-action="type-color-swatch-change"]');
        if (swatch) swatch.value = val;
      }
    }
  });

  // ─── Start ─────────────────────────────────────────────────────────────────

  async function loadTypes() {
    try {
      var result = await api('/event-types');
      state.types = result.payload.data || [];

      var options = state.types.map(function (type) {
        return '<option value="' + type.id + '">' + esc(type.name) + '</option>';
      }).join('');

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

  /**
   * Welke events nog een oude WP Tribe Events-pagina hebben (v1). Faalt
   * dit (WordPress onbereikbaar, geen rechten, ...), dan blijft de
   * markering gewoon leeg -- dit mag nooit de rest van de pagina blokkeren.
   */
  async function loadLegacyWpPages() {
    try {
      var result = await api('/wp-legacy-pages');
      state.legacyWpPages = result.payload.data || {};
    } catch (error) {
      state.legacyWpPages = {};
      console.warn('Oude WP-pagina\'s laden mislukt:', error.message);
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

  document.addEventListener('keydown', function (domEvent) {
    if (domEvent.key === 'Escape' && domEvent.target && domEvent.target.id === 'titleInlineInput') {
      state.editingTitle = false;
      renderDetail();
    }
  });

  document.addEventListener('DOMContentLoaded', function () {
    initNavbar();
    loadHealth();
    // Statische select in de "nieuw event"-dialoog: eenmalig vullen, net als
    // newType/newHost. Zelfde reden als dateTimeField() in het detailpaneel:
    // de browser-eigen datetime-local-picker toont zijn minutenlijst altijd
    // per minuut, step of niet.
    if (el('newStartsAtHour')) {
      el('newStartsAtHour').innerHTML = '<option value="">--</option>' + hourOptions('');
    }
    if (el('newStartsAtMinute')) {
      el('newStartsAtMinute').innerHTML = '<option value="">--</option>' + minuteOptions('');
    }
    Promise.all([loadTypes(), loadHosts(), loadLegacyWpPages()]).then(loadEvents);
    if (window.lucide) window.lucide.createIcons();
  });
})();
