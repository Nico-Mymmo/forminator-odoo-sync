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
import { resolveEmployeeRef } from './employee-reference.js';
import { postChatterMessage } from './odoo-client.js';
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
// Hoe lang een browsersessie na ons blijft staan voor de volgende inzending.
const KEEP_ALIVE_MS = 5 * 60 * 1000;

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
    // Contactpersoon: eigen resolutiepad (zie hierboven bij "Contactpersoon").
    // Beeldmateriaal: bewust nooit per koppeling instelbaar -- één keer
    // opgemaakt in de sjabloonbouwer, geen mapping-doel. Bedrijf: komt sinds de
    // bedrijfsprofielen (fs_v2_bedrijf_profielen) niet meer uit een mapping,
    // maar uit één gekozen profiel (target.pdf_bedrijf_profiel_id) -- zie
    // pasBedrijfsprofielToe() verderop. Zie ook de UI-filter in
    // forminator-sync-v2-detail-pdf-composer.js.
    if (!groep || groep.groep === 'Contactpersoon' || groep.groep === 'Beeldmateriaal' || groep.groep === 'Bedrijf') continue;
    for (const paar of (Array.isArray(groep.velden) ? groep.velden : [])) {
      if (Array.isArray(paar) && paar[0]) set.add(String(paar[0]));
    }
  }
  return set;
}

/**
 * Een keuze uit het formulier leesbaar maken voor op papier:
 * "afvallokaal,meerdere_ingangen,laadpalen" → "Afvallokaal, meerdere ingangen, laadpalen".
 *
 * Een meerkeuze (de keien in een WordPress-stap, een checkbox-groep) komt
 * binnen als de SLEUTELS van de keuzes, aan elkaar met een komma. Die
 * sleutels zijn wat Odoo moet krijgen en liggen vast -- maar op een offerte
 * leest een klant "meerdere_ingangen,laadpalen" als een fout.
 *
 * ENKEL wat eruitziet als sleutels wordt omgezet: elk deel bestaat uit kleine
 * letters, cijfers en underscores, bevat minstens een letter, en het geheel
 * heeft een komma of een underscore. Een adres, een naam, "4" of "12,5" blijft
 * dus exact zoals het binnenkwam. De LABELS uit de stap zelf ("Tuin met
 * onderhoud") kent de OM niet; wat hier staat is de sleutel, leesbaar gemaakt.
 *
 * @param {*} waarde @returns {string}
 */
export function leesbareKeuze(waarde) {
  const tekst = String(waarde).trim();
  const delen = tekst.split(/\s*,\s*/).filter((d) => d !== '');
  const isSleutel = (d) => /^[a-z0-9_]+$/.test(d) && /[a-z]/.test(d);
  if (!delen.length || !delen.every(isSleutel)) return String(waarde);
  if (delen.length === 1 && !tekst.includes('_')) return String(waarde);
  const zin = delen.map((d) => d.replace(/_+/g, ' ').trim()).join(', ');
  return zin.charAt(0).toUpperCase() + zin.slice(1);
}

/**
 * Een samengestelde waarde ("{straat} {nummer}, {postcode} {gemeente}") waarin
 * een veld leeg bleef: geen dubbele spaties, geen komma zonder iets ervoor of
 * erna. Zonder dit staat er op de offerte "Kerkstraat , 9000 Gent" of
 * ", 9000 Gent". Blijft er niets over, dan is het leeg -- en houdt het veld de
 * sjabloonwaarde, zoals elk ander leeg veld.
 *
 * @param {*} waarde @returns {string}
 */
export function ruimSamengesteldOp(waarde) {
  return String(waarde == null ? '' : waarde)
    .replace(/[ \t]+/g, ' ')
    .replace(/ +,/g, ',')
    .replace(/,(\s*,)+/g, ',')
    .replace(/^[\s,]+|[\s,]+$/g, '');
}

/** {{pad.naar.waarde}} → waarde uit gegevens. Onbekend/leeg = leeg, zelfde regel als offerte-render.js. */
function vulTekst(tekst, gegevens) {
  return String(tekst == null ? '' : tekst).replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, pad) => {
    const w = leesPad(gegevens, pad);
    return (w === null || w === undefined) ? '' : String(w);
  });
}

// ─── Offertenummer-generator, geldigheidstermijn, licentieprijs ──────────────────

/**
 * Jaar, maand en dag in EUROPE/BRUSSELS.
 *
 * Een Worker draait op UTC. `new Date().getDate()` geeft daardoor tussen
 * middernacht en 02:00 onze tijd nog de VORIGE dag -- en dan staat er een
 * offertenummer en een geldigheidsdatum van gisteren op een offerte die vandaag
 * vertrekt. Dat is niet zichtbaar als fout: er komt gewoon een nummer. Zelfde
 * les als `x_studio_starting_day` bij de events (dat is er echt misgegaan) en de
 * leesbare datumvelden bij Calendly.
 *
 * Blijft puur: de aanroeper geeft het moment mee, deze functie kent geen klok
 * van zichzelf behalve de standaardwaarde.
 *
 * @param {Date} [nu]
 * @returns {{jaar: number, maand: number, dag: number}}
 */
export function datumdelenBrussel(nu = new Date()) {
  const delen = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Brussels',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(nu).reduce((acc, deel) => {
    acc[deel.type] = deel.value;
    return acc;
  }, {});

  return { jaar: Number(delen.year), maand: Number(delen.month), dag: Number(delen.day) };
}

