/**
 * Projecten
 *
 * Interne projecten en to-do's, voor het hele team: projecten met secties en
 * mijlpalen, taken met subtaken, labels, opmerkingen, bijlagen en een
 * verwijzing naar Odoo; weergaven Lijst, Bord, Kalender en "Mijn taken".
 * Opslag: D1 om-core (pm_*), zie d1/om-core/migrations/0003_projecten.sql.
 *
 * Staat los van de oude projectgenerator (/projects), die projecten in Odoo
 * aanmaakt.
 */

import { routes } from './routes.js';

export default {
  code: 'projecten',
  name: 'Projecten',
  description: 'Interne projecten en to-do\'s opvolgen',
  route: '/projecten',
  icon: 'folder-kanban',
  isActive: true,
  requiresAuth: true,
  requiresAdmin: false,
  routes,
};
