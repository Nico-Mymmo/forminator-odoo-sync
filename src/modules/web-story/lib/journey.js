/**
 * Het verhaal van een lead of actieblad: langs welke wegen kwamen de mensen
 * erachter, tot ze de stap zetten. Zie website-tracker/docs/ontwerp-odoo-zonder-bezoekers.md §3.
 *
 * Drie lezingen naast elkaar, omdat geen enkel attributiemodel "waar" is:
 *   - eerste aanraking: hoe kende men ons;
 *   - laatste niet-directe aanraking vóór de conversie: wat trok over de streep
 *     ("Direct" en "Eigen sites" tellen niet als oorzaak);
 *   - het pad: de kanalen in volgorde, opeenvolgende gelijke samengevoegd.
 *
 * De kanalen komen uit readVisitorSessions() van het dashboard: één indeling.
 * Puur rekenwerk + HTML; geen Odoo, geen D1 (dat doet push.js).
 */

// Vóór 29-09-2026 bewaarde de tracker de verwijzer niet: een "direct" bezoek uit
// die tijd is niet direct maar onbekend. Enkel weergave; het dashboard telt het
// als "Direct / onbekend" (zie de opmerking bij CHANNELS in web-visits.js).
const ONBEKEND_OUD = 'Onbekend (oude historiek)';
const GEEN_OORZAAK = new Set(['Direct / onbekend', 'Eigen sites', ONBEKEND_OUD]);
const MAX_PAD = 8;

// Dezelfde kleuren als CHANNEL_COLORS in public/dashboards-web.js (de Worker kan
// niets uit public/ importeren): een kanaal heeft overal dezelfde kleur. Enkel de
// grijzen zijn donkerder: hier zijn ze ook TEKSTkleur, en #cbd5e1 op wit leest niet.
export const KLEUR = {
  'Betaald zoeken': '#2563eb', 'Betaalde social': '#7c3aed', 'Betaald overig': '#a78bfa',
  'E-mail': '#f59e0b', 'Organisch zoeken': '#059669', 'Social organisch': '#db2777',
  'AI-assistenten': '#0891b2', 'Verwijzing': '#65a30d', 'Eigen sites': '#64748b', 'Direct / onbekend': '#94a3b8',
  [ONBEKEND_OUD]: '#94a3b8',
};

