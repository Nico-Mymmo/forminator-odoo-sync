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
 *
 *  BELANGRIJK: deze bucket wordt ook door andere modules gebruikt (mini-apps:
 *  prefixen "mini-apps/" + "mini-apps-storage/", zie
 *  src/modules/mini-apps/lib/r2-client.js + lib/storage.js). routes.js kent
 *  daarom een gesloten eigen namespace (ASSET_CATEGORY_PREFIXES: public/,
 *  banners/, events/, logos/, uploads/, + users/{id}/) en een expliciete
 *  FOREIGN_MODULE_PREFIXES-denylist -- GET /api/assets/list mag NOOIT een
 *  onbegrensd/leeg prefix 1-op-1 doorgeven aan R2_ASSETS.list(), en
 *  canReadPrefix/canWritePrefix weigeren altijd foreign-module-prefixen, ook
 *  voor admin. Vóór 2026-07-13 gaf een leeg prefix ("Alles"-tab) de HELE
 *  bucket ongefilterd terug, waardoor mini-apps' eigen data als "bestanden"
 *  in de Asset Library verscheen. Nieuwe modules die deze bucket ook gaan
 *  gebruiken: hun prefix toevoegen aan FOREIGN_MODULE_PREFIXES in routes.js.
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
