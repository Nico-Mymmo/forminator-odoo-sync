/**
 * Afspraaklinks — opslag, validatie en het opbouwen van de URL.
 *
 * Een afspraaklink is (eigenaar in Odoo, soort, Calendly-afspraaktype) onder
 * een korte sleutel. De URL die naar buiten gaat is die van ONZE site:
 *
 *   <site>/?afspraak=<slug>
 *
 * en nooit de Calendly-link zelf. Twee redenen: de bezoeker blijft op onze
 * site (met ons formulier één tabblad verder), en de plugin zoekt de sleutel
 * server-side op -- een Calendly-link in de URL zou iedereen toelaten om op
 * onze site de agenda van een willekeurige derde te tonen.
 */

import { getSupabaseClient } from '../../../lib/database.js';
import { searchRead } from '../../../lib/odoo.js';

const TABEL = 'booking_links';

/** De terugval-sleutel: "geen persoonlijke link, toon de algemene agenda". */
export const ALGEMEEN = 'algemeen';

/** De soort die {{afspraak.<stap>.standaard}} bedoelt: de standaardlink. */
export const STANDAARD = 'standaard';

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,58}[a-z0-9]$/;
const MAX_POINTS = 6;
const KIND_RE = /^[a-z0-9][a-z0-9-]{0,38}$/;

export class BookingLinkError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function db(env) {
  return getSupabaseClient(env);
}

