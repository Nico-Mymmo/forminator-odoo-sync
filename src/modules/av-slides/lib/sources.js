/**
 * AV-slides -- de gegevens ophalen en er een beginversie van de twee slides van
 * maken. Alles wat hier staat, komt uit een bestaande bron; deze module bezit
 * geen eigen kopie van events, medewerkers of feestdagen.
 *
 *   verjaardagen  hr.employee.birthday in Odoo (actieve medewerkers)
 *   events        listEvents() van Eventbeheer -- dezelfde motor, geen eigen query
 *   kleuren       de eventcategorieen (x_webinar_event_type.x_studio_type_color_hex)
 *   feestdagen    holidays.js (uitgerekend)
 *
 * Een leeftijd komt nergens op een slide: enkel dag en maand.
 */

import { searchRead } from '../../../lib/odoo.js';
import { listEvents, listEventTypes } from '../../event-operations-v2/lib/events-service.js';
import { EVENT_FIELDS } from '../../event-operations-v2/odoo-contract.js';
import { feestdagenTussen } from './holidays.js';
import { DEFAULT_STYLE, DEFAULT_ICON, DEFAULT_DECOR } from './layout.js';

const TYPE_EMOJI = {
  webinar: '📺',
  infosessie: '🧑‍🏫',
  'q&a': '💬',
  'live event': '🎤',
  groepsopleiding: '🎓',
};
const VERJAARDAG_EMOJI = ['🎁', '🎂', '🎉', '🥳', '🎈'];

// Standaardtekening per soort, uit de thingies van de Asset Manager (zie
// thingies.js). Bestaat een naam daar niet (meer), dan toont de kaart haar
// emoji. Per kaart te wijzigen in het scherm.
const TYPE_TEKENING = {
  webinar: 'telefoon',
  infosessie: 'vergrootglas',
  'q&a': 'openstaande-vraag',
  'live event': 'sfeer',
  groepsopleiding: 'aktentas',
};
const TEKENING_FEESTDAG = 'tuin';
export const TEKENING_EIGEN = 'calendar1';

const TINT_VERJAARDAG = '#e0f2fe';
const TINT_FEESTDAG = '#ccfbf1';
export const TINT_EIGEN = '#fef3c7';

/** Een lichte tint van een categoriekleur, voor de kop van een kaart. */
export function tint(hex, aandeelWit = 0.72) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return '#e0f2fe';
  const n = parseInt(m[1], 16);
  const kanaal = (v) => Math.round(v + (255 - v) * aandeelWit).toString(16).padStart(2, '0');
  return `#${kanaal((n >> 16) & 255)}${kanaal((n >> 8) & 255)}${kanaal(n & 255)}`;
}

function brusselsDatum(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Brussels', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

/**
 * "OpenVME platform: Opleidingssessie en Q&A | 07/10" -> vet "OpenVME platform:",
 * gewoon "Opleidingssessie en Q&A". De datum achteraan staat al in de kop van de
 * kaart.
 */
export function splitsTitel(titel) {
  const t = String(titel || '').replace(/\s*\|\s*\d{1,2}\/\d{1,2}(\/\d{2,4})?\s*$/, '').trim();
  const dubbelpunt = t.indexOf(':');
  if (dubbelpunt > 0 && dubbelpunt < t.length - 1) {
    return { title: t.slice(0, dubbelpunt + 1).trim(), text: t.slice(dubbelpunt + 1).trim() };
  }
  const streep = t.indexOf(' | ');
  if (streep > 0) return { title: t.slice(0, streep).trim(), text: t.slice(streep + 3).trim() };
  return { title: t, text: '' };
}

// ── Verjaardagen ────────────────────────────────────────────────────────────

export async function leesMedewerkers(env) {
  const rijen = await searchRead(env, {
    model: 'hr.employee',
    domain: [['active', '=', true], ['birthday', '!=', false]],
    fields: ['id', 'name', 'birthday'],
    limit: 500,
  });
  const lijst = (Array.isArray(rijen) ? rijen : []).map((r) => {
    const delen = String(r.name || '').trim().split(/\s+/);
    return { id: r.id, name: String(r.name || ''), first: delen[0] || '', last: delen.slice(1).join(' '), birthday: String(r.birthday || '') };
  });
  // Twee collega's met dezelfde voornaam: de eerste letter van de achternaam erbij.
  const telling = {};
  for (const m of lijst) telling[m.first] = (telling[m.first] || 0) + 1;
  for (const m of lijst) if (telling[m.first] > 1 && m.last) m.first = `${m.first} ${m.last[0]}.`;
  return lijst;
}

/** De verjaardagen die tussen twee datums vallen (JJJJ-MM-DD, beide inbegrepen). */
export function verjaardagenTussen(medewerkers, van, tot) {
  const j1 = Number(van.slice(0, 4));
  const j2 = Number(tot.slice(0, 4));
  const uit = [];
  for (const m of medewerkers) {
    const md = /^\d{4}-(\d{2})-(\d{2})$/.exec(m.birthday);
    if (!md) continue;
    for (let j = j1; j <= j2; j++) {
      let dag = md[2];
      // 29 februari in een gewoon jaar: de 28e.
      if (md[1] === '02' && dag === '29' && !(j % 4 === 0 && (j % 100 !== 0 || j % 400 === 0))) dag = '28';
      const datum = `${j}-${md[1]}-${dag}`;
      if (datum >= van && datum <= tot) uit.push({ id: m.id, first: m.first, date: datum });
    }
  }
  return uit.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.first.localeCompare(b.first)));
}

