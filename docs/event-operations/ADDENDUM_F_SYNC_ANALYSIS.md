# ADDENDUM F – SYNC VERBETERINGEN (ANALYSE)

**Module:** Event Operations  
**Addendum:** F – Sync Performance Analyse & Optimalisatievoorstel  
**Analyse Date:** February 16, 2026  
**Status:** 📋 Analyse (nog niet geïmplementeerd)  
**Scope:** `/events/api/sync`, `/events/api/odoo-webinars`, frontend laadflow

---

## 1. DOEL

De huidige synchronisatie voelt traag. Dit document brengt in kaart:

1. Waar de tijd nu waarschijnlijk naartoe gaat
2. Welke verbeteringen de meeste winst opleveren
3. In welke volgorde deze veilig ingevoerd kunnen worden

---

## 2. HUIDIGE FLOW (AS-IS)

### 2.1 Handmatige sync (`POST /events/api/sync`)

Huidige backend flow:

1. Parallel ophalen van:
   - Odoo webinars (`getOdooWebinars`)
   - WordPress Core events met meta (`getWordPressEventsWithMeta`)
   - Supabase client
   - event type mappings
2. Per webinar in een `for ... of` loop:
   - (indien WP match) extra WordPress Tribe detail call (`getWordPressEvent`)
   - state berekenen (`computeEventState`)
   - snapshot upserten (één DB write per webinar)
3. Resultaat teruggeven

### 2.2 Data load in UI (`loadData`)

Bij refresh/reload vraagt de UI parallel op:

- `/events/api/odoo-webinars`
- `/events/api/snapshots`
- `/events/api/odoo-event-types`
- `/events/api/event-type-tag-mappings`

Belangrijk: `/events/api/odoo-webinars` doet daarna voor **elk webinar** een aparte Odoo `search_count` call voor registraties.

---

## 3. BOTTLENECKS

## 3.1 Sequentiële remote calls in sync-loop (hoogste impact)

In de sync-loop worden per webinar remote I/O acties na elkaar uitgevoerd (`await` in loop):

- WP detail fetch (Tribe)
- Supabase upsert

Bij $N$ webinars is de looptijd ruwweg:

$$
T_{sync} \approx T_{prefetch} + \sum_{i=1}^{N}(T_{wp\_detail,i} + T_{upsert,i})
$$

Daardoor schaalt de sync bijna lineair met relatief hoge constante factoren.

## 3.2 Eén extra WP-call per gematchte webinar

De sync haalt eerst WP Core events op, maar doet daarna nog een detail-call via Tribe per match. Dat is functioneel correct, maar network-heavy als er veel events zijn.

## 3.3 Veel losse DB writes

Snapshot-opslag gebeurt per webinar met een losse upsert-call. Dat geeft extra latency en overhead (connection + protocol + index writes per record).

## 3.4 Registratie-aantallen zijn duur in laadflow

`GET /api/odoo-webinars` doet voor elk webinar een Odoo `search_count`. Ook al staat dit in `Promise.all`, het blijft veel remote RPC en kan de totale pagina-load duidelijk verlengen of Odoo belasten.

## 3.5 Geen expliciete performance-observability

Er zijn logs, maar nog geen consistente stage timing (`sync_total_ms`, `wp_detail_ms`, `db_upsert_ms`, enz.). Daardoor is optimalisatie moeilijk objectief te valideren.

---

## 4. OPTIMALISATIES (PRIORITEIT)

## P0 — Quick wins (laag risico, hoge opbrengst)

### 4.1 Concurrency-limiet voor sync-loop I/O

Vervang volledig sequentieel gedrag door bounded parallelism (bijv. 4–8 workers):

- WP detail fetches met limiet
- snapshot writes met limiet

Doel: veel sneller dan sequentieel, zonder WP/Supabase te overbelasten.

### 4.2 Bulk upsert snapshots in batches

