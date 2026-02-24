/**
 * Asset Manager Module
 *
 * Centrale bestandsbeheerlaag bovenop Cloudflare R2.
 * Route: /assets
 *
 * ─── Role access ─────────────────────────────────────────────────────────────
 *
 *  Alle authenticated users met module-toegang via user_modules kunnen
 *  de module bezoeken en hun eigen bestanden beheren (users/{id}/).
 *
 *  De asset_manager en admin rollen ontgrendelen alle uploads/ prefixen.
 *
 *  API-level role-gating zit in routes.js.
 *  UI-level zichtbaarheid zit in ui.js via isAdminOrManager.
 *
 * ─── R2 binding ─────────────────────────────────────────────────────────────
 *
 *  env.R2_ASSETS — gedeclareerd in wrangler.jsonc, bucket: openvme-assets
 *  NOOIT env.ASSETS gebruiken — dat is de static files binding
 */

import { routes } from './routes.js';

export default {
  code:        'asset_manager',
  name:        'Asset Manager',
  description: 'Centrale bestandsbeheerlaag voor uploads en publieke assets',
  route:       '/assets',
  icon:        'folder-open',
  isActive:    true,

  /**
   * Sub-roles binnen deze module.
   * Server-side afgedwongen in routes.js — niet hier.
   * Gedocumenteerd voor tooling / admin panels.
   *
   * Waarden komen overeen met users.role:
   *   'user'           – Eigen prefix (users/{id}/) lezen en schrijven
   *   'asset_manager'  – Upload/verwijder in alle uploads/ prefixen
   *   'admin'          – Volledige toegang inclusief public/ en system/
   */
  subRoles: ['user', 'asset_manager', 'admin'],

  routes
};
