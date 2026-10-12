/**
 * Verkoop: van de Odoo-spiegel in D1 naar compacte feiten voor de browser.
 *
 * Dit is de ENIGE plek met de regels. De browser (public/dashboards-sales.js en
 * dashboards-targets.js) telt, filtert en tekent, maar beslist niet wat een
 * abonnement, een verlenging of een stopzetting is. Wil je een regel wijzigen:
 * hier, en in docs/ontwerp-om-verkoopdashboard.md §6.4.
 *
 * DE REGELS
 *
 * Keten (= één abonnement): alle orders met hetzelfde origin_order_id. NOOIT op
 * subscription_id groeperen: dat wijst naar het DIRECT vorige contract, en dan
 * vallen alle orders vanaf de tweede verlenging weg (in oktober 2026: 135 orders,
 * waaronder 43 lopende abonnementen).
 *
 * Periode: een bevestigde order (state sale/done) die geen upsell is. Een periode
 * loopt van haar start_date tot de start van de volgende periode. De laatste:
 *   - lopend (3_progress, 4_paused): open;
 *   - gestopt (6_churn): tot min(end_date, next_invoice_date) -- de betaalde
 *     periode eindigt op next_invoice_date, Odoo sluit soms pas weken later;
 *   - 5_renewed zonder bevestigde opvolger: tot next_invoice_date, en "na te kijken".
 * Een verlengingsOFFERTE (2_renewal, draft/sent) is GEEN periode: het lopende
 * contract blijft gelden tegen zijn prijs, en het abonnement staat op
 * "Wachten op betaling".
 *
 * MRR: recurring_monthly van de periode-order. Een bevestigde upsell wordt in
 * Odoo bij de periode-order opgeteld; vóór de startdatum van die upsell telt hij
 * dus nog niet mee (mrrAt in de browser, met `u` per periode).
 *
 * Klant: commercial_partner_id. Een abonnement op een contactpersoon ("VME Gilmar,
 * Maikel Beckers") hoort bij de VME, ook voor het klanttype.
 *
 * Wissel: een abonnement dat stopt terwijl dezelfde klant binnen
 * switchWindowDays (standaard 30) een ander abonnement heeft of start, is GEEN
 * verloren klant, en dat andere abonnement is geen nieuwe klant. Odoo maakt bij
 * een planwissel of correctie (redenen 7, 13, 14, 16) meestal een nieuw,
 * ongekoppeld contract; zonder deze regel stond dat als verloren + nieuw.
 * Het verschil in MRR telt als wissel (in de brug: uitbreiding/verlaging).
 *
 * Naar expert: het LAATSTE abonnement van een klant stopte, maar op de klant staat
 * nu "facturatie via expert" aan, met een expert en status Actief. Dat is een VME
 * in beheer die voortaan in het abonnement van haar expert zit: geen verloren
 * klant. Odoo bewaart niet wanneer dat vinkje aanging, dus dit volgt de stand van
 * vandaag (endVia, zie "Naar facturatie via expert" hieronder).
 *
 * Uitsluitingen (Supabase sales_exclusions): een uitgesloten klant of order
 * verdwijnt hier, en `excluded` zegt altijd hoeveel -- stil weglaten leest als
 * een kleiner cijfer.
 *
 * DE KLANTEN (zo noemt mymmo ze; zie CLAUDE.md "Dashboards — tabs Verkoop en Targets")
 *
 * Klanttype (x_company_type): VME IN ADVIES (type 1, in Odoo kortweg "VME") beheert
 * het gebouw zelf en krijgt ondersteuning van zijn adviserend expert; VME IN BEHEER
 * (3) heeft een professionele syndicus (soms Syndicoach zelf); PROFESSIONELE
 * SYNDICUS (2) gebruikt het platform voor al zijn gebouwen en betaalt per kavel.
 * Een VME in beheer wordt OF door OpenVME gefactureerd (eigen abonnement OpenVME
 * Professional, ~ EUR 4 per kavel per maand) OF door haar expert (x_studio_invoiced_by_partner:
 * dan heeft ze GEEN eigen abonnement en zitten haar kavels in het abonnement van
 * de professional, tegen zijn eigen prijs).
 * Syndicoach-pakket (x_syndicoach_pack op het gebouw): de DIENST naast de software
 * -- assistant (ondersteuning, uren in regie per credit), captain (Syndicoach is de
 * syndicus), coach. Syndicoach factureert nog niet in Odoo.
 * Begeleiding: de adviserend expert (x_studio_parent_expert) is Syndicoach, een
 * andere expert, of niemand. Een PROFESSIONELE SYNDICUS staat apart: hij heeft
 * geen adviserend expert, hij IS de expert van zijn gebouwen. "Geen expert" is dus
 * enkel een VME (of een klant zonder klanttype) zonder expert -- en dat is een fout
 * in Odoo (staat bij "Na te kijken").
 * Gratis (x_studio_non_invoiced_customer): interne gebruikers met een gratis licentie.
 */

import { readSales, hasSalesDb } from '../../../../lib/sales-db.js';
import { leadMerkWhy, leadProductWhy, leadWonDate, leadVerloren } from './lead-rules.js';
import { resolveChannel, BRAND_LABELS, BRAND_KEYS } from '../lead-kanalen.js';

export const SHAPE_VERSION = 9; // 2: pendHist, 3: waarom (merk, product, leadnaam), 4: pakket, begeleiding, gratis, licentie-aandeel, experts, 5: testpartners, 6: kanaal zoals Aanvragen, licenties gegroepeerd, 7: waarom in zinnen, 8: naar expert (endVia), 9: begeleiding: professionele syndici apart

