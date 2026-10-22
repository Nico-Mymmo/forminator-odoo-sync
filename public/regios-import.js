/* Regio's -- importeren: eerst een voorbeeld van wat er verandert, dan pas doen. */
(function () {
  var RG = window.RG;
  var S = RG.state;
  var e = RG.esc;
  var $ = RG.$;

  function modus() {
    var r = document.querySelector('input[name="rgModus"]:checked');
    return r ? r.value : 'aanvullen';
  }

  RG.importReset = function () {
    $('dlgImportVoorbeeld').innerHTML = '';
    $('dlgImportKnop').disabled = true;
  };

  RG.openImport = function () {
    RG.importReset();
    $('dlgImportTekst').value = '';
    $('dlgImportBestand').value = '';
    $('dlgImportAdmin').innerHTML = S.isAdmin
      ? '<button class="btn btn-xs btn-ghost gap-1 text-base-content/60" data-action="import-overname" title="Haalt alles opnieuw uit de mini-app en vervangt wat hier staat">' +
        '<i data-lucide="rotate-ccw" class="w-3.5 h-3.5"></i> Opnieuw uit de mini-app</button>'
      : '';
    RG.iconen();
    $('dlgImport').showModal();
  };

  RG.importBestand = function (input) {
    var f = input.files && input.files[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { RG.toast('Het bestand is groter dan 5 MB.', 'error'); return; }
    var lezer = new FileReader();
    lezer.onload = function () {
      // Excel bewaart een gewone CSV in Windows-1252, niet in UTF-8: zonder
      // terugval wordt "é" in een naam onleesbaar en dus een nieuwe syndicoach.
      var bytes = new Uint8Array(lezer.result);
      var tekst;
      try { tekst = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
      catch (x) { tekst = new TextDecoder('windows-1252').decode(bytes); }
      $('dlgImportTekst').value = tekst;
      RG.importVoorbeeld();
    };
    lezer.readAsArrayBuffer(f);
  };

  function lijstje(titel, items, klasse) {
    if (!items.length) return '';
    return '<details class="mt-2"><summary class="cursor-pointer text-sm ' + (klasse || '') + '">' + titel + '</summary>' +
      '<div class="text-xs text-base-content/70 mt-1 max-h-40 overflow-y-auto pl-4">' + items.join('<br>') + '</div></details>';
  }

  RG.importVoorbeeld = async function () {
    var tekst = $('dlgImportTekst').value;
    var vak = $('dlgImportVoorbeeld');
    if (!tekst.trim()) { vak.innerHTML = '<div class="alert alert-warning text-sm">Kies een bestand of plak een lijst.</div>'; return; }
    vak.innerHTML = '<div class="py-3 text-center"><span class="loading loading-spinner loading-sm"></span></div>';
    $('dlgImportKnop').disabled = true;
    try {
      var p = await RG.api('/import/voorbeeld', { method: 'POST', body: { tekst: tekst, modus: modus() } });
      var t = p.tellingen;
      var naamVan = function (pc) { var pl = RG.plaatsVan(pc); return pc + (pl ? ' ' + e(pl) : ''); };
      var verplaatst = p.toewijzen.filter(function (x) { return x.van; });
      var nieuw = p.toewijzen.filter(function (x) { return !x.van; });
      var nietOpKaart = p.toewijzen.filter(function (x) { return !S.postcodeNaarNis[x.postcode]; });
      var html = '<div class="rounded-lg border border-base-content/10 p-3">' +
        '<div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">' +
          tegel('Nieuw toegewezen', t.nieuw) + tegel('Naar andere syndicoach', t.verplaatst) +
          tegel('Vrijgegeven', t.vrijgeven, t.vrijgeven ? 'text-warning' : '') + tegel('Al zo', t.ongewijzigd) +
        '</div>' +
        (p.nieuwe_syndicoaches.length ? '<p class="text-sm mt-3"><strong>Nieuwe syndicoaches:</strong> ' + p.nieuwe_syndicoaches.map(e).join(', ') + '</p>' : '') +
        lijstje('Naar een andere syndicoach (' + verplaatst.length + ')', verplaatst.map(function (x) {
          return naamVan(x.postcode) + ': ' + e(x.van) + ' &rarr; ' + e(x.naam);
        })) +
        lijstje('Nieuw toegewezen (' + nieuw.length + ')', nieuw.map(function (x) { return naamVan(x.postcode) + ' &rarr; ' + e(x.naam); })) +
        lijstje('Vrijgegeven (' + p.vrijgeven.length + ')', p.vrijgeven.map(function (pc) {
          var s = RG.coach(S.toewijzingen[pc]);
          return naamVan(pc) + (s ? ' (nu ' + e(s.naam) + ')' : '');
        }), 'text-warning') +
        lijstje('Niet op de kaart (' + nietOpKaart.length + ') -- worden toch bewaard', nietOpKaart.map(function (x) { return x.postcode + ' &rarr; ' + e(x.naam); }), 'text-warning') +
        lijstje('Overgeslagen, geen geldige postcode (' + p.ongeldig_aantal + ')', p.ongeldig.map(function (x) { return 'regel ' + x.regel + ': ' + e(x.waarde); }), 'text-error') +
        lijstje('Twee keer in het bestand, de laatste telt (' + p.dubbel.length + ')', p.dubbel.map(function (x) {
          return x.postcode + ': ' + e(x.eerder) + ' en ' + e(x.nu) + ' (regel ' + x.regel + ')';
        }), 'text-warning') +
        '</div>';
      vak.innerHTML = html;
      var iets = t.nieuw + t.verplaatst + t.vrijgeven + p.nieuwe_syndicoaches.length;
      $('dlgImportKnop').disabled = !iets;
      if (!iets) vak.innerHTML += '<p class="text-sm text-base-content/60 mt-2">Er verandert niets.</p>';
    } catch (err) {
      vak.innerHTML = '<div class="alert alert-error text-sm">' + e(err.message) + '</div>';
    }
  };

  function tegel(label, n, klasse) {
    return '<div class="rounded-md bg-base-200 p-2"><div class="text-xl font-semibold ' + (klasse || '') + '">' + n + '</div>' +
      '<div class="text-xs text-base-content/60">' + label + '</div></div>';
  }

  RG.importDoe = async function () {
    $('dlgImportKnop').disabled = true;
    try {
      var r = await RG.schrijf(function () {
        return RG.api('/import', { method: 'POST', body: { tekst: $('dlgImportTekst').value, modus: modus() } });
      }, 'Importeren mislukt');
      $('dlgImport').close();
      await RG.laad(true);
      var t = r.tellingen;
      RG.toast('Geimporteerd: ' + t.nieuw + ' nieuw, ' + t.verplaatst + ' verplaatst, ' + t.vrijgeven + ' vrijgegeven.');
    } catch (x) {
      $('dlgImportKnop').disabled = false;
    }
  };

  RG.importOvername = function (bevestig) {
    $('dlgImport').close();
    bevestig('Opnieuw uit de mini-app overnemen?',
      'Alles wat hier staat (syndicoaches, toewijzingen, met de hand toegevoegde postcodes) wordt <strong>vervangen</strong> door de stand in de mini-app Regio\'s. Wat sindsdien hier veranderde, gaat verloren.',
      'Ja, vervangen',
      async function () {
        try {
          var v = await RG.schrijf(function () { return RG.api('/overname', { method: 'POST' }); }, 'Overnemen mislukt');
          S.actief = null;
          await RG.laad(true);
          RG.toast('Overgenomen: ' + v.syndicoaches + ' syndicoaches, ' + v.postcodes + ' postcodes.');
        } catch (x) { /* gemeld */ }
      });
  };
})();
