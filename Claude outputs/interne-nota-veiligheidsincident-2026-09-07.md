# Interne nota — veiligheidsincident websites

**Aan:** management
**Van:** Nico Plinke
**Datum:** 7 september 2026
**Classificatie:** intern — niet extern verspreiden
**Status:** feitenrelaas in opmaak

---

## Kern

Onze twee websites zijn gecompromitteerd: **syndicoach.be** en **openvme.be**. Op syndicoach is de inbraak vastgesteld en volledig opgeruimd; op openvme is ze vandaag vastgesteld en loopt de opkuis nog. De aanvaller had beheerdersrechten, wat betekent dat we moeten aannemen dat de volledige inhoud van beide sites leesbaar was — inclusief de **Forminator-inzendingen**, en dat is ons belangrijkste risicogebied.

Er is een **wettelijke meldingstermijn van 72 uur**. Uitgaande van vandaag 7 september, 14u50 als moment van vaststelling loopt die tot **donderdag 10 september, 15u**. Management moet vóór dat moment beslissen of we melden bij de Gegevensbeschermingsautoriteit.

Een volledig feitenrelaas met exacte tijdlijn is in opmaak.

---

## Wat er is vastgesteld

### syndicoach.be

**Vijf valse beheerdersaccounts**, aangemaakt tussen 4 en 7 september (tijden in Belgische tijd):

| Account | Aangemaakt |
|---|---|
| `w2s_c341380eeb57` | vr 4 sep, 19u30 |
| `w2s_0b9a0a94e330` | zo 6 sep, 00u33 |
| `a0dc8c033d3e9edf` | zo 6 sep, 21u53 |
| `w2s_e97fb9ae1e76` | ma 7 sep, 10u13 |
| `gtepwovec` | ma 7 sep, 14u48 |

Het achtervoegsel `w2s` verwijst naar een bekend inbraakgereedschap dat van een WordPress-login serverzijdige toegang maakt. Het laatste account is aangemaakt tijdens ons onderzoek — de toegang was op dat moment dus nog actief.

**Vier kwaadaardige plugins**, waarvan één actief: een valse beveiligingsplugin die zich voordeed als een uitgave van het WordPress-beveiligingsteam en die de aanmaak van beheerdersaccounts verzorgde, plus drie neergezette mappen zonder auteur- of versiegegevens.

### openvme.be

De bestandsbeheerder **WP File Manager** staat actief en is niet door ons geïnstalleerd. Dat is een volwaardige bestandsbeheerder met upload- en editfunctie in het beheerscherm — het gereedschap waarmee een aanvaller bestanden op de server plaatst. Anders dan op syndicoach is dit een echte, legitieme plugin, wat verklaart waarom hij bij een eerste controle op naam en herkomst niet opviel.

**De begindatum op openvme is nog niet vastgesteld.** De volgorde "eerst syndicoach, dan openvme" is onze werkhypothese, niet een vaststelling. Blijkt de installatiedatum van WP File Manager vóór 4 september te liggen, dan keert die volgorde om en wordt de periode langer. Twee bronnen kunnen dit dateren: de datum van de pluginmap op de server, en de serverlogs bij onze hostingpartij. Dat wordt opgevraagd, en het is bepalend voor de periode die we in een eventuele melding opgeven.

---

## Hoe zijn ze binnengekomen — hypothese

De aanwijzingen gaan in de richting van een **brute force-aanval waarbij het wachtwoord van Seppe achterhaald is**. **Maarten onderzoekt dit nog**; zolang dat onderzoek loopt, blijft dit een hypothese en geen vaststelling.

Twee omstandigheden maken die hypothese plausibel: er stond op geen van beide sites tweestapsverificatie op de beheerdersaccounts, en er was geen begrenzing op het aantal inlogpogingen. Beide zijn sinds vandaag wel actief op syndicoach.

Eén detail voor het onderzoek: Seppe heeft op syndicoach enkel redacteursrechten, niet die van beheerder. Een achterhaald wachtwoord alleen verklaart de valse beheerdersaccounts daar dus niet — daarvoor is de kwaadaardige plugin nodig geweest, die precies die functie had. Dat is consistent met de hypothese, maar betekent dat er twee stappen in het spel zijn en niet één.

---

## Belangrijkste risicogebied: Forminator

Forminator is de plugin waarmee we onze webformulieren maken, en hij bewaart **elke inzending in de database van de site**. Wie beheerder is, kan die inzendingen lezen. Dat maakt dit het zwaarste onderdeel van dit incident: het gaat om persoonsgegevens van mensen die zich bij ons hebben ingeschreven of ons hebben gecontacteerd, over de volledige periode dat de formulieren bestaan.

Wat we per site moeten vastleggen, en wat rechtstreeks in de melding hoort:

- welke formulieren er bestaan en welke velden ze vragen
- hoeveel inzendingen, over welke periode
- of er vrije tekstvelden bij zitten waarin mensen gevoelige informatie kunnen hebben achtergelaten
- of er ergens wachtwoorden of betaalgegevens in staan (naar onze kennis niet)

Die cijfers zijn per formulier op te vragen in het beheerscherm van Forminator.

---

## Wat al gebeurd is

**syndicoach.be — opgeruimd en gecontroleerd:** de vijf valse accounts zijn verwijderd, de vier kwaadaardige plugins zijn van de schijf gehaald, de wachtwoorden zijn vernieuwd, en er zijn twee maatregelen bijgekomen: tweestapsverificatie en een begrenzing op inlogpogingen. De gebruikerslijst ging van 11 naar 5 accounts en de pluginlijst van 24 naar 19. Dat is nagekeken na de opkuis; er zijn sindsdien geen nieuwe accounts of plugins verschenen.

**openvme.be — in behandeling.** WP File Manager moet weg, en daarna volgt dezelfde behandeling: nieuwe beveiligingssleutels, nieuwe wachtwoorden, intrekken van alle applicatiewachtwoorden, en vernieuwen van de hosting-, FTP- en databasewachtwoorden.

---

## Wat nog open is

1. **Begindatum op openvme** — bepalend voor de periode in de melding.
2. **De weg naar binnen** — onderzoek Maarten.
3. **Resterende achterdeurtjes** op beide sites: `mu-plugins`, het thema, `wp-config.php`, PHP-bestanden in de uploadmap, geplande taken, en de codefragmenten in WPCode. Een gereedschap als dit laat zelden één spoor achter.
4. **Aantallen en velden van de Forminator-inzendingen** per site.
5. **Bijwerken van alle plugins** — op syndicoach liepen er vijf achter, en een niet-bijgewerkte plugin blijft een open deur zolang we de weg naar binnen niet kennen.
6. **Herzien van de rechten**: vijf beheerders op syndicoach en vier op openvme is meer dan nodig.

---

## Meldingsplicht — de beslissing die deze week valt

**De termijn.** De wet geeft 72 uur vanaf het moment dat we kennis hebben van de inbreuk. Nemen we vandaag 14u50 als dat moment, dan is de uiterste termijn **donderdag 10 september, 15u**. Die 72 uur begint niet bij het eerste vermoeden maar bij een redelijke zekerheid, en een korte onderzoeksperiode om vast te stellen *of* er een inbreuk is, is toegestaan. Het is wel belangrijk dat we vastleggen wanneer en hoe we het vastgesteld hebben — dat is wat het startmoment onderbouwt.

**Twee te onderscheiden plichten.**

*Melden aan de Gegevensbeschermingsautoriteit* is verplicht tenzij de inbreuk waarschijnlijk géén risico oplevert voor de betrokkenen. Bij dagen aan beheerdersrechten op twee sites met formulierinzendingen is "geen risico" moeilijk te verdedigen.

*De betrokkenen zelf informeren* is een aparte en strengere toets: dat moet alleen bij een **hoog** risico. Die twee beslissingen horen los van elkaar genomen te worden.

**Twee dingen die de drempel verlagen.** De melding mag in fasen: we melden wat we weten en vullen later aan, dus het lopende onderzoek is geen reden om te wachten. En zelf melden weegt uitdrukkelijk mee in ons voordeel bij de beoordeling.

**Wat altijd moet, ook als we niet melden:** het incident intern documenteren — wat er gebeurd is, wanneer, welke gegevens, welke maatregelen, en waarom we wel of niet gemeld hebben. Die motivering is precies wat achteraf wordt opgevraagd.

**Over het risico op een boete.** Gehackt worden is niet beboetbaar; niet melden terwijl het moest en het ontbreken van passende beveiliging zijn dat wel. In ons nadeel weegt dat er geen tweestapsverificatie stond, dat plugins achterliepen, en dat de inbraak dagen heeft doorgelopen. In ons voordeel weegt dat we het binnen enkele uren na vaststelling hebben opgeruimd, dat we het kunnen aantonen, en dat we meteen extra maatregelen namen. Voor een onderneming van onze grootte die tijdig meldt en het aantoonbaar heeft opgelost, is een boete onwaarschijnlijk — een berisping of geen verder gevolg is de gebruikelijke uitkomst.

Dit is geen juridisch advies. De beoordeling of we melden hoort gemaakt te worden met wie bij ons voor gegevensbescherming verantwoordelijk is.

---

## Gevraagd van management

1. **Beslissing over de melding** aan de Gegevensbeschermingsautoriteit, vóór donderdag 10 september 15u.
2. **Beslissing over het informeren van de betrokkenen**, apart van punt 1.
3. **Aanwijzen wie het interne register bijhoudt** en wie het contact met de toezichthouder doet.
4. **Ruimte voor de resterende opkuis** op openvme, inclusief de kans dat de site tijdelijk offline moet.