// Licenties: één per abonnement, de rest zijn opties. Volgorde = volgorde in de filter.
// Basic, Smart en Coached zijn de licenties die vandaag verkocht worden; Unlimited is
// net uitgefaseerd maar blijft apart zichtbaar. Alles van vroeger (early adopter,
// Solo/Team, All in) en wat geen licentie heeft, staat samen: niemand stuurt daar nog op.
const LEGACY = 'Legacy en overig';
const LICENSE_FAMILY = {
  34: 'Basic', 35: 'Smart', 47: 'Coached', 36: 'Unlimited',
  43: 'OpenVME Professional', 41: 'OpenVME Professional', 42: 'Professional',
  26: LEGACY, 15: LEGACY, 16: LEGACY, 17: LEGACY, 18: LEGACY, 27: LEGACY
};
const ADDON = { 31: 'bank', 32: 'bank', 44: 'bank', 38: 'peppol', 28: 'discount' };
// Klanttypes zoals ze intern heten. Odoo noemt type 1 kortweg "VME"; dat is de VME
// die zichzelf beheert en door haar expert geadviseerd wordt.
const CT_LABELS = { 1: 'VME in advies', 3: 'VME in beheer', 2: 'Professionele syndicus' };
const PACK_LABELS = { assistant: 'Assistant', captain: 'Captain', coach: 'Coach' };
const KAVEL_UOMS = { Kavels: 'k', Apartments: 'k', 'Commercial units': 'c', Houses: 'h' };
// Producten zonder abonnement, gegroepeerd zoals het oude dashboard ze toonde.
const TRANS_GROUP = {
  14: 'Credits', 13: 'Oplaadacties wallet', 37: 'Opstarthulp', 40: 'Opstarthulp', 30: 'Import data',
  2: 'Uren in regie', 39: 'Syndicoach 5 uur'
};
// De producten waarvan "Assistant" een nieuw contract telt (Odoo-dashboard 19).
export const ASSISTANT_LICENSES = [34, 35, 36, 47];
export const PRO_LICENSE = 43;

/** Targets van het tabblad Targets: label, merk, leadstroom (voor de omgekeerde funnel), bron. */
export const PRODUCT_TARGETS = [
  { key: 'assistant', label: 'Assistant', merk: 'Syndicoach', stream: 'openvme', unit: '',
    source: 'Nieuwe contracten met Basic, Smart, Unlimited of Coached, op startdatum (geen verlenging, upsell of wissel)' },
  { key: 'opstarthulp', label: 'Opstarthulp', merk: 'Syndicoach', stream: null, unit: '',
    source: 'Bevestigde verkooporders met product Opstarthulp, op orderdatum' },
  { key: 'expert_uren', label: 'Expert-uren', merk: 'Syndicoach', stream: null, unit: 'uur', decimals: 2,
    source: 'Verkochte credits in bevestigde verkooporders ÷ 3 (3 credits = 1 uur), op orderdatum' },
  { key: 'captain', label: 'Captain', merk: 'Syndicoach', stream: 'syndicoach', unit: '',
    source: 'Gewonnen Syndicoach-kansen met Captain-signaal, op wondatum' },
  { key: 'prof_syndici', label: 'Professionele syndici', merk: 'OpenVME', stream: 'openvme', unit: '',
    source: 'Gewonnen kansen met Expert of van een professionele syndicus, op wondatum' },
  { key: 'openvme_professional', label: 'OpenVME Professional (VME\'s)', merk: 'OpenVME', stream: null, unit: '',
    source: 'Nieuwe contracten met OpenVME Professional, op startdatum' }
];

const DAY = 86400e3;
const fmtBru = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels', year: 'numeric', month: '2-digit', day: '2-digit' });
/** 'YYYY-MM-DD HH:MM:SS' (UTC, Odoo) -> 'YYYY-MM-DD' in Brussel. */
export function toBrusselsDate(dt) {
  if (!dt) return null;
  if (dt.length === 10) return dt;
  const d = new Date(dt.replace(' ', 'T') + 'Z');
  return isNaN(d) ? null : fmtBru.format(d);
}
const todayBru = () => fmtBru.format(new Date());
const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);
const addDays = (iso, n) => new Date(Date.parse(iso) + n * DAY).toISOString().slice(0, 10);
const minDate = (...ds) => ds.filter(Boolean).sort()[0] || null;
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** Een woordenboek: tekst -> index, zodat elke rij enkel getallen draagt. */
function dict() {
  const list = [], idx = new Map();
  return {
    list,
    add(v) {
      const k = v == null || v === '' ? '' : String(v);
      if (!idx.has(k)) { idx.set(k, list.length); list.push(k); }
      return idx.get(k);
    }
  };
}

function plotsBucket(n) {
  if (!n || n <= 0) return 'Onbekend';
  if (n <= 4) return '1-4';
  if (n <= 9) return '5-9';
  if (n <= 19) return '10-19';
  if (n <= 49) return '20-49';
  return '50+';
}
const PLOT_ORDER = ['1-4', '5-9', '10-19', '20-49', '50+', 'Onbekend'];

async function loadAll(env) {
  const q = (sql) => readSales(env, sql);
  const [orders, lines, invoices, invLines, partners, products, leads, sheets, lookups, sync, pendHist] = await Promise.all([
    q('SELECT * FROM orders'),
    q('SELECT id, order_id, product_id, uom, qty, price_subtotal, is_recurring, display_type FROM order_lines'),
    q('SELECT id, name, move_type, state, payment_state, partner_id, commercial_id, invoice_date, amount_untaxed_signed FROM invoices'),
    q('SELECT id, move_id, product_id, qty, price_subtotal, sale_line_ids FROM invoice_lines'),
    q('SELECT * FROM partners'),
    q('SELECT * FROM products'),
    q('SELECT * FROM leads'),
    q('SELECT * FROM action_sheets'),
    q('SELECT * FROM lookups'),
    q('SELECT model, last_run_at, last_error FROM sync_state'),
    // "Wachten op betaling" bestaat niet als historiek in Odoo: enkel de dagelijkse
    // momentopname (sinds de eerste sync) kent het verloop.
    q("SELECT day, origin_id, mrr FROM subscription_snapshots WHERE status = 'wachten' ORDER BY day")
  ]);
  return { orders, lines, invoices, invLines, partners, products, leads, sheets, lookups, sync, pendHist };
}

/**
 * @param {object} env
 * @param {object} settings  uit settings.js loadSalesSettings()
 * @returns {Promise<object>} de feiten voor de browser
 */
