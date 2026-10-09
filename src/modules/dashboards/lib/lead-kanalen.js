/**
 * Dashboards — de kanaalindeling van een lead (merk + kanaal).
 *
 * VANGRAIL. Gedeeld door de tabbladen Aanvragen (lib/aanvragen/), Verkoop en
 * Targets (lib/sales/derive.js): "Kanaal (lead)" moet op alle drie dezelfde
 * indeling zijn. Daarom staat dit los van het tabblad Aanvragen, en daarom
 * wijzigt het enkel met een review van Nico (.github/CODEOWNERS). Tot 2026-10-09
 * stond dit bovenaan lib/leads-instroom.js.
 *
 * Kanaal-indeling (bijgewerkt 2026-09-08, tweede iteratie):
 * Naast `x_studio_brand_origin` (het merk) gebruiken we ook het Studio-veld
 * `x_studio_lead_channel` (fijnmaziger kanaal binnen dat merk, bv. "VME-Check",
 * "Contactform", "Telefoon"). Beide zijn properties op de lead zelf -- geen
 * leadnaam-heuristiek in DEZE code. Het eenmalig vullen van
 * `x_studio_lead_channel` op oudere leads (op basis van leadnaam) gebeurt bewust
 * apart, via een manueel te draaien Odoo Server Action, niet hier -- dat blijft
 * een menselijk gecontroleerde, eenmalige data-cleanup.
 *
 * Twee uitzonderingen die WEL hier in code horen: `x_studio_brand_origin ===
 * 'directregistration'` betekent altijd `openvme_opstarters`, en `===
 * 'syndicuskiezen'` betekent altijd `syndicoach_syndicus_kiezen` -- dat zijn
 * geen gokken maar bevestigde 1-op-1 bedrijfsregels (Nico, 2026-09-08), dus die
 * mogen rechtstreeks op de betrouwbare brand_origin-property worden toegepast
 * i.p.v. te wachten tot elke individuele lead een los kanaalveld heeft.
 *
 * Voor leads waar `x_studio_lead_channel` (nog) niet is ingevuld en het merk
 * niet in die twee uitzonderingen valt, vallen we terug op een
 * "overig"-categorie per merk (bv. "Syndicoach: overig/onbekend") -- expliciet
 * zichtbaar als "nog niet verfijnd", nooit stilzwijgend weggelaten of
 * fout-gecategoriseerd.
 *
 * Merk-filter: Alles / Syndicoach / OpenVME / Onbekend. Dat filtert op
 * Odoo-domainniveau (scopeDomain hieronder), op dezelfde bevestigde
 * brand_origin-regels. "Onbekend" = alles wat niet in de 4 gekende merken valt
 * (in de praktijk vrijwel altijd 'manual').
 *
 * @module modules/dashboards/lib/lead-kanalen
 */

// Kanalen zoals ze letterlijk bestaan als selectiewaarden van
// x_studio_lead_channel in Odoo Studio (ir.model.fields.selection op
// crm.lead), aangevuld met een "overig"-vangnet per merk voor leads die
// (nog) geen kanaaldetail hebben. Volgorde bepaalt de volgorde in de
// legende/grafiek -- gegroepeerd per merk.
export const BRAND_KEYS = [
  'syndicoach_vme_check',
  'syndicoach_meta_lead_ad',
  'syndicoach_contact_form',
  'syndicoach_syndicus_kiezen',
  'syndicoach_telefoon',
  'syndicoach_email',
  'syndicoach_overig',
  'openvme_contact_form',
  'openvme_opstarters',
  'openvme_telefoon',
  'openvme_email',
  'openvme_meta_lead_ad',
  'openvme_overig',
  'manual_overig'
];

