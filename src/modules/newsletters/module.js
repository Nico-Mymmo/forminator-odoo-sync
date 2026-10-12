/**
 * Nieuwsbrieven
 *
 * De drie nieuwsbrieven (Syndicoach, OpenVME, Professionals) worden in de OM
 * gemaakt, door het hele bedrijf samen: elke rubriek heeft een eigenaar, elke
 * editie een inleverdatum met een teller, en marketing is hoofdredactie. Odoo
 * verstuurt (mailing.mailing op mailing.list, Postmark broadcast).
 *
 * Zolang NEWSLETTER_SEND_MODE niet 'live' is, kan er enkel een TEST vertrekken,
 * en enkel naar NEWSLETTER_TEST_EMAILS.
 *
 * Ontwerp: docs/ontwerp-om-nieuwsbrieven.md. Opslag: newsletter_* (Supabase).
 * Publieke bedankpagina voor vragen in de mail: public-api.js, via
 * src/router/public-routes.js (/t/_v/...).
 */

import { routes } from './routes.js';

export default {
  code: 'newsletters',
  name: 'Nieuwsbrieven',
  description: 'Samen de nieuwsbrieven maken: elk zijn stukje, marketing als hoofdredactie',
  route: '/nieuwsbrieven',
  icon: 'newspaper',
  isActive: true,
  requiresAuth: true,
  requiresAdmin: false,
  subRoles: ['user', 'marketing_signature', 'admin'],
  routes,
};
