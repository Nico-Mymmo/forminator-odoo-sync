/**
 * Mini-Apps Module
 *
 * Collega's uploaden zelfgemaakte single-file HTML/JS "mini-apps"
 * (bv. een OGM-generator, een kleine calculator) en kunnen ze vervolgens:
 *  - gebruiken — gesandboxed gedraaid in een <iframe sandbox> in de UI
 *  - tweaken — via een ingebouwde code-editor de HTML/JS aanpassen
 *  - delen — privé, met iedereen ("shared"), of met specifieke collega's
 *
 * Route: /mini-apps
 *
 * Opslag: HTML-inhoud in R2 (env.R2_ASSETS, key-prefix "mini-apps/"),
 * metadata + rechten in de Supabase-tabel `mini_apps`
 * (zie supabase/migrations/20260710120000_mini_apps_module.sql).
 *
 * Rechten-model zit volledig in permissions.js + routes.js — geen subRoles,
 * dit is geen rol-gebaseerde maar een per-record (owner/shared) toegang.
 */

import { routes } from './routes.js';

export default {
  code:        'mini_apps',
  name:        'Mini-apps',
  description: 'Upload, gebruik en tweak zelfgemaakte single-file HTML/JS mini-apps',
  route:       '/mini-apps',
  icon:        'puzzle',
  isActive:    true,

  routes
};