export async function deriveSalesFacts(env, settings) {
  if (!hasSalesDb(env)) return { configured: false };
  const raw = await loadAll(env);
  const today = todayBru();
  const W = settings.switchWindowDays || 30;

  // ── Opzoeklijsten ────────────────────────────────────────────────────────
  const lk = {};
  raw.lookups.forEach((l) => { (lk[l.kind] = lk[l.kind] || {})[l.id] = { name: l.name, extra: l.extra ? JSON.parse(l.extra) : null }; });
  const lkName = (kind, id) => (id == null ? null : (lk[kind] && lk[kind][String(id)] ? lk[kind][String(id)].name : `#${id}`));
  const stageOf = (id) => (lk.stage && lk.stage[String(id)] ? lk.stage[String(id)].extra : null);
  const stageNr = {};
  Object.entries(lk.stage || {}).sort((a, b) => (a[1].extra.sequence - b[1].extra.sequence) || (Number(a[0]) - Number(b[0])))
    .forEach(([id], i) => { stageNr[id] = i + 1; });
  const stageNames = Object.entries(lk.stage || {}).sort((a, b) => stageNr[a[0]] - stageNr[b[0]]).map(([, v]) => v.name);

  const partner = new Map(raw.partners.map((p) => [p.id, p]));
  const product = new Map(raw.products.map((p) => [p.id, p]));
  const linesByOrder = new Map();
  raw.lines.forEach((l) => { if (!linesByOrder.has(l.order_id)) linesByOrder.set(l.order_id, []); linesByOrder.get(l.order_id).push(l); });
  const orderById = new Map(raw.orders.map((o) => [o.id, o]));

  // ── Uitsluitingen ────────────────────────────────────────────────────────
  const exPartner = new Set(settings.exclusions.filter((e) => e.kind === 'partner' && e.scope !== 'transactional').map((e) => e.record_id));
  const exPartnerTrans = new Set(settings.exclusions.filter((e) => e.kind === 'partner').map((e) => e.record_id));
  const exOrder = new Set(settings.exclusions.filter((e) => e.kind === 'order' && e.scope !== 'transactional').map((e) => e.record_id));
  const exOrderTrans = new Set(settings.exclusions.filter((e) => e.kind === 'order').map((e) => e.record_id));
  const excluded = { subscriptions: 0, mrr: 0, transactional: 0, revenue: 0, items: settings.exclusions };

  const customerOf = (o) => o.commercial_id || (partner.get(o.partner_id) || {}).commercial_id || o.partner_id;

  // ── Klanten: wie, welk type, van welk merk/kanaal, hoe groot ─────────────
  const D = { user: dict(), ct: dict(), plan: dict(), lic: dict(), ch: dict(), org: dict(), syn: dict(), plots: dict(),
    reason: dict(), tg: dict(), lost: dict(), expert: dict(), merk: dict(), mw: dict(), pw: dict(), pack: dict(), beg: dict() };
  ['Geen pakket', 'Assistant', 'Captain', 'Coach'].forEach((x) => D.pack.add(x));
  ['Syndicoach', 'Andere expert', 'Geen expert', 'Professionele syndicus'].forEach((x) => D.beg.add(x));
  // Syndicoach als ADVISEREND EXPERT is de partner met exact die naam. Niet in de
  // code vastgezet als id: dan klopt het dashboard niet meer op een kopie of na een
  // samenvoeging, zonder dat iemand het merkt. meta.syndicoachId zegt welke.
  const syndicoachId = (raw.partners.find((p) => p.is_company && String(p.name || '').trim().toLowerCase() === 'syndicoach') || {}).id || null;
  PLOT_ORDER.forEach((p) => D.plots.add(p));
  D.merk.add('OpenVME'); D.merk.add('Syndicoach'); D.merk.add('Onbekend');
  const tagName = (id) => String(lkName('tag', id) || '').toLowerCase();
  /**
   * Het signaal van de merkregel als ZIN (zonder lead-id: die tekst komt in een
   * woordenlijst). Het staat achter een vraagteken in het dashboard, dus het moet
   * zonder uitleg te lezen zijn.
   */
  const merkTekst = (w) => {
    if (w.k === 'herkomst') return `Syndicoach, want de lead heeft als merk-herkomst "${lkName('sel:crm.lead.x_studio_brand_origin', w.v) || w.v}".`;
    if (w.k === 'kanaal') return `Syndicoach, want de lead kwam via het kanaal "${lkName('sel:crm.lead.x_studio_lead_channel', w.v) || w.v}".`;
    if (w.k === 'naam') return `Syndicoach, want de naam van de lead bevat "${w.v}".`;
    if (w.k === 'label') return `Syndicoach, want de lead heeft het label "${w.v}".`;
    return 'OpenVME, want de lead heeft geen enkel Syndicoach-signaal (niet in de herkomst, het kanaal, de naam of de labels).';
  };
  const GEEN_LEAD = 'Onbekend, want deze klant heeft geen enkele lead in Odoo: niet op zijn orders, niet op de klant zelf en niet op een contactpersoon.';

  // Leads per klant: de lead die het eerste contract opleverde, anders de oudste gewonnen, anders de oudste.
  const leadsByCustomer = new Map();
  raw.leads.forEach((l) => {
    const p = partner.get(l.partner_id);
    const c = p ? (p.commercial_id || p.id) : null;
    if (!c) return;
    if (!leadsByCustomer.has(c)) leadsByCustomer.set(c, []);
    leadsByCustomer.get(c).push(l);
  });
  const leadById = new Map(raw.leads.map((l) => [l.id, l]));
  const sheetByCompany = new Map();
  raw.sheets.forEach((s) => {
    if (!s.company_id) return;
    const prev = sheetByCompany.get(s.company_id);
    if (!prev || String(s.write_date) > String(prev.write_date)) sheetByCompany.set(s.company_id, s);
  });

  const customers = [], custIdx = new Map();
  function customerIndex(cid, firstOrder) {
    if (custIdx.has(cid)) return custIdx.get(cid);
    const p = partner.get(cid) || {};
    const ctId = p.company_type_id || (firstOrder && firstOrder.company_type_id) || null;
    // lh: 0 = kans van het eerste contract, 1 = oudste gewonnen lead, 2 = oudste lead, -1 = geen.
    let lead = firstOrder && firstOrder.opportunity_id ? leadById.get(firstOrder.opportunity_id) : null;
    let lh = lead ? 0 : -1;
    if (!lead) {
      const ls = (leadsByCustomer.get(cid) || []).slice().sort((a, b) => String(a.create_date).localeCompare(String(b.create_date)));
      const won = ls.find((l) => (stageOf(l.stage_id) || {}).is_won);
      lead = won || ls[0] || null;
      lh = won ? 1 : lead ? 2 : -1;
    }
    const mw = lead ? leadMerkWhy(lead, JSON.parse(lead.tags || '[]').map(tagName)) : null;
    const merk = !mw ? 'Onbekend' : mw.merk === 'syndicoach' ? 'Syndicoach' : 'OpenVME';
    const sheet = sheetByCompany.get(cid);
    const syn = (sheet && sheet.current_syndic_type) || p.current_syndic_type || null;
    const synKind = sheet && sheet.current_syndic_type ? 'sel:x_sales_action_sheet.x_studio_current_syndic_type' : 'sel:res.partner.x_studio_current_syndic_type';
    const row = {
      id: cid,
      name: p.name || (firstOrder && `#${cid}`) || `#${cid}`,
      ct: D.ct.add(ctId ? (CT_LABELS[ctId] || lkName('company_type', ctId)) : 'Onbekend'),
      ctId: ctId || 0,
      merk: D.merk.add(merk),
      mw: D.mw.add(mw ? merkTekst(mw) : GEEN_LEAD), lh,
      // Kanaal zoals in Aanvragen (merk-herkomst + x_studio_lead_channel), uit dezelfde lead als het merk.
      ch: D.ch.add(lead ? BRAND_LABELS[resolveChannel(lead.brand_origin, lead.lead_channel)] : 'Geen lead'),
      org: D.org.add(lead && lead.brand_origin ? lkName('sel:crm.lead.x_studio_brand_origin', lead.brand_origin) : (lead ? 'Geen herkomst' : 'Geen lead')),
      syn: D.syn.add(syn ? lkName(synKind, syn) : 'Onbekend'),
      plotsN: (sheet && (sheet.plots || sheet.apartments)) || p.number_of_plots || p.number_of_apartments || 0,
      inv: p.invoiced_by_partner ? 1 : 0,
      expert: D.expert.add(p.parent_expert_id ? (partner.get(p.parent_expert_id) || {}).name || `#${p.parent_expert_id}` : 'Geen'),
      pack: D.pack.add(p.syndicoach_pack ? (PACK_LABELS[p.syndicoach_pack] || p.syndicoach_pack) : 'Geen pakket'),
      beg: D.beg.add(ctId === 2 ? 'Professionele syndicus' : !p.parent_expert_id ? 'Geen expert' : p.parent_expert_id === syndicoachId ? 'Syndicoach' : 'Andere expert'),
      free: p.non_invoiced ? 1 : 0,
      lead: lead ? lead.id : null
    };
    custIdx.set(cid, customers.length);
    customers.push(row);
    return customers.length - 1;
  }

  // ── Ketens ───────────────────────────────────────────────────────────────
  const subOrders = raw.orders.filter((o) => o.sub_state && o.sub_state !== '1_draft');
  const byChain = new Map();
  subOrders.forEach((o) => {
    const k = o.origin_id || o.id;
    if (!byChain.has(k)) byChain.set(k, []);
    byChain.get(k).push(o);
  });

  const attention = [];
  // drill: optioneel, de sleutel van een lijst in het dashboard (een venster met alles, niet enkel de eerste 25 links).
  const att = (sev, kind, title, detail, refs, drill) => attention.push({ sev, kind, title, detail, refs: refs || [], ...(drill ? { drill } : {}) });
  const ref = (o) => ({ model: 'sale.order', id: o.id, label: o.name });

  function licenseOf(orderId) {
    const ls = (linesByOrder.get(orderId) || []).filter((l) => l.is_recurring && !l.display_type && l.qty > 0);
    const lic = ls.find((l) => LICENSE_FAMILY[l.product_id]);
    let k = 0, c = 0, h = 0, bank = 0, peppol = 0, allSub = 0, addSub = 0;
    ls.forEach((l) => {
      allSub += l.price_subtotal || 0;
      if (ADDON[l.product_id] === 'bank' || ADDON[l.product_id] === 'peppol') addSub += l.price_subtotal || 0;
      const u = KAVEL_UOMS[l.uom];
      if (u === 'k') k += l.qty; else if (u === 'c') c += l.qty; else if (u === 'h') h += l.qty;
      if (ADDON[l.product_id] === 'bank') bank += l.qty;
      if (ADDON[l.product_id] === 'peppol') peppol += l.qty;
    });
    // Basic/Smart/Coached worden per kavel gefactureerd met de eenheid "Units":
    // dan is het aantal op de licentielijn het aantal kavels.
    if (!k && !c && !h && lic && [34, 35, 47].includes(lic.product_id)) k = lic.qty;
    return {
      fam: lic ? LICENSE_FAMILY[lic.product_id] : LEGACY,
      licId: lic ? lic.product_id : null,
      k: r2(k), c: r2(c), h: r2(h), bank: r2(bank), peppol: r2(peppol),
      // lf: aandeel van de licentie in de MRR (alles behalve bank en Peppol; een korting
      // hoort bij de licentie). Licentie-MRR = mrrAt() x lf, en per kavel = / (k+c+h).
      lf: allSub > 0 ? Math.max(0, Math.min(1, r2((allSub - addSub) / allSub))) : 1
    };
  }

  const chains = [];
  for (const [key, list] of byChain) {
    const root = orderById.get(key) || list[0];
    const cid = customerOf(root);
    if (exPartner.has(cid) || exOrder.has(key)) {
      const cur = list.filter((o) => o.sub_state === '3_progress' && o.state === 'sale');
      excluded.subscriptions += cur.length ? 1 : 0;
      excluded.mrr += cur.reduce((s, o) => s + (o.recurring_monthly || 0), 0);
      continue;
    }
    const confirmed = list.filter((o) => ['sale', 'done'].includes(o.state) && o.sub_state !== '7_upsell' && o.sub_state !== '2_renewal' && o.start_date)
      .sort((a, b) => a.start_date.localeCompare(b.start_date) || a.id - b.id);
    if (!confirmed.length) continue;
    const ups = list.filter((o) => o.sub_state === '7_upsell' && ['sale', 'done'].includes(o.state) && o.start_date);
    const pend = list.filter((o) => o.sub_state === '2_renewal' && ['draft', 'sent'].includes(o.state));

    const periods = confirmed.map((o, i) => {
      const next = confirmed[i + 1];
      let end = next ? next.start_date : null;
      if (!next && o.sub_state === '6_churn') end = minDate(o.end_date, o.next_invoice_date) || o.start_date;
      if (!next && o.sub_state === '5_renewed') {
        end = o.next_invoice_date || o.end_date || o.start_date;
        att('warn', 'renewed_no_successor', `${o.name}: verlengd zonder bevestigde opvolger`,
          'Odoo zegt "verlengd", maar er is geen bevestigde volgende periode. Het abonnement telt tot de einddatum en daarna als gestopt.', [ref(o)]);
      }
      const lic = licenseOf(o.id);
      const u = ups.filter((x) => x.parent_id === o.id && x.start_date > o.start_date && (!end || x.start_date < end))
        .map((x) => [x.start_date, r2(x.recurring_monthly)]);
      return { s: o.start_date, e: end, m: r2(o.recurring_monthly), o: o.id, n: o.name, st: o.sub_state, u, ...lic };
    });
    const last = confirmed[confirmed.length - 1];
    const lastP = periods[periods.length - 1];
    const ended = lastP.e !== null;
    const ci = customerIndex(cid, confirmed[0]);
    const chain = {
      id: key, c: ci,
      user: D.user.add(lkName('user', last.user_id || confirmed[0].user_id) || 'Geen verkoper'),
      plan: D.plan.add(lkName('plan', last.plan_id) || 'Geen plan'),
      lic: D.lic.add(periods[0].fam), licNow: D.lic.add(lastP.fam), licId: periods[0].licId,
      start: periods[0].s,
      end: ended ? lastP.e : null,
      reason: ended && last.close_reason_id ? D.reason.add(lkName('close_reason', last.close_reason_id)) : -1,
      reasonId: ended ? last.close_reason_id || null : null,
      paused: !ended && last.sub_state === '4_paused' ? 1 : 0,
      pend: null, p: periods,
      onContact: (() => { const p = partner.get(last.partner_id); return p && !p.is_company && p.parent_id ? 1 : 0; })(),
      newSwitch: 0, endSwitch: 0, endVia: null
    };
    if (pend.length && !ended) {
      const q = pend.sort((a, b) => b.id - a.id)[0];
      const due = last.next_invoice_date;
      chain.pend = { o: q.id, n: q.name, m: r2(q.recurring_monthly), due, overdue: due ? daysBetween(due, today) : null };
      if (chain.pend.overdue !== null && chain.pend.overdue > 30) {
        att('warn', 'pending_long', `${q.name}: verlengingsofferte staat ${chain.pend.overdue} dagen open`,
          `${customers[ci].name}. Het abonnement telt nog als actief tegen de lopende prijs.`, [ref(q), ref(last)]);
      }
    }
    if (!ended && !chain.pend && last.next_invoice_date && daysBetween(last.next_invoice_date, today) > 14) {
      att('warn', 'expired_running', `${last.name}: lopend, maar de periode eindigde ${daysBetween(last.next_invoice_date, today)} dagen geleden`,
        `${customers[ci].name}. Geen verlengingsofferte en niet stopgezet: telt als actief tot iemand het afsluit of verlengt.`, [ref(last)]);
    }
    if (!ended && (partner.get(cid) || {}).invoiced_by_partner) {
      att('warn', 'via_expert_own_sub', `${last.name}: eigen abonnement, maar "facturatie via expert" staat aan`,
        `${customers[ci].name}. Dan factureert de expert dit gebouw in zijn eigen abonnement: wordt het dubbel aangerekend, of staat het vinkje verkeerd?`, [ref(last)]);
    }
    if (!ended && (last.recurring_monthly || 0) <= 0) {
      att('info', 'zero_mrr', `${last.name}: lopend abonnement zonder bedrag`, `${customers[ci].name}. Telt als abonnement, niet in de ARR.`, [ref(last)]);
    }
    chains.push(chain);
  }

  // ── Wissels: per klant, stopzetting ↔ start binnen W dagen ───────────────
  const chainsByCust = new Map();
  chains.forEach((ch, i) => { if (!chainsByCust.has(ch.c)) chainsByCust.set(ch.c, []); chainsByCust.get(ch.c).push(i); });
  chains.forEach((ch) => {
    const others = (chainsByCust.get(ch.c) || []).map((i) => chains[i]).filter((o) => o !== ch);
    // Nieuw is een wissel als de klant in de W dagen ervoor al een abonnement had.
    const from = addDays(ch.start, -W);
    if (others.some((o) => o.start < ch.start && (!o.end || o.end >= from))) ch.newSwitch = 1;
    // Stoppen is een wissel als de klant binnen W dagen erna (of al) een ander abonnement heeft.
    // Stoppen is een wissel als de klant in de W dagen erna een ander abonnement heeft
    // (al lopend of net gestart).
    if (ch.end) {
      const to = addDays(ch.end, W);
      if (others.some((o) => o.start <= to && (!o.end || o.end > ch.end))) ch.endSwitch = 1;
    }
  });
  // ── Naar facturatie via expert ───────────────────────────────────────────
  // Een VME in beheer gaat soms van facturatie door OpenVME (eigen abonnement) over
  // naar facturatie door haar expert. In Odoo stopt dan haar eigen abonnement (meestal
  // met reden 7, "vernieuwd met een nieuw plan"), gaat "facturatie via expert" aan en
  // blijft haar status Actief. Dat is geen verloren klant: haar kavels zitten voortaan
  // in het abonnement van de expert, tegen zijn prijs. Gemeten op 2026-10-08: Beterveld,
  // Mheerstraat en Zavelpand II (Immo Pauly, 1 oktober) en Excelsior (Marco Vanerom,
  // 24 september) stonden zo als verloren.
  // Odoo bewaart niet WANNEER het vinkje aanging; dit volgt dus de stand van vandaag.
  // Daarom enkel het LAATSTE abonnement van de klant, en enkel zolang vinkje, expert en
  // status (x_studio_company_status = 'Active') zo staan. Komt de status op iets anders
  // (Blocked, ...), dan is het vanzelf weer verloren.
  // endVia: [expert-id, naam, lopend abonnement van de expert [order-id, naam, mrr, sinds] of null]
  chains.forEach((ch) => {
    if (!ch.end || ch.endSwitch) return;
    const p = partner.get(customers[ch.c].id);
    if (!p || p.active === 0 || !p.invoiced_by_partner || p.company_status !== 'Active' || !p.parent_expert_id) return;
    if ((chainsByCust.get(ch.c) || []).some((i) => chains[i] !== ch && chains[i].start > ch.start)) return;
    const eCh = custIdx.has(p.parent_expert_id)
      ? (chainsByCust.get(custIdx.get(p.parent_expert_id)) || []).map((i) => chains[i]).find((x) => !x.end) : null;
    const eLp = eCh ? eCh.p[eCh.p.length - 1] : null;
    ch.endVia = [p.parent_expert_id, (partner.get(p.parent_expert_id) || {}).name || `#${p.parent_expert_id}`,
      eLp ? [eLp.o, eLp.n, eLp.m, eCh.start] : null];
  });
  const NOT_CHURN_REASONS = [7, 13, 14, 16];
  chains.forEach((ch) => {
    if (ch.end && !ch.endSwitch && !ch.endVia && ch.end <= today && NOT_CHURN_REASONS.includes(ch.reasonId)) {
      const last = ch.p[ch.p.length - 1];
      const c = customers[ch.c];
      att('warn', 'switch_without_successor', `${last.n}: gestopt met "${lkName('close_reason', ch.reasonId)}" zonder opvolger`,
        `${c.name}${c.inv ? ' · facturatie via expert' : ''}. Telt als verloren klant. Is dit een planwissel, een correctie, of `
        + 'verhuisd naar de facturatie van een professionele syndicus?', [{ model: 'sale.order', id: last.o, label: last.n }]);
    }
  });
  // Een VME met een lopend abonnement hoort een adviserend expert te hebben. Ontbreekt
  // die, dan staat ze in "Begeleiding" onder "Geen expert" -- een fout in Odoo, geen keuze.
  const zonderExpert = [];
  for (const [ci, idxs] of chainsByCust) {
    const c = customers[ci];
    if ((c.ctId === 1 || c.ctId === 3) && D.beg.list[c.beg] === 'Geen expert' && idxs.some((i) => !chains[i].end)) zonderExpert.push(c);
  }
  if (zonderExpert.length) {
    att('warn', 'vme_no_expert', `${zonderExpert.length} VME's met een lopend abonnement zonder adviserend expert`,
      'In Odoo is "Parent expert" leeg. Een VME in advies of in beheer hoort een expert te hebben; in Verloop > Begeleiding staat ze nu onder "Geen expert".',
      zonderExpert.slice(0, 25).map((c) => ({ model: 'res.partner', id: c.id, label: c.name })));
  }
  // Meer dan één lopend abonnement bij dezelfde klant.
  for (const [ci, idxs] of chainsByCust) {
    const running = idxs.map((i) => chains[i]).filter((ch) => !ch.end);
    if (running.length > 1) {
      att('info', 'multiple_running', `${customers[ci].name}: ${running.length} lopende abonnementen`,
        'Kan kloppen (twee gebouwen onder één klant), kan ook een dubbel contract zijn.',
        running.map((ch) => { const p = ch.p[ch.p.length - 1]; return { model: 'sale.order', id: p.o, label: p.n }; }));
    }
  }
  chains.filter((ch) => ch.onContact && !ch.end).forEach((ch) => {
    const p = ch.p[ch.p.length - 1];
    att('info', 'on_contact', `${p.n}: staat op een contactpersoon`,
      `Telt bij de VME ${customers[ch.c].name} (ook voor het klanttype). In Odoo staat de order op de persoon.`, [{ model: 'sale.order', id: p.o, label: p.n }]);
  });

  // ── Transactionele producten ─────────────────────────────────────────────
  const invByLine = new Map(); // sale.order.line -> {date, paid}
  const invoiceById = new Map(raw.invoices.map((i) => [i.id, i]));
  raw.invLines.forEach((il) => {
    const inv = invoiceById.get(il.move_id);
    if (!inv || inv.state !== 'posted' || inv.move_type !== 'out_invoice') return;
    JSON.parse(il.sale_line_ids || '[]').forEach((sl) => {
      const prev = invByLine.get(sl);
      if (!prev || inv.invoice_date < prev.d) invByLine.set(sl, { d: inv.invoice_date, paid: ['paid', 'in_payment'].includes(inv.payment_state) ? 1 : 0 });
    });
  });
  const tg = D.tg;
  const trans = [];
  raw.lines.forEach((l) => {
    const pr = product.get(l.product_id);
    if (!pr || pr.is_recurring || l.display_type || !(l.qty > 0)) return;
    const o = orderById.get(l.order_id);
    if (!o || !['sale', 'done'].includes(o.state)) return;
    const cid = customerOf(o);
    if (exPartnerTrans.has(cid) || exOrderTrans.has(o.id)) { excluded.transactional += l.price_subtotal || 0; return; }
    const g = TRANS_GROUP[l.product_id] || pr.name;
    const inv = invByLine.get(l.id);
    trans.push([toBrusselsDate(o.date_order), inv ? inv.d : '', inv ? inv.paid : 0, tg.add(g), r2(l.qty), r2(l.price_subtotal),
      customerIndex(cid, o), o.id, l.product_id]);
  });

  // ── Gefactureerde omzet per bron ─────────────────────────────────────────
  const BRON = dict();
  ['Abonnementen', 'Professionele abonnementen', 'Transactioneel', 'Overig'].forEach((b) => BRON.add(b));
  const revAgg = new Map();
  raw.invLines.forEach((il) => {
    const inv = invoiceById.get(il.move_id);
    if (!inv || inv.state !== 'posted' || !inv.invoice_date) return;
    const cid = inv.commercial_id || inv.partner_id;
    const sign = inv.move_type === 'out_refund' ? -1 : 1;
    if (exPartner.has(cid)) { excluded.revenue += sign * (il.price_subtotal || 0); return; }
    const pr = product.get(il.product_id);
    const p = partner.get(cid) || {};
    const bron = !pr ? 'Overig' : pr.is_recurring ? (p.company_type_id === 2 ? 'Professionele abonnementen' : 'Abonnementen') : 'Transactioneel';
    const k = `${inv.id}|${bron}`;
    const cur = revAgg.get(k) || [inv.invoice_date, BRON.add(bron), 0, custIdx.has(cid) ? custIdx.get(cid) : customerIndex(cid, null), inv.id,
      ['paid', 'in_payment', 'reversed'].includes(inv.payment_state) ? 1 : 0, inv.name];
    cur[2] = r2(cur[2] + sign * (il.price_subtotal || 0));
    revAgg.set(k, cur);
  });
  const revenue = [...revAgg.values()].filter((r) => r[2] !== 0);

  // ── Leads (Targets) ──────────────────────────────────────────────────────
  const PROD = dict(); ['assistant', 'opstarthulp', 'captain', 'prof_syndicus', 'niet_toegewezen'].forEach((p) => PROD.add(p));
  const leadFrom = `${Number(today.slice(0, 4)) - 2}-01-01`;
  const leads = [];
  let lostNoReason = 0, noStage = 0;
  const unassignedWon = [], expertSc = [];
  const fyStart = fiscalYearStart(today, settings.fyStartMonth);
  raw.leads.forEach((l) => {
    const cd = toBrusselsDate(l.create_date);
    if (!cd || cd < leadFrom) return;
    const tags = JSON.parse(l.tags || '[]').map(tagName);
    const mw = leadMerkWhy(l, tags), merk = mw.merk;
    const p = partner.get(l.partner_id);
    const pw = leadProductWhy(l, merk, tags, [p, p && partner.get(p.parent_id)]), prod = pw.prod;
    const won = leadWonDate(l, stageOf(l.stage_id), toBrusselsDate);
    const verloren = leadVerloren(l);
    const nr = stageNr[String(l.stage_id)] || 0;
    if (!nr) noStage++;
    if (verloren && !l.lost_reason_id && cd >= fyStart) lostNoReason++;
    if (won && won >= fyStart && prod === 'niet_toegewezen') unassignedWon.push({ model: 'crm.lead', id: l.id, label: l.name || `#${l.id}` });
    if (prod === 'prof_syndicus' && merk === 'syndicoach' && cd >= fyStart) expertSc.push({ model: 'crm.lead', id: l.id, label: l.name || `#${l.id}` });
    const cust = p ? (p.commercial_id || p.id) : null;
    leads.push([l.id, cd, merk === 'syndicoach' ? 1 : 0, PROD.add(prod), nr, verloren ? 1 : 0, won || '',
      D.user.add(lkName('user', l.user_id) || 'Geen verkoper'),
      D.ch.add(BRAND_LABELS[resolveChannel(l.brand_origin, l.lead_channel)]),
      D.org.add(l.brand_origin ? lkName('sel:crm.lead.x_studio_brand_origin', l.brand_origin) : 'Geen herkomst'),
      D.lost.add(l.lost_reason_id ? lkName('lost_reason', l.lost_reason_id) : (verloren ? 'Gearchiveerd zonder reden' : '')),
      l.type === 'opportunity' ? 1 : 0, cust && custIdx.has(cust) ? custIdx.get(cust) : -1,
      String(l.name || '').slice(0, 80), D.mw.add(merkTekst(mw)), D.pw.add(pw.why)]);
  });
  if (unassignedWon.length) att('warn', 'lead_unassigned_won', `${unassignedWon.length} gewonnen kansen met product "Niet toegewezen"`,
    'Syndicoach-kansen zonder Captain- of Opstarthulp-signaal tellen voor geen enkel product. Zet "captain" of "opstarthulp" in de naam, een label of het pakket.', unassignedWon.slice(0, 25));
  if (expertSc.length) att('info', 'lead_expert_sc', `${expertSc.length} expert-leads met merk Syndicoach`,
    'Product = Professionele syndicus; het merk volgt de merkregel. Klopt het merk?', expertSc.slice(0, 25));
  if (noStage) att('info', 'lead_no_stage', `${noStage} leads zonder fase`, 'Tellen niet mee in de funnel.', []);
  if (lostNoReason) att('info', 'lead_lost_no_reason', `${lostNoReason} verloren leads dit boekjaar zonder verliesreden`,
    'Gearchiveerd zonder reden. Hoe meer redenen ingevuld, hoe bruikbaarder de verliesanalyse.', []);

  // ── Professionals: geplande starts die nog niet in Odoo staan ────────────
  const planned = (settings.planned || []).map((pl) => {
    const running = pl.odoo_partner_id ? (chainsByCust.get(custIdx.get(pl.odoo_partner_id)) || []).some((i) => !chains[i].end) : false;
    return { id: pl.id, name: pl.name, start: pl.start_month, plots: pl.plots, mrr: Number(pl.mrr), partner: pl.odoo_partner_id, note: pl.note, inOdoo: running };
  });
  planned.filter((pl) => !pl.inOdoo && pl.start < today.slice(0, 7) + '-01').forEach((pl) => {
    att('info', 'planned_past', `Gepland: ${pl.name} zou starten in ${pl.start.slice(0, 7)}`, 'Staat nog niet als lopend abonnement in Odoo. Pas de startmaand aan of koppel de Odoo-partner.', []);
  });
  if (excluded.subscriptions || excluded.transactional) {
    att('info', 'excluded', 'Uitgesloten uit de verkoopcijfers',
      settings.exclusions.map((e) => `${e.label || e.kind + ' ' + e.record_id}: ${e.reason}`).join(' · '), []);
  }

  // ── Test- en interne partners, om in Odoo op te ruimen ──────────────────
  // Gevonden op de NAAM: een SUGGESTIE, geen regel. Ze tellen gewoon mee tot iemand
  // ze in Odoo opruimt (archiveren, of "Niet gefactureerde klant" aanvinken) -- het
  // dashboard toont ze enkel, met een link naar elk record. Uitsluiten zou ze net
  // onzichtbaar maken, en dan ruimt niemand ze op.
  // tests: [partner-id, naam, klanttype-id, reden ('naam'|'expert'|'ouder'), hoort bij (id) of 0,
  //         gebouwen met deze partner als expert, waarvan facturatie via expert, leads, lopend abonnement [order-id, naam, mrr] of null]
  // Begin van een woord, niet het hele woord: "Testgebouw" en "TestVME" horen erbij,
  // "Grotestraat" en "Septestraat" niet. "Teststraat" wel -- een suggestie, geen regel.
  const TEST_RE = /\b(test|demo|dummy|proef|fictief)|^mymmo\b/i;
  const testIds = new Set(raw.partners.filter((p) => p.is_company && p.active !== 0 && TEST_RE.test(String(p.name || '').trim())).map((p) => p.id));
  const lopendVan = (pid) => {
    if (!custIdx.has(pid)) return null;
    const ch = (chainsByCust.get(custIdx.get(pid)) || []).map((i) => chains[i]).find((x) => !x.end);
    if (!ch) return null;
    const lp = ch.p[ch.p.length - 1];
    return [lp.o, lp.n, lp.m];
  };
  const tests = [];
  raw.partners.forEach((p) => {
    if (!p.is_company || p.active === 0) return;
    const eigen = testIds.has(p.id);
    const bij = eigen ? 0 : testIds.has(p.parent_expert_id) ? p.parent_expert_id : testIds.has(p.parent_id) ? p.parent_id : 0;
    if (!eigen && !bij) return;
    const kinderen = eigen ? raw.partners.filter((x) => x.parent_expert_id === p.id && x.active !== 0) : [];
    tests.push([p.id, p.name || `#${p.id}`, p.company_type_id || 0, eigen ? 'naam' : (p.parent_expert_id === bij ? 'expert' : 'ouder'), bij,
      kinderen.length, kinderen.filter((x) => x.invoiced_by_partner).length, (leadsByCustomer.get(p.id) || []).length, lopendVan(p.id)]);
  });
  const testEigen = tests.filter((t) => !t[4]);
  if (testEigen.length) {
    att('warn', 'test_partners', `${testEigen.length} test- of interne partners in Odoo, met ${tests.length - testEigen.length} gebouwen eraan`,
      'Gevonden op de naam (test, demo, proef, een naam die met Mymmo begint): een suggestie, geen regel. Ze tellen gewoon mee tot ze in Odoo opgeruimd zijn. '
        + 'De lijst toont per partner wat eraan hangt: gebouwen, leads, een lopend abonnement.',
      testEigen.slice(0, 25).map((t) => ({ model: 'res.partner', id: t[0], label: t[1] })), 'tests');
  }

  // ── Gebouwen per expert ──────────────────────────────────────────────────
  // Een gebouw met "facturatie via expert" heeft geen eigen abonnement: de expert
  // factureert het in zijn professioneel abonnement. Hier staat per expert hoeveel
  // gebouwen dat zijn en hoeveel kavels ze volgens Odoo (partner) hebben, zodat het
  // dashboard dat naast de GEFACTUREERDE kavels kan zetten.
  // viaBuildings: [expertId, gebouw-id, naam, kavels volgens Odoo (0 = onbekend)]
  const viaBuildings = [], expertAgg = new Map();
  raw.partners.forEach((p) => {
    if (!p.is_company || p.active === 0 || !p.parent_expert_id || exPartner.has(p.id) || exPartner.has(p.parent_expert_id)) return;
    const e = expertAgg.get(p.parent_expert_id) || { n: 0, via: 0, viaPlots: 0, viaUnknown: 0 };
    e.n++;
    if (p.invoiced_by_partner) {
      const kv = p.number_of_plots || p.number_of_apartments || 0;
      e.via++; e.viaPlots += kv; if (!kv) e.viaUnknown++;
      viaBuildings.push([p.parent_expert_id, p.id, p.name || `#${p.id}`, kv]);
    }
    expertAgg.set(p.parent_expert_id, e);
  });
  // experts: [expert-id, naam, klantindex (-1 = geen klant), gebouwen, via expert, kavels via, via zonder kavelaantal]
  const experts = [...expertAgg.entries()].map(([id, e]) => [id, (partner.get(id) || {}).name || `#${id}`,
    custIdx.has(id) ? custIdx.get(id) : -1, e.n, e.via, e.viaPlots, e.viaUnknown]);

  // Aantal kavels: actieblad of partner, anders het aantal op de licentielijn
  // (Basic/Smart/Coached en Professional worden per kavel gefactureerd).
  chains.forEach((ch) => {
    const c = customers[ch.c], lp = ch.p[ch.p.length - 1];
    if (!c.plotsN) c.plotsN = Math.round((lp.k || 0) + (lp.c || 0) + (lp.h || 0));
  });
  customers.forEach((c) => { c.plots = D.plots.add(plotsBucket(c.plotsN)); });

  const lastRun = raw.sync.map((s) => s.last_run_at).filter(Boolean).sort();
  return {
    configured: true,
    shape: SHAPE_VERSION,
    meta: {
      today, fyStartMonth: settings.fyStartMonth, switchWindowDays: W,
      syncedAt: lastRun.length ? lastRun[0] : null,
      syncErrors: raw.sync.filter((s) => s.last_error).map((s) => ({ model: s.model, error: s.last_error })),
      odooUrl: 'https://mymmo.odoo.com',
      products: PRODUCT_TARGETS, stages: stageNames, assistantLicenses: ASSISTANT_LICENSES, proLicense: PRO_LICENSE,
      syndicoachId,
      // De kanalen in de volgorde van het tabblad Aanvragen (per merk), zodat
      // "Kanaal (lead)" dezelfde volgorde en kleuren krijgt (dashboards-sales.js).
      kanalen: BRAND_KEYS.map((k) => ({ key: k, label: BRAND_LABELS[k] }))
    },
    dict: Object.fromEntries(Object.entries(D).map(([k, v]) => [k, v.list])),
    bron: BRON.list, leadProducts: PROD.list,
    customers, chains, trans, revenue, leads, planned, experts, viaBuildings, tests,
    pendHist: raw.pendHist.map((r) => [r.day, r.origin_id, r2(r.mrr)]),
    attention, excluded: { ...excluded, mrr: r2(excluded.mrr), transactional: r2(excluded.transactional), revenue: r2(excluded.revenue) },
    manualRatios: settings.manualRatios
  };
}

