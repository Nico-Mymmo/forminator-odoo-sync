/**
 * Dashboards — de pagina zelf: aanmelding, navbar en iconen.
 *
 * Elk tabblad heeft een eigen bestand en tekent zichzelf zodra het zichtbaar
 * wordt: Verkoop (dashboards-sales.js), Targets (dashboards-targets.js),
 * Aanvragen (dashboard-aanvragen/aanvragen.js), Marketing
 * (dashboards-marketing.js + -behaviour.js), Website-bezoeken (dashboards-web.js,
 * dat ook de tabbladen wisselt) en Kaart (dashboards-map.js).
 *
 * Tot 2026-10-09 stond hier ook het tabblad Aanvragen. Dat is het terrein van
 * David geworden en heeft nu een eigen map; zie
 * src/modules/dashboards/lib/aanvragen/CLAUDE.md.
 */
(async function () {
  'use strict';
  try {
    var res = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' });
    if (res.status === 401) { window.location.href = '/'; return; }
    var data = await res.json();
    if (!data.user) { window.location.href = '/'; return; }
    if (window.renderSharedNavbar) window.renderSharedNavbar(data.navbarHtml);
  } catch (err) {
    console.error('Aanmelding nakijken mislukt:', err);
  }
  if (window.lucide) window.lucide.createIcons();
})();