/**
 * "{jaar}-OFFSYN-{teller:5}" + teller 7 -> "2026-OFFSYN-00007".
 *
 * Beschikbaar: `{jaar}`, `{maand}`, `{dag}` en `{teller}`. MAAND EN DAG ZIJN
 * STANDAARD TWEE CIJFERS ("09", "05"): zonder voorloopnul zijn de nummers niet
 * even lang, en dan sorteert "2026924" voor "20261001" en is 2026-1-11 niet van
 * 2026-11-1 te onderscheiden. Wie echt geen nul wil, schrijft `{maand:getal}`.
 * `{dag:2}` en `{dag:leadingzero}` blijven werken en betekenen hetzelfde als
 * `{dag}`; achter `{teller}` mag een breedte staan (`{teller:5}` -> "00007").
 * Dit is enkel wat we bij het LEZEN van het patroon aanvaarden.
 *
 * Een onbekend woord achter de dubbele punt matcht niet en blijft dus letterlijk
 * in het nummer staan. Dat is zichtbaar bij de eerste offerte en daarmee te
 * herstellen -- stil de hele placeholder weglaten zou een nummer opleveren dat
 * er goed uitziet en niet klopt.
 *
 * @param {string} patroon
 * @param {number} teller
 * @param {Date} [nu] - het moment waarop het nummer gemaakt wordt
 * @returns {string}
 */
export function formatSequenceNumber(patroon, teller, nu = new Date()) {
  const { jaar, maand, dag } = datumdelenBrussel(nu);

  const vul = (waarde, breedte) => {
    const n = String(waarde);
    if (breedte === 'getal') return n;
    if (!breedte || breedte === 'leadingzero') return n.padStart(2, '0');
    return n.padStart(Number(breedte), '0');
  };

  return String(patroon || '')
    .replace(/\{jaar\}/g, String(jaar))
    .replace(/\{maand(?::(\d+|getal|leadingzero))?\}/g, (_, breedte) => vul(maand, breedte))
    .replace(/\{dag(?::(\d+|getal|leadingzero))?\}/g, (_, breedte) => vul(dag, breedte))
    .replace(/\{teller(?::(\d+))?\}/g, (_, breedte) => {
      const n = String(Math.max(0, Number(teller) || 0));
      return breedte ? n.padStart(Number(breedte), '0') : n;
    });
}

/**
 * Vandaag + N dagen, als "DD/MM/JJJJ" -- dezelfde vorm als de handmatig
 * getypte offerte.datum/offerte.geldig_tot in het sjabloon (zie de seed in
 * 20260918120000_fsv2_pdf_templates.sql: "17/09/2026").
 *
 * @param {number} dagen
 * @param {Date} [nu]
 * @returns {string}
 */
export function computeGeldigTot(dagen, nu = new Date()) {
  // Via datumdelenBrussel en niet via getDate(): zie de uitleg daar. Stond hier
  // op de UTC-dag van de Worker, dus een offerte die hier om 00:30 gemaakt werd
  // kreeg een geldigheidsdatum die een dag te vroeg afliep.
  const einde = new Date(nu.getTime() + Number(dagen) * 24 * 60 * 60 * 1000);
  return formatDatumBrussel(einde);
}

/**
 * Een moment als "DD/MM/JJJJ" in Europe/Brussels -- de vorm die het sjabloon
 * gebruikt voor offerte.datum en offerte.geldig_tot.
 *
 * @param {Date} [nu]
 * @returns {string}
 */
export function formatDatumBrussel(nu = new Date()) {
  const { jaar, maand, dag } = datumdelenBrussel(nu);
  return `${String(dag).padStart(2, '0')}/${String(maand).padStart(2, '0')}/${jaar}`;
}

/**
 * Licentieprijs = tarief per kavel × aantal kavels. Boven de 60 kavels toont
 * de offerte een ONDERGRENS ("Vanaf") op basis van het tarief bij 60 kavels,
 * in plaats van het exacte (en almaar hogere) bedrag voor een heel groot
 * gebouw. Geeft `null` terug als kavels/tarief niet leesbaar zijn (dan blijft
 * de sjabloonwaarde van licentie_totaal staan, zelfde regel als een ongemapt
 * veld) -- `gebouw.kavels` komt uit een formulierveld en is dus vrije tekst
 * ("26 kavels" in de sjabloon-demo, een kaal getal bij een echte inzending).
 *
 * Bewust GEEN "€" in de teruggegeven waarde: net als bij prijs.licentie zelf
 * voegt de COPY-tekst van het sjabloon dat symbool toe, niet de data.
 *
 * `basis` is het aantal kavels waarmee GEREKEND is -- boven de 60 dus 60 en
 * niet het echte aantal. De licentiekaart in de offerte toont die berekening
 * ("Berekend: 26 x €4 per hoofdkavel"); zonder dit veld zou daar bij een groot
 * gebouw een som staan die niet uitkomt op het bedrag ernaast.
 *
 * @param {Object} gegevens
 * @returns {{ totaal: string, vanaf: boolean, basis: string }|null}
 */
