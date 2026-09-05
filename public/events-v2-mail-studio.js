/**
 * Event Operations v2 — Communicatie-studio (client)
 *
 * Bewerkt de mailblokken die IN ODOO staan:
 *   x_webinar_event_type.x_studio_mail_blocks      (standaard per type)
 *   x_webinar.x_studio_mail_blocks_override        (override per event)
 *
 * ONTWERPKEUZE: JE BEWERKT IN DE MAIL ZELF.
 * Een eerdere versie zette een blokkenlijst met ruwe velden (URL, alt, level,
 * een HTML-textarea) naast het voorbeeld. Dat werkt voor wie het gebouwd
 * heeft en voor niemand anders -- en de mensen die dit moeten kunnen zijn de
 * organisatoren van de events, niet alleen marketing. Nu klik je op een titel
 * of alinea IN de mail en typ je erin. Alles wat je niet kan typen (een link,
 * een afbeelding, zichtbaarheid per site) zit achter één knop "Instellingen"
 * op het onderdeel dat je geselecteerd hebt.
 *
 * WAAROM DE EDITOR IN HET IFRAME LEEFT
 * Het voorbeeld is een `srcdoc`-iframe en dus same-origin: we kunnen er
 * rechtstreeks in werken. De selectie-omlijning en de werkbalk worden IN dat
 * document gezet, zodat ze meebewegen met de layout. Een werkbalk in de
 * ouderpagina zou bij elke scroll herberekend moeten worden.
 *
 * De markers waarop dit werkt (`data-om-block`, `data-om-edit`) worden ALLEEN
 * gerenderd wanneer de preview-route `editable: true` meekrijgt. De mail die
 * naar Odoo geschreven wordt bevat ze niet.
 *
 * REGELS UIT CLAUDE.md die hier gelden: geen inline onclick/onchange (alles
 * via data-attributen en één centrale listener), tabs altijd tabs-boxed,
 * fetch met credentials: 'include' en bij 401 terug naar /.
 */