export const BRAND_LABELS = {
  syndicoach_vme_check: 'Syndicoach: VME-Check',
  syndicoach_meta_lead_ad: 'Syndicoach: Meta lead ad',
  syndicoach_contact_form: 'Syndicoach: Contactform',
  syndicoach_syndicus_kiezen: 'Syndicoach: Syndicus kiezen',
  syndicoach_telefoon: 'Syndicoach: Telefoon',
  syndicoach_email: 'Syndicoach: E-mail',
  syndicoach_overig: 'Syndicoach: overig/onbekend',
  openvme_contact_form: 'OpenVME: Contactformulier',
  openvme_opstarters: 'OpenVME: Zelfstarters',
  openvme_telefoon: 'OpenVME: Telefoon',
  openvme_email: 'OpenVME: E-mail',
  openvme_meta_lead_ad: 'OpenVME: Meta lead ad',
  openvme_overig: 'OpenVME: overig/onbekend',
  manual_overig: 'Manueel/overig'
};

// Set van de kanaalwaarden die ECHT als zodanig in Odoo bestaan (i.t.t. de
// lokale "overig"-vangnetcategorieën hierboven, die geen Odoo-waarde zijn).
const KNOWN_CHANNEL_VALUES = new Set([
  'syndicoach_vme_check',
  'syndicoach_meta_lead_ad',
  'syndicoach_contact_form',
  'syndicoach_syndicus_kiezen',
  'syndicoach_telefoon',
  'syndicoach_email',
  'openvme_contact_form',
  'openvme_opstarters',
  'openvme_telefoon',
  'openvme_email',
  'openvme_meta_lead_ad'
]);

/**
 * @param {string|false} brandOrigin - x_studio_brand_origin
 * @param {string|false} channelValue - x_studio_lead_channel
 * @returns {string} één van BRAND_KEYS
 */
export function resolveChannel(brandOrigin, channelValue) {
  // Bevestigde bedrijfsregels, geen gok: rechtstreeks op de betrouwbare
  // brand_origin-property toepassen, zodat dit ook al werkt vóór elke
  // individuele lead een los kanaalveld heeft.
  if (brandOrigin === 'directregistration') return 'openvme_opstarters';
  if (brandOrigin === 'syndicuskiezen') return 'syndicoach_syndicus_kiezen';

  if (channelValue && KNOWN_CHANNEL_VALUES.has(channelValue)) return channelValue;

  switch (brandOrigin) {
    case 'syndicoach': return 'syndicoach_overig';
    case 'openvme': return 'openvme_overig';
    default: return 'manual_overig';
  }
}

/** De merken waarop gefilterd kan worden. Ook de scope van de aanvraagtargets. */
export const VALID_SCOPES = ['all', 'syndicoach', 'openvme', 'onbekend'];

/** Een onbekende of ontbrekende scope wordt 'all'. */
export function normalizeScope(scope) {
  return VALID_SCOPES.includes(scope) ? scope : 'all';
}

/**
 * Odoo-domain-uitbreiding voor de merk-filter. Gebaseerd op dezelfde bevestigde
 * brand_origin-regels als resolveChannel() hierboven -- 'directregistration'
 * hoort bij OpenVME, 'syndicuskiezen' bij Syndicoach. "Onbekend" is alles wat
 * niet in de 4 gekende merken valt.
 *
 * @param {'all'|'syndicoach'|'openvme'|'onbekend'} scope
 */
export function scopeDomain(scope) {
  switch (scope) {
    case 'syndicoach': return [['x_studio_brand_origin', 'in', ['syndicoach', 'syndicuskiezen']]];
    case 'openvme': return [['x_studio_brand_origin', 'in', ['openvme', 'directregistration']]];
    case 'onbekend': return [['x_studio_brand_origin', 'not in', ['syndicoach', 'openvme', 'directregistration', 'syndicuskiezen']]];
    default: return [];
  }
}

/** Enkel de BRAND_KEYS die bij de gekozen scope horen (voor een opgekuiste legende/badges). */
export function relevantKeysForScope(scope) {
  if (scope === 'syndicoach') return BRAND_KEYS.filter((k) => k.startsWith('syndicoach'));
  if (scope === 'openvme') return BRAND_KEYS.filter((k) => k.startsWith('openvme'));
  if (scope === 'onbekend') return ['manual_overig'];
  return BRAND_KEYS;
}