export function berekenLicentiePrijs(gegevens) {
  const kavelsMatch = String((gegevens && gegevens.gebouw && gegevens.gebouw.kavels) || '').match(/\d+/);
  const kavels = kavelsMatch ? parseInt(kavelsMatch[0], 10) : NaN;
  const tarief = parseFloat(String((gegevens && gegevens.prijs && gegevens.prijs.licentie) || '').replace(',', '.'));
  if (!Number.isFinite(kavels) || kavels <= 0 || !Number.isFinite(tarief)) return null;

  const vanaf = kavels > 60;
  const basis = vanaf ? 60 : kavels;
  const totaalGetal = tarief * basis;
  const totaal = Number.isInteger(totaalGetal) ? String(totaalGetal) : totaalGetal.toFixed(2).replace('.', ',');
  return { totaal, vanaf, basis: String(basis) };
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

    // Deze twee bronnen kennen enkel het SJABLOON (env/target hebben ze niet
    // nodig), dus worden ze hier apart afgehandeld i.p.v. via de generieke
    // resolveMapping() -- die kent worker-handler.js's SOURCE_TYPES, niet
    // sjabloon-instellingen zoals sequence_pattern/geldigheid_dagen.
    if (mapping.source_type === 'offer_sequence') {
      if (!template.sequence_pattern) {
        waarschuwingen.push(`Geen offertenummer-patroon ingesteld op dit sjabloon — sjabloonwaarde behouden voor "${pad}".`);
        continue;
      }
      const teller = await nextSequenceNumber(env, template.id);
      zetPad(gegevens, pad, formatSequenceNumber(template.sequence_pattern, teller));
      continue;
    }
    if (mapping.source_type === 'offer_validity') {
      if (!Number.isInteger(template.geldigheid_dagen) || template.geldigheid_dagen <= 0) {
        waarschuwingen.push(`Geen geldigheidstermijn ingesteld op dit sjabloon — sjabloonwaarde behouden voor "${pad}".`);
        continue;
      }
      zetPad(gegevens, pad, computeGeldigTot(template.geldigheid_dagen));
      continue;
    }

    let waarde = resolveMapping(mapping, form, contextObject);
    if (mapping.source_type === 'template') waarde = ruimSamengesteldOp(waarde);
    if (waarde === null || waarde === undefined || waarde === '') {
      waarschuwingen.push(`Geen waarde voor "${pad}" — sjabloonwaarde behouden.`);
      continue;
    }
    zetPad(gegevens, pad, mapping.source_type === 'form' ? leesbareKeuze(waarde) : String(waarde));
  }

  // ── Bedrijf ── één gekozen profiel vervangt de hele groep, geen per-veld
  // mapping meer (zie toegestaneGegevenspaden hierboven). Ontbreekt het
  // profiel (verwijderd na het kiezen), dan blijft de sjabloonwaarde staan --
  // net als bij een ongemapt veld, geen fatale fout.
  if (target.pdf_bedrijf_profiel_id) {
    const profiel = await getBedrijfProfiel(env, target.pdf_bedrijf_profiel_id).catch(() => null);
    if (profiel && profiel.data && typeof profiel.data === 'object') {
      Object.assign(gegevens.bedrijf, profiel.data);
    } else {
      waarschuwingen.push('Het gekozen bedrijfsprofiel bestaat niet meer — sjabloonwaarden voor Bedrijf behouden.');
    }
  }

  // ── Licentieprijs ── afgeleid van gebouw.kavels × prijs.licentie, NA de
  // mappings hierboven (die vullen precies die twee paden). Geen waarschuwing
  // als het niet lukt: dat is normaal zolang er geen aantal kavels bekend is
  // (bv. bij een testpdf zonder ingevulde velden).
  const licentie = berekenLicentiePrijs(gegevens);
  if (licentie) {
    gegevens.prijs.licentie_totaal = licentie.totaal;
    gegevens.prijs.licentie_totaal_label = licentie.vanaf ? 'Vanaf ' : '';
    gegevens.prijs.licentie_basis = licentie.basis;
  }

  // ── Contactpersoon — vast of uit een vorige stap ──────────────────
  //
  // "Uit een vorige stap" kan een hr.employee-id opleveren (het record dat die
  // stap zelf aanmaakte) OF een res.users-id (een round-robin-mapping op bv.
  // crm.lead.user_id/"Salesperson" -- zie het doc-blok in employee-reference.js
  // voor waarom dat verschilt). Beide modellen worden hier apart afgehandeld;
  // de FOTO komt bij een res.users-id via de gekoppelde hr.employee, want dat
  // is waar Odoo de pasfoto bewaart.
  let contactRef;
  try {
    contactRef = resolveEmployeeRef({
      source: target.pdf_contact_source,
      employeeId: target.pdf_contact_employee_id,
      sourceValue: target.pdf_contact_source_value,
      contextObject,
      errorPrefix: 'generate_pdf'
    });
  } catch (err) {
    throw new PdfStepError(err.message);
  }

  if (contactRef) {
    let rec = null;
    if (contactRef.model === 'hr.employee') {
      const rijen = await searchRead(env, {
        model: 'hr.employee',
        domain: [['id', '=', contactRef.id]],
        fields: ['name', 'work_email', 'image_512'],
        limit: 1
      });
      rec = Array.isArray(rijen) && rijen.length ? rijen[0] : null;
    } else if (contactRef.model === 'res.users') {
      const gebruikers = await searchRead(env, {
        model: 'res.users',
        domain: [['id', '=', contactRef.id]],
        fields: ['name', 'email'],
        limit: 1
      });
      const gebruiker = Array.isArray(gebruikers) && gebruikers.length ? gebruikers[0] : null;
      if (gebruiker) {
        // De pasfoto staat op hr.employee, niet op res.users -- een gemiste
        // koppeling (geen hr.employee-record voor deze gebruiker) is geen
        // fout, dan blijft de sjabloonfoto gewoon staan.
        const medewerkers = await searchRead(env, {
          model: 'hr.employee',
          domain: [['user_id', '=', contactRef.id]],
          fields: ['image_512'],
          limit: 1
        });
        rec = {
          name: gebruiker.name,
          work_email: gebruiker.email,
          image_512: (Array.isArray(medewerkers) && medewerkers.length) ? medewerkers[0].image_512 : null
        };
      }
    } else {
      throw new PdfStepError(`generate_pdf: contactpersoon-bron met onbekend model "${contactRef.model}".`);
    }

    if (!rec) throw new PdfStepError(`generate_pdf: contactpersoon ${contactRef.id} (${contactRef.model}) bestaat niet (meer) in Odoo.`);

    gegevens.contact.naam = String(rec.name || '').trim();
    gegevens.contact.email = emailOpBedrijfsdomein(String(rec.work_email || '').trim(), gegevens.bedrijf);
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
async function pakBrowser(env, puppeteer) {
  // Een KOUDE browserstart kost seconden, en die zit een bezoeker uit te kijken
  // naar een laadbalkje: de pipeline draait synchroon binnen zijn verzoek. Een
  // sessie die van een vorige inzending nog warm staat, is meteen bruikbaar.
  //
  // Alleen sessies ZONDER connectionId: een sessie neemt maar een verbinding
  // tegelijk aan, en twee inzendingen op dezelfde sessie is geen traagheid maar
  // een fout. Lukt het aansluiten toch niet (net weggevallen, of een ander
  // verzoek was sneller), dan gaan we naar de volgende en anders gewoon koud
  // starten -- deze hele tak is een versnelling, nooit een voorwaarde.
  try {
    const sessies = await puppeteer.sessions(env.BROWSER);
    for (const sessie of (sessies || [])) {
      if (sessie.connectionId) continue;
      try {
        return { browser: await puppeteer.connect(env.BROWSER, sessie.sessionId), warm: true };
      } catch {
        // Volgende proberen.
      }
    }
  } catch {
    // sessions() is een extra aanroep die mag falen.
  }

  // `keep_alive` houdt de sessie na ons ook nog even open, zodat de VOLGENDE
  // inzending hierboven iets vindt. Bewust vijf minuten en niet het maximum van
  // tien: een sessie houdt een concurrent-slot bezet, en offertes komen niet in
  // treinen van tien.
  return { browser: await puppeteer.launch(env.BROWSER, { keep_alive: KEEP_ALIVE_MS }), warm: false };
}

export async function renderPdf(env, { gegevens, copy, meting = null }) {
  if (!env.BROWSER) {
    throw new PdfStepError('generate_pdf: Browser Rendering is niet gekoppeld (binding BROWSER ontbreekt).');
  }

  const t0 = Date.now();
  const { default: puppeteer } = await import('@cloudflare/puppeteer');
  const { browser, warm } = await pakBrowser(env, puppeteer);
  const tBrowser = Date.now();

  // EEN sluitpromise, hoe vaak sluitBrowser() ook aangeroepen wordt: bij een
  // timeout sluit de setTimeout-tak meteen, en de buitenste finally wacht
  // erna gewoon op diezelfde sluiting in plaats van een tweede keer te sluiten.
  // Zonder dit blijft een trage render bij een timeout gewoon een sessie
  // bezet houden bij Cloudflare (concurrent-browserslot) tot HAAR eigen
  // sessie-idle-timeout (10 min) -- de Worker zelf wacht niet meer op die
  // sessie zodra de respons al verstuurd is, dus browser.close() moet HIER
  // al aangevraagd zijn, niet pas in een `finally` die misschien nooit meer
  // uitgevoerd wordt.
  //
  // Twee manieren om af te ronden, en het verschil doet ertoe:
  //   disconnect() -- wij laten los, de sessie blijft warm staan voor de
  //                   volgende inzending. Dat is de hele winst hierboven.
  //   close()      -- de sessie gaat dicht. Dat hoort bij een TIMEOUT of een
  //                   fout: een sessie die net vastliep warm doorgeven betekent
  //                   dat de volgende bezoeker dezelfde storing erft.
  let sluitPromise = null;
  const sluitBrowser = (hard) => {
    if (!sluitPromise) {
      sluitPromise = (hard ? browser.close() : browser.disconnect()).catch(() => {});
    }
    return sluitPromise;
  };

  const render = (async () => {
    const page = await browser.newPage();
    // `load` en niet `networkidle0`. Dat laatste wacht na het laden nog een
    // halve seconde op netwerkstilte, en blijft hangen op elk verzoek dat
    // toevallig nog nakomt -- terwijl we hieronder zelf al expliciet op de
    // lettertypes en de afbeeldingen wachten, en dat is waar het echt om gaat.
    // De wachtregel op window.OFFERTE vervangt wat networkidle0 impliciet
    // garandeerde: dat offerte-render.js gedraaid heeft.
    await page.goto(`${env.APP_BASE_URL}/offerte.html?server=1`, { waitUntil: 'load' });
    await page.waitForFunction(() => !!(window.OFFERTE && window.OFFERTE.zet));
    const tGeladen = Date.now();

    await page.evaluate((data) => window.OFFERTE.zet(data), { gegevens, copy });
    await page.evaluate(() => Promise.all([
      document.fonts.ready,
      ...Array.from(document.images).map((img) => (img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; })))
    ]));
    const tGevuld = Date.now();

    const bytes = await page.pdf({ printBackground: true, preferCSSPageSize: true });

    if (meting) {
      meting.warm = warm;
      meting.browserMs = tBrowser - t0;
      meting.ladenMs = tGeladen - tBrowser;
      meting.vullenMs = tGevuld - tGeladen;
      meting.pdfMs = Date.now() - tGevuld;
      meting.totaalMs = Date.now() - t0;
    }
    return bytes;
  })();
  // Late fouten na een timeout (bv. "Target closed" door sluitBrowser()) mogen
  // geen "unhandled rejection" worden.
  render.catch(() => {});

  let hardAfsluiten = false;
  try {
    return await Promise.race([
      render,
      new Promise((_resolve, reject) => {
        setTimeout(() => {
          // Sluit METEEN, niet pas als de render toch nog vanzelf afloopt --
          // browser.close() breekt een lopende page.goto()/page.pdf() af.
          sluitBrowser(true);
          reject(new PdfStepError('generate_pdf: renderen duurde langer dan 9 s.'));
        }, RENDER_TIMEOUT_MS);
      })
    ]);
  } catch (err) {
    hardAfsluiten = true;
    throw err;
  } finally {
    // Geslaagde render: hier voor het eerst loslaten, en de sessie blijft warm.
    // Timeout of fout: sluitBrowser(true) is al gestart, dit wacht enkel af.
    await sluitBrowser(hardAfsluiten);
  }
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

