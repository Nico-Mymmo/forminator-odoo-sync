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
 * Gedeelde opslag: mini-apps kunnen daarnaast data (tot 10 MB per app) over
 * gebruikers heen delen via window.sharedStorage (in de iframe-shim, zie
 * public/mini-apps.js) -- key-value + collections, opgeslagen in R2
 * (key-prefix "mini-apps-storage/", niet in Supabase -- zie lib/storage.js
 * voor de motivatie en de /api/apps/:id/storage*-routes in routes.js). Los
 * van localStorage/sessionStorage, die per-browser en niet-persistent
 * blijven (SecurityError in de sandbox, zie de shim).
 *
 * Gebruikers-context: elke app kent de ingelogde gebruiker via
 * window.currentUser en kan collega's opvragen via
 * window.platform.listColleagues() (zie public/mini-apps.js).
 *
 * Notify: apps kunnen zichzelf/een collega mailen via
 * window.platform.notify(to, subject, message) -- verstuurd via Gmail API
 * met domain-wide delegation (lib/gmail-send-client.js), maar altijd met de
 * ontvanger server-side herleid via de users-tabel (nooit een vrij
 * e-mailadres van de client) en met rate-limits + audit-log (lib/notify.js,
 * tabel mini_app_notifications).
 *
 * Google Chat: apps kunnen een bericht naar een gekoppeld KANAAL sturen via
 * window.platform.sendChat(channelId, message) -- incoming webhook per
 * Chat-space, door een gebruiker gekoppeld via de "Chat-kanalen"-knop (zie
 * lib/chat.js, tabellen mini_app_chat_channels/mini_app_chat_log). Geen
 * service-account nodig, los van de Gmail-notify-feature. 1-op-1 DM's naar
 * een specifieke persoon zitten hier NIET in -- dat vereist een
 * geregistreerde Chat-app in Google Cloud Console + een nieuwe
 * domain-wide-delegation-scope, een apart, groter traject.
 *
 * Geplande taken (4de generieke bouwblok): apps kunnen via
 * window.platform.schedule.create(...) een mail/chat laten versturen op een
 * vast tijdstip/interval, OOK als niemand die dag de app opent -- in
 * tegenstelling tot notify()/sendChat() hierboven, die enkel iets versturen
 * terwijl de app open staat. Draait via een bounded, veilige recurrence-
 * evaluator + logic-less template-renderer (lib/scheduler.js, GEEN eval/
 * Function van app-code) die enkel data uit de eigen sharedStorage van de
 * app leest, en verstuurt via de bestaande notifyUser()/sendChannelMessage()
 * (dus dezelfde rate-limits/audit-log). De cron (elke 15 min, zie
 * src/index.js#scheduled()) evalueert due taken (tabellen
 * mini_app_scheduled_tasks/mini_app_scheduled_task_log). Later fase (nog
 * niet gebouwd): de template-context kan uitgebreid worden met data uit
 * andere Operations Manager-modules (events, sales-insights, ...) -- de
 * mini-app kiest dan nog steeds nooit zelf een databron, enkel de
 * kant-en-klare context die wij server-side aanreiken (zelfde regel als
 * notify/chat: nooit een vrij doel/adres vanuit de client).
 *
 * Criteria-taken (5de generieke bouwblok, apart van geplande taken
 * hierboven -- BEWUST een aparte tabel/cron/API, geen uitbreiding van
 * lib/scheduler.js): apps kunnen via window.platform.condition.create(...)
 * een mail/chat laten versturen zodra een voorwaarde in de EIGEN
 * sharedStorage voor het eerst waar wordt (bv. "een collection-item met
 * status=nieuw", of "een kv-waarde die vandaag betekent") -- dus geen vast
 * tijdstip maar een gebeurtenis. Draait via een eigen cron-tak (elke 5 min,
 * zie src/index.js#scheduled(), event.cron === '*\/5 * * * *') die ELKE actieve
 * criteria-taak van ELKE app evalueert: is de voorwaarde nu waar, was ze dat
 * de vorige keer niet (edge-triggered, geen herhaalde spam zolang ze waar
 * blijft), en zo ja: versturen. Zelfde veiligheidsprincipe als hierboven --
 * geen eval, geen Function, pure data-vergelijking (lib/condition-scheduler.js,
 * tabellen mini_app_condition_tasks/mini_app_condition_task_log).
 *
 * Rechten-model zit volledig in permissions.js + routes.js — geen subRoles,
 * dit is geen rol-gebaseerde maar een per-record (owner/shared) toegang.
 *
 * Favorieten (2026-07-13, zie supabase/migrations/20260713110000_*.sql +
 * src/modules/mini-apps/lib/favorites.js): naast de bestaande persoonlijke
 * favoriet (mini_app_favorites, hart-icoon) kan een admin een app ook
 * GLOBAAL favoriet maken (mini_apps.is_global_favorite, ster-icoon,
 * PUT/DELETE /api/apps/:id/global-favorite) -- verschijnt dan bij IEDEREEN
 * in de navbar + Favorieten-strip, en overrulet daarbij bewust de eigen
 * visibility van de eigenaar (zie canView() in permissions.js). Beide
 * soorten favorieten samen vormen één balk per gebruiker, vrij herordenbaar
 * (GET/PUT /api/apps/favorites, /api/apps/favorites/order) -- lib/favorites.js
 * is de ene plek die de merge/sorteerlogica levert aan zowel session.js
 * (navbar) als routes.js (Favorieten-sectie in de pagina zelf).
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
