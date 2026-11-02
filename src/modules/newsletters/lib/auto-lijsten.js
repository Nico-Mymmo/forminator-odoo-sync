/**
 * Nieuwsbrieven -- automatische mailinglijsten (2026-11-02).
 *
 * Een automatische lijst is een gewone mailing.list in Odoo die de OM vult en
 * elke dag gelijkzet: de contactpersonen (res.partner, geen bedrijf, actief,
 * met e-mailadres) onder een BEDRIJF waarvan x_studio_company_status een van
 * de gekozen waarden heeft. Eerste lijst: "Freemium Gebruikers" (Free Trial +
 * Inactive). De instelling staat in D1 om-core (nb_auto_lijsten), niet in Odoo.
 *
 * Afspraken die bewust zo zijn:
 *   - Wie zich UITSCHREEF (opt_out op de mailing.subscription) blijft op de
 *     lijst staan, als uitgeschreven. Haalden we hem eraf, dan zou de volgende
 *     ronde hem opnieuw toevoegen zonder opt_out: een uitschrijving die
 *     stilletjes vervalt.
 *   - Een adres staat er EEN keer op (herleid: kleine letters, zonder spaties).
 *     Bestaat er al een mailing.contact met dat adres, dan wordt die gebruikt.
 *   - Een ronde die BEL ANDERS uitkomt dan de lijst nu is (niemand meer, of meer
 *     dan de helft eraf), doet niets en zegt waarom. Een fout in de selectie mag
 *     een lijst niet leegmaken. "Toch bijwerken" in het scherm forceert.
 *   - Het blacklisten en de bounces blijven van Odoo.
 */

import { getCoreDb } from '../../../lib/core-db.js';
import { searchRead, create, write, batchCreate } from '../../../lib/odoo.js';
import { LOG_PREFIX, isEmail } from './constants.js';
import { NewsletterError } from './store.js';

const TABEL = 'nb_auto_lijsten';
const PAGINA = 2000;
const STUK = 200;
/** Meer dan dit deel eraf (en minstens MIN_WEG adressen) = eerst nakijken. */
const MAX_WEG_DEEL = 0.5;
const MIN_WEG = 25;

// ─── Opslag ────────────────────────────────────────────────────────────────

export async function listAutoLijsten(env) {
  const { data, error } = await getCoreDb(env).from(TABEL).select('*').order('naam', { ascending: true });
  if (error) throw new NewsletterError('Automatische lijsten niet gelezen: ' + error.message, 500);
  return data || [];
}

async function getAutoLijst(env, id) {
  const { data, error } = await getCoreDb(env).from(TABEL).select('*').eq('id', id).maybeSingle();
  if (error) throw new NewsletterError('Lijst niet gelezen: ' + error.message, 500);
  if (!data) throw new NewsletterError('Die automatische lijst bestaat niet.', 404);
  return data;
}

function slug(naam) {
  return String(naam).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'lijst';
}

async function normaliseer(env, invoer, bestaand = null) {
  const naam = invoer.naam !== undefined ? String(invoer.naam || '').trim() : bestaand?.naam;
  if (!naam) throw new NewsletterError('Geef de lijst een naam.');
  if (naam.length > 120) throw new NewsletterError('De naam is te lang.');
  let statussen = bestaand?.statussen || [];
  if (invoer.statussen !== undefined) {
    const toegelaten = (await companyStatussen(env)).map((s) => s.value);
    statussen = [...new Set((Array.isArray(invoer.statussen) ? invoer.statussen : []).map(String))];
    const onbekend = statussen.filter((s) => !toegelaten.includes(s));
    if (onbekend.length) throw new NewsletterError(`Onbekende bedrijfsstatus: ${onbekend.join(', ')}.`);
  }
  if (!statussen.length) throw new NewsletterError('Kies minstens een bedrijfsstatus.');
  const actief = invoer.actief !== undefined ? Boolean(invoer.actief) : (bestaand ? bestaand.actief : true);
  return { naam, statussen, actief };
}

export async function maakAutoLijst(env, invoer, doorNaam) {
  const rij = await normaliseer(env, invoer);
  const bestaand = await listAutoLijsten(env);
  let id = slug(rij.naam);
  if (bestaand.some((l) => l.id === id)) id = `${id}-${Date.now().toString(36)}`;
  const { error } = await getCoreDb(env).from(TABEL).insert({ id, ...rij, door_naam: doorNaam || null });
  if (error) throw new NewsletterError('Bewaren mislukt: ' + error.message, 500);
  return getAutoLijst(env, id);
}

