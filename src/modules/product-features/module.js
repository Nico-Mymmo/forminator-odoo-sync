/**
 * Productfeatures
 *
 * De bibliotheek van wat OpenVME kan: een boom van features (globaal -> fijn)
 * met per feature de feiten die een mail of een pagina nodig heeft (label,
 * titel, korte uitleg, waarom, beeld, USP's, voordelen, voor wie, categorie,
 * link). Marketing houdt ze bij; de nieuwsbrief zet er blokken van in de
 * brief. Toon: feitelijk, geen reclametaal. Opslag: product_features.
 */

import { routes } from './routes.js';

export default {
  code: 'product_features',
  name: 'Productfeatures',
  description: 'Wat OpenVME kan, als bibliotheek: feitelijke blokken voor mails en pagina\'s',
  route: '/productfeatures',
  icon: 'blocks',
  isActive: true,
  requiresAuth: true,
  requiresAdmin: false,
  subRoles: ['user', 'marketing_signature', 'admin'],
  routes,
};
