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
 * Zie src/modules/dashboards/lib/leads-instroom.js voor de analyse achter de
 * merk-groepering en de definitie van "won-ratio vanaf MQL".
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
  routes
};