const ZINNEN = [
  (d, n) => `${d} blaast ${n} een kaarsje meer uit`,
  (d, n) => `${d} is het de beurt aan ${n} om zich een jaartje jonger te voelen`,
  (d, n) => `Op ${d} mag ${n} de cadeautjes openmaken`,
  (d, n) => `Op ${d} zingen we luidkeels voor ${n}`,
  (d, n) => `${d} trakteert ${n} (we rekenen erop)`,
];

function dagMaand(iso) {
  return `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}`;
}

/** De tekst van het blok "Hipperdepiep". */
export function verjaardagTekst(lijst) {
  if (!lijst || !lijst.length) return '';
  const regels = lijst.map((v, i) => {
    let zin = ZINNEN[i % ZINNEN.length](dagMaand(v.date), v.first);
    if (i > 0 && i === lijst.length - 1) zin = `En ${zin[0].toLowerCase()}${zin.slice(1)}`;
    return `${zin}.`;
  });
  const slot = lijst.length === 1 ? `Alvast een happy birthday, ${lijst[0].first}!` : 'Alvast een happy birthday allemaal!';
  return [...regels, slot].join('\n');
}

// ── Kaarten voor het prikbord ───────────────────────────────────────────────

export async function leesEventKaarten(env, van, tot) {
  const [lijst, soorten] = await Promise.all([
    listEvents(env, {
      filters: { from: `${van}T00:00:00Z`, to: `${tot}T23:59:59Z`, publication_states: ['published', 'done'] },
      order: `${EVENT_FIELDS.STARTS_AT} asc`,
      limit: 200,
    }),
    listEventTypes(env).catch(() => ({ types: [] })),
  ]);
  const kleurVan = new Map((soorten.types || []).map((t) => [t.id, t.color]));
  const kaarten = [];
  for (const e of lijst.events || []) {
    const datum = e.starts_at ? brusselsDatum(e.starts_at) : null;
    if (!datum || datum < van || datum > tot) continue;
    const soort = String(e.event_type?.name || '');
    kaarten.push({
      key: `event:${e.id}`,
      kind: 'event',
      date: datum,
      emoji: TYPE_EMOJI[soort.toLowerCase()] || '📅',
      tint: tint(kleurVan.get(e.event_type?.id)),
      ...splitsTitel(e.title),
      span: 2,
      include: true,
      edited: false,
      thingy: TYPE_TEKENING[soort.toLowerCase()] || TEKENING_EIGEN,
      meta: { type: soort, brand: e.brand || '' },
    });
  }
  return kaarten;
}

export function verjaardagKaarten(verjaardagen) {
  return verjaardagen.map((v) => ({
    key: `bday:${v.id}:${v.date}`,
    kind: 'birthday',
    date: v.date,
    emoji: VERJAARDAG_EMOJI[v.id % VERJAARDAG_EMOJI.length],
    thingy: '',
    tint: TINT_VERJAARDAG,
    title: v.first,
    text: '',
    span: 1,
    include: true,
    edited: false,
  }));
}

export function feestdagKaarten(van, tot) {
  return feestdagenTussen(van, tot).map((f) => ({
    key: `hol:${f.date}`,
    kind: 'holiday',
    date: f.date,
    emoji: '🏖️',
    thingy: TEKENING_FEESTDAG,
    tint: TINT_FEESTDAG,
    title: f.name,
    text: '',
    span: 1,
    include: true,
    edited: false,
  }));
}

/**
 * Alles uit de bronnen voor één venster. Een bron die faalt, levert een lege
 * lijst plus een melding: een prikbord zonder events is beter dan geen scherm.
 */
