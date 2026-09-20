/**
 * Koppelingen — bijlagen bij de `send_mail`-stap.
 *
 * DE STAP BEWAART EEN VERWIJZING, NOOIT DE INHOUD
 * -----------------------------------------------
 * `fs_v2_targets.mail_attachments` is een lijst van `{key, name}`, waarbij
 * `key` een sleutel in de Asset Manager (R2) is. Geen bytes, geen etag, geen
 * Odoo-attachment-id. Bij elke verzending worden de bytes VERS opgehaald.
 *
 * Dat is de hele bedoeling: vervang je de brochure in de Asset Manager (zelfde
 * bestandsnaam, `overwrite=true`), dan dragen de volgende mails vanzelf de
 * nieuwe versie. Er is niets in de koppeling dat mee bijgewerkt moet worden,
 * en dus ook niets dat vergeten kan worden. Zou de stap het attachment-id
 * bewaren, dan bleef er stil een verouderde PDF vertrekken -- zonder fout,
 * zonder melding, en pas op te merken door een ontvanger.
 *
 * WAAROM ER TOCH EEN CACHE IS
 * ---------------------------
 * Odoo wil de inhoud zelf hebben: een `mail.mail` kan niet naar R2 wijzen,
 * hij heeft een `ir.attachment` met base64 nodig. Zonder cache betekent dat
 * een volledige kopie van dezelfde PDF per indiening. Bij een paar honderd
 * leads is dat honderden megabytes voor één bestand.
 *
 * De cachesleutel is `(r2_key, etag)` -- niet `r2_key` alleen. R2's etag
 * verandert zodra de bytes veranderen, dus een vervangen bestand krijgt
 * automatisch een nieuw `ir.attachment` en de oude rij blijft bestaan voor de
 * mails die er al naar wijzen. Precies daardoor is "later de inhoud wijzigen"
 * geen aparte handeling.
 *
 * EEN ONTBREKENDE BIJLAGE IS EEN FOUT, GEEN WAARSCHUWING
 * ------------------------------------------------------
 * Is het bestand uit de Asset Manager verdwenen, dan gooit dit bestand. De
 * mail wordt dan NIET klaargezet en de stap komt als `mail_failed` in het
 * indieningsspoor. Doorsturen zonder bijlage is de slechtere uitkomst: een
 * mail die "in bijlage vind je..." zegt en niets meestuurt, is erger dan een
 * mail die niet vertrok en die je na het terugzetten van het bestand kan
 * replayen.
 */

import { searchRead, create } from '../../lib/odoo.js';
import { getSupabaseClient } from '../../lib/database.js';
import { isWithinAssetNamespace } from '../asset-manager/lib/namespace.js';

/**
 * Hoeveel bijlagen per mail. Geen technische grens -- een mail met zes
 * bijlagen is een mail die een downloadpagina had moeten zijn.
 */
export const MAX_MAIL_ATTACHMENTS = 5;

/**
 * Totale ruwe grootte per mail. Postmark weigert een bericht boven 10 MB, en
 * dat is NA base64 (≈ +33%) en inclusief de tekst. 7 MB ruw laat daar marge
 * onder. De grens wordt hier afgedwongen en niet alleen in de UI: een bestand
 * kan ná het instellen van de stap nog groeien.
 */
export const MAX_MAIL_ATTACHMENT_BYTES = 7 * 1024 * 1024;

export class MailAttachmentError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MailAttachmentError';
  }
}

// ─── Vorm ────────────────────────────────────────────────────────────────────

/**
 * De naam die de ontvanger op de bijlage ziet.
 *
 * Standaard de bestandsnaam uit de sleutel. Een eigen naam mag, want de naam
 * in de Asset Manager is vaak een werknaam ("brochure-v3-def.pdf") en de
 * ontvanger hoort iets leesbaars te krijgen.
 *
 * @param {string} [gewenst]
 * @param {string} key
 * @returns {string}
 */
