# Fase 0 — Bloeden stoppen in de event-keten

Dit is de voorbereidende fase van de Event Operations-herbouw. **Geen enkele zichtbare functionele wijziging.** Doel: niets kan nog stil verloren gaan, en de huidige keten wordt meetbaar voordat we hem vervangen.

## Lees eerst

- `claude.md`
- `src/modules/event-operations/constants.js`
- `src/modules/event-operations/odoo-client.js`
- `src/modules/event-operations/routes.js`
- `src/modules/event-operations/services/attendance-service.js`
- `src/modules/event-operations/wp-client.js`
- `src/modules/forminator-sync-v2/worker-handler.js`
- `src/modules/forminator-sync-v2/routes.js`
- `src/index.js`
- `wrangler.jsonc`
- `supabase/migrations/20260218000000_addendum_k_editorial_semantics.sql`

## Context

De Operations Manager gaat de leidende laag worden voor events, inschrijvingen en communicatie; Odoo wordt de database. Dat is een herbouw in zes fasen. Deze fase staat daar los van en levert de verzekering die we tijdens de verbouwing nodig hebben.

Vijf concrete problemen, alle vijf bewezen uit de code en uit het live Odoo-schema:

1. **Ruwe payloads worden niet bewaard.** Een Forminator-inzending die op een mappingfout stuit, is weg. Alleen `fs_v2_submissions.source_payload` bestaat, en dat wordt pas geschreven nadat een actieve integratie is gevonden — een inzending zonder match verdwijnt met een HTTP 200 (`worker-handler.js:1549-1557`).
2. **Een inschrijving zonder webinarlink meldt `success`.** `buildIncomingValuesFromMappings` (`worker-handler.js:584`) slaat `null`-waarden stil over. Er komt een registratie in Odoo zonder `x_studio_linked_webinar`, en de Odoo-mailautomations 53/58/62 vuren nooit — zonder foutmelding.
3. **Er is geen cron voor event-operations.** De twee crons in `wrangler.jsonc:41` bedienen cx_powerboard, cx_automations en mini-apps. Sync gebeurt alleen als iemand op "Sync All" klikt. Idem voor `processDueRetries()` (`forminator-sync-v2/routes.js:1705`) — die route zit achter de auth-gate en wordt door geen cron aangeroepen, dus een `retry_scheduled`-inzending wacht eeuwig.
4. **De aanwezigheids-audit werkt nooit.** Live geverifieerd: de velden `x_attendance_updated_at`, `x_attendance_updated_by` en `x_attendance_update_origin` staan op **`x_webinar`**, niet op `x_webinarregistrations`. `updateRegistrationAttendance` (`odoo-client.js:440-486`) schrijft ze naar de registratie, vangt de fout, en herschrijft zonder audit. Elke aanwezigheidsklik valt dus stil terug; wie wanneer aanvinkte is nergens vastgelegd.
5. **`webinar_snapshots.title_override` staat in geen migratie.** `wp-client.js:173` selecteert de kolom. Bestaat ze niet in de database, dan faalt de select en wordt de error weggegooid (alleen `data` wordt uitgelezen) — waardoor `existingSnapshot` bij élke publicatie `null` is en `editorial_mode`, `selected_form_id` en `wp_event_id` verloren gaan.

## Wat je implementeert

### 1. Migratie: `evt_intake` en `evt_attendance_audit`

Nieuw migratiebestand met timestampprefix. Volg het bestaande patroon: geen foreign keys, RLS aan met `TO public`, org-brede policies op `auth.uid() IS NOT NULL` (zie `20260217094340_make_webinar_snapshots_global.sql`).

```sql
create table evt_intake (
  id uuid primary key default gen_random_uuid(),
  received_at timestamptz not null default now(),
  source text not null,                 -- 'forminator_v2' | 'generic_webhook' | 'tracker'
  forminator_form_id text,
  integration_id uuid,                  -- null = geen match gevonden
  raw_payload jsonb not null,
  raw_headers jsonb,
  outcome text not null,                -- 'accepted' | 'no_form_id' | 'no_integration' | 'duplicate' | 'error'
  submission_id uuid,                   -- fs_v2_submissions.id zodra bekend
  notes text
);
create index idx_evt_intake_received_at on evt_intake(received_at desc);
create index idx_evt_intake_form_id on evt_intake(forminator_form_id);
create index idx_evt_intake_outcome on evt_intake(outcome);
```

```sql
create table evt_attendance_audit (
  id uuid primary key default gen_random_uuid(),
  odoo_registration_id integer not null,
  odoo_webinar_id integer,
  attended boolean not null,
  actor_user_id uuid,                   -- OM-gebruiker
  actor_odoo_user_id integer,
  origin text not null,
  created_at timestamptz not null default now()
);
create index idx_evt_attendance_audit_registration on evt_attendance_audit(odoo_registration_id);
create index idx_evt_attendance_audit_webinar on evt_attendance_audit(odoo_webinar_id);
```

Voeg in dezelfde migratie ook toe, idempotent, om probleem 5 te dichten:

```sql
alter table webinar_snapshots add column if not exists title_override text default null;
```

### 2. Intake-logging in de webhookhandler

In `src/modules/forminator-sync-v2/worker-handler.js`, in `handleForminatorV2Webhook`: schrijf **direct na het parsen van de body**, vóór `resolveFormId()`, een `evt_intake`-rij weg. Update daarna dezelfde rij met `outcome`, `integration_id` en `submission_id` zodra die bekend zijn.

Harde eis: het loggen mag de webhook nooit laten falen. Wrap in try/catch, log bij fout alleen naar console, en ga door. Een mislukte log is nooit een reden om een inzending te weigeren.

