/**
 * Webgedrag
 *
 * Het verhaal van een lead, een actieblad of een bezoeker: langs welke wegen
 * kwamen ze bij ons, met de volledige tijdlijn. Live uit D1 (website-tracker);
 * Odoo krijgt elk uur een samenvatting met een link hierheen (lib/push.js).
 * Zie website-tracker/docs/ontwerp-odoo-zonder-bezoekers.md.
 */

import { routes } from './routes.js';

export default {
  code: 'web_story',
  name: 'Webgedrag',
  description: 'Hoe leads en VME\'s bij ons kwamen: bezoeken, kanalen en de volledige tijdlijn',
  route: '/webgedrag',
  icon: 'footprints',
  isActive: true,
  requiresAuth: true,
  requiresAdmin: false,
  /**
   * Sub-rollen (waarden van users.role), afgedwongen in routes.js:
   *   'user'                – lezen (elke gebruiker heeft deze module)
   *   'marketing_signature' – ook uitsluiten uit de cijfers / weer laten meetellen
   *   'admin'               – alles, ook Twijfelgevallen
   */
  subRoles: ['user', 'marketing_signature', 'admin'],
  routes,
};
