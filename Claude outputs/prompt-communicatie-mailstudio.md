# Communicatie-studio: mail-opmaak van Odoo naar de OM trekken

## Lees eerst
- `CLAUDE.md`
- `claude/event-platform-herimplementatieplan.md`
- `claude/event-operations-v2-status.md`
- `claude/event-operations-doorlichting.md`
- `src/modules/event-operations-v2/odoo-contract.js`
- `src/modules/event-operations-v2/public-api.js`
- `src/modules/event-operations-v2/lib/registrations-service.js`
- `src/modules/event-operations-v2/lib/events-service.js`
- `src/modules/event-operations-v2/lib/wp-reload.js` (patroon voor fire-and-forget side-effects na een write)
- `src/modules/event-operations-v2/lib/cron.js`
- `src/modules/event-operations-v2/constants.js`
- `src/modules/mail-signature-designer/ui.js` (live iframe-preview patroon, regel ~540-550 en de rest van de tab-structuur — herbruikbaar voor een HTML-previewpaneel, dit is GEEN blokkeneditor, enkel het preview-idee is relevant)
- `src/lib/database.js`, `src/lib/odoo.js`

## Context

**Het architectuurprincipe staat al vast (niet heronderhandelen):** Odoo is de enige database.
Uit `event-platform-herimplementatieplan.md`: *"Mails: opgemaakt, aangevuld en klaargezet in OM;
Odoo rendert/verstuurt via `mail.mail`."* Fase **V2·4** in datzelfde plan is letterlijk:
*"communicatie-studio: blokken-editor, `mail.mail` per ontvanger met `scheduled_date`,
verzendmarkering op de registratie"*, gevolgd door een **Cutover**-fase die automations 53/58/62
uitzet. Dit is dus geen nieuw idee — dit is de fase die nu aan de beurt is.

**Waarom dit nodig is (bevestigd via live Odoo-onderzoek, niet aangenomen):**

Vandaag bestaan er 6 `mail.template`-records op model `x_webinarregistrations` (ids 50, 51, 52,
53, 55, 56) en 4 `base.automation`-rules (ids 53, 58, 62, 63). Rule 53 ("Stuur template mail",
bevestiging) en rule 62 ("...Live event)") zijn een kopie van elkaar — rule 62 filtert op
`x_studio_event_type = 'live-event'`, het veld dat het herimplementatieplan expliciet als
**rommelveld** bestempelt ("nooit lezen of schrijven", de echte bron is `x_event_type_id`). Rule 58
en 63 (reminder) zijn dezelfde kopie-constructie, nu op `x_studio_event_type_id in [4]`. Elke
Automation Rule roept twee `ir.actions.server` aan: één `mail_post` met een vast `template_id`,
één `object_write` die de `_sent`-vlag zet. Dat betekent: **elke keer dat structuur of copy moet
afwijken per event-type of onderwerp, kopieert iemand een heel sjabloon + een hele automation-rule
en verzint een nieuwe filter op een verouderd veld.** Dat is precies wat Nico "te beperkt" noemt,
en het is de exacte oorzaak, niet een vermoeden.

Al opgelost en al live (niet opnieuw doen): sinds recent bestaat `x_studio_registration_site`
(selectie, waarden `openvme`/`syndicoach`) op `x_webinarregistrations`, gevuld door de Worker
vanuit de sitesleutel (zie `handleRegister()` in `public-api.js` en `createRegistration()` in
`registrations-service.js`). De bevestigingsmail toont via een QWeb `t-if`/`t-elif`/`t-else` op
dat veld al een ander hero-logo per site — dat blijft gewoon werken/bestaan als precedent voor
"per-site variatie", maar de aanpak hieronder moet die QWeb-conditie uiteindelijk overbodig maken
door het hero-blok een gewoon blok in de nieuwe editor te maken.

**Andere vaste projectregels die hier hard van toepassing zijn:**
- `CLAUDE.md`: *alle* Odoo-aanpassingen (nieuwe velden, automations uitzetten, rechten) gaan via
  Odoo Studio of de Technische UI — geen custom Python-modules, geen Dynapps tenzij het niet
  anders kan. Bepaal dus voor élke Odoo-wijziging die je voorstelt of ze Studio-first kan.
- `blocks.js` in deze module bevat bewust **geen** blokkenschema voor de publieke eventpagina,
  met als reden: *"Er komt GEEN apart blokkenschema: dat zou een tweede waarheid naast Odoo zijn."*
  Diezelfde regel geldt voor de nieuwe mail-compositie: de bloktekst/structuur die je gaat
  bewerken in de OM moet **in Odoo blijven wonen** (een Studio-veld, geen Supabase-tabel, geen
  KV als bron-van-waarheid — KV/cache mag enkel als wegwerpbare kopie).
