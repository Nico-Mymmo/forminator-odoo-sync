/**
 * De veelgestelde vragen op de pagina: een link naar een vraag klapt ze open.
 *
 * Het openklappen zelf doet de browser (<details>); dit script doet enkel wat
 * niet elke browser vanzelf doet: wie op een link naar #faq-hoeveel-kost-...
 * klikt, of met dat adres binnenkomt, ziet het antwoord meteen in plaats van
 * een dichte vraag.
 */

(function () {
  'use strict';

  function openDoel() {
    var id = window.location.hash ? decodeURIComponent(window.location.hash.slice(1)) : '';
    if (!id) {
      return;
    }
    var doel = document.getElementById(id);
    var vraag = doel && doel.closest ? doel.closest('.mymmo-faq-vraag') : null;
    if (vraag && vraag.tagName === 'DETAILS' && !vraag.open) {
      vraag.open = true;
    }
  }

  window.addEventListener('hashchange', openDoel);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', openDoel);
  } else {
    openDoel();
  }
})();
