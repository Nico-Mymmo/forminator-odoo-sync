/**
 * Koppelingen — de `generate_pdf`-stap.
 *
 * Vult een module-breed pdf-sjabloon (`fs_v2_pdf_templates`, dezelfde vorm als
 * `window.OFFERTE_DATA`/`window.OFFERTE_VELDEN` uit `public/offerte-data.js`)
 * met de waarden die deze inzending opleverde, haalt de contactpersoon uit
 * `hr.employee` (vast gekozen of dynamisch uit een vorige stap), rendert
 * `public/offerte.html` via Cloudflare Browser Rendering naar een echte pdf en
 * uploadt het resultaat als `ir.attachment`.
 *
 * ÉÉN RENDERER, GEEN TWEEDE.
 * --------------------------
 * De pdf komt tot stand door de ECHTE `offerte-render.js` te draaien in een
 * headless browser (`window.OFFERTE.zet(data)`, die functie bestaat al). Er
 * wordt hier NERGENS de offerte-layout herbouwd — dat zou precies het
 * twee-renderers-probleem zijn dat elders in deze module bewust vermeden wordt
 * (zie form-preview-parity-test.mjs).
 *
 * IDEMPOTENTIE ZIT OP EEN MARKER IN HET ATTACHMENT, NIET OP action_result
 * ------------------------------------------------------------------------
 * `pdf_generated`/`pdf_reused` staan niet in de lijst action_results die
 * `shouldSkipOnRetry()` in worker-handler.js overslaat, dus deze stap draait
 * bij elke retry gewoon opnieuw. Om dan geen tweede pdf te maken, zoekt de stap
 * eerst op een vaste omschrijving ("OM pdf-stap target:<id> submission:<id>")
 * en hergebruikt dat attachment als het er al is.
 *
 * Zie docs/plan-offerte-pdf-stap.md voor de volledige onderbouwing.
 */

import { searchRead, create } from '../../lib/odoo.js';
import { getSupabaseClient } from '../../lib/database.js';
import { naarBase64 } from './mail-attachments.js';

export class PdfStepError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PdfStepError';
  }
}

function validatieFout(message) {
  const err = new Error(message);
  err.code = 'VALIDATION_ERROR';
  return err;
}

/** Renderen mag maximaal dit lang duren — de WP-plugin wacht max. 15 s op de hele indiening. */
const RENDER_TIMEOUT_MS = 9000;

// ─── Padjes in de gegevens ───────────────────────────────────────────────────

function leesPad(obj, pad) {
  let d = obj;
  for (const deel of String(pad).split('.')) {
    if (d == null) return '';
    d = d[deel];
  }
  return d == null ? '' : d;
}

function zetPad(obj, pad, waarde) {
  const delen = String(pad).split('.');
  let cur = obj;
  for (let i = 0; i < delen.length - 1; i += 1) {
    if (cur[delen[i]] == null || typeof cur[delen[i]] !== 'object') cur[delen[i]] = {};
    cur = cur[delen[i]];
  }
  cur[delen[delen.length - 1]] = waarde;
}

/** Elk pad uit `velden`, behalve de groep "Contactpersoon" — die loopt via §buildPdfGegevens punt 4. */
function toegestaneGegevenspaden(velden) {
  const set = new Set();
  for (const groep of (Array.isArray(velden) ? velden : [])) {
    if (!groep || groep.groep === 'Contactpersoon') continue;
    for (const paar of (Array.isArray(groep.velden) ? groep.velden : [])) {
      if (Array.isArray(paar) && paar[0]) set.add(String(paar[0]));
    }
  }
  return set;
}

/** {{pad.naar.waarde}} → waarde uit gegevens. Onbekend/leeg = leeg, zelfde regel als offerte-render.js. */
function vulTekst(tekst, gegevens) {
  return String(tekst == null ? '' : tekst).replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, pad) => {
    const w = leesPad(gegevens, pad);
    return (w === null || w === undefined) ? '' : String(w);
  });
}

