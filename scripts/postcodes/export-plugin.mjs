/**
 * De postcodelijsten van de OM afgeslankt naar de WordPress-plugin kopiëren.
 *
 *   node scripts/postcodes/export-plugin.mjs      (vanuit de wortel van de repo)
 *
 * Draait vanzelf in wp-plugin/build-mymmo-forms.sh. De OM is de enige bron
 * (src/modules/forminator-sync-v2/forms/postcodes/*.js, gegenereerd door
 * build-postcodes.py); de plugin krijgt enkel wat de browser nodig heeft:
 * postcode -> plaatsen. Geen coördinaten, geen gemeenten, geen adresaantallen
 * -- dat is gewicht dat elke bezoeker zou downloaden zonder het te gebruiken.
 *
 * Zelfde afspraak als public/mymmo-forms.css: bewerk de kopie in de plugin
 * nooit met de hand.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const BRON = path.resolve('src/modules/forminator-sync-v2/forms/postcodes');
const DOEL = path.resolve('wp-plugin/mymmo-forms/assets/data');

if (!fs.existsSync(BRON)) {
  console.error(`Geen postcodelijsten in ${BRON} -- draai dit vanuit de wortel van de repo.`);
  process.exit(1);
}
fs.mkdirSync(DOEL, { recursive: true });

for (const bestand of fs.readdirSync(BRON).filter((f) => /^[a-z]{2}\.js$/.test(f)).sort()) {
  const { default: lijst } = await import(pathToFileURL(path.join(BRON, bestand)).href);
  const p = {};
  for (const [postcode, info] of Object.entries(lijst.postcodes || {})) p[postcode] = info.p || [];
  const uit = { land: lijst.land, stand: lijst.stand, bron: lijst.bron, licentie: lijst.licentie, p };
  const naam = `postcodes-${bestand.slice(0, 2)}.json`;
  const inhoud = JSON.stringify(uit);
  fs.writeFileSync(path.join(DOEL, naam), inhoud, 'utf8');
  console.log(`postcodelijst ${lijst.land}: ${Object.keys(p).length} postcodes -> assets/data/${naam} (${Math.round(inhoud.length / 1024)} kB)`);
}
