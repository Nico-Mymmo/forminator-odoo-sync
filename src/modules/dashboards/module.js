/**
 * Dashboards-module
 *
 * Doel: de dashboards die tot nu toe via de Google Sheet + Looker Studio-
 * pijplijn liepen (Odoo -> odoo-proxy -> google-odoo-dataset-sync -> Sheet ->
 * Looker Studio) stap voor stap overzetten naar de OM, rechtstreeks op
 * Odoo-data. odoo-proxy blijft voorlopig bestaan (o.a. voor de
 * abonnementenlogica), maar wordt voor deze dashboards niet meer gebruikt --
 * deze module praat rechtstreeks met Odoo via lib/odoo.js.
 *
 * v1 (2026-09-08): één widget, de instroom-sectie (aanvragen/leads-instroom).
 * Bewust hardcoded en NIET generiek -- eerst dit ene patroon bewijzen
 * (query -> KPI-kaarten + grafiek) voor we naar een door gebruikers zelf
 * samen te stellen widget-systeem gaan, zoals uiteindelijk de bedoeling is.
 * De merk- en kanaalindeling staat in lib/lead-kanalen.js (gedeeld met Verkoop en
 * Targets), de definitie van "won-ratio vanaf MQL" in lib/aanvragen/instroom.js.
 *
 * Tabbladen (2026-10-09), in deze volgorde: Verkoop (standaard), Targets,
 * Aanvragen, Marketing, Website-bezoeken, Kaart. Marketing was tot dan de
 * aparte module Webgedrag (web_story); zie lib/marketing-routes.js.
 * Aanvragen is het terrein van David (lib/aanvragen/CLAUDE.md): hij voegt daar
 * zelf samen, binnen de vangrails.
 *
 * Route: /dashboards
 */
import { routes } from './routes.js';

export default {
  code: 'dashboards',
  name: 'Dashboards',
  description: 'Interne dashboards op live Odoo-data (vervangt stap voor stap de Looker Studio-rapporten)',
  route: '/dashboards',
  icon: 'layout-dashboard',
  isActive: true,
  /**
   * Sub-rollen (waarden van users.role), afgedwongen in lib/marketing-routes.js:
   *   'user'                – alles lezen
   *   'marketing_signature' – ook uitsluiten uit de cijfers / weer laten meetellen
   *   'admin'               – alles, ook de twijfelgevallen van Marketing
   */
  subRoles: ['user', 'marketing_signature', 'admin'],
  routes
};