function veiligeBestandsnaam(naam) {
  let n = String(naam || '').trim().split(/[\\/]/).pop() || '';
  n = n.replace(/[\x00-\x1f\x7f:*?"<>|]/g, '-');
  if (!/\.pdf$/i.test(n)) n += '.pdf';
  return n === '.pdf' ? 'Offerte.pdf' : n.slice(0, 150);
}

/** Grove herkenning van het beeldtype uit de eerste tekens van een base64-string. */
function gokAfbeeldingMime(base64) {
  const kop = String(base64 || '').slice(0, 8);
  if (kop.startsWith('/9j/')) return 'image/jpeg';
  if (kop.startsWith('iVBOR')) return 'image/png';
  if (kop.startsWith('PHN2Zy') || kop.startsWith('PD94')) return 'image/svg+xml';
  return 'image/png';
}

// ─── Gegevens vullen ─────────────────────────────────────────────────────────

/**
 * Het sjabloon vullen met de waarden van deze inzending — geen upload, geen
 * render. Apart geëxporteerd zodat de testroute (`POST /api/targets/:id/pdf-test`)
 * dit kan draaien zonder ooit iets in Odoo te uploaden.
 *
 * @param {Object} env
 * @param {Object} args
 * @param {Object} args.target          - rij uit fs_v2_targets
 * @param {Object} args.template        - rij uit fs_v2_pdf_templates ({data: {gegevens, copy, velden}})
 * @param {Array}  args.mappings        - fs_v2_mappings van deze stap
 * @param {Object} args.form            - genormaliseerde formulierwaarden
 * @param {Object} args.contextObject   - uitvoer van eerdere stappen
 * @param {Function} args.resolveMapping - (mapping, form, contextObject) => waarde
 * @returns {Promise<{gegevens: Object, copy: Object, filename: string, waarschuwingen: string[]}>}
 */
export async function buildPdfGegevens(env, { target, template, mappings, form, contextObject, resolveMapping }) {
  const gegevens = structuredClone(template.data.gegevens);
  const toegestaan = toegestaneGegevenspaden(template.data.velden);
  const waarschuwingen = [];

  for (const mapping of (mappings || [])) {
    const pad = String(mapping.odoo_field || '').trim();
    if (!pad || pad.startsWith('contact.')) continue;
    if (!toegestaan.has(pad)) {
      waarschuwingen.push(`Onbekend sjabloonveld "${pad}" — mapping genegeerd.`);
      continue;
    }
    const waarde = resolveMapping(mapping, form, contextObject);
    if (waarde === null || waarde === undefined || waarde === '') {
      waarschuwingen.push(`Geen waarde voor "${pad}" — sjabloonwaarde behouden.`);
      continue;
    }
    zetPad(gegevens, pad, String(waarde));
  }

  // ── Contactpersoon — uit hr.employee, vast of dynamisch ─────────────────
  const bron = String(target.pdf_contact_source || '').trim();
  if (bron === 'fixed' || bron === 'dynamic') {
    let employeeId = null;
    if (bron === 'fixed') {
      const n = Number(target.pdf_contact_employee_id);
      employeeId = Number.isInteger(n) && n > 0 ? n : null;
      if (!employeeId) {
        throw new PdfStepError('generate_pdf: geen geldige vaste medewerker ingesteld voor de contactpersoon.');
      }
    } else {
      const bronVeld = String(target.pdf_contact_source_value || '').trim();
      if (!bronVeld) {
        throw new PdfStepError('generate_pdf: geen bron ingesteld voor de dynamische contactpersoon.');
      }
      const ruw = contextObject ? contextObject[bronVeld] : null;
      const n = Number.parseInt(String(ruw), 10);
      employeeId = Number.isInteger(n) && n > 0 ? n : null;
      if (!employeeId) {
        throw new PdfStepError(
          `generate_pdf: vorige stap gaf geen geldig medewerker-ID (bron: "${bronVeld}", waarde: "${String(ruw)}").`
        );
      }
    }

    const rijen = await searchRead(env, {
      model: 'hr.employee',
      domain: [['id', '=', employeeId]],
      fields: ['name', 'work_email', 'image_512'],
      limit: 1
    });
    const rec = Array.isArray(rijen) && rijen.length ? rijen[0] : null;
    if (!rec) throw new PdfStepError(`generate_pdf: medewerker ${employeeId} bestaat niet (meer) in Odoo.`);

    gegevens.contact.naam = String(rec.name || '').trim();
    gegevens.contact.email = String(rec.work_email || '').trim();
    if (rec.image_512) {
      gegevens.contact.foto = `data:${gokAfbeeldingMime(rec.image_512)};base64,${rec.image_512}`;
    }
  }

  const filename = veiligeBestandsnaam(
    vulTekst(target.pdf_filename_template || 'Offerte-{{offerte.nummer}}.pdf', gegevens)
  );

  return { gegevens, copy: template.data.copy, filename, waarschuwingen };
}

// ─── Renderen (Cloudflare Browser Rendering) ─────────────────────────────────

/**
 * Puppeteer geeft doorgaans een Buffer terug (een Uint8Array-subklasse) — deze
 * helper werkt met beide zonder daarop te gokken: een echte kopie van de
 * onderliggende bytes, ongeacht offset/subklasse. Geëxporteerd zodat de
 * testroute (POST /api/targets/:id/pdf-test) 'm ook kan gebruiken.
 */
export function pdfBytesToBase64(bytes) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return naarBase64(arr.buffer.slice(arr.byteOffset, arr.byteOffset + arr.byteLength));
}

/**
 * `offerte.html` renderen naar pdf-bytes via Cloudflare Browser Rendering.
 *
 * `window.OFFERTE.zet(data)` bestaat al in offerte-render.js — dat is de haak
 * die dit zonder een tweede renderer mogelijk maakt. `@page`/`@media print` in
 * offerte.css regelen A4-formaat en het verbergen van de werkbalk al;
 * `preferCSSPageSize` laat Puppeteer die regel volgen.
 *
 * @returns {Promise<Uint8Array>}
 */
export async function renderPdf(env, { gegevens, copy }) {
  if (!env.BROWSER) {
    throw new PdfStepError('generate_pdf: Browser Rendering is niet gekoppeld (binding BROWSER ontbreekt).');
  }

  const render = (async () => {
    const { default: puppeteer } = await import('@cloudflare/puppeteer');
    const browser = await puppeteer.launch(env.BROWSER);
    try {
      const page = await browser.newPage();
      await page.goto(`${env.APP_BASE_URL}/offerte.html?server=1`, { waitUntil: 'networkidle0' });
      await page.evaluate((data) => window.OFFERTE.zet(data), { gegevens, copy });
      await page.evaluate(() => Promise.all([
        document.fonts.ready,
        ...Array.from(document.images).map((img) => (img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; })))
      ]));
      return await page.pdf({ printBackground: true, preferCSSPageSize: true });
    } finally {
      await browser.close();
    }
  })();
  // Late fouten na een timeout mogen geen "unhandled rejection" worden.
  render.catch(() => {});

  return Promise.race([
    render,
    new Promise((_resolve, reject) => {
      setTimeout(() => reject(new PdfStepError('generate_pdf: renderen duurde langer dan 9 s.')), RENDER_TIMEOUT_MS);
    })
  ]);
}

