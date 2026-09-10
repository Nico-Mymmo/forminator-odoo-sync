/**
 * Tests voor de platte-tekstrenderer. Geen netwerk, geen Odoo.
 *   node src/lib/mail/tests/render-plain-test.mjs
 *
 * De belangrijkste tests hier zijn de NEGATIEVE: dat er geen tabel, geen
 * achtergrond, geen breedtebeperking en geen afbeelding in de uitvoer zit.
 * Dat is de hele bestaansreden van deze renderer, en het is precies wat er
 * sluipend weer in kan komen als iemand hem "net iets mooier" maakt.
 */
import { renderPlainMailHtml, renderPlainSubject, nietPlatteOpmaak } from '../render-plain.js';

let geslaagd = 0;
let gefaald = 0;

function ok(naam, voorwaarde, extra = '') {
  if (voorwaarde) {
    geslaagd += 1;
    console.log('  ok  ' + naam);
  } else {
    gefaald += 1;
    console.log('  FAIL ' + naam + (extra ? ' — ' + extra : ''));
  }
}

const context = {
  registration: { first_name: 'Jadranka' },
  lead: { calendly: 'https://cal.example/thomas' },
  host: { name: 'Thomas' }
};

console.log('\nplatte tekstmail');

ok('lege tekst geeft een lege string, geen leeg omhulsel',
  renderPlainMailHtml({ html: '', context }) === '' &&
  renderPlainMailHtml({ html: '   \n  ', context }) === '');

const kaal = renderPlainMailHtml({
  html: 'Hoi {{registration.first_name}},\n\nBedankt voor je aanvraag.\nTot binnenkort!',
  context
});
ok('kale tekst met witregels wordt alinea\'s', kaal.includes('<p style="margin:0 0 1em;">Hoi Jadranka,</p>'), kaal);
ok('een enkele enter binnen een alinea wordt <br>', kaal.includes('Tot binnenkort!') && kaal.includes('<br>'));
ok('placeholders zijn ingevuld bij het versturen', kaal.includes('Jadranka') && !kaal.includes('{{'));

// De EERSTE versie liet bestaande <p>-tags helemaal ongemoeid. Dat gaf in de
// inbox dubbele witruimte: de standaardmarge van de mailclient bovenop onze
// eigen afstand. De renderer bepaalt de witruimte nu zelf, dus deze test legt
// bewust het nieuwe gedrag vast: structuur en tekst blijven, de marge is de onze.
const reedsHtml = renderPlainMailHtml({ html: '<p>Al opgemaakt</p><p>Twee</p>', context });
ok('bestaande blok-HTML houdt zijn structuur, maar krijgt onze marge',
  reedsHtml.includes('Al opgemaakt') && reedsHtml.includes('Twee') &&
  (reedsHtml.match(/margin:0 0 1em;/g) || []).length === 2, reedsHtml);

// ─── De negatieve tests: dit is geen marketingmail ───────────────────────────
const alles = renderPlainMailHtml({
  html: 'Hoi {{registration.first_name}},\n\nKies een moment: <a href="{{lead.calendly}}">hier</a>.\n\n{{host.name}}',
  context
});
ok('geen tabel in de uitvoer', !/<table/i.test(alles), alles);
ok('geen achtergrondkleur', !/background/i.test(alles), alles);
ok('geen breedtebeperking', !/max-width/i.test(alles), alles);
ok('geen afbeelding', !/<img/i.test(alles), alles);
ok('geen border-radius, geen kaart', !/border-radius/i.test(alles));
ok('geen verborgen preheader', !/mso-hide|display:none/i.test(alles));
ok('precies één omhullende div', (alles.match(/<div/g) || []).length === 1, alles);
// Vergelijkt de BEDOELING, niet de exacte HTML: een link mag opmaak hebben
// (blauw + onderstreept, anders ziet Outlook hem niet), maar mag geen knop
// worden — dat leest als een mailing.
ok('een link blijft een gewone link, geen knop',
  /<a href="https:\/\/cal\.example\/thomas"[^>]*>hier<\/a>/.test(alles) &&
  !/<a[^>]*style="[^"]*(background|display:inline-block|border-radius|padding)/i.test(alles), alles);