Doe hetzelfde voor `handleGenericWebhook` met `source: 'generic_webhook'`.

Sla geen `Authorization`-header en geen `token`-queryparameter op in `raw_headers` — filter die eruit.

### 3. Alarm bij een registratie zonder webinarlink

In `runSubmissionAttempt`, op het punt waar een target met `odoo_model === 'x_webinarregistrations'` een `create` gaat doen: controleer of `x_studio_linked_webinar` in de opgebouwde values zit en een positief geheel getal is.

Zit hij er niet in, dan:
- `console.error` met een duidelijk `[event-intake] MISSING_WEBINAR_LINK`-prefix, het submission-id, form-id en de resolved context
- schrijf `outcome: 'error'` en een `notes`-tekst op de bijhorende `evt_intake`-rij
- zet het stapresultaat op mislukt met een expliciete foutmelding, zodat de submission `partial_failed` of `permanent_failed` wordt in plaats van `success`

Maak dit gedrag schakelbaar via `env.EVENT_REQUIRE_WEBINAR_LINK` (default: aan). Zo kan het bij een onverwacht neveneffect zonder deploy uit.

### 4. Cron-tak voor events en retries

In `src/index.js`, in de `scheduled`-handler, binnen `runFifteenMinJobs`: voeg twee `ctx.waitUntil`-takken toe, met dezelfde crash-logging als de bestaande.

- `runEventOperationsSync(env)` — een nieuwe export in `src/modules/event-operations/cron.js`, die de bestaande synclogica uit `POST /api/sync` hergebruikt. **Refactor die logica naar een aanroepbare functie** in plaats van hem te kopiëren; de route moet die functie daarna zelf ook gebruiken. Volg het patroon van `src/modules/cx-automations/cron.js`.
- `runDueForminatorRetries(env)` — dunne wrapper rond de bestaande `processDueRetries()`.

Twee dingen om op te letten bij de sync-cron:
- de huidige sync faalt met een 400 op één ontbrekende event-type-mapping (`routes.js:531-573`). In de cron mag dat niet de hele run blokkeren: log de `validation_errors` en sla alleen die webinars over.
- de sync doet vandaag per webinar alle registratierecords ophalen met `fields: []` (`routes.js:613-616`). Vervang dat door één `read_group`-aanroep over alle webinar-id's tegelijk, zoals `getRegistrationCountsByWebinar` al doet, uitgebreid met de tellers die `computeRegistrationStats` nodig heeft. Zonder deze wijziging draait de cron elke 15 minuten ~200 externe calls.

### 5. Aanwezigheids-audit repareren

In `src/modules/event-operations/odoo-client.js`, `updateRegistrationAttendance`: schrijf naar de registratie **alleen** `x_studio_webinar_attended`. Verwijder de drie audit-velden uit de payload en verwijder de try/catch-fallback — die verbergt nu echte fouten.

In `src/modules/event-operations/services/attendance-service.js`, `applyAttendanceUpdate`: schrijf na de geslaagde Odoo-write een rij in `evt_attendance_audit`. De OM-gebruiker moet meekomen, dus geef `context.user.id` door vanaf de route (`routes/event-registrations.js`) — die is daar beschikbaar maar wordt nu niet gebruikt.

Ook hier: een mislukte auditschrijving mag de aanwezigheidswijziging niet terugdraaien. Log en ga door.

### 6. Losse fix: de onklikbare checkbox

`public/detail-panel-controller.js:108-111` doet `preventDefault()` op elk element met `data-action`. De aanwezigheidscheckbox heeft dat attribuut zelf (r. 1100-1107), waardoor het vinkje wordt teruggedraaid en er geen `change`-event vuurt. De hele attendance-handler (r. 237-249) is daardoor onbereikbaar.

Sla `preventDefault()` over voor `input`- en `label`-elementen, of sluit `toggle-attendance` expliciet uit in de click-handler. Dit is klein maar het maakt het verschil tussen "de audit werkt" en "de audit werkt en er komt ook data in".

## Wat je NIET aanraakt

- `src/modules/event-operations/ui.js` — behalve als een wijziging hierboven het onvermijdelijk maakt. Dit bestand wordt in fase 5 vervangen; investeer er niets in.
- `public/editor-controller.js` — volledig dode code, blijft staan tot fase 5.
- De dode helft van `public/event-operations-client.js` (de tweede kalender- en detailpaneelimplementatie, `initializeCalendar` r. 55 t/m `initDetailPanelDelegation` r. 447).
- Alle bestaande `fs_v2_*`-tabellen en hun mappinglogica. `evt_intake` staat ernaast, niet ertussen.
- De Odoo-automations 53, 58, 62 en de server actions 1099/1100. Die gaan pas in fase 4 uit.
- De WordPress-kant. Geen Tribe- of Core-REST-wijzigingen in deze fase.
- `webinar_snapshots.registration_stats` blijft in dezelfde vorm — alleen de manier waarop hij berekend wordt verandert.

## Definitie van klaar

- Een inzending met een onbekend form-id of zonder integratie is terug te vinden in `evt_intake` met de juiste `outcome`
- Een testinzending zonder webinarlink levert een mislukte submission op, niet `success`
- De sync draait elke 15 minuten zonder klik, en de sync-route en de cron delen dezelfde functie
- `SYNC_TIMING` in de logs toont een duidelijk lager `wp_detail_count` en geen registratie-fetch per webinar meer
- Een aanwezigheidsklik in de UI werkt, en levert een rij in `evt_attendance_audit` met de juiste OM-gebruiker
- Publiceren van een webinar met een custom beschrijving en een gekozen formulier behoudt beide na een tweede publicatie

Lees ook `claude.md` voor de projectregels.
