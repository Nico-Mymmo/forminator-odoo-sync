/**
 * Productfeatures -- de vaste lijsten.
 *
 * EEN plek voor de woorden die de bibliotheek EN de nieuwsbrief gebruiken:
 * de categorieen (de vier van Nico), de voordelen waar een feature onder
 * valt, voor wie ze bedoeld is, vanaf welk pakket, en de vormen waarin een
 * feature in een mail kan staan. Het scherm krijgt ze via /api/bootstrap;
 * de nieuwsbrief importeert ze rechtstreeks.
 */

export const LOG_PREFIX = '[productfeatures]';

export const TABLE = 'product_features';

/** De vier categorieen (beslissing Nico, 2026-10-16). */
export const CATEGORIEEN = [
  { key: 'technisch', label: 'Technisch beheer', kleur: '#0369a1' },
  { key: 'communicatie', label: 'Goede communicatie', kleur: '#14b8a6' },
  { key: 'financieel', label: 'Financiële zekerheid', kleur: '#7c3aed' },
  { key: 'wettelijk', label: 'Wettelijk in orde', kleur: '#ea580c' },
];

/** Waar een feature de klant mee helpt. Een feature kan er meerdere hebben. */
export const VOORDELEN = [
  { key: 'tijdswinst', label: 'Tijdswinst', uitleg: 'Minder handwerk, minder heen-en-weer.' },
  { key: 'eenvoud', label: 'Eenvoud', uitleg: 'Je hoeft geen expert te zijn.' },
  { key: 'overzicht', label: 'Overzicht', uitleg: 'Alles op één plek, altijd terug te vinden.' },
  { key: 'transparantie', label: 'Transparantie', uitleg: 'Iedereen ziet wat er gebeurt.' },
  { key: 'gemoedsrust', label: 'Gemoedsrust', uitleg: 'Wettelijk en financieel in orde, zonder zorgen.' },
  { key: 'kostenbesparing', label: 'Kostenbesparing', uitleg: 'Minder kosten voor de VME.' },
  { key: 'betrokkenheid', label: 'Betrokkenheid', uitleg: 'Mede-eigenaars doen mee en volgen mee.' },
  { key: 'mobiel', label: 'Altijd bij de hand', uitleg: 'Op smartphone, tablet en computer.' },
];

/** Voor wie een feature bedoeld is. */
export const DOELGROEPEN = [
  { key: 'eigenaar-syndicus', label: 'Eigenaar-syndicus' },
  { key: 'professionele-syndicus', label: 'Professionele syndicus' },
  { key: 'mede-eigenaar', label: 'Mede-eigenaar' },
  { key: 'rvme', label: 'Raad van mede-eigendom' },
  { key: 'bewoner', label: 'Bewoner of huurder' },
  { key: 'boekhouder', label: 'Boekhouder' },
];

/** Vanaf welk pakket (zoals op openvme.be/prijzen). Leeg = overal. */
export const PAKKETTEN = [
  { key: '', label: 'In elk pakket' },
  { key: 'gratis', label: 'Gratis' },
  { key: 'basic', label: 'Basic' },
  { key: 'smart', label: 'Smart' },
  { key: 'unlimited', label: 'Unlimited' },
  { key: 'pro', label: 'OpenVME Pro' },
];

/** De merken waarvoor een feature kan bestaan. */
export const MERKEN = ['openvme', 'syndicoach'];

/**
 * Hoe een feature in een mail kan staan (de "layouts"). De renderer van de
 * nieuwsbrief kent precies deze sleutels (blokFeature in render.js).
 */
export const FEATURE_VORMEN = [
  { key: 'kaart', label: 'Kaart', uitleg: 'Beeld bovenaan, label, titel, uitleg, USP\'s en een knop.' },
  { key: 'naast', label: 'Beeld ernaast', uitleg: 'Tekst links, beeld rechts; de USP\'s als lijstje.' },
  { key: 'uitgelicht', label: 'Uitgelicht', uitleg: 'Een gekleurd vlak met grote titel, "waarom" en een knop.' },
  { key: 'compact', label: 'Compact', uitleg: 'Klein beeld naast label, titel en één zin.' },
  { key: 'lijst', label: 'Lijstje', uitleg: 'Enkel titel en USP\'s, zonder beeld: voor een snelle opsomming.' },
];

export const MAX_USPS = 6;

const sleutels = (lijst) => new Set(lijst.map((x) => x.key));
export const CATEGORIE_KEYS = sleutels(CATEGORIEEN);
export const VOORDEEL_KEYS = sleutels(VOORDELEN);
export const DOELGROEP_KEYS = sleutels(DOELGROEPEN);
export const PAKKET_KEYS = sleutels(PAKKETTEN);
export const VORM_KEYS = sleutels(FEATURE_VORMEN);
