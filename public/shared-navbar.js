/**
 * shared-navbar.js — Gedeelde navbar voor alle moderne modules (public/*.html).
 *
 * De navbar-HTML wordt gegenereerd door de server (src/lib/components/navbar.js)
 * en meegestuurd in de /api/auth/me response als `navbarHtml`.
 * Dit bestand injecteert die HTML alleen — er zit hier GEEN navbar-logica in.
 *
 * Gebruik:
 *   1. <script src="/shared-navbar.js"></script>  (in <head>)
 *   2. <div id="navbar"></div>  in de body
 *   3. Na /api/auth/me: window.renderSharedNavbar(data.navbarHtml);
 *
 * VERBODEN: eigen navbar per module aanmaken. navbar.js is de enige bron.
 *
 * BELANGRIJK (2026-07): favorieten-drag-and-drop, het "Meer…"-blokje en de
 * bijbehorende iconen-verrijking zaten hier eerder ZELF in dit bestand --
 * dat werkte enkel op de 5 MODERNE modules die dit script laden, niet op de
 * legacy modules (ui.js rendert navbar(user) rechtstreeks server-side in de
 * volledige pagina en laadt dit bestand nooit, dus die logica bereikte de
 * homepage en andere legacy pagina's helemaal niet). Verplaatst naar het
 * inline <script> in src/lib/components/navbar.js zelf -- dat draait
 * namelijk op ELKE pagina die navbar(user) gebruikt, legacy EN modern, dus
 * dat is de enige plek die dit app-breed daadwerkelijk waarmaakt. Voeg hier
 * dus GEEN navbar-favorieten-logica meer toe -- dat hoort in navbar.js.
 */
window.renderSharedNavbar = function renderSharedNavbar(navbarHtml) {
  var el = document.getElementById('navbar');
  if (!el || !navbarHtml) return;
  // Eerst de vorige inhoud wissen -- zonder dit stapelt elke herhaalde
  // renderSharedNavbar()-aanroep (bv. na elke favorieten-wijziging in de
  // mini-apps-module) een NIEUWE kopie van de navbar-HTML bovenop de vorige,
  // met dubbele id's (#navbarFavorites, #navbarFavoritesDivider, ...) als
  // gevolg. document.getElementById() geeft dan de EERSTE (verouderde) kopie
  // terug, terwijl de zichtbare, nieuwste kopie daar los van blijft bestaan
  // -- dat verklaarde bugs zoals een verdwijnende "Terug"-link of
  // verdwijnende iconen na opeenvolgende updates.
  el.innerHTML = '';
  // createContextualFragment zorgt dat de inline <script> in navbar.js wordt uitgevoerd
  var frag = document.createRange().createContextualFragment(navbarHtml);
  el.appendChild(frag);
};
