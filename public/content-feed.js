/**
 * Content Feed — beheerscherm
 *
 * REGEL 3 uit CLAUDE.md: event handlers via data-attributen + één centrale
 * listener. Nooit een variabele in een inline handler.
 *
 * Odoo is de enige database; dit scherm praat uitsluitend met
 * /content-feed/api/*.
 */

(function () {
  'use strict';

  var state = {
    tab: 'published',
    items: [],
    types: [],
    tags: [],
    audiences: [],
    owners: [],
    bewerktId: null,
    // De beeld-URL uit een artikel-analyse. Die wordt pas bij het BEWAREN
    // opgehaald en in Odoo gezet -- anders betaal je de download van elk
    // artikel dat iemand toch niet plaatst.
    pendingImageUrl: null,
    zoek: '',
    typeId: '',
    tagId: ''
  };

  var STATUS_LABEL = {
    published: 'Gepubliceerd',
    concept: 'Concept',
    private: 'Privé'
  };

  var KLEUR_BADGE = {
    'default': 'badge-ghost',
    blue: 'badge-info',
    green: 'badge-success',
    yellow: 'badge-warning',
    red: 'badge-error'
  };

  // ── Helpers ────────────────────────────────────────────────────────────────

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function $(id) { return document.getElementById(id); }

  function toast(bericht, soort) {
    var host = $('toastHost');
    var el = document.createElement('div');
    el.className = 'alert ' + (soort === 'error' ? 'alert-error' : 'alert-success');
    el.innerHTML = '<span>' + esc(bericht) + '</span>';
    host.appendChild(el);
    setTimeout(function () { el.remove(); }, 4000);
  }

  function icons() {
    if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();
  }

  /** Elke fetch met credentials; bij 401 terug naar de loginpagina. */
  async function api(pad, opties) {
    var res = await fetch('/content-feed' + pad, Object.assign({
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' }
    }, opties || {}));

    if (res.status === 401) {
      window.location.href = '/';
      throw new Error('Niet ingelogd');
    }
    var data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (!res.ok || (data && data.success === false)) {
      throw new Error((data && data.error) || ('Fout ' + res.status));
    }
    return data;
  }

  function datumNL(iso) {
    if (!iso) return null;
    var d = new Date(iso + 'T00:00:00');
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('nl-BE', { day: 'numeric', month: 'long', year: 'numeric' });
  }

  // ── Renderen ───────────────────────────────────────────────────────────────

  function zichtbareItems() {
    return state.items.filter(function (item) {
      if (state.tab === 'archived') return !item.active;
      if (!item.active) return false;
      return item.status === state.tab;
    });
  }

  /**
   * De waarschuwingsbalk. Toont alleen wat een mens moet rechtzetten:
   * gepubliceerde berichten zonder datum belanden op een onvoorspelbare plek
   * in de tijdlijn, want de datum is de enige sorteersleutel.
   */
  function renderWaarschuwing() {
    var zonderDatum = state.items.filter(function (i) {
      return i.active && i.status === 'published' && !i.publishedOn;
    });
    var balk = $('dataWarning');
    if (zonderDatum.length === 0) {
      balk.classList.add('hidden');
      return;
    }
    $('dataWarningText').textContent =
      zonderDatum.length + ' gepubliceerd(e) bericht(en) hebben geen publicatiedatum. '
      + 'Ze staan daardoor op een onvoorspelbare plek in de tijdlijn — vul de datum aan.';
    balk.classList.remove('hidden');
  }

  function kaart(item) {
    var kop = item.summaryTitle || item.title || '(zonder titel)';
    var labels = item.tagIds.map(function (id) {
      var tag = state.tags.find(function (t) { return t.id === id; });
      return tag ? '<span class="badge badge-sm badge-outline">' + esc(tag.name) + '</span>' : '';
    }).join(' ');

    var datum = item.publishedOn
      ? '<span>' + esc(datumNL(item.publishedOn)) + '</span>'
      : '<span class="text-warning font-medium">geen datum</span>';

    // loading="lazy": de afbeelding komt als VOLLEDIG origineel uit Odoo
    // (een binary Studio-veld heeft geen verkleinde varianten), dus alles
    // tegelijk ophalen is tientallen megabytes. Zo laadt enkel wat in beeld
    // komt, en de cache in lib/image.js zorgt dat het maar één keer gebeurt.
    var beeld = item.hasImage
      ? '<img src="/content-feed/api/items/' + item.id + '/image?v='
        + encodeURIComponent(item.imageVersion || '0') + '" alt="" loading="lazy"'
        + ' decoding="async" class="w-20 h-20 object-cover rounded-lg shrink-0">'
      : '<div class="w-20 h-20 rounded-lg bg-base-200/60 shrink-0 flex items-center'
        + ' justify-center opacity-40"><i data-lucide="image-off" class="w-5 h-5"></i></div>';


    var doelgroep = '';
    if (item.audience) {
      var gevonden = state.audiences.find(function (a) { return a.value === item.audience; });
      doelgroep = '<span class="badge badge-sm badge-outline">'
        + esc(gevonden ? gevonden.label : item.audience) + '</span>';
    }

    var acties = item.active
      ? '<button class="btn btn-sm" data-action="edit-item" data-id="' + item.id + '">Bewerken</button>'
        + '<button class="btn btn-sm btn-ghost text-error" data-action="archive-item" data-id="'
        + item.id + '">Archiveren</button>'
      : '<button class="btn btn-sm" data-action="restore-item" data-id="' + item.id + '">Terughalen</button>';

    return ''
      + '<div class="card bg-base-100 shadow-sm">'
      +   '<div class="card-body p-4 flex-row gap-4 items-start">'
      +     beeld
      +     '<div class="flex-1 min-w-0">'
      +       '<div class="flex items-center gap-2 flex-wrap mb-1">'
      +         '<span class="badge badge-sm ' + (KLEUR_BADGE[item.color] || 'badge-ghost') + '">'
      +           esc(item.color) + '</span>'
      +         (item.type ? '<span class="badge badge-sm badge-outline">' + esc(item.type.name) + '</span>' : '')
      +         doelgroep
      +       '</div>'
      +       '<h3 class="font-semibold truncate" title="' + esc(kop) + '">' + esc(kop) + '</h3>'
      +       (item.curatorNote
        ? '<p class="text-sm italic opacity-80 line-clamp-1" title="'
          + esc(item.curatorNote) + '">' + esc(item.curatorNote) + '</p>'
        : '')
      +       '<p class="text-sm opacity-70 line-clamp-2">' + esc(item.summary || '') + '</p>'
      +       '<div class="flex items-center gap-3 text-xs opacity-60 mt-2 flex-wrap">'
      +         datum
      +         (item.source ? '<span>bron: ' + esc(item.source) + '</span>' : '')
      +         (labels ? '<span class="flex gap-1">' + labels + '</span>' : '')
      +       '</div>'
      +     '</div>'
      +     '<div class="flex flex-col gap-2 shrink-0">' + acties + '</div>'
      +   '</div>'
      + '</div>';
  }

  function render() {
    var lijst = zichtbareItems();
    $('loadingState').classList.add('hidden');
    $('emptyState').classList.toggle('hidden', lijst.length > 0);
    $('itemList').innerHTML = lijst.map(kaart).join('');
    renderWaarschuwing();
    icons();
  }

  // ── Laden ──────────────────────────────────────────────────────────────────

  async function laadTaxonomie() {
    var data = await api('/api/taxonomy');
    state.types = data.types || [];
    state.tags = data.tags || [];
    state.audiences = data.audiences || [];
    vulDoelgroepen();

    $('typeFilter').innerHTML = '<option value="">Alle types</option>'
      + state.types.map(function (t) {
        return '<option value="' + t.id + '">' + esc(t.name) + '</option>';
      }).join('');
    $('tagFilter').innerHTML = '<option value="">Alle labels</option>'
      + state.tags.map(function (t) {
        return '<option value="' + t.id + '">' + esc(t.name) + '</option>';
      }).join('');
    $('fType').innerHTML = '<option value="">—</option>'
      + state.types.map(function (t) {
        return '<option value="' + t.id + '">' + esc(t.name) + '</option>';
      }).join('');
    $('fTags').innerHTML = state.tags.map(function (t) {
      return '<label class="label cursor-pointer gap-2 py-0">'
        + '<input type="checkbox" class="checkbox checkbox-sm" data-tag-id="' + t.id + '">'
        + '<span class="label-text">' + esc(t.name) + '</span></label>';
    }).join('');
  }

  /**
   * De doelgroepen komen uit het Odoo-veld zelf. Bestaat dat veld nog niet,
   * dan is de lijst leeg en blijven beide keuzes VERBORGEN -- een leeg
   * keuzemenu is erger dan geen keuzemenu: het suggereert dat er iets stuk is.
   */
  function vulDoelgroepen() {
    var heeft = state.audiences.length > 0;
    var opties = '<option value="">— geen —</option>'
      + state.audiences.map(function (a) {
        return '<option value="' + esc(a.value) + '">' + esc(a.label) + '</option>';
      }).join('');

    $('fAudience').innerHTML = opties;
    $('fArticleAudience').innerHTML = opties;
    $('audienceWrap').classList.toggle('hidden', !heeft);
    $('articleAudienceWrap').classList.toggle('hidden', !heeft);
  }

  async function laadOwners() {
    try {
      var data = await api('/api/owners');
      state.owners = data.owners || [];
      $('fOwner').innerHTML = '<option value="">—</option>'
        + state.owners.map(function (o) {
          return '<option value="' + o.id + '">' + esc(o.name) + '</option>';
        }).join('');
    } catch (e) {
      // Geen verantwoordelijke kunnen kiezen is vervelend, maar mag het
      // scherm niet blokkeren.
      console.warn('gebruikers ophalen mislukt:', e.message);
    }
  }

  async function laadItems() {
    $('loadingState').classList.remove('hidden');
    var params = new URLSearchParams();
    params.set('include_archived', '1');
    params.set('limit', '100');
    if (state.zoek) params.set('search', state.zoek);
    if (state.typeId) params.set('type_id', state.typeId);
    if (state.tagId) params.set('tag_id', state.tagId);
    try {
      var data = await api('/api/items?' + params.toString());
      state.items = data.items || [];
      render();
    } catch (e) {
      $('loadingState').classList.add('hidden');
      toast(e.message, 'error');
    }
  }

  // ── Dialoog ────────────────────────────────────────────────────────────────

  function vulDialoog(item) {
    // Een VOORSTEL heeft geen id: dat wordt dus een POST, geen PUT.
    state.bewerktId = item && item.id ? item.id : null;
    // Open je een BESTAAND bericht, dan mag er geen beeld-URL van een vorige
    // analyse blijven hangen -- anders krijgt dat bericht het beeld van een
    // artikel dat je net niet bewaard hebt.
    if (state.bewerktId) state.pendingImageUrl = null;
    $('dialogTitle').textContent = item ? 'Bericht bewerken' : 'Nieuw bericht';
    // Ook de KLEUR terugzetten: de relevantiewaarschuwing zet dit vak op
    // alert-warning, en zonder reset zou een echte opslagfout daarna geel
    // tonen -- een fout die eruitziet als een tip.
    $('dialogError').classList.add('hidden');
    $('dialogError').classList.remove('alert-warning');
    $('dialogError').classList.add('alert-error');

    $('fTitle').value = (item && item.title) || '';
    $('fSummaryTitle').value = (item && item.summaryTitle) || '';
    $('fSummary').value = (item && item.summary) || '';
    $('fUrl').value = (item && item.url) || '';
    $('fCta').value = (item && item.cta) || '';
    $('fSource').value = (item && item.source) || '';
    $('fPublishedOn').value = (item && item.publishedOn) || '';
    $('fStatus').value = (item && item.status) || 'concept';
    $('fType').value = item && item.type ? String(item.type.id) : '';
    $('fColor').value = (item && item.color) || 'default';
    $('fOwner').value = item && item.owner ? String(item.owner.id) : '';
    $('fQuote').value = (item && item.quote) || '';
    $('fCuratorNote').value = (item && item.curatorNote) || '';
    $('fAudience').value = (item && item.audience) || '';

    var gekozen = (item && item.tagIds) || [];
    Array.prototype.forEach.call($('fTags').querySelectorAll('[data-tag-id]'), function (cb) {
      cb.checked = gekozen.indexOf(Number(cb.dataset.tagId)) !== -1;
    });

    // De afbeelding is (nog) niet vanuit de OM te uploaden: ze staat als
    // binair veld in Odoo. Zeg dat expliciet, in plaats van een lege plek
    // te tonen waar iemand een uploadknop verwacht.
    if (state.pendingImageUrl) {
      // Uit de analyse: nog niet in Odoo. Toon 'm rechtstreeks van de bron,
      // en zeg erbij dat hij pas bij het bewaren overgenomen wordt.
      $('fImage').innerHTML = '<div class="flex items-center gap-3">'
        + '<img src="' + esc(state.pendingImageUrl) + '" alt="" decoding="async"'
        + ' class="w-24 h-24 object-cover rounded-lg bg-base-200">'
        + '<span class="opacity-70">Uit het artikel. Wordt bij het bewaren '
        + 'overgenomen in Odoo. <button type="button" class="link link-error" '
        + 'data-action="drop-image">Niet gebruiken</button></span></div>';
    } else if (item && item.hasImage) {
      $('fImage').innerHTML = '<div class="flex items-center gap-3">'
        + '<img src="/content-feed/api/items/' + item.id + '/image?v='
        + encodeURIComponent(item.imageVersion || '0') + '" alt="" decoding="async"'
        + ' class="w-24 h-24 object-cover rounded-lg">'
        + '<span class="opacity-70">Staat in Odoo (veld “content image”). '
        + 'Wijzigen doe je voorlopig in Odoo.</span></div>';
    } else {
      $('fImage').innerHTML = '<span class="opacity-70">Geen afbeelding. Toevoegen doe je '
        + 'voorlopig in Odoo, in het veld “content image”.</span>';
    }

    $('itemDialog').showModal();
  }

  function leesDialoog() {
    var tagIds = [];
    Array.prototype.forEach.call($('fTags').querySelectorAll('[data-tag-id]'), function (cb) {
      if (cb.checked) tagIds.push(Number(cb.dataset.tagId));
    });
    return {
      title: $('fTitle').value.trim(),
      summaryTitle: $('fSummaryTitle').value.trim(),
      summary: $('fSummary').value.trim(),
      url: $('fUrl').value.trim(),
      cta: $('fCta').value.trim(),
      source: $('fSource').value.trim(),
      publishedOn: $('fPublishedOn').value || '',
      status: $('fStatus').value,
      typeId: $('fType').value ? Number($('fType').value) : 0,
      color: $('fColor').value,
      ownerId: $('fOwner').value ? Number($('fOwner').value) : 0,
      quote: $('fQuote').value.trim(),
      curatorNote: $('fCuratorNote').value.trim(),
      audience: $('fAudience').value,
      tagIds: tagIds,
      imageSourceUrl: state.pendingImageUrl || undefined
    };
  }

  // ── Artikel analyseren ─────────────────────────────────────────────────────

  /**
   * Het voorstel van de AI in het bewerkscherm zetten.
   *
   * Er wordt bewust NIET automatisch bewaard: een samenvatting die niemand
   * gelezen heeft, hoort niet rechtstreeks bij klanten terecht te komen.
   */
  function toonVoorstel(voorstel, artikel) {
    state.pendingImageUrl = voorstel.imageSourceUrl || null;
    vulDialoog({
      title: voorstel.title,
      summaryTitle: voorstel.summaryTitle,
      summary: voorstel.summary,
      curatorNote: voorstel.curatorNote,
      audience: voorstel.audience || '',
      quote: voorstel.quote,
      url: voorstel.url,
      cta: voorstel.cta,
      source: voorstel.source,
      publishedOn: voorstel.publishedOn,
      status: 'concept',
      color: voorstel.color,
      tagIds: voorstel.tagIds || [],
      // Type "Artikel" is wat deze weg per definitie oplevert.
      type: state.types.find(function (t) { return t.name === 'Artikel'; }) || null,
      owner: null,
      hasImage: false
    });
    $('dialogTitle').textContent = 'Voorstel uit het artikel';

    // Twee dingen die de redacteur MOET weten voor hij bewaart. Ze kunnen
    // samen voorkomen, dus ze worden verzameld en niet overschreven.
    var meldingen = [];
    if (voorstel.quoteRejected) {
      meldingen.push('Het voorgestelde citaat stond niet letterlijk in het '
        + 'artikel en is daarom weggelaten. Zet er eventueel zelf een zin in '
        + 'die je in de tekst terugvindt.');
    }
    if (voorstel.relevance === 'laag') {
      meldingen.push('Dit artikel lijkt weinig op te leveren voor de gekozen '
        + 'doelgroep. Kijk goed na of het hier thuishoort.');
    }
    if (meldingen.length) {
      $('dialogErrorText').textContent = meldingen.join(' ');
      $('dialogError').classList.remove('hidden');
      $('dialogError').classList.remove('alert-error');
      $('dialogError').classList.add('alert-warning');
    }
    icons();
  }

  async function analyseer() {
    var url = $('fArticleUrl').value.trim();
    if (!url) { $('fArticleUrl').focus(); return; }

    $('articleError').classList.add('hidden');
    $('articleBusy').classList.remove('hidden');
    $('articleBusyText').textContent = 'Het artikel wordt opgehaald…';

    // Na een paar seconden weet je dat het ophalen gelukt is en de AI bezig
    // is. Zonder dit staat er een halve minuut dezelfde zin.
    var fase = setTimeout(function () {
      $('articleBusyText').textContent = 'De AI leest het artikel…';
    }, 3000);

    try {
      var data = await api('/api/analyze', {
        method: 'POST',
        body: JSON.stringify({ url: url, audience: $('fArticleAudience').value })
      });
      clearTimeout(fase);
      $('articleBusy').classList.add('hidden');
      $('articleDialog').close();
      toonVoorstel(data.proposal, data.article);
    } catch (e) {
      clearTimeout(fase);
      $('articleBusy').classList.add('hidden');
      $('articleErrorText').textContent = e.message;
      $('articleError').classList.remove('hidden');
      icons();
    }
  }

  async function bewaar() {
    var payload = leesDialoog();
    try {
      if (state.bewerktId) {
        await api('/api/items/' + state.bewerktId, {
          method: 'PUT', body: JSON.stringify(payload)
        });
      } else {
        await api('/api/items', { method: 'POST', body: JSON.stringify(payload) });
      }
      $('itemDialog').close();
      state.pendingImageUrl = null;
      toast('Bewaard');
      await laadItems();
    } catch (e) {
      $('dialogErrorText').textContent = e.message;
      $('dialogError').classList.remove('hidden');
      icons();
    }
  }

  // ── Eén centrale listener (REGEL 3) ────────────────────────────────────────

  document.addEventListener('click', function (e) {
    var tab = e.target.closest('[data-feed-tab]');
    if (tab) {
      state.tab = tab.dataset.feedTab;
      Array.prototype.forEach.call(document.querySelectorAll('[data-feed-tab]'), function (el) {
        el.classList.toggle('tab-active', el === tab);
      });
      render();
      return;
    }

    var el = e.target.closest('[data-action]');
    if (!el) return;
    var actie = el.dataset.action;
    var id = el.dataset.id;

    if (actie === 'refresh') { laadItems(); return; }
    if (actie === 'close-dialog') { $('itemDialog').close(); return; }
    if (actie === 'save-item') { bewaar(); return; }

    // Stap 1: eerst kiezen WAT je toevoegt.
    if (actie === 'new-item') { $('typeDialog').showModal(); icons(); return; }
    if (actie === 'close-type') { $('typeDialog').close(); return; }
    if (actie === 'close-article') { $('articleDialog').close(); return; }
    if (actie === 'analyze-article') { analyseer(); return; }

    if (actie === 'choose-type') {
      $('typeDialog').close();
      if (el.dataset.type === 'article') {
        $('fArticleUrl').value = '';
        $('articleError').classList.add('hidden');
        $('articleBusy').classList.add('hidden');
        $('articleDialog').showModal();
        $('fArticleUrl').focus();
      } else {
        state.pendingImageUrl = null;
        vulDialoog(null);
      }
      icons();
      return;
    }

    if (actie === 'drop-image') {
      state.pendingImageUrl = null;
      $('fImage').innerHTML = '<span class="opacity-70">Geen afbeelding.</span>';
      return;
    }

    if (actie === 'edit-item') {
      var item = state.items.find(function (i) { return String(i.id) === String(id); });
      if (item) { vulDialoog(item); icons(); }
      return;
    }

    if (actie === 'archive-item') {
      // Archiveren, niet verwijderen -- zie setSnippetActive() in de service.
      if (!window.confirm('Dit bericht archiveren? Het verdwijnt van de site, maar blijft terug te halen.')) return;
      api('/api/items/' + id, { method: 'DELETE' })
        .then(function () { toast('Gearchiveerd'); return laadItems(); })
        .catch(function (err) { toast(err.message, 'error'); });
      return;
    }

    if (actie === 'restore-item') {
      api('/api/items/' + id + '/restore', { method: 'POST' })
        .then(function () { toast('Teruggehaald'); return laadItems(); })
        .catch(function (err) { toast(err.message, 'error'); });
    }
  });

  var zoekTimer = null;
  document.addEventListener('input', function (e) {
    var el = e.target.closest('[data-action-input="search"]');
    if (!el) return;
    clearTimeout(zoekTimer);
    zoekTimer = setTimeout(function () {
      state.zoek = el.value.trim();
      laadItems();
    }, 300);
  });

  document.addEventListener('change', function (e) {
    var el = e.target.closest('[data-action-change="filter"]');
    if (!el) return;
    state.typeId = $('typeFilter').value;
    state.tagId = $('tagFilter').value;
    laadItems();
  });

  // ── Start ──────────────────────────────────────────────────────────────────

  async function init() {
    try {
      var res = await fetch('/api/auth/me', { credentials: 'include' });
      if (res.status === 401) { window.location.href = '/'; return; }
      var data = await res.json();
      if (window.renderSharedNavbar) window.renderSharedNavbar(data.navbarHtml);
    } catch (e) {
      window.location.href = '/';
      return;
    }

    try {
      await laadTaxonomie();
    } catch (e) {
      toast('Types en labels konden niet geladen worden: ' + e.message, 'error');
    }
    await laadOwners();
    await laadItems();
    icons();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