/**
 * Het VOLGENDE offertenummer voor dit sjabloon, plus de datums die erbij horen.
 *
 * Voor de EDITOR (public/offerte.html), waar iemand met de hand een offerte
 * opmaakt. Bewust dezelfde teller, hetzelfde patroon en dezelfde
 * geldigheidstermijn als een echte inzending: een tweede nummerreeks ernaast
 * geeft ooit twee offertes met hetzelfde nummer, en dat merk je pas als een
 * klant ernaar verwijst.
 *
 * De teller wordt ECHT verhoogd. Een nummer opvragen en de offerte dan toch
 * niet maken laat dus een gat in de reeks -- dat is de goede kant om op te
 * falen; hergebruiken zou twee documenten hetzelfde nummer geven.
 *
 * @param {Object} env
 * @param {string} templateId
 * @returns {Promise<{nummer: string, datum: string, geldig_tot: string|null}>}
 */
export async function takeNextOfferNumber(env, templateId) {
  const template = await getPdfTemplate(env, templateId);
  if (!template.sequence_pattern) {
    throw validatieFout('Dit sjabloon heeft nog geen offertenummer-patroon. Stel dat eerst in bij "Nummering & geldigheid".');
  }
  const nu = new Date();
  const teller = await nextSequenceNumber(env, template.id);
  const geldigheid = Number(template.geldigheid_dagen);
  return {
    nummer: formatSequenceNumber(template.sequence_pattern, teller, nu),
    datum: formatDatumBrussel(nu),
    geldig_tot: Number.isInteger(geldigheid) && geldigheid > 0 ? computeGeldigTot(geldigheid, nu) : null
  };
}

