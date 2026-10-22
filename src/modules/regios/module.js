/**
 * Regio's
 *
 * Welke syndicoach werkt waar: een kaart van België waarop elke postcode bij
 * precies een syndicoach hoort. Opvolger van de mini-app "Regio's"; die wijst
 * sinds 2026-10-22 door naar hier (mini-apps/lib/verhuisd.js).
 * Opslag: D1 om-core (regio_*), zie d1/om-core/migrations/0012_regios.sql.
 *
 * Een syndicoach is een partner die onze werkwijze toepast (niet Syndicoach
 * het bedrijf). Louter informatief: geen koppeling met Odoo.
 */

import { routes } from './routes.js';

export default {
  code: 'regios',
  name: "Regio's",
  description: 'Welke syndicoach werkt waar?',
  route: '/regios',
  icon: 'map',
  isActive: true,
  requiresAuth: true,
  requiresAdmin: false,
  routes,
};