/** Eerste dag van het boekjaar waarin `today` valt. */
export function fiscalYearStart(today, startMonth) {
  const y = Number(today.slice(0, 4)), m = Number(today.slice(5, 7));
  const fy = m >= startMonth ? y : y - 1;
  return `${fy}-${String(startMonth).padStart(2, '0')}-01`;
}

/** De stand per keten vandaag, voor de dagelijkse momentopname (sync.js writeSnapshot). */
export function snapshotRows(facts) {
  const t = facts.meta.today;
  return facts.chains.map((ch) => {
    const p = ch.p.filter((x) => x.s <= t && (!x.e || x.e > t)).pop();
    const c = facts.customers[ch.c];
    return {
      id: ch.id, cur: p ? p.o : null, cust: c.id,
      status: !p ? 'gestopt' : ch.pend ? 'wachten' : ch.paused ? 'gepauzeerd' : 'actief',
      mrr: p ? p.m : 0, ct: c.ctId || null, plan: null
    };
  });
}

// ── Cache ──────────────────────────────────────────────────────────────────
// De berekening leest ~25.000 rijen uit D1. Ze wordt bewaard tot de volgende
// sync (SALES_VERSION_KEY in KV) of tot de instellingen veranderen.
export async function getSalesFactsCached(env, ctx, settings) {
  const version = env.MAPPINGS_KV ? (await env.MAPPINGS_KV.get('sales:version')) || '0' : '0';
  const sHash = await sha(JSON.stringify([settings.exclusions.map((e) => [e.kind, e.record_id, e.scope]), settings.planned,
    settings.fyStartMonth, settings.switchWindowDays, settings.manualRatios]));
  const key = new Request(`https://om-cache.internal/sales-facts?v=${version}&s=${sHash}&shape=${SHAPE_VERSION}&d=${todayBru()}`);
  const cache = typeof caches !== 'undefined' ? caches.default : null;
  if (cache) {
    const hit = await cache.match(key);
    if (hit) return hit.json();
  }
  const facts = await deriveSalesFacts(env, settings);
  if (cache && facts.configured) {
    const res = new Response(JSON.stringify(facts), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=3600' } });
    const put = cache.put(key, res);
    if (ctx && ctx.waitUntil) ctx.waitUntil(put); else await put;
  }
  return facts;
}

async function sha(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].slice(0, 8).map((b) => b.toString(16).padStart(2, '0')).join('');
}