- `getSupabaseClient` mag niet voorkomen in `event-operations-v2/` — dat is een build-check-waarde
  uit het herimplementatieplan.

## Wat je hier komt doen

Dit is **geen implementatie-opdracht in één stap** — het is eerst een **ontwerpbeslissing** met
productierisico (dubbele of gemiste mails naar echte inschrijvingen), en pas daarna bouwwerk. Ga
in deze volgorde:

1. **Ontwerp het contract tussen OM en Odoo, expliciet, voor je iets bouwt.** Concreet te
   beslissen (en aan Nico voor te leggen waar het een productkeuze is, niet een technische):
   - Waar leeft de bloktekst/structuur per event-type (en eventueel override per event)? Voorstel:
     een nieuw Studio-veld met een JSON- of HTML-structuur op `x_event_type` (default) en
     optioneel op `x_webinar` (override) — bepaal zelf de meest Studio-vriendelijke vorm (een
     los veld per blok is Studio-simpeler dan één groot JSON-blob, maar minder flexibel; weeg dit
     af en motiveer de keuze).
   - Hoe verstuurt de OM: rechtstreeks `create` op `mail.mail` (`email_to`, `subject`, `body_html`,
     `scheduled_date`), zodat Odoo's eigen mailqueue-cron verzendt op het juiste moment — geen
     Automation Rule en geen `mail.template` meer nodig voor confirmation/reminder/recap. Ga na of
     de bestaande Odoo API-gebruiker al schrijfrecht heeft op `mail.mail` (dit sessie had enkel
     leestoegang tot Odoo — dit MOET je verifiëren, niet aannemen) en of dat via Studio/Technische
     UI vrij te geven is zonder Dynapps.
   - De `_sent`-vlaggen (`x_studio_confirmation_email_sent`, `x_studio_reminder_email_sent`,
     `x_studio_recap_email_sent`) zet je in **dezelfde schrijfactie** als het aanmaken van de
     `mail.mail`, nooit in een aparte stap met een `catch` die hem overslaat — dat is letterlijk de
     bug die het aanwezigheidsaudit-spoor in v1 brak (zie `event-operations-v2-status.md`), val niet
     in dezelfde val voor mails.
   - Confirmation-timing: kan synchroon/`ctx.waitUntil()` direct na `createRegistration()` (zie het
     patroon in `wp-reload.js`). Reminder- en recap-timing hebben een cron nodig — er bestaat er nog
     geen voor event-operations-v2 (zie open punt "Cron" in `event-operations-v2-status.md`); ontwerp
     die mee of leg vast dat dit een aparte, latere stap is.
   - Migratiepad: bepaal hoe je dit uittest zonder de bestaande automations meteen te breken (bv.
     eerst één event-type of één site, met de oude automation nog actief als vangnet totdat het
     nieuwe pad bewezen werkt), en pas daarna pas automations 53/58/62/63 en templates
     50/51/52/53/55/56 archiveren — exact zoals de Cutover-fase in het plan al voorschrijft.

2. **Leg het ontwerp (met de bovenstaande keuzes concreet ingevuld, niet als open vragen) aan Nico
   voor, in het Nederlands, beknopt, vóór je code schrijft.** Dit is een architectuurbeslissing met
   onomkeerbare kanten (Odoo-rechten, een Studio-veld dat je niet zelf kan aanmaken — alleen Nico
   heeft Studio-toegang) — niet iets om zelf stilzwijgend te kiezen.

3. **Pas na akkoord: bouw de editor + het schrijfpad**, in de bestaande stijl van de module
   (`public/events-v2.html` voor UI, JSON-only routes, geen server-rendered HTML-strings, geen
   inline `onclick`/`onchange`, hergebruik `getSupabaseClient`/`requireAuth`/`searchRead` waar
   relevant — er komt in dit hele stuk **geen Supabase bij**, enkel voor auth/UI-state zoals de
   rest van de module dat al doet).

## Wat je niet aanraakt

- De publieke inschrijf-flow, capaciteitscontrole, dubbele-inschrijving-check en de KV-lock in
  `registrations-service.js` blijven ongewijzigd — je voegt er hoogstens een aanroep aan toe na
  een succesvolle create.
- Het per-site hero-logo (QWeb `t-if` op `x_studio_registration_site`) blijft werken tot het
  vervangen is door een blok in de nieuwe editor — niet vooruit weghalen.
- Geen nieuwe Supabase-tabellen, geen custom Odoo Python-modules, geen wijziging aan
  `wp-plugin/mymmo-events/` (dit stuk raakt alleen Odoo + de OM).
- `EVENTS_WP_RELOAD_WEBHOOKS`, de bestaande cache-TTL's en de rate-limits op inschrijven blijven
  zoals ze zijn.

Lees ook `CLAUDE.md` voor de projectregels.