/**
 * De medewerkers die als contactpersoon op een offerte kunnen staan.
 *
 * Zonder foto -- die is per medewerker een paar tientallen kB base64, en een
 * keuzelijst van veertig mensen zou dan megabytes wegen voor een lijst waaruit
 * er een gekozen wordt. De foto komt pas bij getOfferContact().
 */
export async function listOfferContacten(env) {
  const rijen = await searchRead(env, {
    model: 'hr.employee',
    domain: [['active', '=', true]],
    fields: ['id', 'name', 'work_email'],
    order: 'name asc'
  });
  return (rijen || []).map((r) => ({
    id: r.id,
    naam: String(r.name || '').trim(),
    email: String(r.work_email || '').trim()
  }));
}

/**
 * Een medewerker in de vorm van gegevens.contact: naam, e-mailadres en de
 * foto als data-URI. Exact wat buildPdfGegevens() bij een echte inzending
 * invult, zodat de editor niet iets anders oplevert dan de pipeline.
 */
export async function getOfferContact(env, id) {
  const nummer = Number(id);
  if (!Number.isInteger(nummer) || nummer <= 0) throw validatieFout('Ongeldige medewerker.');
  const rijen = await searchRead(env, {
    model: 'hr.employee',
    domain: [['id', '=', nummer]],
    fields: ['name', 'work_email', 'image_512'],
    limit: 1
  });
  const rec = Array.isArray(rijen) && rijen.length ? rijen[0] : null;
  if (!rec) throw nietGevonden('Deze medewerker bestaat niet (meer) in Odoo.');
  return {
    naam: String(rec.name || '').trim(),
    email: String(rec.work_email || '').trim(),
    foto: rec.image_512 ? `data:${gokAfbeeldingMime(rec.image_512)};base64,${rec.image_512}` : null
  };
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

export async function updatePdfTemplate(env, id, { name, data, sequence_pattern, geldigheid_dagen } = {}) {
  if (data !== undefined) validatePdfTemplateData(data);
  const updates = {};
  if (name !== undefined) updates.name = String(name || '').trim() || 'Naamloos sjabloon';
  if (data !== undefined) updates.data = data;
  if (sequence_pattern !== undefined) updates.sequence_pattern = String(sequence_pattern || '').trim() || null;
  if (geldigheid_dagen !== undefined) {
    const n = Number(geldigheid_dagen);
    updates.geldigheid_dagen = Number.isInteger(n) && n > 0 ? n : null;
  }

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

// ─── Bedrijfsprofielen (fs_v2_bedrijf_profielen) ────────────────────────────
//
// Exact dezelfde vorm als een pdf-sjabloon (id/name/data jsonb), enkel de
// TABEL en de betekenis van `data` verschillen: hier is dat de hele
// "Bedrijf"-groep (naam/product/platform/kbo/biv/adres/email/telefoon/
// website) uit één koppeling gekozen via target.pdf_bedrijf_profiel_id, in
// plaats van elk bedrijf.*-veld apart te mappen.

/** Puur -- gebruikt door de CRUD-routes, zelfde controle als validatePdfTemplateData(). */
export function validateBedrijfProfielData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw validatieFout('Een bedrijfsprofiel heeft gegevens nodig.');
  }
}

