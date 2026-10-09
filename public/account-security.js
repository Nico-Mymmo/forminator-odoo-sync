// Profiel -> Beveiliging: 2FA, herstelcodes, sessies en aanmeldingen van de
// ingelogde gebruiker. API: src/modules/profile/security-routes.js.

(function () {
  'use strict';

  var data = null;
  var pwDoel = null;        // 'setup' | 'codes'
  var setupChallenge = null;
  var getoondeCodes = [];

  function $(id) { return document.getElementById(id); }

  function esc(s) {
    var d = document.createElement('div');
    d.textContent = s == null ? '' : String(s);
    return d.innerHTML;
  }

  function datum(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('nl-BE', { dateStyle: 'medium', timeStyle: 'short' });
  }

  function geleden(iso) {
    if (!iso) return '—';
    var s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 90) return 'zonet';
    var m = Math.round(s / 60);
    if (m < 60) return m + ' min geleden';
    var u = Math.round(m / 60);
    if (u < 24) return u + ' uur geleden';
    var d = Math.round(u / 24);
    if (d < 14) return d + ' dag' + (d === 1 ? '' : 'en') + ' geleden';
    return datum(iso);
  }

  function toast(tekst, soort) {
    var c = $('toastContainer');
    var t = document.createElement('div');
    t.className = 'alert ' + (soort === 'error' ? 'alert-error' : soort === 'success' ? 'alert-success' : 'alert-info') + ' text-sm py-2 px-4';
    var span = document.createElement('span');
    span.textContent = tekst;
    t.appendChild(span);
    c.appendChild(t);
    setTimeout(function () { t.remove(); }, soort === 'error' ? 6000 : 3500);
  }

  async function api(url, opties) {
    var res = await fetch(url, Object.assign({ credentials: 'include' }, opties || {}));
    if (res.status === 401) {
      window.location.href = '/?next=' + encodeURIComponent('/profile/beveiliging');
      throw new Error('Niet ingelogd');
    }
    var json = null;
    try { json = await res.json(); } catch (e) { json = null; }
    return { ok: res.ok, status: res.status, data: json || {} };
  }

  function post(url, body) {
    return api(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
  }

  function bezig(form, aan) {
    var knop = form.querySelector('[data-knop]');
    if (!knop) return;
    if (aan) {
      knop.dataset.label = knop.dataset.label || knop.textContent;
      knop.disabled = true;
      knop.innerHTML = '<span class="loading loading-spinner loading-xs"></span>';
    } else {
      knop.disabled = false;
      if (knop.dataset.label) knop.textContent = knop.dataset.label;
    }
  }

  var TOON_KLEUR = { success: 'badge-success', error: 'badge-error', warning: 'badge-warning', neutral: 'badge-ghost' };

  // ---------- Tekenen ----------

  function tekenMfa(mfa) {
    var herstel = mfa.recovery_remaining;
    var herstelTekst = herstel + ' van 10 herstelcodes nog bruikbaar';
    var herstelKlasse = herstel <= 3 ? 'text-warning' : 'text-base-content/60';
    if (mfa.enabled) {
      return '<div class="card bg-base-100 border border-base-content/10 shadow-sm mb-6"><div class="card-body">'
        + '<div class="flex flex-wrap items-start justify-between gap-3">'
        + '<div>'
        + '<h2 class="card-title text-base">Tweestapsverificatie <span class="badge badge-success badge-sm">Aan</span></h2>'
        + '<p class="text-sm text-base-content/60 mt-1">Bij elke nieuwe aanmelding vraagt de OM een code van je authenticator-app. Ingesteld op ' + esc(datum(mfa.enabled_at)) + '.</p>'
        + '<p class="text-sm mt-2 ' + herstelKlasse + '">' + esc(herstelTekst) + (herstel <= 3 ? ' — maak nieuwe aan.' : '') + '</p>'
        + '</div>'
        + '<div class="flex flex-wrap gap-2">'
        + '<button class="btn btn-sm" data-action="ask-password" data-doel="codes">Nieuwe herstelcodes</button>'
        + '<button class="btn btn-sm" data-action="ask-password" data-doel="setup">Authenticator vervangen</button>'
        + '</div>'
        + '</div>'
        + '</div></div>';
    }
    return '<div class="card bg-base-100 border border-warning/40 shadow-sm mb-6"><div class="card-body">'
      + '<div class="flex flex-wrap items-start justify-between gap-3">'
      + '<div>'
      + '<h2 class="card-title text-base">Tweestapsverificatie <span class="badge badge-warning badge-sm">Uit</span></h2>'
      + '<p class="text-sm text-base-content/60 mt-1">Stel het nu in: met enkel een wachtwoord kan wie het raadt of onderschept meteen binnen.</p>'
      + '</div>'
      + '<button class="btn btn-primary btn-sm" data-action="ask-password" data-doel="setup">Instellen</button>'
      + '</div>'
      + '</div></div>';
  }

  function tekenSessies(sessies) {
    var anderen = sessies.filter(function (s) { return !s.current; }).length;
    var rijen = sessies.map(function (s) {
      var methode = s.mfa_method === 'recovery'
        ? '<span class="badge badge-warning badge-xs">herstelcode</span>'
        : s.mfa_method === 'totp'
          ? '<span class="badge badge-ghost badge-xs">2FA</span>'
          : '<span class="badge badge-error badge-xs">zonder 2FA</span>';
      return '<tr>'
        + '<td><div class="font-medium">' + esc(s.device) + (s.current ? ' <span class="badge badge-primary badge-xs">dit apparaat</span>' : '') + '</div>'
        + '<div class="text-xs text-base-content/50">' + esc([s.location, s.ip].filter(Boolean).join(' · ') || 'locatie onbekend') + '</div></td>'
        + '<td class="text-sm text-base-content/70 whitespace-nowrap">' + esc(datum(s.created_at)) + '<div>' + methode + '</div></td>'
        + '<td class="text-sm text-base-content/70 whitespace-nowrap">' + esc(geleden(s.last_activity_at)) + '</td>'
        + '<td class="text-right">' + (s.current ? '' : '<button class="btn btn-ghost btn-xs text-error" data-action="revoke-session" data-id="' + esc(s.id) + '">Uitloggen</button>') + '</td>'
        + '</tr>';
    }).join('');

    return '<div class="card bg-base-100 border border-base-content/10 shadow-sm mb-6"><div class="card-body">'
      + '<div class="flex flex-wrap items-center justify-between gap-3 mb-2">'
      + '<h2 class="card-title text-base">Waar je bent ingelogd</h2>'
      + (anderen > 0 ? '<button class="btn btn-sm btn-outline btn-error" data-action="revoke-others">Alle andere apparaten uitloggen</button>' : '')
      + '</div>'
      + '<p class="text-sm text-base-content/60 mb-3">Herken je een apparaat of plaats niet? Log het uit en wijzig je wachtwoord.</p>'
      + '<div class="overflow-x-auto"><table class="table table-sm">'
      + '<thead><tr><th>Apparaat</th><th>Ingelogd</th><th>Laatst actief</th><th></th></tr></thead>'
      + '<tbody>' + rijen + '</tbody></table></div>'
      + '</div></div>';
  }

  function tekenEvents(events) {
    if (!events.length) {
      return '<div class="card bg-base-100 border border-base-content/10 shadow-sm"><div class="card-body">'
        + '<h2 class="card-title text-base">Recente aanmeldingen</h2><p class="text-sm text-base-content/50">Nog niets gelogd.</p></div></div>';
    }
    var rijen = events.map(function (e) {
      return '<tr>'
        + '<td class="whitespace-nowrap text-sm text-base-content/70">' + esc(datum(e.created_at)) + '</td>'
        + '<td><span class="badge badge-sm ' + (TOON_KLEUR[e.tone] || 'badge-ghost') + '">' + esc(e.label) + '</span></td>'
        + '<td class="text-sm text-base-content/70">' + esc(e.device || '') + '<div class="text-xs text-base-content/50">' + esc([e.location, e.ip].filter(Boolean).join(' · ')) + '</div></td>'
        + '</tr>';
    }).join('');
    return '<div class="card bg-base-100 border border-base-content/10 shadow-sm"><div class="card-body">'
      + '<h2 class="card-title text-base">Recente aanmeldingen</h2>'
      + '<p class="text-sm text-base-content/60 mb-2">Een fout wachtwoord dat jij niet typte, betekent dat iemand het probeert: wijzig dan je wachtwoord.</p>'
      + '<div class="overflow-x-auto"><table class="table table-sm"><tbody>' + rijen + '</tbody></table></div>'
      + '</div></div>';
  }

  function teken() {
    $('inhoud').innerHTML = tekenMfa(data.mfa) + tekenSessies(data.sessions || []) + tekenEvents(data.events || []);
  }

  async function laad() {
    try {
      var res = await api('/profile/api/security');
      if (!res.ok || !res.data.success) throw new Error(res.data.error || 'Ophalen mislukt');
      data = res.data.data;
      teken();
    } catch (err) {
      if (err.message === 'Niet ingelogd') return;
      $('inhoud').innerHTML = '<div class="alert alert-error text-sm"><span>' + esc(err.message) + '</span></div>';
    }
  }

  // ---------- Wachtwoord opnieuw vragen ----------

  function vraagWachtwoord(doel) {
    pwDoel = doel;
    $('pwUitleg').textContent = doel === 'codes'
      ? 'Je krijgt tien nieuwe herstelcodes. De vorige werken daarna niet meer.'
      : 'Daarna scan je een nieuwe QR-code met je authenticator-app. Je andere sessies worden uitgelogd.';
    $('pwInput').value = '';
    $('pwFout').classList.add('hidden');
    $('pwDialog').showModal();
    setTimeout(function () { $('pwInput').focus(); }, 30);
  }

  $('pwForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var form = e.currentTarget;
    var pw = $('pwInput').value;
    if (!pw) return;
    bezig(form, true);
    var url = pwDoel === 'codes' ? '/profile/api/security/recovery-codes' : '/profile/api/security/mfa/setup';
    var res = await post(url, { password: pw });
    bezig(form, false);
    if (!res.ok || !res.data.success) {
      $('pwFout').textContent = res.data.error || 'Er ging iets mis.';
      $('pwFout').classList.remove('hidden');
      $('pwInput').value = '';
      $('pwInput').focus();
      return;
    }
    $('pwDialog').close();
    if (pwDoel === 'codes') {
      toonCodes(res.data.recovery_codes, null);
    } else {
      openSetup(res.data);
    }
  });

  // ---------- Authenticator koppelen ----------

  function openSetup(r) {
    setupChallenge = r.challenge;
    $('setupSecret').textContent = String(r.secret || '').replace(/(.{4})/g, '$1 ').trim();
    $('setupInput').value = '';
    $('setupFout').classList.add('hidden');
    var vak = $('qrVak');
    vak.innerHTML = '';
    if (typeof window.qrcode === 'function') {
      var qr = window.qrcode(0, 'M');
      qr.addData(r.otpauth);
      qr.make();
      vak.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
      var svg = vak.querySelector('svg');
      if (svg) { svg.setAttribute('width', '100%'); svg.setAttribute('height', '100%'); }
    } else {
      vak.innerHTML = '<p class="text-xs text-center text-neutral-500 p-2">QR-code kon niet geladen worden. Typ de sleutel hieronder in.</p>';
    }
    $('setupDialog').showModal();
    setTimeout(function () { $('setupInput').focus(); }, 30);
  }

  $('setupInput').addEventListener('input', function (e) {
    var w = e.target.value.replace(/\D/g, '').slice(0, 6);
    if (w !== e.target.value) e.target.value = w;
    if (/^\d{6}$/.test(w)) $('setupForm').requestSubmit();
  });

  $('setupForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var form = e.currentTarget;
    if (form.querySelector('[data-knop]').disabled) return;
    var code = $('setupInput').value.trim();
    if (!code) return;
    bezig(form, true);
    var res = await post('/profile/api/security/mfa/confirm', { challenge: setupChallenge, code: code });
    bezig(form, false);
    if (!res.ok || !res.data.success) {
      $('setupInput').value = '';
      if (res.data.restart) {
        $('setupDialog').close();
        toast(res.data.error || 'Begin opnieuw.', 'error');
        return;
      }
      $('setupFout').textContent = res.data.error || 'Die code klopt niet.';
      $('setupFout').classList.remove('hidden');
      $('setupInput').focus();
      return;
    }
    setupChallenge = null;
    $('setupDialog').close();
    var extra = res.data.sessions_revoked > 0
      ? 'Je authenticator is gekoppeld. ' + res.data.sessions_revoked + ' andere sessie' + (res.data.sessions_revoked === 1 ? ' werd' : 's werden') + ' uitgelogd.'
      : 'Je authenticator is gekoppeld.';
    toonCodes(res.data.recovery_codes, extra);
  });

  // ---------- Herstelcodes ----------

  function toonCodes(codes, extra) {
    getoondeCodes = (codes || []).slice();
    var lijst = $('herstelLijst');
    lijst.innerHTML = '';
    getoondeCodes.forEach(function (c) {
      var el = document.createElement('div');
      el.className = 'text-center py-1';
      el.textContent = c;
      lijst.appendChild(el);
    });
    if (extra) {
      $('codesExtra').textContent = extra;
      $('codesExtra').classList.remove('hidden');
    } else {
      $('codesExtra').classList.add('hidden');
    }
    $('codesDialog').showModal();
  }

  function codesAlsTekst() {
    return 'Herstelcodes mymmo Operations Manager\n'
      + (data && data.email ? 'Account: ' + data.email + '\n' : '')
      + 'Gemaakt op: ' + new Date().toLocaleString('nl-BE') + '\n'
      + 'Elke code werkt een keer.\n\n'
      + getoondeCodes.join('\n') + '\n';
  }

  // De codes mogen niet blijven hangen in de pagina na het sluiten.
  $('codesDialog').addEventListener('close', function () {
    getoondeCodes = [];
    $('herstelLijst').innerHTML = '';
    laad();
  });

  // ---------- Sessies ----------

  async function beeindigSessie(id) {
    if (!confirm('Dit apparaat uitloggen?')) return;
    var res = await api('/profile/api/security/sessions/' + encodeURIComponent(id), { method: 'DELETE' });
    if (!res.ok || !res.data.success) {
      toast(res.data.error || 'Uitloggen mislukt.', 'error');
      return;
    }
    toast('Apparaat uitgelogd.', 'success');
    laad();
  }

  async function beeindigAndere() {
    if (!confirm('Alle andere apparaten uitloggen? Dit apparaat blijft ingelogd.')) return;
    var res = await post('/profile/api/security/sessions/revoke-others', {});
    if (!res.ok || !res.data.success) {
      toast(res.data.error || 'Uitloggen mislukt.', 'error');
      return;
    }
    toast(res.data.count + ' sessie' + (res.data.count === 1 ? '' : 's') + ' uitgelogd.', 'success');
    laad();
  }

  // ---------- Centrale listener ----------

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    if (!el) return;
    var action = el.getAttribute('data-action');
    if (action === 'ask-password') {
      vraagWachtwoord(el.getAttribute('data-doel'));
    } else if (action === 'close-dialog') {
      var d = $(el.getAttribute('data-dialog'));
      if (d) d.close();
    } else if (action === 'copy-secret') {
      navigator.clipboard.writeText($('setupSecret').textContent.replace(/\s/g, '')).then(function () { toast('Sleutel gekopieerd.'); });
    } else if (action === 'copy-codes') {
      navigator.clipboard.writeText(codesAlsTekst()).then(function () { toast('Herstelcodes gekopieerd.'); });
    } else if (action === 'download-codes') {
      var blob = new Blob([codesAlsTekst()], { type: 'text/plain;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'herstelcodes-operations-manager.txt';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    } else if (action === 'close-codes') {
      $('codesDialog').close();
    } else if (action === 'revoke-session') {
      beeindigSessie(el.getAttribute('data-id'));
    } else if (action === 'revoke-others') {
      beeindigAndere();
    }
  });

  // ---------- Start ----------

  (async function init() {
    try {
      var me = await api('/api/auth/me');
      if (me.data && window.renderSharedNavbar) window.renderSharedNavbar(me.data.navbarHtml);
    } catch (e) { /* 401 stuurt al door */ }
    laad();
  })();
})();
