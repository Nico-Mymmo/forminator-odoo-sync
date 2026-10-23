/* Toestemmingsscherm voor de connector "Claude voor sales" (zie src/modules/claude-sales/lib/oauth.js). */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var query = window.location.search;

  function fout(tekst) {
    $('csFout').textContent = tekst;
    $('csFout').classList.remove('hidden');
  }

  async function laad() {
    try {
      var res = await fetch('/oauth/authorize/info' + query, { credentials: 'include' });
      var data = await res.json().catch(function () { return {}; });
      if (res.status === 401) { window.location.href = '/?next=' + encodeURIComponent('/oauth/authorize' + query); return; }
      if (!res.ok || !data.success) { $('csKop').textContent = ''; fout(data.error || 'Er ging iets mis.'); return; }
      $('csClient').textContent = data.data.client_name;
      $('csGebruiker').textContent = data.data.gebruiker.naam + ' (' + data.data.gebruiker.email + ')';
      if (!data.data.toegang) {
        $('csKop').textContent = '';
        fout('Je hebt nog geen toegang tot "Claude voor sales". Vraag het aan een beheerder van de Operations Manager.');
        return;
      }
      $('csKop').textContent = 'Kijk na of dit klopt voor je verbindt.';
      $('csInhoud').classList.remove('hidden');
    } catch (e) {
      fout('Verbindingsfout. Herlaad de pagina.');
    }
  }

  document.addEventListener('click', async function (e) {
    var knop = e.target.closest('[data-keuze]');
    if (!knop) return;
    document.querySelectorAll('[data-keuze]').forEach(function (k) { k.disabled = true; });
    try {
      var res = await fetch('/oauth/authorize/approve', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query, akkoord: knop.dataset.keuze === 'ja' }),
      });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok || !data.success) {
        fout(data.error || 'Er ging iets mis.');
        document.querySelectorAll('[data-keuze]').forEach(function (k) { k.disabled = false; });
        return;
      }
      window.location.href = data.data.redirect;
    } catch (err) {
      fout('Verbindingsfout. Probeer het opnieuw.');
      document.querySelectorAll('[data-keuze]').forEach(function (k) { k.disabled = false; });
    }
  });

  laad();
})();
