/**
 * "In het kort": het eerste wat een salesmedewerker ziet als hij een gebouw
 * opvraagt. EEN tabel met de kern, hoogstens drie punten om na te kijken, de
 * volgende stap, en wat er nog ontbreekt. Puur: geen env, geen fetch.
 *
 * Dit blok staat KLAAR in Markdown, zodat Claude het overneemt in plaats van
 * zelf een lap tekst te schrijven uit het hele dossier (gevraagd door Nico,
 * 2026-10-23: "nu is het een flap tekst en dat is veel leeswerk"). De rest van
 * het dossier blijft eronder staan voor de vragen die volgen.
 */

import { isLeeg } from './velden.js';
import { htmlNaarTekst } from './tekst.js';

const m2oId = (v) => (Array.isArray(v) ? v[0] : null);
const m2oNaam = (v) => (Array.isArray(v) ? v[1] : null);
const cel = (s) => String(s == null ? '' : s).replace(/\|/g, '/').replace(/\s+/g, ' ').trim() || '-';

/** 2026-10-21 of 2026-10-21 06:05:00 -> 21/10 (met het jaar als het niet dit jaar is). */
export function kortDatum(s) {
  if (!s) return '';
  const [j, m, d] = String(s).slice(0, 10).split('-');
  if (!d) return '';
  return `${d}/${m}${j !== String(new Date().getUTCFullYear()) ? '/' + j : ''}`;
}

function eersteZin(tekst, max = 110, onderwerp = '') {
  // De kopregel die de connector zelf boven een notitie zet, zegt niets over de inhoud.
  let t = String(tekst || '').replace(/^Via Claude[^\n]*\n/, '').replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim();
  // Een mail begint met haar onderwerp (zo zet de Gmail-koppeling ze in de chatter), en met "Beste ...".
  const ow = String(onderwerp || '').trim();
  if (ow && t.startsWith(ow)) t = t.slice(ow.length).trim();
  t = t.replace(/^(re|fw|fwd|tr)\s*:\s*/i, '').replace(/^(beste|dag|hallo|hoi|bonjour|goedemiddag|goedemorgen)[^,.!]{0,40}[,.!]?\s*/i, '');
  if (!t) return '';
  const zin = t.split(/(?<=[.!?])\s/)[0];
  return (zin.length > max ? zin.slice(0, max).trimEnd() + '…' : zin);
}

function faseVan(l) {
  if (!l) return null;
  if (l.active === false) return l.probability === 0 ? 'verloren' : 'gearchiveerd';
  if (l.probability === 100) return 'gewonnen';
  return m2oNaam(l.stage_id);
}

// Wat sales het eerst wil weten, eerst. Op het LABEL (zoals in Studio), dus vrij te
// herschrijven zonder de code; wat er niet in staat, komt achteraan.
const BELANGRIJK = [
  /totaal aantal kavels/i, /bewoonbare kavels/i, /mede-eigenaars/i, /huidige syndicus/i, /type beheer/i, /manier van werken/i,
  /ondernemingsnummer/i, /reden voor contact/i, /huidige situatie/i, /verwachte/i,
  /eerste meeting/i, /verwachtingen/i, /werkrekening|reserverekening/i, /verzekering/i,
];
const rang = (label) => { const i = BELANGRIJK.findIndex((re) => re.test(label)); return i < 0 ? 99 : i; };
const netjes = (label) => String(label).charAt(0).toUpperCase() + String(label).slice(1).toLowerCase();

/**
 * @param {object} p { kern, gesch, web, punten, catalogi: {gebouw, contact, lead, actieblad} }
 * @returns {string[]} Markdown-regels
 */