Bouw eerst een array met snapshot records en schrijf per batch (bijv. 50) weg.

Verwachte winst: minder round-trips en stabielere syncduur.

### 4.3 Instrumentatie per stage

Voeg timing toe voor:

- fetch Odoo
- fetch WP core
- fetch WP detail totaal + count
- state compute
- snapshot write
- totale sync

Meten vóór/na maakt impact direct zichtbaar.

## P1 — Middellange termijn (meer winst, iets meer ingreep)

### 4.4 Verminder noodzaak van per-event Tribe detail fetch

Opties:

1. Voor stateberekening alleen velden gebruiken die al in Core response zitten
2. Alleen Tribe detail ophalen voor kandidaten die mogelijk `out_of_sync` zijn
3. Tribe detail lazy ophalen voor comparison modal, niet in baseline sync

### 4.5 Maak registratie-counts optioneel of lazy

Voor `/api/odoo-webinars`:

- standaard zonder counts laden
- counts alleen op expliciete UI-actie, of met query flag
- eventueel cache met korte TTL (bijv. 60–300s)

Dit versnelt first paint en verlaagt Odoo druk.

## P2 — Structureel (grootste schaalbaarheid)

### 4.6 Incremental sync i.p.v. full scan

Alleen webinars/events verwerken die sinds laatste sync gewijzigd zijn:

- Odoo `write_date`/updateveld
- WP `modified`
- snapshot `last_synced_at`

Doel: runtime vooral afhankelijk maken van aantal wijzigingen, niet totaal aantal webinars.

### 4.7 Asynchrone job-based sync

Maak sync een background job:

- `POST /sync` start job en geeft `job_id`
- UI pollt `GET /sync/:job_id`
- progress/status zichtbaar

Voordeel: betere UX, timeouts minder kritisch, betere foutafhandeling.

---

## 5. VERWACHTE IMPACT (INSCHATTING)

Indicatieve winst, afhankelijk van netwerk en volume:

- P0 volledig: **30–60%** snellere sync
- P1 aanvullend: extra **15–35%** op sync/load paden
- P2 incremental + jobs: grootste schaalwinst bij groeiende dataset

Belangrijk: exacte cijfers moeten op jullie productie-achtige dataset gemeten worden.

---

## 6. AANBEVOLEN UITVOERVOLGORDE

1. **Meetbaar maken** (timings + counters)
2. **Sync-loop paralleliseren met limieten**
3. **Batch/bulk snapshot upserts**
4. **Registratie-counts loskoppelen van initiële load**
5. **Tribe detail selective/lazy maken**
6. **Incremental sync ontwerp + implementatie**

---

## 7. RISICO'S EN RANDVOORWAARDEN

- Te agressieve parallelisatie kan WP/Odoo rate limits raken
- Bulk writes vragen zorgvuldige foutafhandeling (partial failures)
- Incremental sync vereist heldere “source of truth” regels voor conflictcases
- UX moet duidelijk maken wanneer data “partial” of “nog aan het laden” is

---

## 8. KORTE CONCLUSIE

De traagheid komt vooral door **per-webinar sequentiële netwerk- en databaseacties** in de sync-route, plus **zware registratiecount-opvraging** in de laadflow. De snelste en veiligste route is: eerst meten, daarna bounded parallelism + batch writes, en vervolgens selective/incremental sync.

---

## 9. BIJLAGE – CONCRETE CODE-LOCATIES (ANALYSEBASIS)

- `src/modules/event-operations/routes.js`
  - `POST /api/sync`: sequentiële loop met `await getWordPressEvent(...)` en `await supabase...upsert(...)`
  - `GET /api/odoo-webinars`: per webinar `getRegistrationCount(...)`
- `src/modules/event-operations/wp-client.js`
  - `getWordPressEventsWithMeta`, `getWordPressEvent`
- `src/modules/event-operations/ui.js`
  - `loadData()` met parallel fetches naar webinars/snapshots/mappings/event types