export async function bewaarAutoLijst(env, id, invoer, doorNaam) {
  const bestaand = await getAutoLijst(env, id);
  const rij = await normaliseer(env, invoer, bestaand);
  const { error } = await getCoreDb(env).from(TABEL).update({ ...rij, door_naam: doorNaam || null }).eq('id', id);
  if (error) throw new NewsletterError('Bewaren mislukt: ' + error.message, 500);
  // Een andere naam: ook de lijst in Odoo hernoemen, anders zoekt niemand ze terug.
  if (bestaand.odoo_list_id && rij.naam !== bestaand.naam) {
    try {
      await write(env, { model: 'mailing.list', ids: [bestaand.odoo_list_id], values: { name: rij.naam } });
    } catch (err) {
      console.warn(`${LOG_PREFIX} lijst ${bestaand.odoo_list_id} niet hernoemd:`, err?.message);
    }
  }
  return getAutoLijst(env, id);
}

/** Enkel de instelling weg; de lijst in Odoo blijft staan zoals ze is. */
export async function verwijderAutoLijst(env, id) {
  await getAutoLijst(env, id);
  const { error } = await getCoreDb(env).from(TABEL).delete().eq('id', id);
  if (error) throw new NewsletterError('Verwijderen mislukt: ' + error.message, 500);
}

// ─── Odoo ──────────────────────────────────────────────────────────────────

let statusMemo = { at: 0, lijst: null };

/** De waarden van x_studio_company_status, uit Odoo (geen kopie in de code). */
export async function companyStatussen(env) {
  if (statusMemo.lijst && Date.now() - statusMemo.at < 10 * 60 * 1000) return statusMemo.lijst;
  const rijen = await searchRead(env, {
    model: 'ir.model.fields.selection',
    domain: [['field_id.model', '=', 'res.partner'], ['field_id.name', '=', 'x_studio_company_status']],
    fields: ['value', 'name', 'sequence'], order: 'sequence asc, id asc', limit: 50,
  });
  statusMemo = { at: Date.now(), lijst: (rijen || []).map((r) => ({ value: r.value, label: r.name })) };
  return statusMemo.lijst;
}

async function alles(env, opties) {
  const uit = [];
  for (let offset = 0; ; offset += PAGINA) {
    const rijen = await searchRead(env, { ...opties, limit: PAGINA, offset, order: 'id asc' });
    uit.push(...(rijen || []));
    if (!rijen || rijen.length < PAGINA) return uit;
  }
}

function herleid(email) {
  const a = String(email || '').trim().toLowerCase();
  return isEmail(a) ? a : null;
}

/** Wie er volgens de regel op hoort: Map(adres -> { naam, bedrijf }). */
async function gewenst(env, statussen) {
  const partners = await alles(env, {
    model: 'res.partner',
    domain: [
      ['is_company', '=', false], ['active', '=', true], ['email', '!=', false],
      ['parent_id.is_company', '=', true], ['parent_id.x_studio_company_status', 'in', statussen],
    ],
    fields: ['name', 'email', 'parent_id'],
  });
  const uit = new Map();
  for (const p of partners) {
    // Een veld met twee adressen ("a@x.be; b@y.be") telt als het eerste.
    const adres = herleid(String(p.email).split(/[;,\s]+/).find(Boolean));
    if (!adres || uit.has(adres)) continue;
    uit.set(adres, { naam: p.name || adres.split('@')[0], bedrijf: Array.isArray(p.parent_id) ? p.parent_id[1] : '' });
  }
  return uit;
}

async function zorgVoorLijst(env, regel) {
  if (regel.odoo_list_id) {
    const l = (await searchRead(env, {
      model: 'mailing.list', domain: [['id', '=', regel.odoo_list_id]], fields: ['id', 'active'], limit: 1, context: { active_test: false },
    }))?.[0];
    if (l) {
      if (!l.active) await write(env, { model: 'mailing.list', ids: [l.id], values: { active: true } });
      return l.id;
    }
  }
  let l = (await searchRead(env, {
    model: 'mailing.list', domain: [['name', '=', regel.naam]], fields: ['id'], limit: 1, context: { active_test: false },
  }))?.[0];
  const id = l ? l.id : Number(await create(env, { model: 'mailing.list', values: { name: regel.naam, is_public: false } }));
  await getCoreDb(env).from(TABEL).update({ odoo_list_id: id }).eq('id', regel.id);
  return id;
}

/**
 * Een ronde voor een lijst: toevoegen wie er hoort, weghalen wie er niet meer
 * hoort (behalve uitgeschreven). Geeft { toegevoegd, weggehaald, ... }.
 */
