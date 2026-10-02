# Academy achter een formulier van de OM (2026-10)

**Regel: de academy (openvme-cursus, Lovable) kent een cursist enkel nog aan een
ONDERTEKEND inlogbewijs. Dat bewijs maakt de OM na een geslaagde inzending van
een formulier met "Telt in Webgedrag als: Academy". Een e-mailadres alleen opent
niets meer.**

Waarom: het oude script in de kop van syndicoach.be (`<!-- OVME CURSUS POPUP -->`)
stuurde het kale adres in de link naar de academy (`?email=`), en de publieke
serverfuncties van de academy laadden, overschreven en wisten de voortgang op dat
adres alleen. Iedereen kon zo andermans voortgang zien.

| Wat | Waar |
|---|---|
| Bewijs maken (OM) | `src/lib/academy-token.js` (`signAcademyToken`), secret `ACADEMY_TOKEN_SECRET` |
| Bewijs meegeven na de inzending | `handleSubmit()` in `src/modules/forminator-sync-v2/forms/public-api.js` (`data.academy_token`) |
| Doorgeven aan de browser | `Mymmo_Forms_Api_Client::submit()` + `Mymmo_Forms_Submit::finish()` (enkel AJAX) |
| Overnemen in de pop-up | `meldAcademyBewijs()` in `assets/js/mymmo-forms.js` (event `mymmo:academy_token`, cancelable) |
| Instellingen, blok, venster in de voettekst | `wp-plugin/mymmo-forms/includes/class-academy.php` |
| Knop -> formulier of academy | `assets/js/mymmo-forms-academy.js` |
| Bewijs controleren + verlengen (academy) | `src/lib/learner-token.server.ts` in openvme-cursus |
| Wie de cursist is in de browser | `src/lib/learner.ts` in openvme-cursus |
| Cursuslijst voor de blok-editor | `GET /api/catalog` in openvme-cursus |

Afspraken die bewust zo zijn:

- **Het bewijs is stateless** (HMAC-SHA256 over `{e, x}`), 400 dagen geldig, en de
  academy geeft bij elk bezoek een verlengd bewijs terug. Geen tabel, geen
  migratie. Gevolg: intrekken van één bewijs kan niet; het geheim wisselen trekt
  ze ALLEMAAL in (iedereen ziet het formulier dan één keer opnieuw).
- **Twee kopieën van de vorm**: `academy-token.js` (OM) en
  `learner-token.server.ts` (academy). Twee repo's delen geen code. Wijzig ze samen.
- **Het bewijs reist in het FRAGMENT** (`#t=`), niet in de query: een fragment
  gaat naar geen enkele server en staat dus in geen log. De academy haalt het
  meteen uit de adresbalk.
- **De academy toont geen eigen e-mailvenster meer.** Met `?gate=parent` meldt ze
  `ovme_login_needed` aan de pagina eromheen, die dan het formulier toont.
  Rechtstreeks geopend zonder bewijs blijft alles op slot met een knop naar de
  website (`ACADEMY_ENTRY_URL` in `learner.ts`).
- **Het venster staat in de voettekst van elke pagina** zodra de academy
  ingesteld is: de oude knoppen (`.ovme-exit-cursus`, `ovme-cursus-<slug>`)
  staan in menu's en sjablonen, niet enkel in blokken. Wie aangemeld is, staat
  enkel in de browser (localStorage `mymmo_academy_token`), dus de paginacache
  blijft werken.
- **De bezoeker telt als "academy" in Webgedrag zonder apart script**: het is een
  gewone inzending, en die meldt de OM zelf aan de tracker.
- **Lokale voortgang van iemand anders** in dezelfde browser wordt niet
  overgenomen (`openvme-progress-owner` in de academy).

**Uitrolvolgorde (anders staan cursisten even voor een gesloten deur):**
1. `ACADEMY_TOKEN_SECRET` als Worker-secret in de OM, OM deployen.
2. In Koppelingen het academy-formulier op "Academy" zetten (met een e-mailveld).
3. mymmo-forms 1.20.0 installeren, Instellingen → Mymmo academy invullen, het oude
   script uit de kop van de site halen. Dit werkt ook met de OUDE academy: die
   negeert `#t=` en vraagt dan zelf nog het adres.
4. Hetzelfde geheim als secret in Lovable, dan de academy publiceren.

Na stap 4 werkt een `?email=`-link niet meer. Wie de academy al gebruikte, vult
het formulier één keer opnieuw in; zijn voortgang komt terug, want die hangt aan
zijn adres.