function ms(ts) { return ts ? Date.parse(ts.replace(' ', 'T') + 'Z') : 0; }
function esc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function dag(ts) {
  return new Date(ms(ts)).toLocaleDateString('nl-BE', { timeZone: 'Europe/Brussels', day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * @param {Array} sessions readVisitorSessions(), chronologisch
 * @param {{conversionAt?: string|null, persons: Map<string,string>}} opts
 *        conversionAt = moment van de conversie (eerste inzending, anders het
 *        aanmaken van de lead); persons = uuid -> label (e-mail of toestel)
 */
export function buildJourney(sessions, { conversionAt = null, persons = new Map(), atConversion = null } = {}) {
  if (!sessions.length) return null;
  sessions = sessions.map(s => (s.historic && s.channel === 'Direct / onbekend' ? { ...s, channel: ONBEKEND_OUD } : s));
  const firstConv = sessions.find(s => s.conversions.calendly + s.conversions.events + s.conversions.forms > 0);
  // De conversie is de eerste inzending/afspraak op de site; anders het moment
  // waarop de lead ontstond (via telefoon, mail, een collega ...).
  // atConversion: het dashboard bepaalt zelf WELKE conversie (de eerste in de
  // gekozen periode), niet de allereerste ooit.
  const convTs = atConversion || (firstConv ? firstConv.start : conversionAt);
  const voor = convTs ? sessions.filter(s => ms(s.start) <= ms(convTs) + 60 * 60 * 1000) : sessions;
  const basis = voor.length ? voor : sessions;

  const eerste = basis[0];
  const laatste = [...basis].reverse().find(s => !GEEN_OORZAAK.has(s.channel)) || null;

  const pad = [];
  for (const s of basis) {
    const prev = pad[pad.length - 1];
    if (prev && prev.channel === s.channel) prev.n++;
    else pad.push({ channel: s.channel, n: 1 });
  }

  const personen = new Set(basis.map(s => persons.get(s.uuid) || s.uuid));
  return {
    eerste: { channel: eerste.channel, detail: eerste.detail, ts: eerste.start, historic: eerste.historic },
    laatste: laatste ? { channel: laatste.channel, detail: laatste.detail, ts: laatste.start } : null,
    pad,
    sessies: basis.length,
    na: sessions.length - basis.length,
    personen: personen.size,
    conversie: convTs ? { ts: convTs, opSite: !!(atConversion || firstConv) } : null,
    dagen: convTs ? Math.max(0, Math.round((ms(convTs) - ms(eerste.start)) / 86400000)) : null,
  };
}

function chip(channel, extra) {
  const c = KLEUR[channel] || '#6b7280';
  return `<span style="display:inline-block;background-color:${c}1a;color:${c};border:1px solid ${c}40;padding:1px 8px;`
    + `border-radius:10px;font-size:11px;font-weight:600;margin:2px 4px 2px 0;">${esc(channel)}${extra ? ' ' + esc(extra) : ''}</span>`;
}

function regel(label, inhoud) {
  return `<div style="display:flex;gap:10px;padding:3px 0;font-size:12px;"><div style="width:150px;color:#888;flex:none;">${esc(label)}</div>`
    + `<div style="color:#222;">${inhoud}</div></div>`;
}

export function journeyHtml(j, { omUrl = null, titel = 'Hoe deze lead bij ons kwam' } = {}) {
  if (!j) return '';
  const aanraking = t => t
    ? `${chip(t.channel)}${t.detail ? `<span style="color:#555;">${esc(t.detail)}</span> ` : ''}<span style="color:#999;">· ${esc(dag(t.ts))}</span>`
    : '<span style="color:#999;">geen — enkel directe bezoeken</span>';
  const zichtbaar = j.pad.slice(-MAX_PAD);
  const pad = (j.pad.length > MAX_PAD ? `<span style="color:#999;">… </span>` : '')
    + zichtbaar.map(p => chip(p.channel, p.n > 1 ? '×' + p.n : '')).join('<span style="color:#bbb;">→ </span>')
    + (j.conversie ? `<span style="color:#bbb;">→ </span>${chip(j.conversie.opSite ? 'Conversie op de site' : 'Lead aangemaakt')}` : '');
  const feiten = [`${j.sessies} bezoek${j.sessies === 1 ? '' : 'en'}`];
  if (j.personen > 1) feiten.push(`${j.personen} personen`);
  if (j.dagen !== null) feiten.push(j.dagen === 0 ? 'dezelfde dag' : `${j.dagen} dag${j.dagen === 1 ? '' : 'en'} tot de conversie`);
  if (j.na) feiten.push(`${j.na} bezoek${j.na === 1 ? '' : 'en'} erna`);
  return `<div style="font-family:system-ui,-apple-system,sans-serif;border:1px solid #e5e7eb;border-radius:10px;padding:12px 14px;margin-bottom:14px;background-color:#fff;">`
    + `<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px;">`
    + `<div style="font-size:13px;font-weight:700;color:#111;">${esc(titel)}</div>`
    + (omUrl ? `<a href="${esc(omUrl)}" target="_blank" rel="noopener" style="font-size:12px;">Volledig verhaal in de OM →</a>` : '')
    + `</div>`
    + regel('Eerste aanraking', aanraking(j.eerste))
    + regel('Laatste aanraking', aanraking(j.laatste))
    + regel('Pad', pad)
    + regel('Samengevat', esc(feiten.join(' · ')))
    + `</div>`;
}