export async function werkAutoLijstBij(env, id, { forceer = false } = {}) {
  const regel = await getAutoLijst(env, id);
  const start = Date.now();
  let resultaat;
  try {
    const listId = await zorgVoorLijst(env, regel);
    const wil = await gewenst(env, regel.statussen || []);

    // Wie er nu op staat, via de inschrijvingen (daar staat opt_out).
    const subs = await alles(env, {
      model: 'mailing.subscription', domain: [['list_id', '=', listId]], fields: ['contact_id', 'opt_out'],
    });
    const contactIds = [...new Set(subs.map((s) => (Array.isArray(s.contact_id) ? s.contact_id[0] : null)).filter(Boolean))];
    const contacten = [];
    for (let i = 0; i < contactIds.length; i += PAGINA) {
      contacten.push(...(await searchRead(env, {
        model: 'mailing.contact', domain: [['id', 'in', contactIds.slice(i, i + PAGINA)]], fields: ['id', 'email_normalized'], limit: PAGINA,
      }) || []));
    }
    const adresVan = new Map(contacten.map((c) => [c.id, String(c.email_normalized || '').toLowerCase()]));
    const uitgeschreven = new Set(subs.filter((s) => s.opt_out).map((s) => s.contact_id?.[0]));
    const opLijst = new Set([...adresVan.values()].filter(Boolean));

    const weg = contacten.filter((c) => !uitgeschreven.has(c.id) && !wil.has(adresVan.get(c.id))).map((c) => c.id);
    const erbij = [...wil.keys()].filter((a) => !opLijst.has(a));

    const leden = contacten.length;
    if (!forceer && leden > 0 && (wil.size === 0 || (weg.length >= MIN_WEG && weg.length > leden * MAX_WEG_DEEL))) {
      resultaat = {
        ok: false, gestopt: true, op_lijst: leden, hoort: wil.size, zou_weg: weg.length, zou_erbij: erbij.length,
        fout: `Er zouden ${weg.length} van de ${leden} adressen af gaan. Niets gewijzigd: kijk de bedrijfsstatussen na, of kies "Toch bijwerken".`,
      };
    } else {
      // Bestaande mailing.contacts hergebruiken, de rest aanmaken.
      const bestaand = new Map();
      for (let i = 0; i < erbij.length; i += STUK) {
        const rijen = await searchRead(env, {
          model: 'mailing.contact', domain: [['email_normalized', 'in', erbij.slice(i, i + STUK)]], fields: ['id', 'email_normalized'], limit: STUK * 3, order: 'id asc',
        });
        for (const r of rijen || []) {
          const a = String(r.email_normalized || '').toLowerCase();
          if (!bestaand.has(a)) bestaand.set(a, r.id);
        }
      }
      const koppel = erbij.filter((a) => bestaand.has(a)).map((a) => bestaand.get(a));
      for (let i = 0; i < koppel.length; i += STUK) {
        await write(env, { model: 'mailing.contact', ids: koppel.slice(i, i + STUK), values: { list_ids: [[4, listId]] } });
      }
      const nieuw = erbij.filter((a) => !bestaand.has(a)).map((a) => ({
        name: wil.get(a).naam, email: a, company_name: wil.get(a).bedrijf || false, list_ids: [[4, listId]],
      }));
      for (let i = 0; i < nieuw.length; i += STUK) {
        await batchCreate(env, { model: 'mailing.contact', valuesArray: nieuw.slice(i, i + STUK) });
      }
      for (let i = 0; i < weg.length; i += STUK) {
        await write(env, { model: 'mailing.contact', ids: weg.slice(i, i + STUK), values: { list_ids: [[3, listId]] } });
      }
      resultaat = {
        ok: true, toegevoegd: erbij.length, weggehaald: weg.length, uitgeschreven: uitgeschreven.size,
        op_lijst: leden + erbij.length - weg.length, odoo_list_id: listId, geforceerd: Boolean(forceer),
      };
    }
  } catch (err) {
    console.error(`${LOG_PREFIX} automatische lijst ${id} mislukt:`, err?.message);
    resultaat = { ok: false, fout: err?.message || String(err) };
  }
  resultaat.duur_ms = Date.now() - start;
  await getCoreDb(env).from(TABEL).update({ laatste_ronde_at: new Date().toISOString(), laatste_resultaat: resultaat }).eq('id', id);
  return resultaat;
}

/** Elke dag een keer (cron.js), voor elke actieve lijst. */
export async function werkAutoLijstenBij(env) {
  for (const regel of await listAutoLijsten(env)) {
    if (!regel.actief) continue;
    const r = await werkAutoLijstBij(env, regel.id);
    console.log(`${LOG_PREFIX} automatische lijst ${regel.naam}:`, JSON.stringify(r));
  }
}
