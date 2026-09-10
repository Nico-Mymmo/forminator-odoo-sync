# Koppelingen: `send_mail`-stap met vertraging, conditie en open-tracking

## Lees eerst

- `CLAUDE.md` — in het bijzonder de bewerkprocedure voor bestanden > 150 regels, de
  Studio-first regel voor Odoo, en de UI-regels (REGEL 1-6, `tabs-boxed`).
- `src/modules/event-operations-v2/lib/mail-service.js` — het `mail.mail`-patroon dat
  hier hergebruikt wordt (idempotentie via `message_id`, `auto_delete: false`,
  `scheduled_date`, vlag-als-spiegel).
- `src/modules/event-operations-v2/lib/mail-blocks.js` — blokkenschema en `timing`.
- `src/modules/event-operations-v2/lib/mail-render.js` — blok → HTML, zonder QWeb.
- `src/modules/forminator-sync-v2/worker-handler.js` — de stap-pipeline.
- `src/modules/forminator-sync-v2/validation.js` — per-`operation_type` validatie
  (zie `chatter_message` en `create_activity` als patroon).
- `src/modules/forminator-sync-v2/services/integration-service.js`
- `src/router/public-routes.js` — token-geauthenticeerde webhookroutes.
- `supabase/migrations/20260304180000_fsv2_chatter_message.sql` en
  `20260320000000_fsv2_activity_step.sql` — hoe een nieuw stap-type zijn kolommen krijgt.
- `supabase/migrations/20260728120000_fsv2_trackers.sql` — `fs_v2_tracker_hits`.

## Waarom dit bestaat

Vandaag vertrekt er **niets** wanneer iemand Syndicoach aanvraagt. Dat is nagegaan in de
live Odoo, niet aangenomen:

- De aanvragen landen als leads `Syndicoach Aangevraagd: <naam>` op team Sales, met
  `partner_id` (VME + contactnaam) en `lang_id` NL. Instroom ~1 per dag; laatste bij het
  schrijven van dit document is lead 11490 (2026-09-08 11:44).
- Marketing-automation-campagne **19** ("Nurture | Syndicoach | VME-check", running) heeft
  activiteit 78 → mailing 171 ("🍀 Bevestiging VME-check", delay 0u) en activiteit 79
  (activiteit op de lead). Haar domein is `x_studio_is_vme_check = True`. Dat veld staat
  op **False** bij alle aanvraag-leads; er bestaan in totaal 4 leads met die vlag, de
  laatste van 2026-06-24. Mailing 171 staat dan ook op 14 sends / 8 opens.