export function kortOverzicht({ kern, gesch, web, punten, catalogi }) {
  const { gebouw: g, contacten, leads, actiebladen } = kern;
  const lead = leads.find((l) => l.active !== false) || leads[0] || null;
  const blad = actiebladen[0] || null;
  const contactId = m2oId(blad?.x_studio_contact_id) || m2oId(lead?.partner_id);
  const contact = contacten.find((c) => c.id === contactId) || contacten[0] || null;

  const r = [];
  const kop = [
    g?.name || kern.zonderGebouw?.name || lead?.name || 'Onbekend',
    g ? null : 'nog geen gebouw in Odoo',
    m2oNaam(g?.x_studio_company_type),
    g?.x_studio_number_of_plots || blad?.x_studio_number_of_plots ? `${g?.x_studio_number_of_plots || blad?.x_studio_number_of_plots} kavels` : null,
    g?.city,
  ].filter(Boolean);
  r.push(`**${cel(kop[0])}**${kop.length > 1 ? ' · ' + kop.slice(1).map(cel).join(' · ') : ''}`, '');

  const rij = (label, waarde) => { if (waarde) r.push(`| ${label} | ${cel(waarde)} |`); };
  r.push('| | |', '|---|---|');
  if (lead) {
    rij('Lead', [faseVan(lead), m2oNaam(lead.user_id), lead.expected_revenue ? `€ ${Math.round(lead.expected_revenue)}` : null,
      leads.length > 1 ? `(+${leads.length - 1} andere)` : null].filter(Boolean).join(' · '));
  } else {
    rij('Lead', 'geen');
  }
  if (contact) {
    rij('Contact', [contact.name.replace(/^.*?,\s*/, ''), contact.function, contact.mobile || contact.phone, contact.email]
      .filter(Boolean).join(' · ') + (contacten.length > 1 ? ` (+${contacten.length - 1})` : ''));
  }
  const syndicus = m2oNaam(blad?.x_studio_current_syndic) || m2oNaam(g?.x_studio_current_syndic);
  const typeBeheer = blad?.x_studio_current_syndic_type || g?.x_studio_current_syndic_type;
  if (syndicus || typeBeheer) {
    const label = { none: 'geen beheer', self: 'vrijwillige syndicus', pro: 'professionele syndicus' }[typeBeheer] || typeBeheer;
    rij('Huidig beheer', [syndicus, label].filter(Boolean).join(' · '));
  }

  const lopend = (gesch.orders || []).filter((o) => ['3_progress', '4_paused'].includes(o.subscription_state));
  const offertes = (gesch.orders || []).filter((o) => ['draft', 'sent'].includes(o.state));
  rij('Klant', lopend.length
    ? lopend.map((o) => `${o.name}${o.recurring_monthly ? ` € ${Math.round(o.recurring_monthly)}/maand` : ''}`).join(', ')
    : (offertes.length ? `nog niet · ${offertes.length} open offerte(s)` : 'nog niet'));

  // Laatste contact: het meest recente bericht van een mens (geen systeemnotitie).
  const laatste = (gesch.berichten || []).find((m) => htmlNaarTekst(m.body).length > 15);
  if (laatste) {
    const wie = m2oNaam(laatste.author_id) || String(laatste.email_from || '').replace(/<.*>/, '').trim();
    rij('Laatste contact', `${kortDatum(laatste.date)} ${laatste.message_type === 'comment' ? 'notitie' : 'mail'} van ${wie}: ${eersteZin(htmlNaarTekst(laatste.body), 110, laatste.subject)}`);
  }

  // Volgende stap: eerstvolgende activiteit of afspraak.
  const nu = Date.now();
  const kandidaten = [
    ...(gesch.activiteiten || []).map((a) => ({ t: a.date_deadline, tekst: `${a.summary || m2oNaam(a.activity_type_id) || 'activiteit'} (${m2oNaam(a.user_id) || '-'})` })),
    ...(gesch.calendly || []).filter((m) => !m.x_studio_cm_iscancelled && Date.parse(m.x_studio_cm_start_time) > nu)
      .map((m) => ({ t: m.x_studio_cm_start_time, tekst: `afspraak ${m2oNaam(m.x_studio_cm_event_type) || ''} met ${m2oNaam(m.x_studio_cm_host_name) || '-'}` })),
  ].filter((k) => k.t).sort((a, b) => (a.t < b.t ? -1 : 1));
  const volgende = kandidaten[0];
  rij('Volgende stap', volgende
    ? `${kortDatum(volgende.t)}${Date.parse(volgende.t) < nu - 86400000 ? ' (over tijd)' : ''} ${volgende.tekst}`
    : 'niets gepland');

  if (web?.samenvatting) rij('Website', web.samenvatting);
  r.push('');

  if (punten.length) {
    r.push(`**Na te kijken** (${punten.length})`);
    punten.slice(0, 3).forEach((x) => r.push(`- ${x}`));
    if (punten.length > 3) r.push(`- … en ${punten.length - 3} meer`);
    r.push('');
  }

  // Wat ontbreekt: de belangrijkste lege velden van actieblad, gebouw en lead.
  const leeg = [];
  const tel = (soort, rec) => {
    if (!rec || !catalogi[soort]) return;
    for (const item of catalogi[soort]) if (isLeeg(item, rec[item.naam])) leeg.push(item.label);
  };
  // Enkel actieblad en gebouw: de lead herhaalt die gegevens uit het formulier, en dan staat
  // "aantal kavels" als onbekend terwijl het op het gebouw al staat.
  tel('actieblad', blad); tel('gebouw', g);
  const uniek = [...new Set(leeg)].sort((a, b) => rang(a) - rang(b));
  if (uniek.length) r.push(`**Nog niet bekend:** ${uniek.length} gegevens, o.a. ${uniek.slice(0, 5).map(netjes).join(', ')}.`, '');
  return r;
}
