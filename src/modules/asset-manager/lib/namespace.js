/**
 * Asset Manager — de eigen namespace in de gedeelde R2-bucket.
 *
 * WAAROM DIT EEN APART BESTAND IS. `env.R2_ASSETS` is één bucket die door
 * meerdere modules gebruikt wordt (zie het doc-blok in module.js). Welke
 * prefixen van de asset-manager zijn, welke van een andere module, en wie wat
 * mag lezen: dat stond in routes.js, en dus kon alleen de asset-manager zelf
 * die vraag beantwoorden. Sinds Koppelingen bijlagen uit de Asset Manager kan
 * kiezen (`GET /forminator-v2/api/mail-assets`) is er een tweede lezer, en
 * twee kopieën van een rechtenregel is één kopie te veel -- dat is precies de
 * soort verschuiving waardoor de bucket-brede list van vóór 2026-07-13
 * ongemerkt de hele bucket teruggaf.
 *
 * routes.js importeert hier uit; het heeft zelf geen eigen kopie meer.
 */

import { buildUserPrefix, isWithinPrefix } from './path-utils.js';
import { getSupabaseClient } from '../../../lib/database.js';

/**
 * De volledige, gesloten namespace van de asset-manager zelf -- moet exact
 * overeenkomen met de categorie-prefixen in ui.js (Banners/Events/Logos/
 * Overige) + de per-user prefix. Een lijst-aanroep met een leeg prefix
 * ("Alles") mag NOOIT verder kijken dan deze set, en elk expliciet opgegeven
 * prefix moet hierbinnen vallen.
 */
export const ASSET_CATEGORY_PREFIXES = ['public/', 'banners/', 'events/', 'logos/', 'uploads/'];

/**
 * Andere modules die dezelfde env.R2_ASSETS-bucket gebruiken (zie
 * src/modules/mini-apps/lib/r2-client.js + lib/storage.js) -- de
 * asset-manager mag hier nooit in lezen of schrijven, ook een admin niet.
 * Nieuwe modules die deze bucket later ook gebruiken: hier toevoegen.
 */
export const FOREIGN_MODULE_PREFIXES = ['mini-apps/', 'mini-apps-storage/', 'fsv2-tracker-logos/'];

/**
 * Hoort deze sleutel/prefix bij een ANDERE module?
 *
 * @param {string} prefix
 * @returns {boolean}
 */
export function isForeignPrefix(prefix) {
  const p = String(prefix || '');
  return FOREIGN_MODULE_PREFIXES.some(fp => p.startsWith(fp));
}

/**
 * Ligt deze sleutel binnen de asset-manager zelf?
 *
 * Bewust op de KEY en niet op de gebruiker: dit is de vraag "is dit überhaupt
 * een Asset-Manager-bestand", los van wie het opvraagt. `users/{id}/` telt mee,
 * want dat is ook asset-manager-opslag.
 *
 * @param {string} key
 * @returns {boolean}
 */
export function isWithinAssetNamespace(key) {
  const k = String(key || '');
  if (k === '' || k.startsWith('/') || k.includes('..')) return false;
  if (isForeignPrefix(k)) return false;
  if (k.startsWith('users/')) return true;
  return ASSET_CATEGORY_PREFIXES.some(p => k.startsWith(p));
}

/**
 * Mag deze gebruiker deze sleutel/prefix LEZEN?
 *
 * Admin en asset_manager overal binnen de eigen namespace; een gewone
 * gebruiker alleen zijn eigen `users/{id}/`. Foreign prefixen nooit, ook niet
 * voor een admin.
 *
 * @param {Object} user
 * @param {string} keyOrPrefix
 * @returns {boolean}
 */
export function canReadAssetPrefix(user, keyOrPrefix) {
  if (!user) return false;
  if (isForeignPrefix(keyOrPrefix)) return false;
  if (user.role === 'admin') return true;
  if (user.role === 'asset_manager') return true;
  const ownPrefix = buildUserPrefix(user.id);
  return isWithinPrefix(keyOrPrefix, ownPrefix);
}

/**
 * De top-level categorieen die een beheerder er zelf bij maakte
 * (`asset_manager_categories`). Ze horen bij de namespace net zo goed als de
 * vaste lijst hierboven, dus ze staan hier en niet in routes.js -- Koppelingen
 * moet ze ook kunnen tonen in de bijlagekiezer.
 *
 * Een leesfout is geen reden om te stoppen: dan zie je de vaste categorieen,
 * niet een foutmelding.
 *
 * @param {Object} env
 * @returns {Promise<Array<{prefix: string, label: string}>>}
 */
export async function listDynamicAssetCategories(env) {
  try {
    const supabase = getSupabaseClient(env);
    const { data, error } = await supabase
      .from('asset_manager_categories')
      .select('prefix, label')
      .order('created_at', { ascending: true });
    if (error) {
      console.error('[asset-manager] listDynamicAssetCategories error:', error.message);
      return [];
    }
    return data || [];
  } catch (err) {
    console.error('[asset-manager] listDynamicAssetCategories error:', err && err.message);
    return [];
  }
}
