/**
 * Medewerkers in Odoo -- de ENIGE plek waar de OM een collega opzoekt
 * (hr.employee): voor een handtekening, een afzenderkaart, een contactpersoon
 * op een offerte, een nieuwsbrief. Elke module gebruikt dit; niemand bouwt nog
 * een eigen domein op hr.employee om "wie is dit" te weten.
 *
 * Hoe een OM-gebruiker (of een Odoo-gebruiker, of een e-mailadres) een
 * medewerker wordt, in deze volgorde:
 *   1. de gekoppelde Odoo-gebruiker (users.odoo_uid -> hr.employee.user_id)
 *   2. het werkadres (hr.employee.work_email)
 *   3. de login van de gekoppelde Odoo-gebruiker (hr.employee.user_id.login)
 *   4. hetzelfde adres op het hoofddomein: wie met rob@openvme.be inlogt, staat
 *      in Odoo als rob@mymmo.com
 * Hoofdletters tellen nergens.
 *
 * Wat je terugkrijgt is een PROFIEL:
 *   { employee_id, user_id, naam, voornaam, functie, email, foto_url }
 * - `naam`/`voornaam` komen uit Odoo. Een e-mailadres is NOOIT een naam: zonder
 *   medewerker valt `naamVoor()` terug op de naam in de OM, en anders op het
 *   stuk voor de @ met een hoofdletter ("dirk@mymmo.com" -> "Dirk").
 * - `foto_url` is de publieke pasfoto (`x_public_image_attachment_id`) als
 *   absolute URL op de Odoo-host: die werkt in een mail, waar een relatieve URL
 *   of een data-URI het niet doet. Geen publieke foto = ''.
 * - De foto als BYTES (voor een pdf) haal je apart met `fotoAlsDataUri()`:
 *   die is groot en is enkel nodig waar geen URL kan.
 *
 * Alles hier faalt ZACHT: een storing in Odoo geeft een leeg profiel, nooit een
 * fout. Zonder foto of functie valt dat stukje gewoon weg.
 */

import { searchRead } from './odoo.js';

export const HOOFDDOMEIN = 'mymmo.com';

const VELDEN = ['id', 'name', 'job_title', 'work_email', 'user_id', 'x_public_image_attachment_id'];
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function m2o(waarde) {
  if (Array.isArray(waarde)) return Number.isInteger(waarde[0]) ? waarde[0] : null;
  return Number.isInteger(waarde) ? waarde : null;
}

const klein = (s) => String(s || '').trim().toLowerCase();

/** Een e-mailadres en zijn variant op het hoofddomein. */
function adressen(email) {
  const e = klein(email);
  if (!EMAIL_RE.test(e)) return [];
  const opHoofddomein = `${e.split('@')[0]}@${HOOFDDOMEIN}`;
  return opHoofddomein === e ? [e] : [e, opHoofddomein];
}

export function odooOrigin(env) {
  return String(env?.ODOO_WEB_ORIGIN || 'https://mymmo.odoo.com').replace(/\/+$/, '');
}

/** De voornaam uit een volledige naam. */
export function voornaamVan(naam) {
  return String(naam || '').trim().split(/\s+/)[0] || '';
}

/** Een e-mailadres als naam tonen we nooit: "dirk.peeters@x.be" -> "Dirk". */
export function naamUitEmail(email) {
  const deel = klein(email).split('@')[0].split(/[._-]+/)[0] || '';
  return deel ? deel.charAt(0).toUpperCase() + deel.slice(1) : '';
}

/**
 * De naam waaronder iemand verschijnt: uit Odoo, anders uit de OM (tenzij dat
 * een e-mailadres is), anders afgeleid uit het e-mailadres.
 */
export function naamVoor(profiel, gebruiker = {}) {
  if (profiel?.naam) return profiel.naam;
  const omNaam = String(gebruiker.full_name || gebruiker.name || '').trim();
  if (omNaam && !omNaam.includes('@')) return omNaam;
  return naamUitEmail(gebruiker.email || omNaam);
}

function profielUitRij(env, r) {
  const naam = String(r.name || '').trim();
  const foto = m2o(r.x_public_image_attachment_id);
  return {
    employee_id: r.id,
    user_id: m2o(r.user_id),
    naam,
    voornaam: voornaamVan(naam),
    functie: String(r.job_title || '').trim(),
    email: String(r.work_email || '').trim(),
    foto_url: foto ? `${odooOrigin(env)}/web/image/${foto}` : '',
  };
}

/**
 * Medewerkers zoeken op Odoo-gebruiker, e-mailadres of eigen id, in één
 * aanroep. Geeft de ruwe profielen terug; `koppel()` legt ze bij wie ze horen.
 */
