/**
 * Odoo-controle -- de vaste lijsten (prioriteiten, domeinen, soorten fouten,
 * zekerheid, statussen) en de afleiding van de status.
 *
 * Het scherm krijgt deze lijsten via GET /odoo-controle/api/bootstrap, zodat
 * er maar één bron is. De statusregel staat ook in public/odoo-controle.js
 * (statusVan), omdat het scherm een vinkje meteen moet tonen voor de server
 * geantwoord heeft; wijzig je ze hier, wijzig ze daar mee.
 */

export const ODOO_URL = 'https://mymmo.odoo.com';

export const TABLES = {
  cases: 'controle_cases',
  patterns: 'controle_patterns',
  links: 'controle_case_patterns',
  history: 'controle_history',
  meta: 'controle_meta',
};

export const PRIO = [
  { id: 'dringend', label: 'Dringend', why: 'Er ontbreekt nu geld, of er is te veel aangerekend.', rang: 1 },
  { id: 'hoog', label: 'Hoog', why: 'Kost later geld als het niet voor de vervaldag rechtgezet wordt.', rang: 2 },
  { id: 'gemiddeld', label: 'Gemiddeld', why: 'Eenmalig bij te sturen; geen directe schade.', rang: 3 },
  { id: 'beslissen', label: 'Beslissen', why: 'Bewuste keuze nodig over hoe dit contract in Odoo hoort te staan.', rang: 4 },
  { id: 'laag', label: 'Laag', why: 'Administratief.', rang: 5 },
];

export const DOMEIN = [
  ['facturatie', 'Facturatie'],
  ['abonnement', 'Abonnement'],
  ['partners', 'Bedrijven en contacten'],
  ['crm', 'Leads'],
];

export const SOORT = [
  ['ingave', 'Verkeerde ingave (prijs, aantal, datum, product)'],
  ['upsell', 'Verkeerde upsell of wissel'],
  ['dubbel', 'Dubbel aangemaakt'],
  ['creditnota', 'Creditnota zonder bijsturing'],
  ['opvolging', 'Niet opgevolgd'],
  ['afspraak', 'Afspraak niet vastgelegd'],
  ['gegevens', 'Gegevens onvolledig of fout'],
  ['systeem', 'Automatisch (Odoo of platform)'],
  ['onbekend', 'Nog onbekend'],
];

export const ZEKER = [
  ['zeker', 'Fout vastgesteld'],
  ['waarschijnlijk', 'Waarschijnlijk fout'],
  ['na te kijken', 'Na te kijken: kan bewust zijn'],
];

export const STATUS = {
  open: 'Open',
  bezig: 'Bezig',
  wacht: 'Wacht op goedkeuring',
  opgelost: 'Opgelost',
  geenfout: 'Geen fout',
};

/** Odoo-model -> woord in het scherm en in de prompts. */
export const MODEL_LABEL = {
  'sale.order': 'order',
  'account.move': 'factuur',
  'res.partner': 'bedrijf',
  'crm.lead': 'lead',
};

export const REF_MODELS = Object.keys(MODEL_LABEL);

/** De vier teksten die het team bij een case schrijft. */
export const CASE_TEKSTEN = [
  ['wat_gebeurde', 'Wat er gebeurde', 'Wie deed wat, wanneer, en waarom liep het mis?'],
  ['actie', 'Wat we deden om het recht te zetten', 'Bijvoorbeeld: volgende factuurdatum op 21/10/2026 gezet, creditnota CFVK/... gemaakt.'],
  ['complicaties', 'Opmerkingen: complicaties bij het rechtzetten', 'Wat maakt het rechtzetten moeilijk? Waarop of op wiens goedkeuring wachten we?'],
  ['les', 'Les voor het patroon (optioneel)', 'Iets wat deze case leert en wat in de regel van het patroon hoort. Claude neemt het mee als het de regel opstelt.'],
];

/** De drie teksten van een patroon die Claude mag herschrijven. */
export const PATROON_TEKSTEN = [
  ['uitleg', 'Uitleg'],
  ['regel', 'Regel'],
  ['controle', 'Controle'],
];

export const CASE_VINKJES = ['onderzocht', 'rechtgezet', 'geen_fout', 'in_openvme', 'vasthouden'];

export function label(lijst, waarde) {
  const x = lijst.find((y) => y[0] === waarde);
  return x ? x[1] : (waarde || '');
}

export function prioVan(id) {
  return PRIO.find((p) => p.id === id) || PRIO[PRIO.length - 1];
}

/**
 * De status van een case is afgeleid, nooit opgeslagen:
 * geen fout > opgelost (beide stappen) > wacht op goedkeuring > bezig (één stap) > open.
 */
export function statusVan(c) {
  if (c.geen_fout) return 'geenfout';
  const n = (c.onderzocht ? 1 : 0) + (c.rechtgezet ? 1 : 0);
  if (n === 2) return 'opgelost';
  if (c.vasthouden) return 'wacht';
  return n ? 'bezig' : 'open';
}

export function isAfgehandeld(c) {
  const s = statusVan(c);
  return s === 'opgelost' || s === 'geenfout';
}

export function odooUrl(ref) {
  return `${ODOO_URL}/web?debug=1#id=${ref.id}&model=${ref.model}&view_type=form`;
}

export function stapLabel(c) {
  return c.in_openvme ? 'Rechtgezet in OpenVME' : 'Rechtgezet in Odoo';
}