export async function verzamelBronnen(env, van, tot) {
  const meldingen = [];
  const [medewerkers, events] = await Promise.all([
    leesMedewerkers(env).catch((e) => { meldingen.push(`Verjaardagen niet gelezen: ${e.message}`); return []; }),
    leesEventKaarten(env, van, tot).catch((e) => { meldingen.push(`Events niet gelezen: ${e.message}`); return []; }),
  ]);
  const verjaardagen = verjaardagenTussen(medewerkers, van, tot);
  return {
    verjaardagen,
    kaarten: [...feestdagKaarten(van, tot), ...verjaardagKaarten(verjaardagen), ...events],
    meldingen,
  };
}

// ── Inhoud ──────────────────────────────────────────────────────────────────

export function nieuweInhoud({ van, tot, bronnen, inzichten }) {
  return {
    version: 1,
    style: { ...DEFAULT_STYLE },
    // De standaardtekst van Hipperdepiep: "Standaardtekst" in het scherm zet hem terug.
    birthdaysText: verjaardagTekst(bronnen.verjaardagen),
    insights: inzichten,
    wist: {
      title: 'Wist-je-weetje-wist-je-datje',
      image: null,
      blocks: [
        { key: 'birthdays', type: 'text', style: 'mint', title: '🥳 Hipperdepiep', text: verjaardagTekst(bronnen.verjaardagen), thingy: 'vlieger', include: true, edited: false },
        { key: 'weetje', type: 'text', style: 'sky', title: '💡 Wist je dat…', text: (inzichten[0] && inzichten[0].text) || '', thingy: 'vergrootglas', include: true, edited: false },
        { key: 'review', type: 'review', style: 'white', name: '', source: 'Google', stars: 5, when: '', text: '', include: true },
      ],
    },
    prikbord: { title: 'Prikbord', icon: DEFAULT_ICON, decor: DEFAULT_DECOR, from: van, until: tot, cards: bronnen.kaarten },
  };
}

const KAART_VELDEN = ['date', 'emoji', 'thingy', 'tint', 'title', 'text', 'span'];

/**
 * Opnieuw ophalen ZONDER weg te gooien wat iemand al deed: het beeld, de
 * review, eigen kaarten, wat er aan- of uitgezet werd, en elke tekst die met de
 * hand aangepast is (`edited`). Enkel wat nog onaangeroerd uit een bron kwam,
 * wordt vervangen.
 */
export function vernieuwInhoud(oud, vers) {
  if (!oud || !oud.wist || !oud.prikbord) return vers;
  const uit = { ...vers, style: oud.style || vers.style };

  const versBlok = new Map(vers.wist.blocks.map((b) => [b.key, b]));
  const blokken = (oud.wist.blocks || []).map((oudBlok) => {
    const v = versBlok.get(oudBlok.key);
    // Een blok van voor de tekeningetjes krijgt de standaardtekening.
    const b = v && oudBlok.thingy === undefined ? { ...oudBlok, thingy: v.thingy } : oudBlok;
    if (v && b.key === 'birthdays' && !b.edited) return { ...b, text: v.text };
    if (v && b.key === 'weetje' && !b.edited && !String(b.text || '').trim()) return { ...b, text: v.text };
    return b;
  });
  for (const v of vers.wist.blocks) if (!blokken.some((b) => b.key === v.key)) blokken.push(v);
  uit.wist = { ...vers.wist, title: oud.wist.title || vers.wist.title, image: oud.wist.image || null, blocks: blokken };

  const oudeKaarten = new Map((oud.prikbord.cards || []).map((k) => [k.key, k]));
  const kaarten = vers.prikbord.cards.map((k) => {
    const o = oudeKaarten.get(k.key);
    if (!o) return k;
    const bewaard = { ...k, include: o.include !== false };
    if (o.edited) {
      for (const veld of KAART_VELDEN) if (o[veld] !== undefined) bewaard[veld] = o[veld];
      bewaard.edited = true;
    }
    return bewaard;
  });
  const eigen = (oud.prikbord.cards || []).filter((k) => k.kind === 'custom');
  uit.prikbord = {
    ...vers.prikbord,
    title: oud.prikbord.title || vers.prikbord.title,
    icon: oud.prikbord.icon === undefined ? vers.prikbord.icon : oud.prikbord.icon,
    decor: oud.prikbord.decor === undefined ? vers.prikbord.decor : oud.prikbord.decor,
    cards: [...kaarten, ...eigen],
  };
  return uit;
}