async function zoek(env, { userIds = [], emails = [], employeeIds = [] }) {
  const delen = [];
  const uids = [...new Set(userIds.filter(Number.isInteger))];
  const eids = [...new Set(employeeIds.filter(Number.isInteger))];
  const mails = [...new Set(emails.flatMap(adressen))];
  if (uids.length) delen.push(['user_id', 'in', uids]);
  if (eids.length) delen.push(['id', 'in', eids]);
  // `=ilike` per adres: hoofdletters in Odoo mogen geen gemiste match geven.
  for (const m of mails) {
    delen.push(['work_email', '=ilike', m]);
    delen.push(['user_id.login', '=ilike', m]);
  }
  if (!delen.length) return [];
  const domain = [['active', '=', true]];
  for (let i = 1; i < delen.length; i++) domain.push('|');
  domain.push(...delen);
  try {
    const rijen = await searchRead(env, { model: 'hr.employee', domain, fields: VELDEN, limit: 500 });
    return (Array.isArray(rijen) ? rijen : []).map((r) => profielUitRij(env, r));
  } catch (error) {
    console.warn('[medewerkers] opzoeken in Odoo mislukt:', error?.message);
    return [];
  }
}

/**
 * Puur: wie hoort bij welk profiel. `logins` = { odooUserId: login } voor de
 * stap "login van de gekoppelde gebruiker" (die staat niet op hr.employee zelf).
 */
export function koppel(gebruikers, profielen, logins = {}) {
  const uit = {};
  for (const g of gebruikers) {
    const uid = Number.isInteger(g.odoo_uid) && g.odoo_uid > 0 ? g.odoo_uid : null;
    const mails = adressen(g.email);
    const p = (uid && profielen.find((x) => x.user_id === uid))
      || profielen.find((x) => mails.includes(klein(x.email)))
      || profielen.find((x) => x.user_id && mails.includes(klein(logins[x.user_id])))
      || null;
    uit[g.id] = p;
  }
  return uit;
}

async function loginsVan(env, userIds) {
  const ids = [...new Set(userIds.filter(Number.isInteger))];
  if (!ids.length) return {};
  try {
    const rijen = await searchRead(env, { model: 'res.users', domain: [['id', 'in', ids]], fields: ['id', 'login'], limit: ids.length });
    return Object.fromEntries((rijen || []).map((r) => [r.id, r.login]));
  } catch {
    return {};
  }
}

/**
 * Het profiel van elke OM-gebruiker ({id, email, odoo_uid, full_name}),
 * als { [omUserId]: profiel | null }.
 */
export async function medewerkersVoorGebruikers(env, gebruikers) {
  const lijst = (gebruikers || []).filter((g) => g && g.id);
  if (!lijst.length) return {};
  const profielen = await zoek(env, {
    userIds: lijst.map((g) => g.odoo_uid),
    emails: lijst.map((g) => g.email),
  });
  const logins = await loginsVan(env, profielen.map((p) => p.user_id));
  return koppel(lijst, profielen, logins);
}

/** Eén OM-gebruiker (of iets met `email` en eventueel `odoo_uid`). */
export async function medewerkerVoorGebruiker(env, gebruiker) {
  if (!gebruiker) return null;
  const g = { id: gebruiker.id || 'x', email: gebruiker.email, odoo_uid: gebruiker.odoo_uid };
  return (await medewerkersVoorGebruikers(env, [g]))[g.id] || null;
}

/** Het profiel bij een Odoo-gebruiker (res.users-id). */
export async function medewerkerVoorOdooGebruiker(env, odooUserId) {
  if (!Number.isInteger(odooUserId)) return null;
  const [p] = await zoek(env, { userIds: [odooUserId] });
  return p || null;
}

/** Het profiel bij een hr.employee-id. */
export async function medewerkerOpId(env, employeeId) {
  const id = Number(employeeId);
  if (!Number.isInteger(id) || id <= 0) return null;
  const [p] = await zoek(env, { employeeIds: [id] });
  return p || null;
}

/** De pasfoto als data-URI (voor een pdf), of null. */
export async function fotoAlsDataUri(env, employeeId, maat = 512) {
  const id = Number(employeeId);
  const veld = `image_${[128, 256, 512, 1024].includes(maat) ? maat : 512}`;
  if (!Number.isInteger(id) || id <= 0) return null;
  try {
    const rijen = await searchRead(env, { model: 'hr.employee', domain: [['id', '=', id]], fields: [veld], limit: 1 });
    const b64 = String(rijen?.[0]?.[veld] || '');
    if (!b64) return null;
    const mime = b64.startsWith('iVBOR') ? 'image/png' : b64.startsWith('R0lGOD') ? 'image/gif'
      : b64.startsWith('UklGR') ? 'image/webp' : b64.startsWith('PHN2Z') || b64.startsWith('PD94') ? 'image/svg+xml' : 'image/jpeg';
    return `data:${mime};base64,${b64}`;
  } catch {
    return null;
  }
}