(function () {
  'use strict';

  var API = '/events-v2/api';

  var state = {
    eventId: null,
    eventTypeId: null,
    eventTypeName: '',
    event: null,
    kind: 'confirmation',
    /** '' = beide sites, anders 'openvme' / 'syndicoach' */
    viewSite: '',
    /** false = de standaard van het event-type, true = alleen dit event */
    scopeEvent: false,
    typeDoc: null,
    eventDoc: null,
    schema: null,
    selectedId: null,
    dirty: false,
    previewTimer: null,
    busy: false,
    addAt: 'end',
    ownedByOm: false
  };

  var KIND_LABEL = { confirmation: 'bevestiging', reminder: 'reminder', recap: 'recap' };

  /**
   * De onderdelen zoals ze in de kiezer verschijnen. Bewust in mensentaal en
   * met een voorbeeld erbij -- niet de technische bloknaam.
   */
  var BLOCK_META = {
    heading:       { label: 'Titel',           icon: 'heading',             hint: 'Een kop in het vet',           sample: { level: 2, text: 'Nieuwe titel' } },
    text:          { label: 'Tekst',           icon: 'align-left',          hint: 'Een alinea',                   sample: { html: '<p style="margin:0 0 16px 0;">Nieuwe tekst.</p>' } },
    event_details: { label: 'Praktisch kader', icon: 'calendar-clock',      hint: 'Datum, tijd, locatie en link', sample: { title: 'Details van het evenement:' } },
    button:        { label: 'Knop',            icon: 'mouse-pointer-click', hint: 'Een duidelijke actieknop',     sample: { label: 'Neem deel', href: '{{event.link}}' } },
    video:         { label: 'Opname',          icon: 'play-circle',         hint: 'De video van dit event',       sample: {} },
    hero:          { label: 'Banner',          icon: 'image',               hint: 'Volle breedte, bovenaan',      sample: { src: '', alt: '' } },
    signature:     { label: 'Afzender',        icon: 'user-round',          hint: 'Naam, functie en foto',        sample: {} },
    divider:       { label: 'Lijntje',         icon: 'minus',               hint: 'Scheidingslijn',               sample: {} },
    spacer:        { label: 'Witruimte',       icon: 'move-vertical',       hint: 'Extra lucht',                  sample: { height: 24 } },
    card_break:    { label: 'Nieuw kader',     icon: 'layout-panel-top',    hint: 'Begint een nieuw wit blok',    sample: {} },
    footer:        { label: 'Voettekst',       icon: 'panel-bottom',        hint: 'Klein en grijs, onderaan',     sample: { html: '&copy; {{now.year}} Mymmo BV' } }
  };

  /** Wat je NIET rechtstreeks in de mail kan typen. Leeg = alleen zichtbaarheid. */
  var BLOCK_SETTINGS = {
    hero: [
      { key: 'src', label: 'Afbeelding-URL', type: 'url' },
      { key: 'alt', label: 'Omschrijving van de afbeelding', type: 'text' },
      { key: 'href', label: 'Klikt door naar (optioneel)', type: 'url' }
    ],
    heading: [{ key: 'level', label: 'Grootte', type: 'select', options: [['1', 'Groot'], ['2', 'Normaal'], ['3', 'Klein']] }],
    button: [{ key: 'href', label: 'Link', type: 'url' }],
    spacer: [{ key: 'height', label: 'Hoogte in pixels', type: 'number' }],
    signature: [
      { key: 'name', label: 'Naam', type: 'text', placeholder: 'Leeg = de host van dit event' },
      { key: 'job_title', label: 'Functie', type: 'text', placeholder: 'Leeg = uit Odoo' },
      { key: 'org', label: 'Organisatie', type: 'text', placeholder: 'Leeg = volgt de site' }
    ],
    video: [], text: [], event_details: [], divider: [], card_break: [], footer: []
  };

  function el(id) { return document.getElementById(id); }

  function esc(value) {
    return String(value === null || value === undefined ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  async function api(path, options) {
    var response = await fetch(API + path, Object.assign({ credentials: 'include' }, options || {}));
    if (response.status === 401) { window.location.href = '/'; return null; }
    var payload = await response.json().catch(function () { return {}; });
    if (!response.ok || payload.success === false) {
      throw new Error(payload.error || ('Serverfout ' + response.status));
    }
    return payload.data;
  }

  function toast(message, type) {
    if (typeof window.showToast === 'function') { window.showToast(message, type); return; }
    console.log('[mail-studio]', message);
  }

  function icons() { if (window.lucide) window.lucide.createIcons(); }

  // ─── Documentmodel ─────────────────────────────────────────────────────────

  function activeDoc() { return state.scopeEvent ? state.eventDoc : state.typeDoc; }

  function section() {
    var doc = activeDoc();
    if (!doc[state.kind]) doc[state.kind] = { subject: '', preheader: '', blocks: [] };
    if (!Array.isArray(doc[state.kind].blocks)) doc[state.kind].blocks = [];
    return doc[state.kind];
  }

  function blockById(id) {
    return section().blocks.filter(function (b) { return b.id === id; })[0] || null;
  }

  function indexOfBlock(id) {
    var blocks = section().blocks;
    for (var i = 0; i < blocks.length; i += 1) if (blocks[i].id === id) return i;
    return -1;
  }

  function markDirty() {
    state.dirty = true;
    el('mailStudioDirty').textContent = 'Niet bewaard';
    schedulePreview();
  }

  // ─── Openen ────────────────────────────────────────────────────────────────

  async function open(eventId) {
    state.eventId = Number(eventId);
    state.dirty = false;
    state.kind = 'confirmation';
    state.viewSite = '';
    state.selectedId = null;
    state.scopeEvent = false;

    el('mailStudioDialog').showModal();
    el('mailStudioDirty').textContent = '';

    try {
      if (!state.schema) state.schema = await api('/mail/schema');

      var data = await api('/events/' + state.eventId + '/mail-blocks');
      state.eventTypeId = data.event_type.id;
      state.eventTypeName = data.event_type.name || '(geen type)';
      state.typeDoc = data.type_doc;
      state.eventDoc = data.event_doc;

      renderStatus(data);
      renderPlaceholders();
      renderPicker();
      render();
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  function renderStatus(data) {
    if (data && typeof data.owned_by_om === 'boolean') state.ownedByOm = data.owned_by_om;
    var owned = state.ownedByOm;
    el('mailStudioStatus').innerHTML =
      (owned
        ? '<span class="badge badge-success badge-sm">Deze mails worden vanuit de OM verstuurd</span>'
        : '<span class="badge badge-warning badge-sm">Nog niet actief</span>') +
      '<span class="opacity-70">' +
      esc(owned
        ? 'Bevestiging en reminder vertrekken automatisch bij het inschrijven.'
        : 'Je kan de opmaak nu al klaarzetten; er wordt nog niets vanuit de OM verstuurd.') +
      '</span>' +
      // De keuze tussen "standaard voor het type" en "alleen dit event" staat
      // bewust HIER en niet als grote schakelaar bovenaan: het is een
      // uitzondering, geen dagelijkse handeling.
      '<button class="link link-hover ml-auto" data-action="mail-scope-toggle">' +
      (state.scopeEvent
        ? 'Je bewerkt nu alleen dit event — terug naar de standaard'
        : 'Alleen voor dit event laten afwijken') +
      '</button>';
  }

  function renderPlaceholders() {
    el('mailPlaceholderList').innerHTML = (state.schema ? state.schema.placeholders : [])
      .map(function (p) { return '<code class="bg-base-200 rounded px-1 text-xs">{{' + esc(p) + '}}</code>'; })
      .join('');
  }

  function renderPicker() {
    el('mailBlockPickerGrid').innerHTML = Object.keys(BLOCK_META).map(function (type) {
      var meta = BLOCK_META[type];
      return '<button class="btn btn-outline h-auto py-3 flex-col gap-1 items-start text-left normal-case" ' +
        'data-action="mail-add-pick" data-mail-add-type="' + esc(type) + '">' +
        '<span class="flex items-center gap-2 font-medium">' +
          '<i data-lucide="' + esc(meta.icon) + '" class="w-4 h-4"></i>' + esc(meta.label) + '</span>' +
        '<span class="text-xs opacity-60 font-normal">' + esc(meta.hint) + '</span></button>';
    }).join('');
  }

  function render() {
    el('mailStudioKindTabs').querySelectorAll('[data-mail-kind]').forEach(function (tab) {
      tab.classList.toggle('tab-active', tab.getAttribute('data-mail-kind') === state.kind);
    });
    el('mailSiteSwitch').querySelectorAll('[data-mail-view]').forEach(function (btn) {
      btn.classList.toggle('btn-active', btn.getAttribute('data-mail-view') === state.viewSite);
    });

    el('mailStudioSubtitle').textContent = state.scopeEvent
      ? 'Alleen voor dit ene event'
      : 'Geldt voor elk event van het type ' + state.eventTypeName;

    var sec = section();
    var dialog = el('mailStudioDialog');
    dialog.querySelector('[data-mail-field="subject"]').value = sec.subject || '';
    dialog.querySelector('[data-mail-field="preheader"]').value = sec.preheader || '';

    el('mailSendLabel').textContent = 'Klaarzetten: ' + (KIND_LABEL[state.kind] || state.kind);
    schedulePreview();
    icons();
  }

  // ─── Voorbeeld + bewerken ──────────────────────────────────────────────────

  function schedulePreview() {
    clearTimeout(state.previewTimer);
    state.previewTimer = setTimeout(refreshPreview, 300);
  }

  async function refreshPreview() {
    if (!state.eventId) return;
    try {
      var data = await api('/events/' + state.eventId + '/mail-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: state.kind,
          site: state.viewSite || null,
          draft: activeDoc(),
          scope: state.scopeEvent ? 'event' : 'event_type',
          editable: true
        })
      });
      if (!data) return;

      if (data.event) state.event = data.event;

      var frame = el('mailPreviewFrame');
      frame.onload = function () { enhance(frame); };
      frame.srcdoc = data.html && data.html.indexOf('<t') !== 0 && data.html !== ''
        ? data.html
        : '<p style="font-family:sans-serif;padding:40px;color:#6b7280">Deze mail is nog leeg. Voeg onderaan een onderdeel toe.</p>';

      var hint = el('mailEditHint');
      if (state.kind === 'recap' && data.video_missing) {
        hint.innerHTML = 'Er hangt nog geen opname aan dit event, dus het opnameblok blijft leeg. ' +
          '<button class="link" data-action="mail-video-open">Opname kiezen</button>';
      } else if (!data.subject) {
        hint.textContent = 'Vul hierboven een onderwerp in — zonder onderwerp wordt de mail niet verstuurd.';
      } else {
        hint.textContent = 'Klik in de mail om tekst aan te passen. Selecteer een onderdeel voor extra opties.';
      }
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  /**
   * De editor-laag in het iframe zetten: omlijning bij hover, selectie,
   * inline bewerken en een werkbalk boven het geselecteerde onderdeel.
   */
  function enhance(frame) {
    var doc = frame.contentDocument;
    if (!doc || !doc.body) return;

    // Het iframe scrollt niet zelf: het groeit mee met de mail en de
    // OUDERPAGINA scrollt. Zo blijft de werkbalk op de juiste plek staan en
    // is er maar één scrollbalk in beeld.
    frame.style.height = (Math.max(doc.body.scrollHeight, 400) + 48) + 'px';

    var style = doc.createElement('style');
    style.textContent =
      'body{margin:0;}' +
      '[data-om-block]{outline:2px solid transparent;outline-offset:2px;transition:outline-color .12s;cursor:pointer;}' +
      '[data-om-block]:hover{outline-color:#93c5fd;}' +
      '[data-om-block].om-selected{outline-color:#2563eb;}' +
      '[data-om-edit]{cursor:text;}' +
      '[data-om-edit]:focus{outline:2px solid #2563eb;outline-offset:3px;border-radius:3px;}' +
      '#om-bar{position:absolute;z-index:9999;display:flex;gap:2px;align-items:center;background:#111827;' +
        'border-radius:8px;padding:4px;box-shadow:0 6px 20px rgba(0,0,0,.25);' +
        "font-family:system-ui,-apple-system,'Segoe UI',sans-serif;white-space:nowrap;}" +
      '#om-bar button{border:0;background:transparent;color:#fff;font-size:12px;padding:5px 8px;' +
        'border-radius:5px;cursor:pointer;line-height:1;}' +
      '#om-bar button:hover{background:#374151;}' +
      '#om-bar .om-note{color:#9ca3af;font-size:11px;padding:0 6px;}';
    doc.head.appendChild(style);

    // Links in de mail niet volgen tijdens het bewerken -- anders navigeert
    // het iframe weg bij de eerste klik op een knop of een deelnamelink.
    doc.addEventListener('click', function (event) {
      var link = event.target.closest('a');
      if (link) event.preventDefault();
    }, true);

    doc.addEventListener('click', function (event) {
      if (event.target.closest('#om-bar')) return;

      var holder = event.target.closest('[data-om-block]');
      if (!holder) { deselect(doc); return; }

      select(doc, holder.getAttribute('data-om-block'));

      var editable = event.target.closest('[data-om-edit]');
      if (editable) startEditing(editable, holder.getAttribute('data-om-block'));
    });

    if (state.selectedId) select(doc, state.selectedId);
  }

  function startEditing(node, blockId) {
    if (node.getAttribute('contenteditable') === 'true') return;
    node.setAttribute('contenteditable', 'true');
    node.focus();

    var prop = node.getAttribute('data-om-edit');

    var commit = function () {
      var block = blockById(blockId);
      if (!block) return;
      // `html` bewaart opmaak (vet, cursief); de rest wordt platte tekst,
      // want een `<` in een knoplabel of een titel hoort daar niet.
      var value = prop === 'html' ? node.innerHTML : node.textContent;
      if (String(block[prop] === undefined ? '' : block[prop]) === String(value)) return;
      block[prop] = value;
      markDirty();
    };

    node.addEventListener('blur', function () {
      node.removeAttribute('contenteditable');
      commit();
    }, { once: true });

    node.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') { node.blur(); return; }
      // Enter in een titel of een knoplabel maakt geen nieuwe regel.
      if (event.key === 'Enter' && prop !== 'html') { event.preventDefault(); node.blur(); }
    });
  }

  function deselect(doc) {
    state.selectedId = null;
    doc.querySelectorAll('.om-selected').forEach(function (n) { n.classList.remove('om-selected'); });
    var bar = doc.getElementById('om-bar');
    if (bar) bar.remove();
  }

  function select(doc, blockId) {
    state.selectedId = blockId;
    doc.querySelectorAll('.om-selected').forEach(function (n) { n.classList.remove('om-selected'); });

    var node = doc.querySelector('[data-om-block="' + String(blockId).replace(/["\\]/g, '\\$&') + '"]');
    if (!node) return;
    node.classList.add('om-selected');

    var old = doc.getElementById('om-bar');
    if (old) old.remove();

    var block = blockById(blockId);
    if (!block) return;

    var shared = !Array.isArray(block.sites) || block.sites.length === 0;
    var note = shared
      ? (state.viewSite ? 'geldt voor beide sites' : '')
      : 'alleen ' + block.sites.join(' + ');

    var bar = doc.createElement('div');
    bar.id = 'om-bar';
    bar.innerHTML =
      '<button data-om-cmd="up" title="Naar boven">&uarr;</button>' +
      '<button data-om-cmd="down" title="Naar onder">&darr;</button>' +
      '<button data-om-cmd="duplicate" title="Dupliceren">&#9096;</button>' +
      '<button data-om-cmd="settings">Instellingen</button>' +
      '<button data-om-cmd="add">+ hieronder</button>' +
      '<button data-om-cmd="remove" title="Verwijderen">&#128465;</button>' +
      (note ? '<span class="om-note">' + esc(note) + '</span>' : '');

    bar.addEventListener('click', function (event) {
      var button = event.target.closest('[data-om-cmd]');
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      handleCommand(button.getAttribute('data-om-cmd'), blockId);
    });

    doc.body.appendChild(bar);

    // offsetTop t.o.v. het document: het iframe scrollt niet zelf (zie
    // enhance), dus dit is meteen de juiste absolute positie.
    var top = node.getBoundingClientRect().top + doc.documentElement.scrollTop - bar.offsetHeight - 6;
    var left = node.getBoundingClientRect().left + doc.documentElement.scrollLeft;
    bar.style.top = Math.max(4, top) + 'px';
    bar.style.left = Math.max(8, left) + 'px';
  }

  function handleCommand(command, blockId) {
    var blocks = section().blocks;
    var index = indexOfBlock(blockId);
    if (index === -1) return;

    if (command === 'up' || command === 'down') {
      var target = index + (command === 'up' ? -1 : 1);
      if (target < 0 || target >= blocks.length) return;
      blocks.splice(target, 0, blocks.splice(index, 1)[0]);
      markDirty();
      return;
    }
    if (command === 'duplicate') {
      var copy = JSON.parse(JSON.stringify(blocks[index]));
      copy.id = copy.type + '-' + Date.now();
      blocks.splice(index + 1, 0, copy);
      state.selectedId = copy.id;
      markDirty();
      return;
    }
    if (command === 'remove') {
      blocks.splice(index, 1);
      state.selectedId = null;
      markDirty();
      return;
    }
    if (command === 'add') {
      state.addAt = index + 1;
      el('mailBlockPicker').showModal();
      icons();
      return;
    }
    if (command === 'settings') openSettings(blockId);
  }

  // ─── Instellingen van één onderdeel ────────────────────────────────────────

  function openSettings(blockId) {
    var block = blockById(blockId);
    if (!block) return;
    var meta = BLOCK_META[block.type] || { label: block.type, hint: '' };

    el('mailSettingsTitle').textContent = meta.label;
    el('mailSettingsHint').textContent = meta.hint;

    var fields = (BLOCK_SETTINGS[block.type] || []).map(function (field) {
      var value = block[field.key] === undefined || block[field.key] === null ? '' : block[field.key];
      if (field.type === 'select') {
        return '<label class="form-control"><span class="label-text text-xs opacity-70 mb-1">' + esc(field.label) + '</span>' +
          '<select class="select select-bordered select-sm" data-mail-setting="' + esc(field.key) + '">' +
          field.options.map(function (opt) {
            return '<option value="' + esc(opt[0]) + '"' + (String(value) === opt[0] ? ' selected' : '') + '>' + esc(opt[1]) + '</option>';
          }).join('') + '</select></label>';
      }
      return '<label class="form-control"><span class="label-text text-xs opacity-70 mb-1">' + esc(field.label) + '</span>' +
        '<input type="' + esc(field.type) + '" class="input input-bordered input-sm" data-mail-setting="' + esc(field.key) + '" ' +
        'placeholder="' + esc(field.placeholder || '') + '" value="' + esc(value) + '"></label>';
    }).join('');

    // Zichtbaarheid in gewone taal. "Wie via een andere weg inschreef" is de
    // t-else uit de oude QWeb-template: iedereen van wie we de site niet
    // kennen -- vandaag nog de grote meerderheid.
    var sites = Array.isArray(block.sites) ? block.sites : [];
    var choice = sites.length === 0 ? 'all' : sites.slice().sort().join('+');
    var options = [
      ['all', 'Iedereen'],
      ['openvme', 'Alleen wie via OpenVME inschreef'],
      ['syndicoach', 'Alleen wie via Syndicoach inschreef'],
      ['other', 'Alleen wie via een andere weg inschreef']
    ];

    var visibility =
      '<label class="form-control"><span class="label-text text-xs opacity-70 mb-1">Wie ziet dit onderdeel?</span>' +
      '<select class="select select-bordered select-sm" data-mail-visibility>' +
      options.map(function (opt) {
        return '<option value="' + opt[0] + '"' + (choice === opt[0] ? ' selected' : '') + '>' + esc(opt[1]) + '</option>';
      }).join('') + '</select></label>';

    var video = block.type === 'video'
      ? '<button class="btn btn-sm btn-outline w-full gap-2" data-action="mail-video-open">' +
        '<i data-lucide="clapperboard" class="w-4 h-4"></i> Opname van dit event kiezen</button>' +
        '<p class="text-xs opacity-60">De opname hoort bij het event, niet bij deze mail — zo staat de link op één plek ' +
        'en klopt hij ook in een reminder of op de website.</p>'
      : '';

    el('mailSettingsBody').innerHTML =
      (fields || '<p class="text-sm opacity-60">Dit onderdeel heeft geen extra instellingen.</p>') +
      video + visibility;

    el('mailBlockSettings').showModal();
    icons();
  }

  // ─── Videokiezer ───────────────────────────────────────────────────────────

  async function openVideoPicker() {
    el('mailVideoPicker').showModal();
    el('mailVideoUrl').value = (state.event && state.event.recap && state.event.recap.video_url) || '';
    await loadVideos('');
  }

  async function loadVideos(query) {
    var box = el('mailVideoResults');
    box.innerHTML = '<p class="text-sm opacity-60 col-span-full">Laden…</p>';
    try {
      var data = await api('/vimeo/videos?q=' + encodeURIComponent(query || ''));
      if (!data) return;

      if (!data.configured) {
        box.innerHTML = '<div class="col-span-full alert alert-info text-sm">' +
          'De Vimeo-kiezer staat nog niet aan. Plak hieronder een link, of laat een beheerder ' +
          'het Vimeo-token instellen om hier de video&#39;s uit jullie account te zien.</div>';
        return;
      }
      if (data.videos.length === 0) {
        box.innerHTML = '<p class="text-sm opacity-60 col-span-full">Niets gevonden.</p>';
        return;
      }

      box.innerHTML = data.videos.map(function (video) {
        var mins = Math.floor(video.duration_seconds / 60);
        var secs = String(video.duration_seconds % 60).padStart(2, '0');
        // Een privévideo in een mail is een klassieke misser: de ontvanger
        // krijgt een thumbnail die hij niet kan afspelen.
        var warning = video.privacy && video.privacy !== 'anybody'
          ? '<span class="badge badge-warning badge-xs mt-1">niet openbaar</span>' : '';
        return '<button class="text-left group" data-action="mail-video-pick" data-mail-video="' + esc(video.id) + '">' +
          '<img src="' + esc(video.thumbnail_url) + '" alt="" class="rounded w-full aspect-video object-cover group-hover:ring-2 ring-primary">' +
          '<div class="text-xs mt-1 line-clamp-2">' + esc(video.title) + '</div>' +
          '<div class="text-xs opacity-50">' + mins + ':' + secs + '</div>' + warning + '</button>';
      }).join('');
    } catch (error) {
      box.innerHTML = '<p class="text-sm text-error col-span-full">' + esc(error.message) + '</p>';
    }
  }

  async function setVideo(payload) {
    try {
      var data = await api('/events/' + state.eventId + '/video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!data) return;
      state.event = data.event;
      toast(data.video ? 'Opname ingesteld: ' + data.video.title : 'Opname gewist', 'success');
      el('mailVideoPicker').close();
      schedulePreview();
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  // ─── Bewaren en klaarzetten ────────────────────────────────────────────────

  async function save() {
    if (!state.scopeEvent && !state.eventTypeId) {
      toast('Dit event heeft nog geen event-type. Kies er eerst een.', 'error');
      return;
    }
    var path = state.scopeEvent
      ? '/events/' + state.eventId + '/mail-blocks'
      : '/event-types/' + state.eventTypeId + '/mail-blocks';

    try {
      var saved = await api(path, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(activeDoc())
      });
      if (state.scopeEvent) state.eventDoc = saved; else state.typeDoc = saved;
      state.dirty = false;
      el('mailStudioDirty').textContent = '';
      toast('Bewaard', 'success');
      render();
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  async function send() {
    if (state.busy) return;
    if (state.dirty && !window.confirm('Er zijn niet-bewaarde wijzigingen. Toch versturen met wat er bewaard is?')) return;

    state.busy = true;
    el('mailSendBtn').classList.add('btn-disabled');
    try {
      var result = await api('/events/' + state.eventId + '/mails/' + state.kind + '/send', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({})
      });
      if (result) {
        var queued = result.queued ? result.queued.length : 0;
        var skipped = result.skipped ? result.skipped.length : 0;
        toast(result.message || (queued + ' mail(s) klaargezet' + (skipped ? ', ' + skipped + ' overgeslagen' : '')),
          queued > 0 ? 'success' : 'info');
      }
    } catch (error) {
      toast(error.message, 'error');
    } finally {
      state.busy = false;
      el('mailSendBtn').classList.remove('btn-disabled');
    }
  }

  // ─── Eén centrale listener, geen inline handlers ───────────────────────────

  document.addEventListener('click', function (event) {
    var tab = event.target.closest('[data-mail-kind]');
    if (tab && el('mailStudioDialog').open) {
      state.kind = tab.getAttribute('data-mail-kind');
      state.selectedId = null;
      render();
      return;
    }

    var trigger = event.target.closest('[data-action]');
    if (!trigger) return;
    var action = trigger.getAttribute('data-action');

    if (action === 'open-mail-studio') { open(trigger.getAttribute('data-event-id')); return; }
    if (!el('mailStudioDialog').open) return;

    switch (action) {
      case 'mail-studio-close': el('mailStudioDialog').close(); break;

      case 'mail-site':
        state.viewSite = trigger.getAttribute('data-mail-view') || '';
        state.selectedId = null;
        render();
        break;

      case 'mail-scope-toggle':
        if (state.dirty && !window.confirm('Je hebt niet-bewaarde wijzigingen. Wisselen zonder te bewaren?')) return;
        state.scopeEvent = !state.scopeEvent;
        state.selectedId = null;
        state.dirty = false;
        el('mailStudioDirty').textContent = '';
        renderStatus();
        render();
        break;

      case 'mail-add-open':
        state.addAt = 'end';
        el('mailBlockPicker').showModal();
        icons();
        break;

      case 'mail-add-close': el('mailBlockPicker').close(); break;

      case 'mail-add-pick': {
        var type = trigger.getAttribute('data-mail-add-type');
        var meta = BLOCK_META[type] || { sample: {} };
        var block = Object.assign({ id: type + '-' + Date.now(), type: type, sites: [] },
          JSON.parse(JSON.stringify(meta.sample)));
        // Bekijk je één site, dan hoort een nieuw onderdeel daar ook bij --
        // anders zie je het meteen weer verdwijnen zodra je van site wisselt.
        if (state.viewSite) block.sites = [state.viewSite];

        var blocks = section().blocks;
        if (state.addAt === 'end') blocks.push(block);
        else blocks.splice(Number(state.addAt), 0, block);

        state.selectedId = block.id;
        el('mailBlockPicker').close();
        markDirty();
        break;
      }

      case 'mail-settings-close': el('mailBlockSettings').close(); break;
      case 'mail-video-open': openVideoPicker(); break;
      case 'mail-video-close': el('mailVideoPicker').close(); break;
      case 'mail-video-search': loadVideos(el('mailVideoSearch').value); break;
      case 'mail-video-pick': setVideo({ vimeo_id: trigger.getAttribute('data-mail-video') }); break;
      case 'mail-video-url': setVideo({ video_url: el('mailVideoUrl').value }); break;
      case 'mail-video-clear': setVideo({ video_url: '' }); break;
      case 'mail-save': save(); break;
      case 'mail-send': send(); break;
      default: break;
    }
  });

  document.addEventListener('input', function (event) {
    if (!el('mailStudioDialog').open) return;
    var target = event.target;

    var field = target.getAttribute && target.getAttribute('data-mail-field');
    if (field) { section()[field] = target.value; markDirty(); return; }

    var setting = target.getAttribute && target.getAttribute('data-mail-setting');
    if (setting && state.selectedId) {
      var block = blockById(state.selectedId);
      if (!block) return;
      block[setting] = target.type === 'number' ? Number(target.value) : target.value;
      markDirty();
    }
  });

  document.addEventListener('change', function (event) {
    if (!el('mailStudioDialog').open) return;
    var target = event.target;

    if (target.hasAttribute && target.hasAttribute('data-mail-visibility') && state.selectedId) {
      var block = blockById(state.selectedId);
      if (!block) return;
      block.sites = target.value === 'all' ? [] : [target.value];
      markDirty();
      return;
    }

    var setting = target.getAttribute && target.getAttribute('data-mail-setting');
    if (setting && state.selectedId) {
      var settingBlock = blockById(state.selectedId);
      if (!settingBlock) return;
      settingBlock[setting] = target.type === 'number' ? Number(target.value) : target.value;
      markDirty();
    }
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Enter' && el('mailVideoPicker').open && event.target.id === 'mailVideoSearch') {
      event.preventDefault();
      loadVideos(el('mailVideoSearch').value);
    }
  });

  window.EventsMailStudio = { open: open };
})();
