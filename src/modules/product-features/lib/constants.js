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

/**
 * Voor gewone VME's: vanaf welk pakket (zoals op openvme.be/prijzen). Leeg =
 * overal, 'geen' = niet voor VME's. Unlimited bestaat niet meer (2026-10-20). OpenVME Pro staat hier NIET in: dat is
 * een aparte schakelaar (`pro` op de feature), want een feature kan voor
 * beide gelden (Nico, 2026-10-20).
 */
export const PAKKETTEN = [
  { key: '', label: 'In elk pakket', kort: 'Elk pakket' },
  { key: 'gratis', label: 'Free', kort: 'Free' },
  { key: 'basic', label: 'Vanaf Basic', kort: 'Basic' },
  { key: 'smart', label: 'Smart', kort: 'Smart' },
  { key: 'geen', label: 'Niet voor VME\'s', kort: '' },
];

/** De merken waarvoor een feature kan bestaan. */
export const MERKEN = ['openvme', 'syndicoach'];

/**
 * Hoe een feature in een mail kan staan (de "layouts"). De renderer van de
 * nieuwsbrief kent precies deze sleutels (blokFeature in render.js).
 */
// `beeld` = in welke vorm (src/lib/achtergrond.js VERHOUDINGEN) het opgemaakte
// beeld op die plek komt. Een opgemaakt beeld bestaat in elke vorm.
export const FEATURE_VORMEN = [
  { key: 'kaart', label: 'Kaart', uitleg: 'Beeld bovenaan, label, titel, uitleg, USP\'s en een knop.', beeld: '16:9' },
  { key: 'hero', label: 'Hero', uitleg: 'Een breed beeld over de volle breedte bovenaan, dan titel, uitleg en USP\'s.', beeld: '3:1' },
  { key: 'naast', label: 'Beeld ernaast', uitleg: 'Tekst links, beeld rechts; de USP\'s als lijstje.', beeld: '1:1' },
  { key: 'uitgelicht', label: 'Uitgelicht', uitleg: 'Een gekleurd vlak met grote titel, "waarom" en een knop.', beeld: '16:9' },
  { key: 'compact', label: 'Compact', uitleg: 'Klein beeld naast label, titel en één zin.', beeld: '1:1' },
  { key: 'lijst', label: 'Lijstje', uitleg: 'Enkel titel en USP\'s, zonder beeld: voor een snelle opsomming.', beeld: null },
];

export const MAX_USPS = 6;

const sleutels = (lijst) => new Set(lijst.map((x) => x.key));
export const CATEGORIE_KEYS = sleutels(CATEGORIEEN);
export const VOORDEEL_KEYS = sleutels(VOORDELEN);
export const DOELGROEP_KEYS = sleutels(DOELGROEPEN);
export const PAKKET_KEYS = sleutels(PAKKETTEN);
export const VORM_KEYS = sleutels(FEATURE_VORMEN);