export function attachmentDisplayName(gewenst, key) {
  const uitKey = String(key || '').split('/').pop() || 'bijlage';
  const ruw = String(gewenst == null ? '' : gewenst).trim();
  const basis = ruw === '' ? uitKey : ruw;
  // Geen mappen, geen regeleindes, geen aanhalingstekens: die belanden
  // ongefilterd in de Content-Disposition-header van de mail.
  const schoon = basis
    .split(/[\\/]/).pop()
    .replace(/[\x00-\x1f\x7f"\\]/g, '')
    .trim();
  return schoon === '' ? uitKey : schoon.slice(0, 120);
}

/**
 * De opgeslagen vorm valideren en opschonen.
 *
 * Puur: geen env, geen netwerk. Gebruikt door `validation.js` bij het opslaan
 * van een stap én door de stap zelf bij het versturen -- wat er in de database
 * staat is niet per definitie wat de validatie ooit doorliet (handmatige
 * wijziging, oudere versie).
 *
 * @param {*} waarde
 * @returns {Array<{key: string, name: string}>|null}
 */
export function normalizeMailAttachments(waarde) {
  if (waarde === undefined || waarde === null || waarde === '') return null;
  if (!Array.isArray(waarde)) {
    throw new MailAttachmentError('mail_attachments moet een lijst zijn.');
  }
  if (waarde.length > MAX_MAIL_ATTACHMENTS) {
    throw new MailAttachmentError(
      `Maximaal ${MAX_MAIL_ATTACHMENTS} bijlagen per mail. Meer hoort een link naar een pagina te zijn.`
    );
  }

  const uit = [];
  const gezien = new Set();
  for (const rij of waarde) {
    const key = String((rij && rij.key) || '').trim();
    if (key === '') {
      throw new MailAttachmentError('Een bijlage zonder bestandssleutel. Kies het bestand opnieuw.');
    }
    if (key.endsWith('/')) {
      throw new MailAttachmentError(`"${key}" is een map, geen bestand.`);
    }
    if (!isWithinAssetNamespace(key)) {
      throw new MailAttachmentError(
        `"${key}" ligt buiten de Asset Manager. Een bijlage moet een bestand uit de Asset Manager zijn.`
      );
    }
    if (gezien.has(key)) continue;   // twee keer hetzelfde bestand is geen fout, wel zinloos
    gezien.add(key);
    uit.push({ key, name: attachmentDisplayName(rij && rij.name, key) });
  }
  return uit.length > 0 ? uit : null;
}

/**
 * `mail_attachments` splitsen in de twee itemvormen VOOR ze de bestaande
 * Asset-Manager-code bereiken: `{ key, name }` (statisch R2-bestand, gaat naar
 * `normalizeMailAttachments`/de R2-tak hieronder, ONGEWIJZIGD) en
 * `{ type: 'pdf_step', targetId, name }` (de pdf die een generate_pdf-stap met
 * dat target-id in dezelfde inzending maakt — dynamisch, geen R2-sleutel).
 *
 * MAX_MAIL_ATTACHMENTS geldt voor beide soorten SAMEN.
 *
 * @param {*} waarde
 * @returns {{assets: Array<Object>|null, pdfSteps: Array<{type: 'pdf_step', targetId: string, name: string}>}}
 */
export function splitMailAttachments(waarde) {
  if (waarde === undefined || waarde === null || waarde === '') return { assets: null, pdfSteps: [] };
  if (!Array.isArray(waarde)) {
    throw new MailAttachmentError('mail_attachments moet een lijst zijn.');
  }
  if (waarde.length > MAX_MAIL_ATTACHMENTS) {
    throw new MailAttachmentError(
      `Maximaal ${MAX_MAIL_ATTACHMENTS} bijlagen per mail. Meer hoort een link naar een pagina te zijn.`
    );
  }

  const assets = [];
  const pdfSteps = [];
  for (const rij of waarde) {
    if (rij && rij.type === 'pdf_step') {
      const targetId = String(rij.targetId || '').trim();
      if (targetId === '') {
        throw new MailAttachmentError('Een pdf-bijlage zonder stap-id. Kies de pdf-stap opnieuw.');
      }
      pdfSteps.push({ type: 'pdf_step', targetId, name: attachmentDisplayName(rij.name, 'Offerte.pdf') });
      continue;
    }
    assets.push(rij);
  }
  return { assets: assets.length > 0 ? assets : null, pdfSteps };
}

// ─── Bytes → base64 ──────────────────────────────────────────────────────────

/**
 * `String.fromCharCode(...bytes)` klapt boven ongeveer 64k argumenten ("too
 * many arguments"), en dat is precies de grootte waarop een PDF begint. Dus
 * in blokken.
 *
 * @param {ArrayBuffer} buffer
 * @returns {string}
 */
export function naarBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  const BLOK = 0x8000;
  let binair = '';
  for (let i = 0; i < bytes.length; i += BLOK) {
    binair += String.fromCharCode.apply(null, bytes.subarray(i, i + BLOK));
  }
  return btoa(binair);
}

// ─── R2 ──────────────────────────────────────────────────────────────────────

/**
 * De etag van R2 is de identiteit van de INHOUD. Hij komt met aanhalingstekens
 * uit `httpEtag` en zonder uit `etag`; beide standen worden hier platgeslagen,
 * anders zou dezelfde inhoud twee cache-rijen krijgen.
 *
 * Valt er geen etag te krijgen (dat hoort niet, maar het mag niet fataal zijn),
 * dan is de terugval grootte + uploadmoment: ook dat verandert bij een
 * vervanging, en dat is waar het om gaat.
 *
 * @param {Object} obj  R2-object uit head()
 * @returns {string}
 */
export function inhoudsSleutel(obj) {
  const ruw = String((obj && (obj.etag || obj.httpEtag)) || '').replace(/^W\//, '').replace(/"/g, '').trim();
  if (ruw !== '') return ruw;
  const geupload = obj && obj.uploaded ? new Date(obj.uploaded).toISOString() : 'onbekend';
  return `size${(obj && obj.size) || 0}-${geupload}`;
}

// ─── Cache ───────────────────────────────────────────────────────────────────

/**
 * Wat staat er al in Odoo voor deze (sleutel, inhoud)-paren?
 *
 * @returns {Promise<Map<string, {odoo_attachment_id: number}>>} sleutel: `${key}\n${etag}`
 */
async function leesCache(env, paren) {
  if (paren.length === 0) return new Map();
  const supabase = getSupabaseClient(env);
  const { data, error } = await supabase
    .from('fs_v2_mail_attachment_cache')
    .select('r2_key, etag, odoo_attachment_id')
    .in('r2_key', paren.map(p => p.key));
  if (error) {
    // Een kapotte cache mag de mail niet tegenhouden -- dan maken we gewoon
    // een nieuw attachment aan. Wel luid loggen: dit kost Odoo-opslag.
    console.warn('[fsv2-mail-attachments] cache lezen mislukt:', error.message);
    return new Map();
  }
  const kaart = new Map();
  for (const rij of (data || [])) {
    kaart.set(`${rij.r2_key}\n${rij.etag}`, { odoo_attachment_id: Number(rij.odoo_attachment_id) });
  }
  return kaart;
}

/**
 * Cache-rijen die naar een verwijderd Odoo-attachment wijzen zijn erger dan
 * geen cache: de mail vertrekt dan met een lege verwijzing. Eén aanroep voor
 * alle kandidaten tegelijk.
 *
 * @returns {Promise<Set<number>>} de ids die echt nog bestaan
 */
async function bestaandeInOdoo(env, ids) {
  if (ids.length === 0) return new Set();
  const rijen = await searchRead(env, {
    model: 'ir.attachment',
    domain: [['id', 'in', ids]],
    fields: ['id'],
    limit: ids.length
  });
  return new Set((Array.isArray(rijen) ? rijen : []).map(r => Number(r.id)));
}

/** Best-effort: mislukt dit, dan is het gevolg een extra upload de volgende keer. */
async function schrijfCache(env, rij) {
  try {
    const supabase = getSupabaseClient(env);
    const { error } = await supabase
      .from('fs_v2_mail_attachment_cache')
      .upsert(rij, { onConflict: 'r2_key,etag' });
    if (error) console.warn('[fsv2-mail-attachments] cache schrijven mislukt:', error.message);
  } catch (err) {
    console.warn('[fsv2-mail-attachments] cache schrijven mislukt:', err && err.message);
  }
}

// ─── De hoofdfunctie ─────────────────────────────────────────

/**
 * De bijlagen van een stap omzetten naar Odoo-attachment-ids.
 *
 * Twee soorten (zie `splitMailAttachments`), die vanaf hier door HETZELFDE
 * R2-cachepad lopen: een `{key}`-item (een Asset Manager-bestand, gevalideerd
 * tegen de Asset Manager-namespace) en een `{type:'pdf_step'}`-item (de R2-
 * sleutel die een generate_pdf-stap ZOJUIST zette, uit
 * `contextObject['pdf.<targetId>.r2_key']` -- systeem-gegenereerd, dus zonder
 * de namespace-controle die geldt voor een door de gebruiker gekozen bestand).
 * Odoo wil de inhoud zelf hebben (een mail.mail kan niet naar een R2-link
 * wijzen), dus of het nu een vast Asset Manager-bestand is of een pas
 * gegenereerde offerte: bij het versturen wordt éénmalig een ir.attachment
 * aangemaakt en gecachet op (r2_key, etag) -- zelfde reden als altijd: bij
 * honderden inzendingen geen honderden kopieën van dezelfde bytes in Odoo.
 *
 * @param {Object} env
 * @param {Array<Object>|null} lijst
 * @param {Object} [contextObject] uitvoer van eerdere stappen in deze inzending
 * @returns {Promise<{ids: number[], files: Array<Object>}>}
 * @throws {MailAttachmentError} bij een ontbrekend of te groot bestand
 */
export async function resolveMailAttachments(env, lijst, contextObject) {
  const { assets, pdfSteps } = splitMailAttachments(lijst);
  const genormaliseerd = normalizeMailAttachments(assets) || [];

  // pdf_step-items: de R2-sleutel staat al klaar in de context van DEZE
  // indiening (de generate_pdf-stap liep hiervóór al, zie worker-handler.js).
  // GEEN isWithinAssetNamespace()-controle hier: die geldt voor een door de
  // gebruiker GETYPTE/GEKOZEN sleutel, en fsv2-generated-pdfs/ ligt bewust
  // BUITEN de Asset Manager-namespace (zie FOREIGN_MODULE_PREFIXES).
  const pdfAlsBestand = [];
  for (const item of pdfSteps) {
    const r2Key = contextObject ? contextObject[`pdf.${item.targetId}.r2_key`] : null;
    if (!r2Key) {
      throw new MailAttachmentError(
        `Bijlage "${item.name}" ontbreekt: de pdf-stap leverde niets op (mislukt, overgeslagen, of staat na deze mail).`
      );
    }
    pdfAlsBestand.push({ key: r2Key, name: item.name });
  }

  const alleItems = [...genormaliseerd, ...pdfAlsBestand];
  if (!alleItems.length) return { ids: [], files: [] };
  if (!env || !env.R2_ASSETS) {
    throw new MailAttachmentError('Geen toegang tot de opslag (R2_ASSETS ontbreekt).');
  }

  // ── 1. Bestaat het nog, en hoe groot is het NU? ─────────────────────
  const beschrijvingen = [];
  let totaal = 0;
  for (const item of alleItems) {
    const obj = await env.R2_ASSETS.head(item.key);
    if (!obj) {
      throw new MailAttachmentError(
        `Bijlage "${item.name}" bestaat niet (meer) in de opslag (${item.key}). ` +
        'Zet het bestand terug of kies een ander, en replay deze indiening.'
      );
    }
    const bytes = Number(obj.size) || 0;
    totaal += bytes;
    beschrijvingen.push({
      key: item.key,
      name: item.name,
      etag: inhoudsSleutel(obj),
      bytes,
      mimetype: (obj.httpMetadata && obj.httpMetadata.contentType) || 'application/octet-stream'
    });
  }
  if (totaal > MAX_MAIL_ATTACHMENT_BYTES) {
    const mb = (n) => (n / 1024 / 1024).toFixed(1);
    throw new MailAttachmentError(
      `De bijlagen zijn samen ${mb(totaal)} MB; het maximum is ${mb(MAX_MAIL_ATTACHMENT_BYTES)} MB. ` +
      'Verklein het bestand of zet er een link naar in de tekst.'
    );
  }

  // ── 2. Wat hebben we al in Odoo staan? ──────────────────────────
  const cache = await leesCache(env, beschrijvingen);
  const kandidaten = beschrijvingen
    .map(b => cache.get(`${b.key}\n${b.etag}`))
    .filter(Boolean)
    .map(c => c.odoo_attachment_id);
  const nogGeldig = await bestaandeInOdoo(env, [...new Set(kandidaten)]);

  // ── 3. Aanvullen wat ontbreekt ─────────────────────────────
  const ids = [];
  const files = [];
  for (const b of beschrijvingen) {
    const uitCache = cache.get(`${b.key}\n${b.etag}`);
    if (uitCache && nogGeldig.has(uitCache.odoo_attachment_id)) {
      ids.push(uitCache.odoo_attachment_id);
      files.push({ ...b, attachmentId: uitCache.odoo_attachment_id, hergebruikt: true });
      continue;
    }

    const obj = await env.R2_ASSETS.get(b.key);
    if (!obj) {
      throw new MailAttachmentError(
        `Bijlage "${b.name}" verdween tijdens het klaarzetten (${b.key}). Replay deze indiening.`
      );
    }
    const datas = naarBase64(await obj.arrayBuffer());
    const attachmentId = await create(env, {
      model: 'ir.attachment',
      values: {
        name: b.name,
        datas,
        type: 'binary',
        mimetype: b.mimetype,
        // Bewust GEEN res_model/res_id: dit attachment wordt door alle mails
        // gedeeld die hetzelfde bestand meesturen. Zou het aan het eerste
        // lead hangen, dan verdwijnt het bij het opruimen van dat lead.
        description: `Operations Manager — mailbijlage: ${b.key} (${b.etag})`
        // GEEN public: true -- dat maakt een attachment wereldwijd leesbaar
        // zonder inloggen (zie het doc-blok bij ir.attachment in pdf-step.js
        // voor de onderbouwing), en deze bijlagen kunnen intern gedeelde
        // materialen zijn die niet voor het hele internet bedoeld zijn.
      }
    });
    await schrijfCache(env, {
      r2_key: b.key,
      etag: b.etag,
      odoo_attachment_id: Number(attachmentId),
      filename: b.name,
      mimetype: b.mimetype,
      bytes: b.bytes
    });
    ids.push(Number(attachmentId));
    files.push({ ...b, attachmentId: Number(attachmentId), hergebruikt: false });
  }

  return { ids, files };
}

/**
 * Wat de composer en het voorbeeld willen weten: staat het bestand er nog, en
 * hoe groot is het? Gooit NIET -- dit is een scherm, geen verzending.
 *
 * Een `pdf_step`-item wordt teruggegeven zonder Odoo-opzoeking (`missing:
 * false`, `dynamic: true`): er bestaat nog niets om te controleren voor er een
 * echte inzending doorheen liep.
 *
 * @returns {Promise<Array<{key, name, bytes, mimetype, missing}|{type: 'pdf_step', targetId, name, missing: false, dynamic: true}>>}
 */
export async function describeMailAttachments(env, lijst) {
  let split = null;
  try {
    split = splitMailAttachments(lijst);
  } catch (_err) {
    return [];
  }
  const pdfBeschrijvingen = split.pdfSteps.map((item) => ({ ...item, missing: false, dynamic: true }));

  let genormaliseerd = null;
  try {
    genormaliseerd = normalizeMailAttachments(split.assets);
  } catch (_err) {
    return pdfBeschrijvingen;
  }
  if (!genormaliseerd || !env || !env.R2_ASSETS) return pdfBeschrijvingen;

  const uit = [];
  for (const item of genormaliseerd) {
    let obj = null;
    try {
      obj = await env.R2_ASSETS.head(item.key);
    } catch (_err) {
      obj = null;
    }
    uit.push({
      key: item.key,
      name: item.name,
      bytes: obj ? Number(obj.size) || 0 : 0,
      mimetype: obj ? ((obj.httpMetadata && obj.httpMetadata.contentType) || 'application/octet-stream') : null,
      missing: !obj
    });
  }
  return [...pdfBeschrijvingen, ...uit];
}