export async function listBedrijfProfielen(env) {
  const supabase = getSupabaseClient(env);
  const { data, error } = await supabase
    .from('fs_v2_bedrijf_profielen')
    .select('id, name, updated_at')
    .order('name', { ascending: true });
  if (error) throw new Error(`Bedrijfsprofielen ophalen mislukt: ${error.message}`);
  return data || [];
}

export async function getBedrijfProfiel(env, id) {
  const supabase = getSupabaseClient(env);
  const { data, error } = await supabase.from('fs_v2_bedrijf_profielen').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(`Bedrijfsprofiel ophalen mislukt: ${error.message}`);
  if (!data) throw nietGevonden('Bedrijfsprofiel niet gevonden.');
  return data;
}

export async function createBedrijfProfiel(env, { name, data }) {
  validateBedrijfProfielData(data);
  const supabase = getSupabaseClient(env);
  const { data: row, error } = await supabase
    .from('fs_v2_bedrijf_profielen')
    .insert({ name: String(name || '').trim() || 'Nieuw bedrijf', data })
    .select()
    .single();
  if (error) throw new Error(`Bedrijfsprofiel aanmaken mislukt: ${error.message}`);
  return row;
}

export async function updateBedrijfProfiel(env, id, { name, data } = {}) {
  if (data !== undefined) validateBedrijfProfielData(data);
  const updates = {};
  if (name !== undefined) updates.name = String(name || '').trim() || 'Naamloos bedrijf';
  if (data !== undefined) updates.data = data;

  const supabase = getSupabaseClient(env);
  const { data: row, error } = await supabase
    .from('fs_v2_bedrijf_profielen')
    .update(updates)
    .eq('id', id)
    .select()
    .maybeSingle();
  if (error) throw new Error(`Bedrijfsprofiel bewaren mislukt: ${error.message}`);
  if (!row) throw nietGevonden('Bedrijfsprofiel niet gevonden.');
  return row;
}

/** Weigert (409) zolang een fs_v2_targets-rij nog naar dit profiel verwijst. */
export async function deleteBedrijfProfiel(env, id) {
  const supabase = getSupabaseClient(env);
  const { count, error: countError } = await supabase
    .from('fs_v2_targets')
    .select('id', { count: 'exact', head: true })
    .eq('pdf_bedrijf_profiel_id', id);
  if (countError) throw new Error(`Controle op gebruik mislukt: ${countError.message}`);
  if (count && count > 0) {
    throw inGebruikFout(`Dit bedrijfsprofiel wordt nog gebruikt door ${count} stap(pen). Koppel die eerst los.`);
  }

  const { error } = await supabase.from('fs_v2_bedrijf_profielen').delete().eq('id', id);
  if (error) throw new Error(`Bedrijfsprofiel verwijderen mislukt: ${error.message}`);
  return true;
}

async function laadTemplate(env, templateId) {
  if (!templateId) throw new PdfStepError('generate_pdf: geen sjabloon ingesteld.');
  const supabase = getSupabaseClient(env);
  const { data, error } = await supabase
    .from('fs_v2_pdf_templates')
    .select('id, name, data, sequence_pattern, geldigheid_dagen')
    .eq('id', templateId)
    .maybeSingle();
  if (error) throw new PdfStepError(`generate_pdf: sjabloon kon niet geladen worden — ${error.message}`);
  if (!data) throw new PdfStepError('generate_pdf: het gekozen sjabloon bestaat niet meer.');
  return data;
}

/** Atomische UPDATE...RETURNING -- één teller om te verhogen, geen poule zoals bij round-robin. */
async function nextSequenceNumber(env, templateId) {
  const supabase = getSupabaseClient(env);
  const { data, error } = await supabase.rpc('fs_v2_pdf_next_sequence', { p_template_id: templateId });
  if (error) throw new PdfStepError(`generate_pdf: offertenummer ophogen mislukt — ${error.message}`);
  return Number(data);
}

// ─── E-mailadres van de contactpersoon op het domein van het bedrijf ────────

/** Ons hoofddomein: daar staan de medewerkers mee in Odoo (work_email). */
const HOOFDDOMEIN = 'mymmo.com';

/**
 * Het domein van het bedrijf op de offerte: uit `bedrijf.email`
 * (info@syndicoach.be), en anders uit `bedrijf.website`.
 *
 * @param {Object} bedrijf @returns {string|null}
 */
