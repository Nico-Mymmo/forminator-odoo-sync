---
name: huisstijl-review
description: Review van een component in Mymmo Componenten (wp-plugin/mymmo-cards) tegen de huisstijl -- hiërarchie, zwaarte, consistentie, mobiel en desktop, de werkwijze in Gutenberg -- en daarna de stempel die het bouwscript eist. Gebruik dit vóór je een zip van mymmo-cards bouwt, of wanneer iemand vraagt of een component "strak" zit.
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

1. **De lint eerst.** Draai `node wp-plugin/huisstijl/controleer.mjs`. Zijn er
   fouten, stop dan: los ze op (in het component, nooit in de controle of de
   uitzonderingen) of meld ze, en begin de review pas als de lint groen is.

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
     node wp-plugin/huisstijl/controleer.mjs --stempel "<samenvatting>"
     ```

     De stempel (`wp-plugin/mymmo-cards.review.json`) hoort bij precies deze code.
     Wie daarna nog iets wijzigt in de plugin, moet opnieuw door de review.

6. **Meld wat je NIET kon nagaan**: hoe het er op de echte site uitziet (met het
   thema), op een echt toestel, met echte inhoud. Dat blijft voor de mens die het
   uitrolt -- zeg dat erbij.

## Wat je nooit doet

- De controle, de huisstijl, de uitzonderingen, de bewaking of het bouwscript
  aanpassen om een fout weg te krijgen. Zit een regel echt in de weg, zeg dan
  welke en waarom; dat is een vraag aan Nico.
- Een stempel zetten met fouten in de lint of met een open **moet**.
- Een stempel zetten voor code die je niet gelezen hebt.
