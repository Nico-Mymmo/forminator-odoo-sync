/**
 * Afspraaklinks — beheerscherm.
 *
 * REGEL 3 uit CLAUDE.md: event handlers via data-attributen + één centrale
 * listener. Praat uitsluitend met /afspraaklinks/api/*.
 */

(function () {
  'use strict';

  var BASE = '/afspraaklinks/api';

  var state = {
    boot: null,
    tab: 'mine',
    links: [],
    eventTypes: null,
    odooUsers: null,
    bewerkt: null,
    slugZelfGetypt: false
  };

  // ── Helpers ────────────────────────────────────────────────────────────────

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function $(id) { return document.getElementById(id); }

  function toast(bericht, soort) {
    var el = document.createElement('div');
    el.className = 'alert ' + (soort === 'error' ? 'alert-error' : 'alert-success') + ' text-sm';
    el.textContent = bericht;
    $('toastHost').appendChild(el);
    setTimeout(function () { el.remove(); }, 3500);
  }

  async function api(pad, opties) {
    var res = await fetch(BASE + pad, Object.assign({
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' }
    }, opties || {}));
    if (res.status === 401) { window.location.href = '/'; throw new Error('Niet aangemeld'); }
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok || data.success === false) throw new Error(data.error || ('Fout ' + res.status));
    return data;
  }

  function slugify(tekst) {
    return String(tekst || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  }

  function voornaam(naam) {
    return String(naam || '').trim().split(/\s+/)[0] || '';
  }

  function refreshIcons() {
    if (window.lucide) window.lucide.createIcons();
  }

  // ── Lijst ──────────────────────────────────────────────────────────────────

  async function laadLinks() {
    var data = await api('/links' + (state.tab === 'all' ? '?all=1' : ''));
    state.links = data.data || [];
    renderLijst();
  }

  function renderLijst() {
    var host = $('linkList');
    if (!state.links.length) {
      host.innerHTML = '<div class="card bg-base-100"><div class="card-body items-center text-center">' +
        '<i data-lucide="calendar-plus" class="w-8 h-8 opacity-40"></i>' +
        '<p class="opacity-70">Nog geen afspraaklinks. Maak er een aan met een van je afspraaktypes uit Calendly.</p>' +
        '</div></div>';
      refreshIcons();
      return;
    }

    host.innerHTML = state.links.map(function (l) {
      // Twee verschillende dingen: de SOORT (grijs, waarmee een mail de link
      // vraagt) en de TERUGVALLINK (het vinkje). Allebei "standaard" noemen
      // las als hetzelfde, dus de soort krijgt haar naam erbij.
      var badges = '<span class="badge badge-sm badge-ghost" title="Waarmee een mail deze link vraagt">soort: ' + esc(l.kind) + '</span>';
      if (l.is_default) badges += ' <span class="badge badge-sm badge-primary" title="Gebruikt als een mail een soort vraagt die deze persoon niet heeft">terugvallink</span>';
      if (!l.is_active) badges += ' <span class="badge badge-sm badge-warning">gepauzeerd</span>';
      var eigenaar = state.tab === 'all' ? '<div class="text-xs opacity-60">' + esc(l.odoo_user_name) + '</div>' : '';
      var adressen = l.public_urls || [];

      return '<div class="card bg-base-100' + (l.is_active ? '' : ' opacity-70') + '">' +
        '<div class="card-body p-4 gap-2">' +
          '<div class="flex flex-wrap items-start justify-between gap-2">' +
            '<div class="min-w-0">' +
              eigenaar +
              '<div class="font-semibold">' + esc(l.label || l.calendly_event_type_name || l.slug) + ' ' + badges + '</div>' +
              '<div class="text-xs opacity-60 truncate">Calendly: ' + esc(l.calendly_event_type_name || l.scheduling_url) +
                (l.duration ? ' · ' + esc(l.duration) + ' min' : '') + '</div>' +
            '</div>' +
            '<div class="flex gap-1">' +
              '<button class="btn btn-xs" data-action="edit-link" data-id="' + esc(l.id) + '" title="Bewerken"><i data-lucide="pencil" class="w-3 h-3"></i></button>' +
              '<button class="btn btn-xs btn-ghost text-error" data-action="delete-link" data-id="' + esc(l.id) + '" title="Verwijderen"><i data-lucide="trash-2" class="w-3 h-3"></i></button>' +
            '</div>' +
          '</div>' +
          // Eén link werkt op elke site: per site een adres om te kopiëren.
          (adressen.length
            ? adressen.map(function (a) {
                return '<div class="join w-full">' +
                  '<input class="input input-bordered input-sm join-item w-full font-mono text-xs" readonly value="' + esc(a.url) + '">' +
                  (a.in_mail ? '<span class="btn btn-sm join-item no-animation pointer-events-none">in mails</span>' : '') +
                  '<button class="btn btn-sm join-item" data-action="copy-link" data-url="' + esc(a.url) + '"><i data-lucide="copy" class="w-4 h-4"></i> Kopiëren</button>' +
                  '<a class="btn btn-sm join-item" href="' + esc(a.url) + '" target="_blank" rel="noopener"><i data-lucide="external-link" class="w-4 h-4"></i></a>' +
                '</div>';
              }).join('')
            : '<div class="text-xs text-warning">Geen website ingesteld (BOOKING_LINK_SITES / FORMS_PUBLIC_ORIGINS).</div>') +
        '</div></div>';
    }).join('');
    refreshIcons();
  }

  // ── Dialoog ────────────────────────────────────────────────────────────────

  async function laadEventTypes(ververs) {
    if (state.eventTypes && !ververs) return state.eventTypes;
    var data = await api('/event-types' + (ververs ? '?refresh=1' : ''));
    state.eventTypes = data.data || [];
    return state.eventTypes;
  }

  function eigenaarNaam() {
    if (state.boot.is_admin && !$('ownerRow').classList.contains('hidden')) {
      var sel = $('fOwner');
      var opt = sel.options[sel.selectedIndex];
      if (opt && opt.value) return opt.textContent;
    }
    if (state.bewerkt) return state.bewerkt.odoo_user_name || '';
    return (state.boot.me && state.boot.me.name) || '';
  }

  /**
   * De eigen afspraaktypes bovenaan: waar de naam van de eigenaar in de
   * eigenaar of de hosts voorkomt. Calendly en Odoo delen geen id, dus dit is
   * een GESCHIKTE volgorde en geen filter -- alles blijft kiesbaar.
   */
  function renderEventTypes(gekozenUrl) {
    var naam = eigenaarNaam().toLowerCase();
    var vn = voornaam(naam);
    var types = state.eventTypes || [];
    var van = function (t) {
      var namen = [t.owner_name].concat(t.hosts || []).map(function (n) { return String(n || '').toLowerCase(); });
      return namen.some(function (n) { return n && (n === naam || (vn && n.split(/\s+/)[0] === vn)); });
    };
    var eigen = types.filter(van);
    var rest = types.filter(function (t) { return !van(t); });

    var optie = function (t) {
      var extra = [t.duration ? t.duration + ' min' : '', t.active ? '' : 'uit'].filter(Boolean).join(', ');
      return '<option value="' + esc(t.scheduling_url) + '"' + (t.scheduling_url === gekozenUrl ? ' selected' : '') + '>' +
        esc(t.name) + (t.owner_name ? ' — ' + esc(t.owner_name) : '') + (extra ? ' (' + esc(extra) + ')' : '') + '</option>';
    };

    var html = '<option value="">Kies een afspraaktype…</option>';
    if (eigen.length) html += '<optgroup label="Van ' + esc(eigenaarNaam() || 'jou') + '">' + eigen.map(optie).join('') + '</optgroup>';
    if (rest.length) html += '<optgroup label="Alle andere">' + rest.map(optie).join('') + '</optgroup>';
    if (gekozenUrl && !types.some(function (t) { return t.scheduling_url === gekozenUrl; })) {
      html += '<option value="' + esc(gekozenUrl) + '" selected>' + esc(gekozenUrl) + ' (niet meer in Calendly gevonden)</option>';
    }
    $('fEventType').innerHTML = html;
    toonEventTypeInfo();
  }

  function gekozenType() {
    var url = $('fEventType').value;
    return (state.eventTypes || []).find(function (t) { return t.scheduling_url === url; }) || null;
  }

  function toonEventTypeInfo() {
    var t = gekozenType();
    // Wat er in de zijkolom komt als de subtekst leeg blijft -- laat het zien,
    // anders weet niemand dat leeg laten iets doet.
    var hint = $('introHint');
    if (hint) {
      hint.textContent = t && t.description
        ? 'Leeg = uit Calendly: "' + (t.description.length > 140 ? t.description.slice(0, 140) + '…' : t.description) + '"'
        : 'Leeg = de tekst van de website (dit afspraaktype heeft geen omschrijving in Calendly)';
    }
    var info = '';
    if (t) {
      info = t.scheduling_url;
      if (t.pooling_type) info += ' · ' + (t.pooling_type === 'round_robin' ? 'round robin' : t.pooling_type);
      if (!t.active) info += ' · staat UIT in Calendly';
    }
    $('eventTypeInfo').textContent = info;
  }

  function stelSlugVoor() {
    if (state.slugZelfGetypt) return;
    $('fSlug').value = slugify(voornaam(eigenaarNaam()) + '-' + ($('fKind').value || 'afspraak'));
    toonSlugPreview();
  }

  function toonSlugPreview() {
    var sites = state.boot.sites || [];
    var site = sites.find(function (s) { return s.key === $('fSite').value; }) || sites[0];
    var slug = $('fSlug').value;
    $('slugPreview').textContent = site && slug ? site.origin + '/?afspraak=' + slug : '';
  }

  async function openDialog(link) {
    state.bewerkt = link || null;
    state.slugZelfGetypt = Boolean(link);
    $('dialogTitle').textContent = link ? 'Afspraaklink bewerken' : 'Nieuwe afspraaklink';
    $('dialogError').classList.add('hidden');

    var sites = state.boot.sites || [];
    $('fSite').innerHTML = sites.map(function (s) {
      return '<option value="' + esc(s.key) + '">' + esc(s.origin.replace(/^https:\/\//, '')) + '</option>';
    }).join('');
    $('siteRow').classList.toggle('hidden', sites.length < 2);

    $('fKind').value = link ? link.kind : 'standaard';
    $('fSlug').value = link ? link.slug : '';
    $('fLabel').value = link ? (link.label || '') : '';
    $('fTabTitle').value = link ? (link.tab_title || '') : '';
    $('fIntro').value = link ? (link.intro || '') : '';
    $('fPoints').value = link && Array.isArray(link.points) ? link.points.join('\n') : '';
    $('fShowPhoto').checked = link ? link.show_photo !== false : true;
    $('fSite').value = link ? (link.site || (sites[0] && sites[0].key) || '') : ((sites[0] && sites[0].key) || '');
    $('fDefault').checked = link ? link.is_default : !state.links.some(function (l) { return l.is_default; });
    $('fActive').checked = link ? link.is_active : true;

    // Admin maakt ook voor anderen aan; een bestaande link verhuist niet.
    var toonEigenaar = state.boot.is_admin && !link;
    $('ownerRow').classList.toggle('hidden', !toonEigenaar);
    if (toonEigenaar) {
      if (!state.odooUsers) state.odooUsers = (await api('/odoo-users')).data || [];
      var mijnId = state.boot.me && state.boot.me.id;
      $('fOwner').innerHTML = state.odooUsers.map(function (u) {
        return '<option value="' + u.id + '"' + (u.id === mijnId ? ' selected' : '') + '>' + esc(u.name) + '</option>';
      }).join('');
    }

    $('fEventType').innerHTML = '<option>Afspraaktypes ophalen…</option>';
    $('linkDialog').showModal();
    try {
      await laadEventTypes(false);
      renderEventTypes(link ? link.scheduling_url : '');
    } catch (err) {
      $('fEventType').innerHTML = '<option value="">Kon Calendly niet bevragen</option>';
      toonFout(err.message);
    }
    if (!link) stelSlugVoor();
    toonSlugPreview();
  }

  function toonFout(bericht) {
    var el = $('dialogError');
    el.textContent = bericht;
    el.classList.remove('hidden');
  }

  async function bewaar() {
    var t = gekozenType();
    var url = $('fEventType').value;
    var body = {
      kind: $('fKind').value.trim() || 'standaard',
      slug: $('fSlug').value.trim(),
      label: $('fLabel').value.trim(),
      tab_title: $('fTabTitle').value.trim(),
      intro: $('fIntro').value.trim(),
      points: $('fPoints').value,
      show_photo: $('fShowPhoto').checked,
      site: $('fSite').value,
      is_default: $('fDefault').checked,
      is_active: $('fActive').checked,
      scheduling_url: url
    };
    if (t) {
      body.calendly_event_type_uri = t.uri;
      body.calendly_event_type_name = t.name;
      body.duration = Number.isInteger(t.duration) ? t.duration : null;
      // Een kopie bij het bewaren, zoals de boekingspagina: de website mag
      // niet afhangen van een live aanroep naar Calendly.
      body.calendly_description = t.description || '';
    }
    if (!state.bewerkt && state.boot.is_admin && !$('ownerRow').classList.contains('hidden')) {
      body.odoo_user_id = Number($('fOwner').value);
    }

    $('saveBtn').disabled = true;
    try {
      if (state.bewerkt) {
        await api('/links/' + encodeURIComponent(state.bewerkt.id), { method: 'PUT', body: JSON.stringify(body) });
      } else {
        await api('/links', { method: 'POST', body: JSON.stringify(body) });
      }
      $('linkDialog').close();
      toast('Afspraaklink bewaard');
      await laadLinks();
    } catch (err) {
      toonFout(err.message);
    } finally {
      $('saveBtn').disabled = false;
    }
  }

  async function verwijder(id) {
    var l = state.links.find(function (x) { return x.id === id; });
    if (!l) return;
    if (!window.confirm('Afspraaklink "' + (l.label || l.slug) + '" verwijderen?\n\nLinks die al verstuurd zijn, openen daarna de algemene agenda. Wil je hem tijdelijk uitzetten, vink dan "Actief" uit.')) return;
    try {
      await api('/links/' + encodeURIComponent(id), { method: 'DELETE' });
      toast('Afspraaklink verwijderd');
      await laadLinks();
    } catch (err) {
      toast(err.message, 'error');
    }
  }

  // ── Events ─────────────────────────────────────────────────────────────────

  document.addEventListener('click', function (e) {
    var tab = e.target.closest('[data-links-tab]');
    if (tab) {
      document.querySelectorAll('[data-links-tab]').forEach(function (b) { b.classList.toggle('tab-active', b === tab); });
      state.tab = tab.dataset.linksTab;
      laadLinks().catch(function (err) { toast(err.message, 'error'); });
      return;
    }

    var el = e.target.closest('[data-action]');
    if (!el) return;
    var action = el.dataset.action;

    if (action === 'new-link') openDialog(null);
    else if (action === 'edit-link') openDialog(state.links.find(function (l) { return l.id === el.dataset.id; }));
    else if (action === 'delete-link') verwijder(el.dataset.id);
    else if (action === 'close-dialog') $('linkDialog').close();
    else if (action === 'save-link') bewaar();
    else if (action === 'refresh-event-types') {
      var huidige = $('fEventType').value;
      laadEventTypes(true).then(function () { renderEventTypes(huidige); })
        .catch(function (err) { toonFout(err.message); });
    } else if (action === 'copy-link') {
      navigator.clipboard.writeText(el.dataset.url)
        .then(function () { toast('Link gekopieerd'); })
        .catch(function () { toast('Kopiëren lukte niet', 'error'); });
    }
  });

  document.addEventListener('input', function (e) {
    var el = e.target.closest('[data-action-input]');
    if (!el) return;
    if (el.dataset.actionInput === 'kind') stelSlugVoor();
    if (el.dataset.actionInput === 'slug') { state.slugZelfGetypt = true; toonSlugPreview(); }
  });

  document.addEventListener('change', function (e) {
    if (e.target.id === 'fEventType') toonEventTypeInfo();
    if (e.target.id === 'fSite') toonSlugPreview();
    if (e.target.id === 'fOwner') {
      renderEventTypes($('fEventType').value);
      stelSlugVoor();
    }
  });

  // ── Start ──────────────────────────────────────────────────────────────────

  async function init() {
    try {
      var res = await fetch('/api/auth/me', { credentials: 'include' });
      if (res.status === 401) { window.location.href = '/'; return; }
      var me = await res.json();
      if (window.renderSharedNavbar) window.renderSharedNavbar(me.navbarHtml);
    } catch (_) { /* navbar is niet kritisch */ }

    try {
      state.boot = (await api('/bootstrap')).data;
      $('tabBar').classList.toggle('hidden', !state.boot.is_admin);
      $('generalUrl').textContent = state.boot.general_url || '(geen site ingesteld)';

      var waarschuwing = [];
      if (!state.boot.me) waarschuwing.push('Er is geen Odoo-gebruiker gevonden voor jouw e-mailadres, dus een koppeling kan jouw links niet vinden. Vraag een beheerder om je Odoo-gebruiker te koppelen.');
      if (!state.boot.calendly_configured) waarschuwing.push('De Calendly-koppeling is niet ingesteld (CALENDLY_ACCESS_TOKEN).');
      if (!(state.boot.sites || []).length) waarschuwing.push('Er is geen website ingesteld waarop de links kunnen openen.');
      if (waarschuwing.length) {
        $('setupWarningText').textContent = waarschuwing.join(' ');
        $('setupWarning').classList.remove('hidden');
      }
      await laadLinks();
      await openUitUrl();
    } catch (err) {
      toast(err.message, 'error');
    }
    refreshIcons();
  }

  /**
   * /afspraaklinks?link=<id> opent die link meteen in de bewerkdialoog -- de
   * Calendly-kaart van een koppeling linkt hierheen, want daar kan je een link
   * wel aanmaken maar niet bewerken. Een link van iemand anders staat niet in
   * "mijn links"; een admin krijgt hem dan uit de volledige lijst.
   */
  async function openUitUrl() {
    var id = new URLSearchParams(window.location.search).get('link');
    if (!id) return;
    var link = state.links.find(function (l) { return l.id === id; });
    if (!link && state.boot.is_admin) {
      link = ((await api('/links?all=1')).data || []).find(function (l) { return l.id === id; });
    }
    if (link) await openDialog(link);
    else toast('Die afspraaklink is niet gevonden, of je mag ze niet bewerken.', 'error');
  }

  init();
}());
