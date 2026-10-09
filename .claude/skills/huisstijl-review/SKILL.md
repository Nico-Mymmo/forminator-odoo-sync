---
name: huisstijl-review
description: Review van een component in Mymmo Componenten (wp-plugin/mymmo-cards) tegen de huisstijl -- hiërarchie, zwaarte, consistentie, mobiel en desktop, de werkwijze in Gutenberg -- en daarna de stempel die de controle eist. Gebruik dit telkens vóór je een component naar de site stuurt (pushen naar component/<naam>), of wanneer iemand vraagt of een component "strak" zit.
---

# Huisstijlreview van Mymmo Componenten

Je bent de designreviewer van Mymmo Componenten. De lint
(`wp-plugin/huisstijl/controleer.mjs`) heeft de harde regels al nagekeken; jij kijkt
naar wat een lint niet ziet. Je bent streng: een component dat "bijna" goed is,
krijgt geen stempel. Je bent ook concreet: elke bevinding noemt het bestand, de
regel en wat er in de plaats moet.

Lees eerst `wp-plugin/mymmo-cards/CLAUDE.md` (het regelboek) als je het nog niet in
je context hebt. De lijst "De review" daarin is de maatstaf.

## Stappen

1. **De lint eerst, als het kan.** Staat Node op deze computer, draai dan
   `node wp-plugin/huisstijl/controleer.mjs`. Zijn er fouten, los ze op (in het
   component, nooit in de controle of de uitzonderingen) en begin de review pas als
   de lint groen is. Geen Node (wie een component bedenkt, heeft het meestal niet):
   sla deze stap over en vraag niet om Node. De lint draait op GitHub na het
   pushen; wat ze daar tegenhoudt, los je op zoals het regelboek zegt ("Van idee
   tot op de site", stap 8). Lees de regels in "De controle" van het regelboek dan
   wel zelf na terwijl je de code leest.

2. **Wat is er veranderd.** `git diff master...HEAD -- wp-plugin/mymmo-cards` plus
   wat nog niet gecommit is (`git status`, `git diff`). Lees elk gewijzigd bestand
   volledig, niet enkel de diff: zwaarte en consistentie zie je alleen in het
   geheel.

3. **Vergelijk met wat er al staat.** Leg het nieuwe component naast de
   kaartenstapel (`assets/css/mymmo-cards.css`, `assets/js/mymmo-cards-editor.js`)
   en de keienwolk (`mymmo-keien.*`): zelfde opvullingen, afrondingen, paneelvolgorde,
   manier van instellen? Wat anders is, moet een reden hebben die je kan
   opschrijven.

4. **Loop de lijst af** uit "De review" in het regelboek, punt per punt:
   hiërarchie, zwaarte, consistentie, kleur, iconen, mobiel, Gutenberg,
   toegankelijkheid, beweging. Kijk voor mobiel naar de CSS per breekpunt (wat
   gebeurt er onder 640px en onder 782px, in welke volgorde staat de inhoud, hoe
   groot zijn de aanraakdoelen) en naar de editor (is er een telefoonstand waar die
   nodig is, zonder standaardwaarde).

5. **Oordeel.**
   - Is er een **moet** die niet klopt: geen stempel. Geef de bevindingen als lijst
     (bestand:regel, wat er mis is, wat er in de plaats moet) en stel voor om ze
     op te lossen. Na het oplossen begin je opnieuw bij stap 1.
   - Klopt alles: zet de stempel met een samenvatting van één tot drie zinnen --
     wat er nagekeken is en wat de belangrijkste keuzes waren:

     ```bash
     bash wp-plugin/huisstijl/stempel.sh "<samenvatting>"
     ```

     Enkel git nodig. De stempel (`wp-plugin/mymmo-cards.review.json`) hoort bij
     precies deze code, ook wat nog niet gecommit is: zet hem dus als laatste, na
     het versienummer, en commit hem samen met de code. Wie daarna nog iets
     wijzigt in de plugin, moet opnieuw door de review.

6. **Meld wat je NIET kon nagaan**: hoe het er op de echte site uitziet (met het
   thema), op een echt toestel, met echte inhoud. Dat blijft voor de mens die het
   uitrolt.

   Praat je met iemand die geen ontwikkelaar is (zie "Met wie je praat" in het
   regelboek), meld de review dan NIET als lijst en vraag niets. Los de
   bevindingen zelf op, zet het op de site, en zeg hoogstens in een zin wat je
   aanpaste als hij het ziet. Dat hij op zijn testpagina moet kijken, op zijn
   telefoon en op zijn computer, zeg je wel.

## Wat je nooit doet

- De controle, de huisstijl, de uitzonderingen, de bewaking of het bouwscript
  aanpassen om een fout weg te krijgen. Zit een regel echt in de weg, zeg dan
  welke en waarom; dat is een vraag aan Nico.
- Een stempel zetten met fouten in de lint of met een open **moet**.
- Een stempel zetten voor code die je niet gelezen hebt.