- `mailing.trace` voor `crm.lead` op de negen recentste aanvraag-leads: **0 records**.
- `mail.template` **54** ("Syndicoach: Mail na aanvraag", subject "Bevestiging Syndicoach
  VME Check - Wij gaan aan de slag!", from `info@syndicoach.be`) hangt aan **geen enkele**
  `base.automation` en aan geen `ir.actions.server`. Dode template.
- Wat wél loopt voor Syndicoach is campagne **24** ("Nurture | MetaLead | Syndicoach | NL",
  op Contact): mail 1 op dag 0 (mailing 195), mail 2 op dag 2 (mailing 182). Dat zijn
  mass mailings — precies de marketing-uitstraling die deze mail niet mag hebben.

De opdracht is dus niet "een bestaande mail verplaatsen", maar "een ontbrekende mail
toevoegen", en hem meteen op de juiste plaats zetten: in de Koppelingen-module, als stap
in de pipeline die de aanvraag toch al verwerkt.

## Genomen beslissingen — niet heronderhandelen

1. **De mail-inhoud leeft in Supabase, op de stap.** Een kolom op `fs_v2_targets`, naast
   de bestaande `chatter_template` en `activity_summary_template`. De regel "Odoo is de
   enige database" is een moduleregel van `event-operations-v2`; Koppelingen configureert
   zichzelf al volledig in Supabase, en een tweede configuratieplaats invoeren voor
   uitsluitend de mailtekst zou de module inconsistent maken.
2. **Open- en klikcijfers via een Postmark-webhook naar de OM.** Transactional stream met
   open tracking aan, correlatie via een `X-PM-Metadata-*`-header, nieuwe tabel
   `fs_v2_mail_events`, statistieken per koppeling in de bestaande detailweergave.
3. **Het stap-type wordt generiek** (`operation_type = 'send_mail'`, bruikbaar in elke
   koppeling) en wordt daarna ingeschakeld op de twee Syndicoach-formulieren.
4. **Afzender is de toegewezen coach/eigenaar van de lead** (`user_id`), met een expliciete
   terugvalketen — zie "Openstaand punt" onderaan.

## Architectuur

De OM rendert de HTML en maakt een `mail.mail`-record aan met een `scheduled_date`;
Odoo's eigen queue verstuurt. Cron 3 ("Mail: Email Queue Manager") loopt **elke minuut**,
dus een vertraging van 1 à 2 uur is exact en niet afgerond op een cronvenster.

Idempotentie op het mail-record zelf, zoals bij events, via een afgeleide `message_id`:

```
<kop{integrationId}-t{targetId}-sub{submissionId}@om.mymmo.com>
```

Volgorde per stap: zoeken op die sleutel → bestaat er al een, dan overslaan met
`skipped_reason = 'mail_already_queued'` → anders `create`. Er is geen boolean nodig: het
`mail.mail`-record is het bewijs. `auto_delete` staat expliciet op `false`, anders ruimt een
verzonden mail zichzelf op en valt er achteraf niets te controleren.

**Geen QWeb.** De blokken worden in de Worker naar HTML gerenderd, net als in events, en
gaan als kant-en-klare `body_html` naar `mail.mail`.

### Renderer hergebruiken, niet kopiëren

`mail-render.js` (937 regels) en `mail-blocks.js` (551 regels) zijn nu event-specifiek:
placeholders als `formatEventMoment`, secties per `MAIL_KIND`. Trek de blok→HTML-laag uit
naar `src/lib/mail/render-blocks.js` met een neutrale placeholdercontext (`{ placeholders,
site }`), en laat `event-operations-v2/lib/mail-render.js` die aanroepen. Wat
event-specifiek is (`MAIL_KIND`, `timing`, `formatEventMoment`) blijft staan waar het staat.
Kopieer de renderer niet — dan drijven twee mailopmaken uit elkaar en dat is exact het
probleem dat de mailstudio kwam oplossen.

Volg bij het aanpassen van `mail-render.js` de procedure uit `CLAUDE.md`: Python-script,
binary I/O, `assert content.count(old_block) == 1`, `node --check` en een volledige diff na
elke schrijfactie.

## Migratie

```sql
-- fs_v2_targets: kolommen voor operation_type = 'send_mail'
ALTER TABLE fs_v2_targets
  ADD COLUMN IF NOT EXISTS mail_subject_template   TEXT,
  ADD COLUMN IF NOT EXISTS mail_blocks             JSONB,
  ADD COLUMN IF NOT EXISTS mail_delay_minutes      INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS mail_recipient_source   TEXT,
  ADD COLUMN IF NOT EXISTS mail_res_id_source      TEXT,
  ADD COLUMN IF NOT EXISTS mail_from_source        TEXT NOT NULL DEFAULT 'record_user',
  ADD COLUMN IF NOT EXISTS mail_from_name          TEXT,
  ADD COLUMN IF NOT EXISTS mail_from_email         TEXT,
  ADD COLUMN IF NOT EXISTS mail_reply_to           TEXT,
  ADD COLUMN IF NOT EXISTS mail_server_id          INTEGER,
  ADD COLUMN IF NOT EXISTS mail_track_opens        BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS mail_respect_blacklist  BOOLEAN NOT NULL DEFAULT TRUE;
```

Betekenis van de minder evidente kolommen:

| Kolom | Betekenis |
|---|---|
| `mail_blocks` | Blokkenarray, zelfde schema als de events-mailstudio. |
| `mail_delay_minutes` | 0 = meteen. 90 = anderhalf uur later. Wordt `scheduled_date`. |
| `mail_recipient_source` | Contextsleutel of formulierveld, bv. `step.1.record_id` (e-mail van dat record) of `field.email-1`. |
| `mail_res_id_source` | Waaraan het mail-record hangt (`model` + `res_id`), zodat de mail in de chatter van de lead zichtbaar is. Zelfde idee als `activity_res_id_source`. |
| `mail_from_source` | `record_user` = de eigenaar van het doelrecord; `fixed` = `mail_from_name`/`mail_from_email`. |
| `mail_server_id` | Odoo `ir.mail_server`. Expliciet zetten, want de default is de broadcast-server (zie hieronder). |
| `mail_respect_blacklist` | Zie "Blacklist" — dit is geen optionele nettigheid. |

De vertraging en de copy per antwoord vragen **geen** nieuw mechanisme: `fs_v2_targets`
heeft al `condition_field` + `condition_values` (jsonb, case-insensitief) en een unieke
`execution_order`. "Twee uur later als ze 'ik zoek dringend' antwoordden, anders één uur"
zijn twee `send_mail`-stappen met elk hun eigen conditie en `mail_delay_minutes`; de stap
die niet matcht krijgt `skipped_reason = 'condition_not_met'` en er vertrekt niets dubbel.

```sql
-- Nieuwe tabel: Postmark-events per verzonden mail
CREATE TABLE IF NOT EXISTS fs_v2_mail_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid NOT NULL REFERENCES fs_v2_integrations(id) ON DELETE CASCADE,
  target_id      uuid NULL REFERENCES fs_v2_targets(id) ON DELETE SET NULL,
  submission_id  uuid NULL,
  odoo_mail_id   integer NULL,
  event_type     text NOT NULL,          -- delivery | open | click | bounce | spamcomplaint
  occurred_at    timestamptz NOT NULL DEFAULT now(),
  recipient      text,
  first_open     boolean,
  payload        jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fs_v2_mail_events_integration
  ON fs_v2_mail_events (integration_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_fs_v2_mail_events_submission
  ON fs_v2_mail_events (submission_id);
```

Alle open-events worden bewaard, ook heropeningen; de open rate is `count(distinct
submission_id where event_type='open')` gedeeld door de verzonden mails van die stap.
Postmark markeert de eerste open apart — dat gaat in `first_open`.

## Postmark: waarom er een tweede mailserver nodig is

Jullie Odoo heeft drie `ir.mail_server`-records:

| id | naam | host | user | from_filter | sequence |
|---|---|---|---|---|---|
| 4 | Postmark | `smtp-broadcasts.postmarkapp.com` | `PM-B-newsletter-...` | leeg | 10 |
| 1 | Support | `smtp.gmail.com` | `support@syndicusonline.com` | `support@syndicusonline.com` | 11 |
| 3 | Brevo | `smtp-relay.brevo.com` | `38c572002@smtp-brevo.com` | leeg | 20 |

Server 4 is de **broadcast stream** (`PM-B-`), leeg `from_filter`, laagste sequence — dus
de default voor alles wat Odoo verstuurt. Bij Postmark bepaalt het SMTP-token de stream;
een `X-PM-Message-Stream`-header overschrijft dat **niet**. Een gewone, persoonlijke mail
over de broadcast-stream duwen is precies de marketing-uitstraling die we niet willen, en
je meet er ook niets zinnigs aan.

**Er is geen nieuwe Postmark-server nodig.** Het serveroverzicht van Postmark (nagekeken
2026-09-08) toont bij server **Odoo**: 3.545 Broadcasts en `–` bij Transactional over de
laatste 30 dagen. Die server heeft dus al een transactional stream die vandaag ongebruikt
is — domein, DKIM en afzendersignaturen staan er al op, want die horen bij de server en
niet bij de stream. De andere servers in dat overzicht (OpenVME, acc, staging, dev/test,
preview) zijn het platform zelf, met 7.365 transactionele mails op de productieserver;
daar mag deze mail niet tussen gaan zitten, want dan lopen platformmail en Odoo-mail door
elkaar in de statistieken en in de reputatie.

**De stream bestaat al en heet `outbound-contact-replies`** ("Outbound Contact Replies",
type Transactional, op server Odoo — nagekeken 2026-09-08). Dat is geen Postmark-default:
de standaard transactional stream heeft stream-ID `outbound`. Iemand heeft deze bewust
aangemaakt, en de naam dekt precies wat wij nodig hebben. Ga bij het inrichten na of er
naast deze stream ook nog een `outbound` bestaat (het uitklapmenu naast de streamnaam
toont ze), en kies dan bewust — twee transactional streams die door elkaar gebruikt worden
maakt de statistieken net zo onleesbaar als de broadcast-stream.

**Vastgesteld (Setup Instructions → SMTP van deze stream, 2026-09-08).** Postmark biedt
twee authenticatiewijzen op `smtp.postmarkapp.com` (poort 587):

1. **Servertoken + header.** Gebruikersnaam en wachtwoord zijn beide het SERVERtoken; de
   stream kies je met `X-PM-Message-Stream: outbound-contact-replies`. Het token is dus
   niet stream-gebonden.
2. **Stream-eigen SMTP-token.** De link "Authenticate with an SMTP token" onder die
   instructies geeft een token dat aan déze stream vastzit. Geen header nodig. Dit is wat
   er vandaag voor broadcast gebruikt wordt: `PM-B-newsletter-from--...` is zo'n token.

**Kies variant 2.** Drie redenen, in volgorde van belang:

- **Een servertoken in Odoo is een te grote sleutel.** Het geeft verzendrecht op de hele
  server Odoo, over alle streams, en het is ook het API-token. Een stream-eigen SMTP-token
  kan alleen mail in deze ene stream duwen. Na het token-incident van 2026-09-08 is dat
  geen theoretisch verschil.
- **De stream kan dan niet meer verkeerd zijn.** Bij variant 1 bepaalt een header de
  stream, en een mail die daar zonder header binnenkomt gaat naar de DEFAULT transactional
  stream (`outbound`) — stil, zonder fout. Bij variant 2 is de stream een eigenschap van de
  verbinding en valt er niets te vergeten.
- **Het bestaande serverrecord blijft onaangeraakt.** Server 4 authenticeert met een
  broadcast-SMTP-token en negeert stream-headers; nieuwsbrieven en marketing automation
  blijven dus gewoon op broadcast. Zou je variant 1 op dat bestaande record toepassen, dan
  verhuist ALLE Odoo-mail naar transactional — precies verkeerd, want bulk hoort op
  broadcast.

Concreet dus: een **tweede `ir.mail_server`** "Postmark — Outbound Contact Replies" met het
stream-eigen SMTP-token, met een **hogere** sequence dan 10 zodat hij nooit per ongeluk de
default wordt, en `mail_server_id` expliciet op elke `mail.mail` die deze stap aanmaakt.
Dit is een wijziging via de Technische UI en valt dus binnen de Studio-first regel.

**Zet dan géén `X-PM-Message-Stream` in de headers.** Bij een stream-eigen token is die
header op zijn best overbodig en op zijn slechtst een tegenspraak. De twee headers die wél
blijven (`X-PM-TrackOpens`, `X-PM-Metadata-om-mail`) staan los van de streamkeuze en werken
bij beide varianten.

**Niet via de Postmark-API versturen.** De curl-instructies in de Postmark-UI zijn
verleidelijk, maar de Worker mag deze mail niet zelf de deur uit doen: dan bestaat er geen
`mail.mail`-record, staat de mail niet in de chatter van de lead, en verdwijnt de
idempotentie die op `message_id` draait. Odoo verstuurt, de OM zet klaar.

Omdat de stream nog nooit gebruikt is, staat open tracking er vermoedelijk uit. Zet die
aan op de stream zelf (Settings → open tracking); de `X-PM-TrackOpens`-header per mail is
dan de bevestiging, niet de enige schakelaar.

**Het servertoken van server Odoo staat sinds 2026-09-08 in een screenshot in een
chatgesprek** en moet in Postmark geroteerd worden (Servers → Odoo → API Tokens). Dat
token geeft volledig verzendrecht op de hele server, over alle streams. Na rotatie: het
nieuwe token nergens in de repo, enkel in de Odoo-serverconfiguratie respectievelijk via
`wrangler secret put`.

`mail.mail.headers` bestaat in deze Odoo (type text, wordt bij verzending aan het bericht
toegevoegd). Daar zetten we:

```
X-PM-TrackOpens: true
X-PM-Metadata-om-int: {integrationId}
X-PM-Metadata-om-tgt: {targetId}
X-PM-Metadata-om-sub: {submissionId}
```

**Drie velden, niet één samengestelde waarde.** Postmark staat per metadataveld
maximaal 80 tekens toe (veldnaam max 20, max 10 velden). Drie UUID's aan elkaar
geplakt is 110 tekens, en dan gebeurt het vervelendste soort fout: Odoo meldt
`state: 'sent'` zonder `failure_reason` — de SMTP-overdracht slaagt dus — en het
bericht is in Postmark nergens te vinden. Overkomen met mail 95438 op
2026-09-08. Eén UUID per veld is 36 tekens; `mail-step-test.mjs` bewaakt de grens.

(Geen `X-PM-Message-Stream` — de stream zit in het SMTP-token, zie hierboven.)

De open-webhook van Postmark geeft die metadata terug, zodat de OM het event zonder gokwerk
aan de juiste submissie hangt — geen matching op ontvanger of subject.

Klikken: Postmark-linktracking kan aan, maar voor de Calendly-link is de bestaande
tracker-infrastructuur van Koppelingen (`fs_v2_tracker_hits` + de tracker-stats-tab) beter,
want die geeft je de cijfers op dezelfde plek als de rest van de koppeling. Gebruik een
tracker-slug in de mail en laat Postmark-linktracking uit, anders tel je dubbel.

## Blacklist — verplicht, niet optioneel

Marketing automation respecteert `mail.blacklist` en de opt-out automatisch. Een rauw
`mail.mail`-record doet dat **niet**. Vóór het aanmaken moet de stap dus expliciet checken
op `res.partner.is_blacklisted` respectievelijk `mail.blacklist` voor het e-mailadres, en
bij een treffer overslaan met `skipped_reason = 'blacklisted'`. Dit weglaten betekent
mailen naar mensen die zich hebben uitgeschreven.

Een bevestigingsmail op eigen verzoek is inhoudelijk een servicebericht en heeft geen
uitschrijflink nodig; de blacklist van Odoo respecteren is een aparte verplichting en staat
daar los van.

## Webhookroute

Nieuwe token-geauthenticeerde route in `src/router/public-routes.js`, naast de bestaande
forminator-v2 webhooks:

```
POST /forminator-v2/webhooks/postmark?token=<POSTMARK_WEBHOOK_SECRET>
```

- Token via `wrangler secret put POSTMARK_WEBHOOK_SECRET`, nooit in de repo.
- Onbekende of ontbrekende metadata → 200 met `{ ignored: true }`, geen 4xx: Postmark
  hangt bij fouten zijn webhook op, en een event dat wij niet kunnen plaatsen is geen
  reden om de hele stroom te verliezen.
- Payload ongewijzigd in `payload` bewaren; velden die we vandaag niet gebruiken zijn
  morgen de reden dat we niet opnieuw moeten instrumenteren.

## UI

Een `send_mail`-stap in de flow-builder van Koppelingen, met:

- blokkeneditor (hergebruik het patroon van `public/events-v2-mail-studio.js`),
- live HTML-preview in een iframe (patroon uit `mail-signature-designer/ui.js`),
- **een instelbare vertraging per stap** (`mail_delay_minutes`), ingevoerd als uren +
  minuten, met 0 = meteen versturen. Dit staat nergens als constante in de code: de 90
  minuten hieronder is een startwaarde die je in de stap zelf bijstelt, en twee stappen in
  dezelfde koppeling kunnen een verschillende vertraging hebben,
- de bestaande conditie-velden van de stap,
- een statistiek-tab per koppeling: verzonden / afgeleverd / geopend / geklikt / bounces,
  in de vorm van de bestaande tracker-stats-tab.

Volg REGEL 1-6: UI in `/public`, JSON uit de Worker, data-attributen met één centrale
listener, `tabs-boxed`.

## Handmatige stappen (kunnen niet vanuit de code)

0. **Postmark, eerst** — het servertoken van server Odoo roteren (het staat in een
   screenshot in een chatgesprek).
1. **Postmark** — server **Odoo** → stream `outbound-contact-replies` → Setup Instructions
   → SMTP → **"Authenticate with an SMTP token"**: een stream-eigen SMTP-token aanmaken
   (NIET het servertoken gebruiken, zie hierboven). Daarna open tracking aanzetten onder
   Settings, en onder Webhooks een webhook toevoegen voor Delivery, Open, Click, Bounce en
   Spam Complaint met de OM-URL en het token. Niet de OpenVME-servers gebruiken — dat is
   het platform zelf.
2. **Odoo, Technische UI** — `ir.mail_server` "Postmark — Transactional" aanmaken met die
   gegevens, sequence hoger dan 10 (bv. 30) zodat de bestaande broadcast-server de default
   blijft. Het id opnemen in de stapconfiguratie.
3. **Odoo** — nagaan of de API-gebruiker `create` mag op `mail.mail` (voor events is dat
   al zo geregeld, dus dit is vermoedelijk in orde).
4. **Opruimen** — `mail.template` 54 archiveren (dode template) en beslissen wat er met
   campagne 19 en haar mailing 171 gebeurt: die vuurt vandaag toch niet, en twee bronnen
   voor dezelfde mail is hoe je later een dubbele verzending krijgt.

## De mail zelf — versie 1

Onderwerp: `Bedankt voor je interesse in Syndicoach, even kennismaken?`

```
Hoi {{voornaam}},

Bedankt voor jouw aanvraag, fijn dat je interesse hebt in Syndicoach!

Ik neem graag contact met je op om jullie gebouw wat beter te leren kennen en onze
werking toe te lichten. Zo zie je meteen of Syndicoach bij jullie VME past. Een kort
gesprek van een 15-tal minuten volstaat, en ondertussen beantwoord ik al je vragen.

Je kan hier meteen een moment kiezen dat jou past: {{calendly_link}}

Tot binnenkort!

{{afzender_naam}}
```

**Deze mail is PLATTE TEKST, en dat is de standaard (beslissing 2026-09-08).** Niet "sober
opgemaakt" -- geen opmaak. Geen tabellen, geen achtergrondkleur, geen witte kaart, geen
`max-width`, geen hero, geen logo, geen knoppen, geen voettekst, geen preheader. Eén
omhullende `<div>` met een lettertype, en daarbinnen alinea's:
`src/lib/mail/render-plain.js`.

De eerste opzet van dit plan ging uit van de blokkeneditor van de events-mailstudio. Dat
was fout: een blokkenmail HEEFT een achtergrond, kaarten en knoppen, en dat is een
marketingmail ongeacht welke woorden erin staan en ongeacht via welke stream hij vertrekt.
Iemand die net een aanvraag deed en een antwoord krijgt met een hero-banner, ziet een
mailing.

Vandaar twee standen in `mail_layout`, met `plain` als standaard:

| stand | inhoud uit | renderer |
|---|---|---|
| `plain` (standaard) | `mail_body_html` | `src/lib/mail/render-plain.js` |
| `blocks` | `mail_blocks` | `src/lib/mail/render-blocks.js` |

`nietPlatteOpmaak()` in die renderer is een CONTROLE bij het opslaan, geen opschoning: wie
per ongeluk een tabel of afbeelding in de tekst plakt, hoort dat te horen in plaats van het
stil verwijderd te zien.

Voeg aan `render-plain.js` nooit layout toe "omdat het net iets mooier kan" -- de hele
bestaansreden van dat bestand is dat het niets doet.

`{{calendly_link}}` is een tracker-slug uit Koppelingen, niet de rauwe Calendly-URL, zodat
de kliks in de koppeling zelf zichtbaar zijn.

**Eén onvermijdelijke afbeelding.** Open tracking van Postmark werkt met een onzichtbare
1x1-pixel die Postmark bij het verzenden toevoegt. "Helemaal geen afbeeldingen" en "ik wil
open rates zien" gaan dus niet samen; de pixel is onzichtbaar voor de lezer, maar hij is er.

Vertraging: **90 minuten** als startwaarde, instelbaar per stap in de UI. Meteen versturen
ondermijnt de indruk dat een mens het typte; een halve dag later is te laat om nog vers te
zijn. Wil je later per antwoord een andere vertraging, dan is dat een tweede `send_mail`-stap
met een eigen conditie — geen aanpassing aan de code.

## Afzender — beslist: toewijzing gebeurt bij het aanmaken van de lead

De afzender is de toegewezen coach (`user_id` op de lead). Omdat de toewijzing voortaan
**meteen bij het aanmaken van de lead** gebeurt (beslissing 2026-09-08), staat `user_id`
al vast op het moment dat deze stap zijn `mail.mail` aanmaakt. De vertraging van 90
minuten is daarmee geen probleem: er valt niets meer te herzien tussen aanmaken en
verzenden.

**Geen cronronde voor het aanmaken.** Die was alleen nodig als de toewijzing later viel,
en dat is nu niet zo. Voer dat niet in als vooruitziende maatregel — het zou de
idempotentie over twee momenten uitsmeren zonder dat er iets mee opgelost wordt.

Terugvalketen bij het aanmaken blijft wel staan als vangnet: `lead.user_id` → eigenaar van
de koppeling → vast adres in `mail_from_email` / `mail_from_name`. Nooit leeg, nooit een
raadsel wie het verstuurde.

Een round-robin of andere verdeelregel komt later bij het aanmaken van de lead te zitten,
niet in deze mailstap. Dat is bewust: de mailstap hoort te lezen wie de eigenaar is, niet
te beslissen wie het wordt. Zou die logica hier terechtkomen, dan bestaan er twee plekken
die een coach toewijzen en drijven ze uit elkaar.

## Bouwvolgorde

1. Migratie: kolommen op `fs_v2_targets` + tabel `fs_v2_mail_events`.
2. ~~Renderer uittrekken naar `src/lib/mail/render-blocks.js`~~ **KLAAR (2026-09-08).**
   `src/lib/mail/block-types.js` + `render-blocks.js` (785 regels) aangemaakt;
   `mail-render.js` van 937 naar 239 regels, houdt enkel `TOKEN_LABELS`,
   `formatEventMoment`, `buildPlaceholderContext` en `SITE_NAME` plus omhullingen die de
   event-labels injecteren. `mail-blocks.js` her-exporteert `BLOCK_TYPE`. Geen enkele
   bestaande import hoefde te wijzigen. Geverifieerd met een gouden momentopname (alle 13
   bloktypes, beide editable-standen, elke export): byte-identiek, zelfde sha256. Plus
   `src/lib/mail/render-plain.js` + 21 tests voor de platte stand.
3. `send_mail` in `validation.js` (patroon `chatter_message` / `create_activity`).
4. Stapuitvoering in de pipeline: ontvanger bepalen, blacklist checken, blokken renderen,
   `message_id` afleiden, bestaande mail zoeken, anders `mail.mail` aanmaken met
   `scheduled_date`, `mail_server_id`, `headers` en `auto_delete: false`.
5. Webhookroute + wegschrijven in `fs_v2_mail_events`.
6. UI: stap-editor met preview, en de statistiek-tab.
7. Handmatige stappen 1-3 hierboven, dan de Syndicoach-koppelingen configureren en met een
   testadres één volledige ronde nalopen: aanmaak, `scheduled_date`, verzending, open-event
   in de tab.
