/**
 * Odoo-controle
 *
 * De factuur-, abonnement- en CRM-controle: elke case is een fout of een open
 * vraag in een offerte, abonnement, factuur, bedrijf of verkoopkans in Odoo.
 * Het team zoekt uit wat er gebeurde, zet het recht (in Odoo of in OpenVME) en
 * hangt de case aan een of meer patronen; per patroon staat de regel die het
 * voortaan voorkomt. Uit de patronen ontstaat het skill-concept (SKILL.md).
 *
 * Overgenomen van de claude.ai-pagina "Factuur-, abonnement- en CRM-controle"
 * (2026-10). Opslag: controle_*-tabellen in Supabase, met historiek.
 */

import { routes } from './routes.js';

export default {
  code: 'odoo_controle',
  name: 'Odoo-controle',
  description: 'Factuur-, abonnement- en CRM-controle: cases, patronen, regels en het skill-concept',
  route: '/odoo-controle',
  icon: 'clipboard-check',
  isActive: true,
  requiresAuth: true,
  requiresAdmin: false,
  routes,
};