/** Vrije tekst → sleutelvorm. "Rob – Demo" → "rob-demo". */
export function toSlug(ruw) {
  return String(ruw || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
}

export function isValidSlug(slug) {
  return SLUG_RE.test(slug) && slug !== ALGEMEEN;
}

export function isValidKind(kind) {
  return KIND_RE.test(kind);
}

// ─── Sites ───────────────────────────────────────────────────────────────────

/**
 * Op welke sites een afspraaklink kan openen.
 *
 * BOOKING_LINK_SITES = "openvme:https://openvme.be,syndicoach:https://syndicoach.be"
 * Zonder die variabele worden de origins van FORMS_PUBLIC_ORIGINS genomen --
 * dat zijn per definitie de sites waar mymmo-forms draait, en dus de enige
 * waar ?afspraak= iets kan doen. De naam is dan het eerste deel van de host.
 * De EERSTE site is de standaard, ook voor de terugval.
 */
export function listSites(env) {
  const ruw = String(env?.BOOKING_LINK_SITES || '').trim();
  const uit = [];
  const bron = ruw || String(env?.FORMS_PUBLIC_ORIGINS || '');

  for (const deel of bron.split(',').map((d) => d.trim()).filter(Boolean)) {
    let naam = '';
    let origin = deel;
    const m = deel.match(/^([a-z0-9-]+):(https?:\/\/.+)$/i);
    if (m) { naam = m[1].toLowerCase(); origin = m[2]; }
    try {
      const u = new URL(origin);
      if (u.protocol !== 'https:') continue;
      if (!naam) naam = u.hostname.replace(/^www\./, '').split('.')[0];
      if (uit.some((s) => s.key === naam)) continue;
      uit.push({ key: naam, origin: u.origin });
    } catch {
      // onleesbare regel: overslaan, niet de hele lijst laten vallen
    }
  }
  return uit;
}

function siteOrigin(env, key) {
  const sites = listSites(env);
  return (sites.find((s) => s.key === key) || sites[0] || null)?.origin || null;
}

/**
 * De link op ELKE site. Een afspraaklink hoort niet bij één site: de sleutel
 * wordt bij de OM opgezocht, dus ?afspraak=<slug> werkt overal waar Mymmo
 * Forms draait. `site` op de rij bepaalt enkel welke van deze adressen in een
 * mail komt (bookingUrl).
 */
export function bookingUrls(env, link) {
  if (!link?.slug) return [];
  const voorMail = siteOrigin(env, link.site || '');
  return listSites(env).map((s) => ({
    site: s.key,
    origin: s.origin,
    url: `${s.origin}/?afspraak=${encodeURIComponent(link.slug)}`,
    in_mail: s.origin === voorMail,
  }));
}

/** De URL van een link in een mail. Null als er geen enkele site ingesteld is. */
export function bookingUrl(env, link) {
  const origin = siteOrigin(env, link?.site || '');
  if (!origin || !link?.slug) return null;
  return `${origin}/?afspraak=${encodeURIComponent(link.slug)}`;
}

/**
 * De terugval: onze site met het venster op de algemene agenda. Ook als er
 * geen persoonlijke link bestaat, moet de knop in een mail ergens heen gaan --
 * een lege href is een knop die niets doet, en dat merkt alleen de ontvanger.
 */
export function generalBookingUrl(env, siteKey = '') {
  const origin = siteOrigin(env, siteKey);
  return origin ? `${origin}/?afspraak=${ALGEMEEN}` : null;
}

// ─── Odoo-gebruiker van een OM-gebruiker ────────────────────────────────────

/**
 * res.users-id van een OM-gebruiker: eerst users.odoo_uid (gezet door de
 * CX Powerboard), anders opzoeken op login of e-mailadres.
 */
export async function resolveOdooUser(env, omUser) {
  const supabase = db(env);
  const { data } = await supabase.from('users').select('odoo_uid, email, full_name').eq('id', omUser.id).maybeSingle();
  const email = String(data?.email || omUser.email || '').trim().toLowerCase();

  if (Number.isInteger(data?.odoo_uid) && data.odoo_uid > 0) {
    const rijen = await searchRead(env, { model: 'res.users', domain: [['id', '=', data.odoo_uid]], fields: ['id', 'name'], limit: 1 });
    if (rijen[0]) return { id: rijen[0].id, name: rijen[0].name || '' };
  }
  if (!email) return null;

  const rijen = await searchRead(env, {
    model: 'res.users',
    domain: ['|', ['login', '=ilike', email], ['email', '=ilike', email]],
    fields: ['id', 'name'],
    limit: 1,
  });
  return rijen[0] ? { id: rijen[0].id, name: rijen[0].name || '' } : null;
}

/** Interne Odoo-gebruikers, voor de keuzelijst van een admin. */
export async function listOdooUsers(env) {
  const rijen = await searchRead(env, {
    model: 'res.users',
    domain: [['share', '=', false], ['active', '=', true]],
    fields: ['id', 'name', 'login'],
    order: 'name asc',
    limit: 500,
  });
  return rijen.map((r) => ({ id: r.id, name: r.name || '', login: r.login || '' }));
}

// ─── CRUD ────────────────────────────────────────────────────────────────────

export async function listLinks(env, { odooUserId = null, omUserId = null, all = false } = {}) {
  let q = db(env).from(TABEL).select('*').order('odoo_user_name').order('kind');
  if (!all) {
    const of = [];
    if (omUserId) of.push(`om_user_id.eq.${omUserId}`);
    if (odooUserId) of.push(`odoo_user_id.eq.${Number(odooUserId)}`);
    if (!of.length) return [];
    q = q.or(of.join(','));
  }
  const { data, error } = await q;
  if (error) throw new Error(`Afspraaklinks lezen mislukt: ${error.message}`);
  return data || [];
}

/** De links die naar één boekingspagina wijzen (het eventtype van een koppeling). */
export async function listLinksByUrl(env, schedulingUrl) {
  const { data, error } = await db(env).from(TABEL).select('*')
    .eq('scheduling_url', schedulingUrl).order('odoo_user_name').order('kind');
  if (error) throw new Error(`Afspraaklinks lezen mislukt: ${error.message}`);
  return data || [];
}

export async function getLink(env, id) {
  const { data, error } = await db(env).from(TABEL).select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(`Afspraaklink lezen mislukt: ${error.message}`);
  return data || null;
}

export async function getLinkBySlug(env, slug) {
  const { data, error } = await db(env).from(TABEL).select('*').eq('slug', slug).maybeSingle();
  if (error) throw new Error(`Afspraaklink lezen mislukt: ${error.message}`);
  return data || null;
}

/**
 * Een payload uit de browser naar een rij. Gooit BookingLinkError bij iets
 * dat niet mag -- nooit stil corrigeren: een link die anders heet dan wat
 * iemand intypte, staat al in een verstuurde mail voor hij het merkt.
 */
export function normalizeLinkPayload(env, body, { isNieuw }) {
  const uit = {};
  if (isNieuw || body.slug !== undefined) {
    const slug = String(body.slug || '').trim().toLowerCase();
    if (!isValidSlug(slug)) {
      throw new BookingLinkError('De sleutel mag enkel kleine letters, cijfers en streepjes bevatten (3 tot 60 tekens), en niet "algemeen" zijn.');
    }
    uit.slug = slug;
  }
  if (isNieuw || body.kind !== undefined) {
    const kind = toSlug(body.kind || STANDAARD) || STANDAARD;
    if (!isValidKind(kind)) throw new BookingLinkError('De soort mag enkel kleine letters, cijfers en streepjes bevatten.');
    uit.kind = kind;
  }
  if (isNieuw || body.scheduling_url !== undefined) {
    const url = String(body.scheduling_url || '').trim();
    if (!/^https:\/\/calendly\.com\/[^\s"'<>]+$/.test(url)) {
      throw new BookingLinkError('Kies een afspraaktype uit Calendly (een link die met https://calendly.com/ begint).');
    }
    uit.scheduling_url = url;
  }
  if (body.label !== undefined) uit.label = String(body.label || '').trim().slice(0, 120);
  if (body.tab_title !== undefined) uit.tab_title = String(body.tab_title || '').trim().slice(0, 80);
  if (body.intro !== undefined) uit.intro = String(body.intro || '').trim().slice(0, 300);
  if (body.points !== undefined) uit.points = normalizePoints(body.points);
  if (body.show_photo !== undefined) uit.show_photo = body.show_photo !== false;
  if (body.calendly_description !== undefined) {
    uit.calendly_description = String(body.calendly_description || '').trim().slice(0, 600);
  }
  if (body.calendly_event_type_uri !== undefined) uit.calendly_event_type_uri = String(body.calendly_event_type_uri || '').slice(0, 300);
  if (body.calendly_event_type_name !== undefined) uit.calendly_event_type_name = String(body.calendly_event_type_name || '').slice(0, 200);
  if (body.duration !== undefined) uit.duration = Number.isInteger(body.duration) ? body.duration : null;
  if (body.is_default !== undefined) uit.is_default = body.is_default === true;
  if (body.is_active !== undefined) uit.is_active = body.is_active !== false;
  if (body.site !== undefined) {
    const site = String(body.site || '').trim();
    if (site && !listSites(env).some((s) => s.key === site)) {
      throw new BookingLinkError(`Onbekende site: ${site}`);
    }
    uit.site = site;
  }
  return uit;
}

/**
 * De vinkjes: een lijst teksten, of een tekst met een vinkje per regel (zo
 * komt het uit het tekstvak). Hoogstens zes: meer leest niet meer als een
 * lijstje voordelen maar als een contract.
 */
export function normalizePoints(ruw) {
  const lijst = Array.isArray(ruw) ? ruw : String(ruw || '').split(/\r?\n/);
  return lijst
    .map((t) => String(t || '').replace(/\s+/g, ' ').trim().slice(0, 120))
    .filter(Boolean)
    .slice(0, MAX_POINTS);
}

function vertaalDbFout(error) {
  const msg = String(error?.message || '');
  if (/booking_links_slug_key|duplicate key.*slug/i.test(msg)) {
    return new BookingLinkError('Die sleutel is al in gebruik. Eén afspraaklink werkt op elke site; voor een andere site hoef je geen tweede te maken -- kopieer het adres van die site bij de bestaande link.', 409);
  }
  if (/booking_links_one_default_idx/.test(msg)) {
    return new BookingLinkError('Er staat al een andere standaardlink voor deze persoon.', 409);
  }
  return new Error(`Afspraaklink bewaren mislukt: ${msg}`);
}

/**
 * Standaard zetten ZONDER een tweede standaard: de vorige eerst uitzetten.
 * De unieke index zou het anders weigeren, en dan moet iemand eerst de oude
 * uitvinken voor hij de nieuwe kan aanvinken -- zonder te weten waarom.
 */
async function wisAndereStandaard(env, odooUserId, behalveId = null) {
  let q = db(env).from(TABEL).update({ is_default: false, updated_at: new Date().toISOString() })
    .eq('odoo_user_id', odooUserId).eq('is_default', true);
  if (behalveId) q = q.neq('id', behalveId);
  const { error } = await q;
  if (error) throw new Error(`Standaardlink omzetten mislukt: ${error.message}`);
}

export async function createLink(env, rij) {
  if (rij.is_default) await wisAndereStandaard(env, rij.odoo_user_id);
  const { data, error } = await db(env).from(TABEL).insert(rij).select('*').single();
  if (error) throw vertaalDbFout(error);
  return data;
}

export async function updateLink(env, id, bestaande, wijziging) {
  if (wijziging.is_default) await wisAndereStandaard(env, bestaande.odoo_user_id, id);
  const { data, error } = await db(env).from(TABEL)
    .update({ ...wijziging, updated_at: new Date().toISOString() })
    .eq('id', id).select('*').single();
  if (error) throw vertaalDbFout(error);
  return data;
}

export async function deleteLink(env, id) {
  const { error } = await db(env).from(TABEL).delete().eq('id', id);
  if (error) throw new Error(`Afspraaklink verwijderen mislukt: ${error.message}`);
}

// ─── Opzoeken voor de placeholder ────────────────────────────────────────────

/**
 * De link van een eigenaar voor een soort.
 *
 * Volgorde: exact die soort → de standaardlink van die persoon → zijn enige
 * actieve link. Null als die persoon niets heeft; de aanroeper valt dan terug
 * op de algemene agenda. "demo" vragen en "kennismaking" krijgen omdat dat de
 * standaard is, is bewust: een gesprek met de juiste persoon is beter dan een
 * gesprek met iemand anders over het juiste onderwerp.
 */
export async function findLinkForOwner(env, odooUserId, kind) {
  const { data, error } = await db(env).from(TABEL).select('*')
    .eq('odoo_user_id', odooUserId).eq('is_active', true);
  if (error) throw new Error(`Afspraaklinks lezen mislukt: ${error.message}`);
  const rijen = data || [];
  if (!rijen.length) return null;

  if (kind && kind !== STANDAARD) {
    const exact = rijen.filter((r) => r.kind === kind);
    if (exact.length) return exact.find((r) => r.is_default) || exact[0];
  }
  return rijen.find((r) => r.is_default) || (rijen.length === 1 ? rijen[0] : null)
    || rijen.find((r) => r.kind === STANDAARD) || null;
}

// ─── Avatar van de eigenaar ──────────────────────────────────────────────────

/** Het soort beeld uit de eerste bytes van de base64 -- Odoo geeft geen mimetype mee. */
function mimeUitBase64(b64) {
  if (b64.startsWith('iVBOR')) return 'image/png';
  if (b64.startsWith('/9j/')) return 'image/jpeg';
  if (b64.startsWith('UklGR')) return 'image/webp';
  if (b64.startsWith('R0lGOD')) return 'image/gif';
  if (b64.startsWith('PHN2Z') || b64.startsWith('PD94')) return 'image/svg+xml';
  return null;
}

const MAX_FOTO_B64 = 200 * 1024;

/**
 * De avatar van een Odoo-gebruiker als data-URI, of null.
 *
 * `avatar_256` en niet `image_256`: die laatste is leeg voor wie nooit een foto
 * zette, `avatar_256` geeft dan de initialen-avatar van Odoo -- iets tonen is
 * hier beter dan een gat in de zijkolom. Als data-URI en niet als eigen
 * beeldroute: dan kan het in dezelfde JSON mee die WordPress al ophaalt, en
 * hoeft er geen publieke route zonder sitesleutel bij te komen (een <img src>
 * kan geen sleutel meesturen).
 *
 * Best-effort: een mislukte opzoeking geeft null, nooit een fout -- zonder
 * foto moet het venster gewoon opengaan.
 */
export async function fetchOwnerAvatar(env, odooUserId) {
  if (!Number.isInteger(odooUserId) || odooUserId <= 0) return null;
  try {
    const rijen = await searchRead(env, {
      model: 'res.users',
      domain: [['id', '=', odooUserId]],
      fields: ['avatar_256'],
      limit: 1,
    });
    const b64 = String(rijen[0]?.avatar_256 || '').replace(/\s+/g, '');
    if (!b64 || b64.length > MAX_FOTO_B64 || !/^[A-Za-z0-9+/]+=*$/.test(b64)) return null;
    const mime = mimeUitBase64(b64);
    return mime ? `data:${mime};base64,${b64}` : null;
  } catch (err) {
    console.warn('[booking-links] avatar ophalen mislukt:', err.message);
    return null;
  }
}

/**
 * De vorm die de WordPress-plugin ziet. Mager, zelfde regel als
 * toPublicFormListItem(): de sitesleutel is niet persoonsgebonden. Geen
 * Odoo-id, geen OM-id, geen eventtype-URI.
 *
 * `intro` valt terug op de omschrijving van het afspraaktype in Calendly; is
 * die ook leeg, dan blijft de tekst van de opstelling in WordPress staan.
 * `photo` komt van de aanroeper (fetchOwnerAvatar), want daarvoor is een
 * Odoo-aanroep nodig en deze functie is puur.
 */
export function toPublicBookingLink(link, { photo = null } = {}) {
  const voornaam = String(link.odoo_user_name || '').trim().split(/\s+/)[0] || '';
  return {
    slug: link.slug,
    url: link.scheduling_url,
    name: link.odoo_user_name || '',
    first_name: voornaam,
    kind: link.kind,
    label: link.label || '',
    tab_title: link.tab_title || '',
    intro: String(link.intro || '').trim() || String(link.calendly_description || '').trim(),
    points: normalizePoints(link.points),
    photo: link.show_photo === false ? null : (photo || null),
    duration: Number.isInteger(link.duration) ? link.duration : null,
  };
}