// ─── Sjabloon ────────────────────────────────────────────────────────────────

/**
 * Puur — geen env. Gebruikt door de sjabloon-CRUD-routes én de seed, zodat
 * route en seed dezelfde regel delen.
 */
export function validatePdfTemplateData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw validatieFout('Een pdf-sjabloon heeft gegevens, copy en velden nodig.');
  }
  if (!data.gegevens || typeof data.gegevens !== 'object' || Array.isArray(data.gegevens)) {
    throw validatieFout('Sjabloon: "gegevens" moet een object zijn.');
  }
  if (!data.copy || typeof data.copy !== 'object' || Array.isArray(data.copy)) {
    throw validatieFout('Sjabloon: "copy" moet een object zijn.');
  }
  if (!Array.isArray(data.velden)) {
    throw validatieFout('Sjabloon: "velden" moet een lijst zijn.');
  }
}

// ─── Sjabloonbeheer (CRUD, achter de auth-gate in routes.js) ────────────────

function nietGevonden(message) {
  const err = new Error(message);
  err.code = 'NOT_FOUND';
  return err;
}

function inGebruikFout(message) {
  const err = new Error(message);
  err.code = 'CONFLICT';
  return err;
}

/** Lijst voor het overzicht: geen `data` mee (kan groot zijn), wel hoeveel stappen ernaar verwijzen. */
export async function listPdfTemplates(env) {
  const supabase = getSupabaseClient(env);
  const { data, error } = await supabase
    .from('fs_v2_pdf_templates')
    .select('id, name, updated_at')
    .order('name', { ascending: true });
  if (error) throw new Error(`Sjablonen ophalen mislukt: ${error.message}`);

  const { data: targets, error: targetsError } = await supabase
    .from('fs_v2_targets')
    .select('pdf_template_id')
    .not('pdf_template_id', 'is', null);
  if (targetsError) throw new Error(`Gebruik van sjablonen ophalen mislukt: ${targetsError.message}`);
  const gebruikt = new Map();
  for (const rij of (targets || [])) {
    gebruikt.set(rij.pdf_template_id, (gebruikt.get(rij.pdf_template_id) || 0) + 1);
  }
  return (data || []).map((t) => ({ ...t, in_gebruik: gebruikt.get(t.id) || 0 }));
}

export async function getPdfTemplate(env, id) {
  const supabase = getSupabaseClient(env);
  const { data, error } = await supabase.from('fs_v2_pdf_templates').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(`Sjabloon ophalen mislukt: ${error.message}`);
  if (!data) throw nietGevonden('Sjabloon niet gevonden.');
  return data;
}

