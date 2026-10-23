/* Claude voor sales -- pagina: adres van de connector, verbindingen, logboek. */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var state = { data: null };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function iconen() { if (window.lucide) window.lucide.createIcons(); }
  function toast(msg, soort) {
    var el = document.createElement('div');
    el.className = 'alert ' + (soort === 'error' ? 'alert-error' : 'alert-success') + ' text-sm shadow-lg';
    el.innerHTML = '<span>' + esc(msg) + '</span>';
    $('csToasts').appendChild(el);
    setTimeout(function () { el.remove(); }, 3200);
  }
  function wanneer(s) {
    if (!s) return '-';
    var d = new Date(s);
    return d.toLocaleString('nl-BE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Brussels' });
  }

  async function api(pad, opties) {
    opties = opties || {};
    var res = await fetch('/claude-sales/api' + pad, { method: opties.method || 'GET', credentials: 'include' });
    if (res.status === 401) { window.location.href = '/'; throw new Error('Niet aangemeld'); }
    var data = await res.json().catch(function () { return {}; });
    if (!res.ok || !data.success) throw new Error(data.error || 'Er ging iets mis.');
    return data.data;
  }

  var TOOLS = { zoek_gebouw: 'Gezocht', gebouw_dossier: 'Dossier bekeken', dossier_bijwerken: 'Bijgewerkt in Odoo' };

  function teken() {
    var d = state.data;
    $('csUrl').value = d.connector_url;
    $('csVerbTitel').textContent = d.is_admin ? 'Verbindingen (iedereen)' : 'Je verbindingen';
    $('csLogTitel').textContent = d.is_admin ? 'Wat er via Claude gebeurde (iedereen)' : 'Wat er via Claude gebeurde';

    if (!d.verbindingen.length) {
      $('csVerbindingen').innerHTML = 'Nog geen verbinding. Volg de stappen hierboven.';
    } else {
      $('csVerbindingen').innerHTML = '<table class="table table-sm"><thead><tr>'
        + (d.is_admin ? '<th>Wie</th>' : '') + '<th>Connector</th><th>Verbonden</th><th>Laatst gebruikt</th><th></th></tr></thead><tbody>'
        + d.verbindingen.map(function (v) {
          return '<tr>' + (d.is_admin ? '<td>' + esc(v.naam || '-') + '</td>' : '')
            + '<td>' + esc(v.client_name || 'Claude') + '</td>'
            + '<td>' + wanneer(v.created_at) + '</td><td>' + wanneer(v.last_used_at) + '</td>'
            + '<td class="text-right"><button class="btn btn-xs btn-ghost text-error" data-action="intrekken" data-id="' + esc(v.id) + '">Intrekken</button></td></tr>';
        }).join('') + '</tbody></table>';
    }

    if (!d.logboek.length) {
      $('csLogboek').innerHTML = 'Nog niets.';
    } else {
      $('csLogboek').innerHTML = '<table class="table table-sm"><thead><tr><th>Wanneer</th>' + (d.is_admin ? '<th>Wie</th>' : '')
        + '<th>Wat</th><th>Gebouw</th><th>Details</th></tr></thead><tbody>'
        + d.logboek.map(function (l) {
          var gebouw = l.gebouw_id
            ? '<a class="link" target="_blank" rel="noopener" href="' + esc(d.odoo) + '/web#id=' + l.gebouw_id + '&model=res.partner&view_type=form">' + esc(l.gebouw_id) + '</a>'
            : '-';
          var det = l.details && l.details.gelukt ? l.details.gelukt.join(', ') : '';
          if (l.details && l.details.mislukt && l.details.mislukt.length) det += ' | mislukt: ' + l.details.mislukt.join(', ');
          return '<tr><td class="whitespace-nowrap">' + wanneer(l.created_at) + '</td>' + (d.is_admin ? '<td>' + esc(l.user_name || '-') + '</td>' : '')
            + '<td>' + (l.ok ? '' : '<span class="badge badge-error badge-sm mr-1">fout</span>') + esc(TOOLS[l.tool] || l.tool) + '</td>'
            + '<td>' + gebouw + '</td>'
            + '<td class="text-xs text-base-content/70">' + esc(l.samenvatting || '') + (det ? '<div>' + esc(det) + '</div>' : '') + '</td></tr>';
        }).join('') + '</tbody></table>';
    }
    iconen();
  }

  async function laad() {
    try {
      state.data = await api('/info');
      teken();
    } catch (err) {
      $('csMelding').innerHTML = '<div class="alert alert-error text-sm mb-4">' + esc(err.message) + '</div>';
    }
  }

  document.addEventListener('click', async function (e) {
    var el = e.target.closest('[data-action]');
    if (!el) return;
    if (el.dataset.action === 'kopieer') {
      try { await navigator.clipboard.writeText($('csUrl').value); toast('Gekopieerd'); }
      catch (x) { $('csUrl').select(); }
    }
    if (el.dataset.action === 'intrekken') {
      el.disabled = true;
      try {
        await api('/verbindingen/' + encodeURIComponent(el.dataset.id), { method: 'DELETE' });
        toast('Verbinding ingetrokken');
        laad();
      } catch (err) { toast(err.message, 'error'); el.disabled = false; }
    }
  });

  (async function init() {
    try {
      var res = await fetch('/api/auth/me', { credentials: 'include' });
      if (res.status === 401) { window.location.href = '/'; return; }
      var me = await res.json();
      if (me.navbarHtml && window.renderSharedNavbar) window.renderSharedNavbar(me.navbarHtml);
    } catch (x) { /* de navbar is niet essentieel */ }
    iconen();
    laad();
  })();
})();
