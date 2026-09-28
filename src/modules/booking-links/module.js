/**
 * Afspraaklinks
 *
 * Elke collega zet zijn eigen Calendly-afspraaktypes klaar als een link naar
 * ONZE site (`?afspraak=<slug>`), die daar het venster van mymmo-forms opent
 * op "Plan een gesprek" met zijn agenda. Dezelfde links voeden de placeholder
 * {{afspraak.<stap>.<soort>}} in de koppelingen.
 *
 * Opslag: tabel booking_links (Supabase). De publieke opzoeking voor WordPress
 * zit in forminator-sync-v2/forms/public-api.js, achter dezelfde sitesleutel
 * als de formulieren.
 */

import { routes } from './routes.js';

export default {
  code: 'booking_links',
  name: 'Afspraaklinks',
  description: 'Je eigen Calendly-links die op onze website openen',
  route: '/afspraaklinks',
  icon: 'calendar-clock',
  isActive: true,
  requiresAuth: true,
  requiresAdmin: false,
  routes,
};
