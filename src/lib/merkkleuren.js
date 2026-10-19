/**
 * De merkkleuren: het palet van de huisstijl (aangeleverd door marketing op
 * 2026-10-13), per kleurfamilie van licht naar donker.
 *
 * EEN bron voor de hele OM: de nieuwsbrief (kleurkiezer, achtergrond van een
 * blok of van de mail), de achtergrondbouwer (src/lib/achtergrond.js) en
 * alles wat er later bijkomt. Geldt voor OpenVME en Syndicoach samen; krijgt
 * Syndicoach een eigen palet, dan komt het hier per merk bij.
 */

export const MERKKLEUREN = [
  { familie: 'Grijs', kleuren: ['#FFFFFF', '#F9FAFB', '#F3F4F6', '#E5E7EB', '#4B5563', '#1F2937'] },
  { familie: 'Blauw', kleuren: ['#F0F9FF', '#E0F2FE', '#BAE6FD', '#0EA5E9', '#0369A1'] },
  { familie: 'Mint', kleuren: ['#F0FDFA', '#99F6E4', '#14B8A6'] },
  { familie: 'Oranje', kleuren: ['#FFF7ED', '#FED7AA', '#F97316'] },
  { familie: 'Roze', kleuren: ['#FDF2F8', '#FBCFE8', '#EC4899'] },
];

const ALLE_MERKKLEUREN = new Set(MERKKLEUREN.flatMap((f) => f.kleuren.map((k) => k.toLowerCase())));

/** Een merkkleur (kleine letters), of '' als het er geen is. */
export function merkkleur(waarde) {
  const k = String(waarde || '').trim().toLowerCase();
  return ALLE_MERKKLEUREN.has(k) ? k : '';
}
