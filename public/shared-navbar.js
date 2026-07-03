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
 */
window.renderSharedNavbar = function renderSharedNavbar(navbarHtml) {
  var el = document.getElementById('navbar');
  if (!el || !navbarHtml) return;
  // createContextualFragment zorgt dat de inline <script> in navbar.js wordt uitgevoerd
  var frag = document.createRange().createContextualFragment(navbarHtml);
  el.appendChild(frag);
};
