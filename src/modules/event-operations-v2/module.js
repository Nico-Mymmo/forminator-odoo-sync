/**
 * Event Operations v2
 *
 * Beheer van events, inschrijvingen en communicatie. Odoo is de enige
 * database: deze module bezit geen data en gebruikt geen Supabase.
 *
 * Loopt naast de bestaande event-operations-module (route /events) tot v2
 * bewezen is.
 */

import { routes } from './routes.js';

export default {
  code: 'event_operations_v2',
  name: 'Events',
  description: 'Beheer van events, inschrijvingen en communicatie — Odoo als enige database',
  route: '/events-v2',
  icon: 'calendar-days',
  isActive: true,
  requiresAuth: true,
  requiresAdmin: false,
  routes
};
