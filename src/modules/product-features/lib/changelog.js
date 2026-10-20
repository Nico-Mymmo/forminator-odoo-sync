/**
 * Productfeatures -- het logboek: wie paste wat aan, en wanneer.
 *
 * Tabel product_feature_changes in D1 om-core (0009_product_feature_changes.sql).
 * Elke regel bewaart LEESBARE waarden (een label, een naam, geen sleutel of id),
 * zodat ze klopt als een feature hernoemd wordt of iemand vertrekt.
 *
 * Het logboek mag een wijziging nooit tegenhouden: schrijven faalt stil (met
 * een regel in de log), net als de historiek van Projecten.
 */

import { getCoreDb } from '../../../lib/core-db.js';
import { LOG_PREFIX, CATEGORIEEN, VOORDELEN, DOELGROEPEN, PAKKETTEN } from './constants.js';

const TABEL = 'product_feature_changes';

/** De velden die in het logboek komen, in de volgorde van het formulier. */
const VELDEN = [
  ['name', 'Titel'],
  ['eyebrow', 'Label'],
  ['summary', 'Korte uitleg'],
  ['why', 'Waarom we dit gemaakt hebben'],
  ['usps', 'USP\'s'],
  ['parent_id', 'Staat onder'],
  ['category', 'Categorie'],
  ['plan', 'Voor VME\'s'],
  ['pro', 'OpenVME Pro'],
  ['brand', 'Merk'],
  ['audiences', 'Voor wie'],
  ['benefits', 'Voordelen'],
  ['url', 'Link'],
  ['image_url', 'Beeld'],
  ['achtergrond', 'Achtergrond bij het beeld'],
  ['is_active', 'Te kiezen in een mail'],
];

const MAX_TEKST = 1500;

const labelUit = (lijst, key) => (lijst.find((x) => x.key === key) || {}).label || key;
const jaNee = (v) => (v ? 'Ja' : 'Nee');

/** Een waarde zoals een mens ze leest; '' = leeg. */
function leesbaar(veld, waarde, namen) {
  if (veld === 'parent_id') return waarde ? (namen.get(waarde) || 'een andere feature') : 'Hoofdfeature';
  if (waarde === null || waarde === undefined) return '';
  switch (veld) {
    case 'category': return waarde ? labelUit(CATEGORIEEN, waarde) : '';
    case 'plan': return labelUit(PAKKETTEN, waarde || '');
    case 'pro':
    case 'is_active': return jaNee(waarde);
    case 'brand': return waarde === 'syndicoach' ? 'Syndicoach' : 'OpenVME';
    case 'audiences': return (waarde || []).map((k) => labelUit(DOELGROEPEN, k)).join(', ');
    case 'benefits': return (waarde || []).map((k) => labelUit(VOORDELEN, k)).join(', ');
    case 'usps': return (waarde || []).join('\n');
    case 'achtergrond': return waarde ? 'Ja' : '';
    default: return String(waarde).slice(0, MAX_TEKST);
  }
}

/** JSON met gesorteerde sleutels: anders telt een andere volgorde als wijziging. */
function vast(v) {
  if (Array.isArray(v)) return '[' + v.map(vast).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + vast(v[k])).join(',') + '}';
  return JSON.stringify(v ?? null);
}

/** Twee waarden vergelijken zonder dat null, '' en [] als verschil tellen. */
function sleutel(veld, waarde) {
  if (veld === 'pro' || veld === 'is_active') return waarde ? '1' : '0';
  if (waarde === null || waarde === undefined) return '';
  if (typeof waarde === 'object') return vast(waarde);
  return String(waarde).trim();
}

/**
 * Wat er verschilt tussen de oude en de nieuwe rij, leesbaar.
 * `namen` = Map(id -> naam) om "Staat onder" in woorden te zetten.
 */
export function verschillen(oud, nieuw, namen = new Map()) {
  const uit = [];
  for (const [veld, label] of VELDEN) {
    if (nieuw[veld] === undefined) continue;
    const a = oud ? oud[veld] : undefined;
    if (sleutel(veld, a) === sleutel(veld, nieuw[veld])) continue;
    // Een beeld of achtergrond als URL in het logboek zegt niemand iets.
    if (veld === 'image_url' || veld === 'achtergrond') {
      uit.push({ veld, label, van: '', naar: nieuw[veld] ? (a ? 'vervangen' : 'toegevoegd') : 'weggehaald' });
      continue;
    }
    uit.push({ veld, label, van: leesbaar(veld, a, namen), naar: leesbaar(veld, nieuw[veld], namen) });
  }
  return uit;
}

/** Een regel schrijven. Faalt nooit naar buiten. */
export async function logWijziging(env, { feature, action, changes = [], user }) {
  try {
    const { error } = await getCoreDb(env).from(TABEL).insert({
      feature_id: feature.id,
      feature_name: String(feature.name || '').slice(0, 200),
      action,
      changes,
      user_id: user?.id || null,
      user_name: String(user?.full_name || user?.email || '').slice(0, 200),
    });
    if (error) console.error(LOG_PREFIX, 'logboek', error.message);
  } catch (err) {
    console.error(LOG_PREFIX, 'logboek', err);
  }
}

/** Het logboek van een feature, nieuwste eerst. */
export async function listWijzigingen(env, featureId, limiet = 200) {
  const { data, error } = await getCoreDb(env).from(TABEL).select('*')
    .eq('feature_id', featureId).order('created_at', { ascending: false }).limit(limiet);
  if (error) throw new Error(`Logboek lezen: ${error.message}`);
  return data || [];
}