// ─── Witruimte ───────────────────────────────────────────────────────────────
const uitQuill = renderPlainMailHtml({
  html: '<p>Hoi Jadranka,</p><p><br></p><p>Bedankt!</p><p><br></p><p><br></p><p>Tot binnenkort</p>',
  context
});
ok('lege alinea\'s uit de editor verdwijnen',
  !/<p[^>]*>(\s|&nbsp;|<br\s*\/?>)*<\/p>/i.test(uitQuill), uitQuill);
ok('elke alinea krijgt dezelfde marge, ook die van Quill',
  (uitQuill.match(/margin:0 0 1em;/g) || []).length === 3, uitQuill);
ok('de tekst zelf blijft volledig staan',
  uitQuill.includes('Hoi Jadranka,') && uitQuill.includes('Bedankt!') && uitQuill.includes('Tot binnenkort'));
ok('een <p> die al een eigen stijl heeft wordt niet overschreven',
  renderPlainMailHtml({ html: '<p style="color:red">x</p>', context }).includes('color:red'));
ok('rijen van drie of meer <br> worden ingekort',
  !/(<br\s*\/?>\s*){3,}/i.test(renderPlainMailHtml({ html: '<p>a<br><br><br><br>b</p>', context })));

ok('een link krijgt een zichtbare linkopmaak mee',
  /<a[^>]*style="[^"]*text-decoration:underline/i.test(
    renderPlainMailHtml({ html: '<p>Kies <a href="https://x.example">hier</a> een moment</p>', context })),
  'zonder eigen stijl geeft Outlook een link de tekstkleur — dan ziet niemand dat je kan klikken');
ok('een link die al een eigen stijl heeft blijft ongemoeid',
  renderPlainMailHtml({ html: '<a href="https://x" style="color:green">x</a>', context }).includes('color:green'));

// ─── Editor versus verzending ────────────────────────────────────────────────
const editor = renderPlainMailHtml({
  html: 'Hoi {{registration.first_name}}',
  context,
  editable: true,
  tokenLabels: { 'registration.first_name': 'Voornaam' }
});
ok('in de editor staat een chip, niet de waarde',
  editor.includes('data-om-token="registration.first_name"') &&
  editor.includes('Voornaam') && !editor.includes('Jadranka'), editor);
ok('de editor zet een bewerkmarker', editor.includes('data-om-edit="body"'));
ok('de verzonden mail bevat GEEN editor-markers',
  !alles.includes('data-om-edit') && !alles.includes('data-om-token'));
ok('zonder labels valt de chip terug op het pad zelf, en breekt niet',
  renderPlainMailHtml({ html: '{{onbekend.pad}}', context, editable: true }).includes('onbekend.pad'));

// ─── Onderwerp ───────────────────────────────────────────────────────────────
ok('onderwerp: placeholders ingevuld, witruimte genormaliseerd',
  renderPlainSubject('  Bedankt   {{registration.first_name}}  ', context) === 'Bedankt Jadranka');
ok('onbekende placeholder in het onderwerp wordt leeg, niet zijn eigen naam',
  renderPlainSubject('Hoi {{niet.bestaand}}!', context) === 'Hoi !');

// ─── Controle bij opslaan ────────────────────────────────────────────────────
ok('nietPlatteOpmaak vindt een tabel en een afbeelding',
  JSON.stringify(nietPlatteOpmaak('<p>x</p><table><tr><td><img src="y"></td></tr></table>')) ===
  JSON.stringify(['table', 'img']));
ok('nietPlatteOpmaak laat gewone tekst met een link door',
  nietPlatteOpmaak('<p>Kies <a href="https://x">hier</a> een moment</p>').length === 0);

console.log('\n' + geslaagd + ' test(en) geslaagd' + (gefaald ? ' — ' + gefaald + ' GEFAALD' : ''));
if (gefaald) process.exitCode = 1;
