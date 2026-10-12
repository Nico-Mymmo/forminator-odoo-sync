/**
 * Wat er nieuw is, en nu binnenhalen -- de meldingen bovenaan de editor.
 * Zie includes/class-nieuw.php.
 */
(function (wp) {
  if (!wp || !wp.apiFetch || !wp.data || !wp.domReady) {
    return;
  }

  var KLAAR = 'mymmo-cards-klaar';
  var NIEUWS = 'mymmo-cards-nieuws';

  function meldingen() {
    return wp.data.dispatch('core/notices');
  }

  function toon(soort, tekst, id, extra) {
    meldingen().removeNotice(id);
    meldingen().createNotice(soort, tekst, Object.assign({ id: id, isDismissible: true }, extra || {}));
  }

  function gezien() {
    wp.apiFetch({ path: '/mymmo-cards/v1/gezien', method: 'POST' }).catch(function () {});
  }

  function mislukt() {
    toon('warning', 'Binnenhalen lukte niet. De site haalt de nieuwe versie binnen het uur vanzelf binnen; je kan het ook later opnieuw proberen.', KLAAR, {
      actions: [{ label: 'Opnieuw proberen', onClick: binnenhalen }],
    });
  }

  function binnenhalen() {
    toon('info', 'Bezig met binnenhalen, even geduld...', KLAAR, { isDismissible: false });
    wp.apiFetch({ path: '/mymmo-cards/v1/binnenhalen', method: 'POST' }).then(function (antwoord) {
      if (!antwoord || !antwoord.gelukt) {
        mislukt();
        return;
      }
      toon('success', 'Binnengehaald. Bewaar je werk en ververs de pagina om het nieuwe te gebruiken.', KLAAR, {
        actions: [{ label: 'Pagina verversen', onClick: function () { window.location.reload(); } }],
      });
    }).catch(mislukt);
  }

  wp.domReady(function () {
    wp.apiFetch({ path: '/mymmo-cards/v1/editor' }).then(function (stand) {
      if (stand && stand.klaar) {
        toon('info', 'Er staat een nieuwe versie van de Mymmo-blokken klaar.', KLAAR, {
          actions: [{ label: 'Nu binnenhalen', onClick: binnenhalen }],
        });
      }
      if (stand && stand.nieuws && stand.nieuws.length) {
        toon('info', 'Nieuw in de Mymmo-blokken: ' + stand.nieuws.join(' '), NIEUWS, {
          onDismiss: gezien,
          actions: [{
            label: 'Begrepen',
            onClick: function () {
              gezien();
              meldingen().removeNotice(NIEUWS);
            },
          }],
        });
      }
    }).catch(function () {});
  });
})(window.wp);
