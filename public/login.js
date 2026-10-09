// Inloggen in stappen: wachtwoord -> 2FA (of 2FA instellen) -> herstelcodes
// bewaren -> eventueel een eigen wachtwoord kiezen.
//
// De server zegt bij elk antwoord welke stap volgt (`step`), zie
// src/api/auth-login.js. Het challenge-token van een lopende aanmelding staat
// ENKEL in deze variabele, nooit in localStorage of een cookie: herlaad je de
// pagina, dan begin je opnieuw.

(function () {
  'use strict';

  var state = {
    challenge: null,
    email: '',
    recoveryMode: false,
    codes: [],
    naCodes: null,   // wat er gebeurt na "Verder" bij de herstelcodes
    recoveryRemaining: null
  };

  var TITELS = {
    credentials: ['Inloggen', 'OpenVME Operations Manager'],
    mfa_verify: ['Tweestapsverificatie', 'Nog een stap'],
    mfa_enroll: ['Stel tweestapsverificatie in', 'Verplicht voor elk account'],
    recovery_codes: ['Bewaar je herstelcodes', 'Je hebt ze nodig als je je telefoon kwijt bent'],
    password_change: ['Kies een eigen wachtwoord', 'Laatste stap'],
    recovery_low: ['Bijna geen herstelcodes meer', '']
  };

  function $(id) { return document.getElementById(id); }

  function toonStap(naam) {
    document.querySelectorAll('[data-stap]').forEach(function (s) {
      s.classList.toggle('hidden', s.getAttribute('data-stap') !== naam);
    });
    var t = TITELS[naam] || TITELS.credentials;
    $('stapTitel').textContent = t[0];
    $('stapOndertitel').textContent = t[1];
    verbergMelding();
    var veld = { credentials: 'emailInput', mfa_verify: 'verifyInput', mfa_enroll: 'enrollInput', password_change: 'newPasswordInput' }[naam];
    if (veld) setTimeout(function () { var el = $(veld); if (el && !el.value) el.focus(); }, 30);
  }

  function toonMelding(tekst, soort) {
    var box = $('melding');
    box.className = 'alert text-sm py-2 px-3 mb-3 ' + (soort === 'info' ? 'alert-info' : soort === 'warning' ? 'alert-warning' : 'alert-error');
    $('meldingTekst').textContent = tekst;
  }

  function verbergMelding() {
    $('melding').classList.add('hidden');
  }

  function bezig(form, aan) {
    var knop = form.querySelector('[data-knop]');
    if (!knop) return;
    if (aan) {
      knop.dataset.label = knop.dataset.label || knop.textContent;
      knop.disabled = true;
      knop.innerHTML = '<span class="loading loading-spinner loading-xs"></span> Bezig…';
    } else {
      knop.disabled = false;
      if (knop.dataset.label) knop.textContent = knop.dataset.label;
    }
  }

  function veiligNext() {
    var next = new URLSearchParams(window.location.search).get('next') || '';
    var ok = next.charAt(0) === '/' && next.charAt(1) !== '/' && next.charAt(1) !== '\\' && !/[\r\n]/.test(next);
    return ok ? next : '/';
  }

  function klaar() {
    window.location.href = veiligNext();
  }

  async function post(url, body) {
    var res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body)
      });
    } catch (e) {
      return { ok: false, status: 0, data: { error: 'Verbindingsfout. Probeer het opnieuw.' } };
    }
    var data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    return { ok: res.ok, status: res.status, data: data || { error: 'Er ging iets mis. Probeer het opnieuw.' } };
  }

  function opnieuwBeginnen(boodschap) {
    state.challenge = null;
    state.recoveryMode = false;
    zetHerstelModus(false);
    $('verifyInput').value = '';
    $('enrollInput').value = '';
    $('passwordInput').value = '';
    toonStap('credentials');
    if (boodschap) toonMelding(boodschap);
  }

  // Verwerk een geslaagd antwoord van de server.
  function volgendeStap(data) {
    if (data.challenge) state.challenge = data.challenge;

    if (data.step === 'mfa_verify') {
      toonStap('mfa_verify');
      return;
    }
    if (data.step === 'mfa_enroll') {
      tekenEnroll(data.enroll || {});
      toonStap('mfa_enroll');
      return;
    }

    var naCodes;
    if (data.step === 'password_change') {
      naCodes = function () { $('pwUsername').value = state.email; toonStap('password_change'); };
    } else {
      state.challenge = null;
      if (typeof data.recovery_remaining === 'number') {
        state.recoveryRemaining = data.recovery_remaining;
        naCodes = function () {
          $('recoveryLowTekst').textContent = data.recovery_remaining === 0
            ? 'Je hebt je laatste herstelcode gebruikt. Maak nieuwe aan via Profiel → Beveiliging, anders kom je zonder telefoon niet meer binnen.'
            : 'Je hebt nog ' + data.recovery_remaining + ' herstelcode' + (data.recovery_remaining === 1 ? '' : 's') + '. Maak nieuwe aan via Profiel → Beveiliging.';
          toonStap('recovery_low');
        };
      } else {
        naCodes = klaar;
      }
    }

    if (Array.isArray(data.recovery_codes) && data.recovery_codes.length) {
      toonHerstelcodes(data.recovery_codes, naCodes);
    } else {
      naCodes();
    }
  }

  function verwerkFout(res) {
    if (res.data && res.data.restart) {
      opnieuwBeginnen(res.data.error);
      return;
    }
    toonMelding((res.data && res.data.error) || 'Er ging iets mis. Probeer het opnieuw.');
  }

  // ---------- 2FA instellen: QR-code ----------

  function tekenEnroll(enroll) {
    var secret = String(enroll.secret || '');
    $('enrollSecret').textContent = secret.replace(/(.{4})/g, '$1 ').trim();
    var vak = $('qrVak');
    vak.innerHTML = '';
    if (typeof window.qrcode !== 'function' || !enroll.otpauth) {
      vak.innerHTML = '<p class="text-xs text-center text-neutral-500 p-2">QR-code kon niet geladen worden. Typ de sleutel hieronder in.</p>';
      var details = document.querySelector('[data-stap="mfa_enroll"] details');
      if (details) details.open = true;
      return;
    }
    var qr = window.qrcode(0, 'M');
    qr.addData(enroll.otpauth);
    qr.make();
    vak.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
    var svg = vak.querySelector('svg');
    if (svg) { svg.setAttribute('width', '100%'); svg.setAttribute('height', '100%'); }
  }

  // ---------- Herstelcodes ----------

  function toonHerstelcodes(codes, verder) {
    state.codes = codes.slice();
    state.naCodes = verder;
    var lijst = $('herstelLijst');
    lijst.innerHTML = '';
    codes.forEach(function (c) {
      var el = document.createElement('div');
      el.className = 'text-center py-1';
      el.textContent = c;
      lijst.appendChild(el);
    });
    $('codesBewaard').checked = false;
    $('codesVerder').disabled = true;
    toonStap('recovery_codes');
  }

  function codesAlsTekst() {
    return 'Herstelcodes mymmo Operations Manager\n'
      + (state.email ? 'Account: ' + state.email + '\n' : '')
      + 'Gemaakt op: ' + new Date().toLocaleString('nl-BE') + '\n'
      + 'Elke code werkt een keer.\n\n'
      + state.codes.join('\n') + '\n';
  }

  // ---------- Herstelcode in plaats van de app ----------

  function zetHerstelModus(aan) {
    state.recoveryMode = aan;
    var input = $('verifyInput');
    input.value = '';
    if (aan) {
      input.setAttribute('inputmode', 'text');
      input.setAttribute('autocomplete', 'off');
      input.setAttribute('maxlength', '11');
      input.setAttribute('placeholder', 'xxxxx-xxxxx');
      input.classList.remove('tracking-[0.4em]');
      input.classList.add('tracking-widest');
      $('verifyUitleg').textContent = 'Typ een van je herstelcodes. Elke code werkt een keer.';
      $('toggleRecovery').textContent = 'Toch de code van mijn app gebruiken';
    } else {
      input.setAttribute('inputmode', 'numeric');
      input.setAttribute('autocomplete', 'one-time-code');
      input.setAttribute('maxlength', '6');
      input.setAttribute('placeholder', '123456');
      input.classList.add('tracking-[0.4em]');
      input.classList.remove('tracking-widest');
      $('verifyUitleg').innerHTML = 'Open je authenticator-app en typ de code van 6 cijfers bij <strong>mymmo Operations Manager</strong>.';
      $('toggleRecovery').textContent = 'Telefoon kwijt? Gebruik een herstelcode';
    }
    input.focus();
  }

  // ---------- Formulieren ----------

  $('credentialsForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var form = e.currentTarget;
    if (form.querySelector('[data-knop]').disabled) return;
    var email = $('emailInput').value.trim();
    var password = $('passwordInput').value;
    $('emailInput').classList.toggle('input-error', !email);
    $('passwordInput').classList.toggle('input-error', !password);
    if (!email || !password) {
      toonMelding('Vul je e-mailadres en wachtwoord in.');
      return;
    }
    verbergMelding();
    bezig(form, true);
    var res = await post('/api/auth/login', { email: email, password: password });
    bezig(form, false);
    if (res.ok && res.data.success) {
      state.email = email;
      $('passwordInput').value = '';
      volgendeStap(res.data);
      return;
    }
    if (res.status === 401) {
      $('passwordInput').value = '';
      $('passwordInput').classList.add('input-error');
      $('passwordInput').focus();
    }
    toonMelding(res.data.error || 'Inloggen mislukt.');
  });

  async function stuurCode(form, input) {
    if (form.querySelector('[data-knop]').disabled) return;
    var code = input.value.trim();
    if (!code) {
      toonMelding('Typ de code.');
      return;
    }
    verbergMelding();
    bezig(form, true);
    var res = await post('/api/auth/login/mfa', { challenge: state.challenge, code: code });
    bezig(form, false);
    if (res.ok && res.data.success) {
      volgendeStap(res.data);
      return;
    }
    input.value = '';
    input.focus();
    verwerkFout(res);
  }

  $('verifyForm').addEventListener('submit', function (e) {
    e.preventDefault();
    stuurCode(e.currentTarget, $('verifyInput'));
  });

  $('enrollForm').addEventListener('submit', function (e) {
    e.preventDefault();
    stuurCode(e.currentTarget, $('enrollInput'));
  });

  // Zes cijfers = meteen versturen; geen extra klik nodig.
  ['verifyInput', 'enrollInput'].forEach(function (id) {
    $(id).addEventListener('input', function (e) {
      if (id === 'verifyInput' && state.recoveryMode) return;
      var waarde = e.target.value.replace(/\D/g, '').slice(0, 6);
      if (waarde !== e.target.value) e.target.value = waarde;
      if (/^\d{6}$/.test(waarde)) e.target.form.requestSubmit();
    });
  });

  $('passwordForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var form = e.currentTarget;
    if (form.querySelector('[data-knop]').disabled) return;
    var pw = $('newPasswordInput').value;
    var pw2 = $('confirmPasswordInput').value;
    if (pw.length < 12) {
      toonMelding('Een wachtwoord moet minstens 12 tekens lang zijn.');
      return;
    }
    if (pw !== pw2) {
      toonMelding('De twee wachtwoorden zijn niet gelijk.');
      return;
    }
    verbergMelding();
    bezig(form, true);
    var res = await post('/api/auth/login/password', { challenge: state.challenge, password: pw });
    bezig(form, false);
    if (res.ok && res.data.success) {
      volgendeStap(res.data);
      return;
    }
    verwerkFout(res);
  });

  $('codesBewaard').addEventListener('change', function (e) {
    $('codesVerder').disabled = !e.target.checked;
  });

  // ---------- Knoppen (data-action) ----------

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-action]');
    if (!el) return;
    var action = el.getAttribute('data-action');

    if (action === 'restart') {
      opnieuwBeginnen();
    } else if (action === 'toggle-recovery') {
      zetHerstelModus(!state.recoveryMode);
    } else if (action === 'copy-secret') {
      var s = $('enrollSecret').textContent.replace(/\s/g, '');
      navigator.clipboard.writeText(s).then(function () { toonMelding('Sleutel gekopieerd.', 'info'); });
    } else if (action === 'copy-codes') {
      navigator.clipboard.writeText(codesAlsTekst()).then(function () { toonMelding('Herstelcodes gekopieerd.', 'info'); });
    } else if (action === 'download-codes') {
      var blob = new Blob([codesAlsTekst()], { type: 'text/plain;charset=utf-8' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'herstelcodes-operations-manager.txt';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    } else if (action === 'codes-done') {
      if ($('codesVerder').disabled) return;
      var verder = state.naCodes || klaar;
      state.codes = [];
      $('herstelLijst').innerHTML = '';
      verder();
    } else if (action === 'finish') {
      klaar();
    }
  });

  toonStap('credentials');
})();
