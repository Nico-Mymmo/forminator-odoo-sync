/**
 * Claude voor sales
 *
 * Een connector voor claude.ai: een salesmedewerker vraagt in Claude een
 * gebouw op, krijgt het dossier uit Odoo, vult het aan met een gesprek of
 * notities, en Claude zet het na bevestiging in Odoo (velden, chatter,
 * interne notitie van de lead, gesprek op het actieblad).
 *
 * Het denkwerk gebeurt in Claude, op het account van de medewerker. De OM
 * levert enkel de gegevens en schrijft weg (lib/mcp.js), en regelt het
 * aanmelden (lib/oauth.js). Beide zitten buiten de gewone module-router
 * (src/router/public-routes.js): Claude stuurt een token, geen sessiecookie.
 *
 * Deze module is de PAGINA: het adres van de connector, uitleg, je
 * verbindingen en wat er via de connector gebeurde.
 */

import { routes } from './routes.js';

export default {
  code: 'claude_sales',
  name: 'Claude voor sales',
  description: 'Een gebouwdossier opvragen en aanvullen vanuit Claude.',
  route: '/claude-sales',
  icon: 'sparkles',
  isActive: true,
  requiresAuth: true,
  requiresAdmin: false,
  routes,
};
