# Claude Context Gateway — Installatiegids

## Wat is dit?

Een medewerker kan een **Claude-project** aanmaken dat real-time salesdata ophaalt  
uit Odoo via een beveiligde koppeling (5-minuten token, allowlist-gefilterde data).  
Claude verzint **nooit** data — hij haalt het altijd eerst op via de API.

---

## Hoe werkt het in het kort?

**Eenstaps GET-flow** (Claude.ai / web_fetch):
```
Medewerker
  │
  └─▶ GET /api/claude/context/full?client_id=...&client_secret=...
        └─▶ Claude analyseert de pipeline
```

**Tweestaps Bearer-token-flow** (clients met POST-ondersteuning):
```
Medewerker
  │
  └─▶ Claude vraagt: "Geef je het OK om data te vernieuwen?"
        │
        └─▶ POST /api/claude/session/request   ← met client_id
              └─▶ POST /api/claude/session/authorize  ← met client_secret
                    └─▶ GET /api/claude/context/full  ← met token (5 min)
                          └─▶ Claude analyseert de pipeline
```

Het **secret** staat opgeslagen in de Claude project-instructies.  
Eén koppeling per medewerker (of één gedeelde voor een team).

---

## Stap 1 — Integratie aanmaken (eenmalig per medewerker)

1. Ga naar **`https://forminator-sync.<jouw-account>.workers.dev/api/claude`**
2. Log in met je gewone account
3. Klik op **"Nieuwe Integratie"**
4. Geef een naam op, bv. `Pieter - Claude Sales`
5. Kies de juiste scope:

   | Scope | Wat Claude ziet |
   |---|---|
   | **Eigen leads** | Alleen jouw eigen leads, minimale velden |
   | **Team overzicht** | Alle teamleads + eigenaar/team |
   | **Volledige context** | Volledige pipeline incl. relaties en prioriteit |

6. Klik **Aanmaken**

### ⚠️ Bewaar het secret direct

Na aanmaken verschijnt er één keer een scherm met:

```
Client ID:     ci-a1b2c3d4...    ← altijd te zien in het overzicht
Client Secret: sk-e5f6g7h8...    ← EENMALIG ZICHTBAAR, daarna weg
```

**Kopieer het secret onmiddellijk** en bewaar het op één van deze plaatsen:
- In de **Claude project-instructies** (zie Stap 2)
- In een **wachtwoordmanager** (1Password, Bitwarden, ...)

> Verloren secret? Klik op 🔄 "Regenereer" in het integratieoverzicht.  
> Het oude secret wordt direct ongeldig.

---

## Stap 2 — Claude Project aanmaken

1. Ga naar [claude.ai](https://claude.ai) → **Projects** → **New project**
2. Geef het project een naam, bv. `Sales Pipeline - OpenVME`
3. Klik op **Project Instructions** (of "Custom instructions")
4. Plak de volgende tekst en **vul jouw waarden in** (zie `{{ ... }}`):

```
## Sales Context Gateway — OpenVME

Je hebt toegang tot real-time salesdata via een beveiligde context API.

### Jouw koppelingsgegevens
- API base URL:  {{ WORKER_URL }}
- Client ID:     {{ CLIENT_ID }}
- Client Secret: {{ CLIENT_SECRET }}

### Regels — verplicht te volgen
1. Verzin NOOIT leads, kansen of activiteiten. Gebruik ALTIJD de context API.
2. Vraag altijd bevestiging aan de gebruiker voordat je data ophaalt.
3. Verwerk de context altijd — geef nooit een ruwe JSON-dump terug.
4. Toon nooit het client_secret aan de gebruiker.

### Data ophalen (voer dit uit bij elke data-aanvraag)

Gebruik web_fetch (GET) op deze URL:
{{ WORKER_URL }}/api/claude/context/full?client_id={{ CLIENT_ID }}&client_secret={{ CLIENT_SECRET }}

Optionele parameters toevoegen aan de URL:
- &timeframe=month   → alleen data van de afgelopen maand
- &limit=50          → maximaal 50 leads

Bij een 401-fout: meld dit aan de gebruiker. Probeer niet automatisch opnieuw.

### Structuur van de context
{
  "meta": { "generated_at", "scope", "timeframe", "lead_count" },
  "pipeline_summary": [ { "stage", "count", "total_revenue" } ],
  "leads": [ { "id", "name", "stage_id", "planned_revenue", ... } ],
  "activities": [ { "type", "lead_name", "date_deadline", "state" } ],
  "risks": [ { "name", "reason", "date_deadline" } ],
  "opportunities": [ { "name", "probability", "planned_revenue" } ]
}

### Nooit doen
- Zelf leads of kansen bedenken
- Contactgegevens tonen (die zitten niet in de context)
- Het client_secret tonen of in de chat herhalen
- Meerdere aanvragen tegelijk sturen
```

**Vervang voor het opslaan:**
- `{{ WORKER_URL }}` → bv. `https://forminator-sync.openvme.workers.dev`
- `{{ CLIENT_ID }}` → de `ci-...` waarde uit de UI
- `{{ CLIENT_SECRET }}` → de `sk-...` waarde die je eenmalig hebt gezien

---

## Stap 3 — Testen (optioneel maar aanbevolen)

Terug in de settings-pagina (`/api/claude`):

1. Klik op ▶ naast de integratie
2. Voer het secret in het testvenster in
3. De app voert de volledige flow uit (challenge → token → context)
4. Je ziet: scope, aantal leads gevonden, eerste lead-naam, token-expiry

---

## Scopekeuze — wanneer welke?

| Situatie | Aanbevolen scope |
|---|---|
| Medewerker wil alleen eigen pipeline bewaken | `own_leads` |
| Salesmanager wil teamoverzicht | `team_view` |
| Directie of rapportage-use case | `full_context` |

> Scopes instellen = bij aanmaken van de integratie.  
> Aanpassen = nieuwe integratie aanmaken en de oude intrekken.

---

## Beheer

### Secret verloren
→ Klik op 🔄 in het integratieoverzicht → kopieer nieuw secret → update Claude-project.

### Integratie intrekken
→ Klik op 🗑 → alle actieve sessies worden direct ongeldig.

### Wie gebruikt de API? (admin)
→ Tab "Audit Log" in de settings-pagina toont elke context-aanvraag:  
scope, tijdstip, succes/fout, payload-grootte, IP-adres.

---

## Security op een rij

| Maatregel | Hoe |
|---|---|
| Secret nooit opgeslagen | Alleen SHA-256 hash in DB, plaintext alleen bij aanmaken/rotate |
| Korte TTL | Tokens verlopen na 5 min |
| Race-safe challenge | Atomaire DB-update, tweede poging krijgt altijd 401 |
| Rate limiting | 10 challenges/min per IP, 5 autorisaties/min per client_id |
| Allowlist filtering | Nieuwe Odoo-velden automatisch uitgesloten |
| Directe revocatie | Intrekken annuleert alle actieve tokens onmiddellijk |