export function bedrijfsdomein(bedrijf) {
  const mail = String((bedrijf && bedrijf.email) || '').trim().toLowerCase();
  const uitMail = mail.includes('@') ? mail.split('@').pop() : '';
  if (/^[a-z0-9.-]+\.[a-z]{2,}$/.test(uitMail)) return uitMail;

  const site = String((bedrijf && bedrijf.website) || '').trim().toLowerCase()
    .replace(/^[a-z]+:\/\//, '').replace(/^www\./, '').split(/[/?#:]/)[0];
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(site) ? site : null;
}

/**
 * Het e-mailadres van de contactpersoon, op het domein van het bedrijf dat de
 * offerte uitbrengt: nico@mymmo.com wordt nico@syndicoach.be op een
 * Syndicoach-offerte.
 *
 * Medewerkers staan in Odoo met hun adres op het HOOFDDOMEIN, maar de klant
 * kent het merk, en een offerte van Syndicoach met een mymmo.com-adres erop
 * leest als een ander bedrijf. Enkel een adres op het hoofddomein wordt
 * omgezet: wie in Odoo bewust een ander adres heeft, houdt dat. Is het domein
 * van het bedrijf niet te bepalen, dan blijft het adres zoals het is.
 *
 * @param {string} email @param {Object} bedrijf @returns {string}
 */
export function emailOpBedrijfsdomein(email, bedrijf) {
  const adres = String(email || '').trim();
  const m = /^([^@\s]+)@([^@\s]+)$/.exec(adres);
  if (!m || m[2].toLowerCase() !== HOOFDDOMEIN) return adres;
  const domein = bedrijfsdomein(bedrijf);
  if (!domein || domein === HOOFDDOMEIN) return adres;
  return `${m[1]}@${domein}`;
}

// ─── Gegenereerde documenten (fs_v2_generated_documents, R2 i.p.v. Odoo) ───
//
// De pdf zelf staat NOOIT in Odoo. ir.attachment is per record permanente
// Postgres-opslag in Odoo, en bij honderden offertes is dat honderden
// megabytes voor documenten die na verzending zelden nog iemand in Odoo zelf
// opzoekt. In plaats daarvan gaat de pdf naar de gedeelde R2_ASSETS-bucket
// (prefix "fsv2-generated-pdfs/", BEWUST uitgesloten van publieke serving --
// zie public-routes.js en FOREIGN_MODULE_PREFIXES in asset-manager/lib/
// namespace.js), met deze tabel als index om te tonen/downloaden/opruimen
// (tabblad "Documenten" op de koppeling).

const GENERATED_PDF_PREFIX = 'fsv2-generated-pdfs/';

function escapeHtml(tekst) {
  return String(tekst == null ? '' : tekst)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function zoekBestaandDocument(env, targetId, submissionId) {
  const supabase = getSupabaseClient(env);
  const { data, error } = await supabase
    .from('fs_v2_generated_documents')
    .select('*')
    .eq('target_id', targetId)
    .eq('submission_id', submissionId)
    .maybeSingle();
  if (error) throw new PdfStepError(`generate_pdf: opzoeken van een bestaand document mislukt — ${error.message}`);
  return data;
}

async function maakGeneratedDocument(env, payload) {
  const supabase = getSupabaseClient(env);
  const { data, error } = await supabase
    .from('fs_v2_generated_documents')
    .insert(payload)
    .select()
    .single();
  if (error) throw new PdfStepError(`generate_pdf: document registreren mislukt — ${error.message}`);
  return data;
}

/** Lijst voor het tabblad "Documenten" -- nieuwste eerst. */
export async function listGeneratedDocuments(env, integrationId) {
  const supabase = getSupabaseClient(env);
  const { data, error } = await supabase
    .from('fs_v2_generated_documents')
    .select('id, target_id, submission_id, filename, bytes, created_at')
    .eq('integration_id', integrationId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`Documenten ophalen mislukt: ${error.message}`);
  return data || [];
}

export async function getGeneratedDocument(env, id) {
  const supabase = getSupabaseClient(env);
  const { data, error } = await supabase.from('fs_v2_generated_documents').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(`Document ophalen mislukt: ${error.message}`);
  if (!data) throw nietGevonden('Document niet gevonden.');
  return data;
}

/** Verwijdert zowel de rij als het R2-object -- best-effort op R2, want een
 *  wees-object in de bucket is onschadelijk (nergens meer naar verwezen),
 *  terwijl een falende rij-verwijdering de gebruiker een reden moet geven. */
export async function deleteGeneratedDocument(env, id) {
  const document = await getGeneratedDocument(env, id);
  const supabase = getSupabaseClient(env);
  const { error } = await supabase.from('fs_v2_generated_documents').delete().eq('id', id);
  if (error) throw new Error(`Document verwijderen mislukt: ${error.message}`);
  try {
    await env.R2_ASSETS.delete(document.r2_key);
  } catch (err) {
    console.error(`Failed to delete R2 object ${document.r2_key}: ${err?.message || err}`);
  }
  return true;
}

/** "Ouder dan N dagen opruimen" -- de bulkactie in het tabblad "Documenten". */
export async function cleanupGeneratedDocuments(env, integrationId, olderThanDays) {
  const dagen = Number(olderThanDays);
  if (!Number.isFinite(dagen) || dagen < 0) {
    throw validatieFout('older_than_days moet een getal van 0 of meer zijn.');
  }
  const grens = new Date(Date.now() - dagen * 24 * 60 * 60 * 1000).toISOString();

  const supabase = getSupabaseClient(env);
  const { data, error } = await supabase
    .from('fs_v2_generated_documents')
    .select('id, r2_key')
    .eq('integration_id', integrationId)
    .lt('created_at', grens);
  if (error) throw new Error(`Op te ruimen documenten ophalen mislukt: ${error.message}`);
  const rijen = data || [];
  if (!rijen.length) return 0;

  const { error: delError } = await supabase
    .from('fs_v2_generated_documents')
    .delete()
    .in('id', rijen.map((r) => r.id));
  if (delError) throw new Error(`Opruimen mislukt: ${delError.message}`);

  for (const rij of rijen) {
    try {
      await env.R2_ASSETS.delete(rij.r2_key);
    } catch (err) {
      console.error(`Failed to delete R2 object ${rij.r2_key}: ${err?.message || err}`);
    }
  }
  return rijen.length;
}

/**
 * "Hangt aan": plaatst een chatter-NOTITIE met een downloadlink op het
 * gekozen record, in plaats van een ir.attachment te koppelen (dat bestaat
 * niet meer sinds de pdf niet meer in Odoo staat). Het MODEL komt uit de
 * step.N.record_model-alias die registerTargetOutput() in worker-handler.js
 * naast record_id zet -- nooit uit target.odoo_model, want dat veld heeft
 * voor een generate_pdf-stap geen eigen betekenis en zou stil uit sync lopen
 * met welke stap in pdf_res_id_source gekozen is.
 *
 * Gooit NOOIT: de pdf zelf is op dit punt al veilig in R2 en geregistreerd --
 * een mislukte notitie is een waarschuwing voor de aanroeper, geen reden om
 * de hele stap te laten falen.
 */
async function plaatsDocumentNotitie(env, { target, contextObject, document }) {
  const bronVeld = String(target.pdf_res_id_source || '').trim();
  if (!bronVeld) return null;

  const ruw = contextObject ? contextObject[bronVeld] : null;
  const recordId = Number.parseInt(String(ruw), 10);
  if (!Number.isInteger(recordId) || recordId <= 0) {
    throw new Error(`vorige stap gaf geen geldig record-ID (bron: "${bronVeld}", waarde: "${String(ruw)}")`);
  }

  const modelKey = bronVeld.endsWith('.record_id')
    ? bronVeld.slice(0, -'record_id'.length) + 'record_model'
    : null;
  const model = modelKey && contextObject ? contextObject[modelKey] : null;
  if (!model) {
    throw new Error(`kon het model van "${bronVeld}" niet bepalen`);
  }

  const url = `${env.APP_BASE_URL}/forminator-v2/api/generated-documents/${document.id}/download`;
  const body = `<p>📄 <a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(document.filename)}</a> is gegenereerd.</p>`;
  return postChatterMessage(env, { model, recordId, body, subtypeXmlid: 'mail.mt_note' });
}

// ─── De stap ────────────────────────────────────────────────────────────────────────────────────

/**
 * Eén `generate_pdf`-stap uitvoeren: sjabloon laden → vullen → renderen → in
 * R2 zetten → registreren. Idempotent via fs_v2_generated_documents (target_id
 * + submission_id) — een retry maakt nooit een tweede pdf.
 *
 * @returns {Promise<{action: 'pdf_generated'|'pdf_reused', documentId: string, r2Key: string, filename: string, detail: string|null}>}
 */
export async function runGeneratePdfStep(env, { target, submissionId, form, contextObject, mappings, resolveMapping }) {
  const template = await laadTemplate(env, target.pdf_template_id);

  const bestaand = await zoekBestaandDocument(env, target.id, submissionId);
  if (bestaand) {
    return {
      action: 'pdf_reused',
      documentId: bestaand.id,
      r2Key: bestaand.r2_key,
      filename: bestaand.filename,
      detail: 'De pdf van een vorige poging bestaat al; niet opnieuw gerenderd.'
    };
  }

  const { gegevens, copy, filename, waarschuwingen } = await buildPdfGegevens(env, {
    target, template, mappings, form, contextObject, resolveMapping
  });
  const meting = {};
  const bytes = await renderPdf(env, { gegevens, copy, meting });
  // In het spoor EN in de log: zonder cijfers is "het duurt lang" niet op te
  // lossen, en dit is de enige stap die seconden kan kosten.
  const timing = `Render ${meting.totaalMs} ms (browser ${meting.browserMs}`
    + `${meting.warm ? ', warm' : ', koud'}, laden ${meting.ladenMs}, vullen ${meting.vullenMs}`
    + `, pdf ${meting.pdfMs}).`;
  console.log(`[pdf-step] target ${target.id} submission ${submissionId}: ${timing}`);

  if (!env.R2_ASSETS) throw new PdfStepError('generate_pdf: R2_ASSETS ontbreekt.');
  const r2Key = `${GENERATED_PDF_PREFIX}${target.integration_id}/${submissionId}-${target.id}.pdf`;
  await env.R2_ASSETS.put(r2Key, bytes, { httpMetadata: { contentType: 'application/pdf' } });

  const document = await maakGeneratedDocument(env, {
    integration_id: target.integration_id,
    target_id: target.id,
    submission_id: submissionId,
    r2_key: r2Key,
    filename,
    bytes: bytes.byteLength || 0
  });

  if (target.pdf_res_id_source) {
    try {
      await plaatsDocumentNotitie(env, { target, contextObject, document });
    } catch (err) {
      waarschuwingen.push(`Notitie op het record plaatsen mislukt: ${err.message}`);
    }
  }

  return {
    action: 'pdf_generated',
    documentId: document.id,
    r2Key,
    filename,
    detail: [...waarschuwingen, timing].join(' ')
  };
}