export async function createPdfTemplate(env, { name, data }) {
  validatePdfTemplateData(data);
  const supabase = getSupabaseClient(env);
  const { data: row, error } = await supabase
    .from('fs_v2_pdf_templates')
    .insert({ name: String(name || '').trim() || 'Nieuw sjabloon', data })
    .select()
    .single();
  if (error) throw new Error(`Sjabloon aanmaken mislukt: ${error.message}`);
  return row;
}

export async function updatePdfTemplate(env, id, { name, data } = {}) {
  if (data !== undefined) validatePdfTemplateData(data);
  const updates = {};
  if (name !== undefined) updates.name = String(name || '').trim() || 'Naamloos sjabloon';
  if (data !== undefined) updates.data = data;

  const supabase = getSupabaseClient(env);
  const { data: row, error } = await supabase
    .from('fs_v2_pdf_templates')
    .update(updates)
    .eq('id', id)
    .select()
    .maybeSingle();
  if (error) throw new Error(`Sjabloon bewaren mislukt: ${error.message}`);
  if (!row) throw nietGevonden('Sjabloon niet gevonden.');
  return row;
}

/** Weigert (409) zolang een fs_v2_targets-rij nog naar dit sjabloon verwijst. */
export async function deletePdfTemplate(env, id) {
  const supabase = getSupabaseClient(env);
  const { count, error: countError } = await supabase
    .from('fs_v2_targets')
    .select('id', { count: 'exact', head: true })
    .eq('pdf_template_id', id);
  if (countError) throw new Error(`Controle op gebruik mislukt: ${countError.message}`);
  if (count && count > 0) {
    throw inGebruikFout(`Dit sjabloon wordt nog gebruikt door ${count} stap(pen). Koppel die eerst los.`);
  }

  const { error } = await supabase.from('fs_v2_pdf_templates').delete().eq('id', id);
  if (error) throw new Error(`Sjabloon verwijderen mislukt: ${error.message}`);
  return true;
}

async function laadTemplate(env, templateId) {
  if (!templateId) throw new PdfStepError('generate_pdf: geen sjabloon ingesteld.');
  const supabase = getSupabaseClient(env);
  const { data, error } = await supabase
    .from('fs_v2_pdf_templates')
    .select('id, name, data')
    .eq('id', templateId)
    .maybeSingle();
  if (error) throw new PdfStepError(`generate_pdf: sjabloon kon niet geladen worden — ${error.message}`);
  if (!data) throw new PdfStepError('generate_pdf: het gekozen sjabloon bestaat niet meer.');
  return data;
}

// ─── De stap ─────────────────────────────────────────────────────────────────

/**
 * Eén `generate_pdf`-stap uitvoeren: sjabloon laden → vullen → renderen →
 * uploaden als ir.attachment. Idempotent via een vaste marker (zie doc-blok
 * bovenaan) — een retry maakt nooit een tweede pdf.
 *
 * @returns {Promise<{action: 'pdf_generated'|'pdf_reused', attachmentId: number, detail: string|null}>}
 */
export async function runGeneratePdfStep(env, { target, submissionId, form, contextObject, mappings, resolveMapping }) {
  const template = await laadTemplate(env, target.pdf_template_id);

  const marker = `OM pdf-stap target:${target.id} submission:${submissionId}`;
  const bestaand = await searchRead(env, {
    model: 'ir.attachment',
    domain: [['description', '=', marker]],
    fields: ['id'],
    limit: 1
  });
  if (Array.isArray(bestaand) && bestaand.length > 0) {
    return {
      action: 'pdf_reused',
      attachmentId: Number(bestaand[0].id),
      detail: 'De pdf van een vorige poging bestaat al; niet opnieuw gerenderd.'
    };
  }

  const { gegevens, copy, filename, waarschuwingen } = await buildPdfGegevens(env, {
    target, template, mappings, form, contextObject, resolveMapping
  });
  const bytes = await renderPdf(env, { gegevens, copy });

  let resLink = {};
  if (target.pdf_res_id_source) {
    const ruw = contextObject ? contextObject[target.pdf_res_id_source] : null;
    const n = Number.parseInt(String(ruw), 10);
    if (Number.isInteger(n) && n > 0 && target.odoo_model) {
      resLink = { res_model: target.odoo_model, res_id: n };
    }
  }

  const attachmentId = await create(env, {
    model: 'ir.attachment',
    values: {
      name: filename,
      datas: pdfBytesToBase64(bytes),
      type: 'binary',
      mimetype: 'application/pdf',
      description: marker,
      ...resLink
    }
  });

  return {
    action: 'pdf_generated',
    attachmentId: Number(attachmentId),
    detail: waarschuwingen.length ? waarschuwingen.join(' ') : null
  };
}
