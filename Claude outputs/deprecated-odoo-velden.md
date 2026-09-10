# Verouderde velden op x_webinar en x_webinarregistrations

Onderzoek: welke Studio-velden op de Odoo-modellen **x_webinar** (event) en **x_webinarregistrations** (inschrijving) niet meer gebruikt worden door de huidige `event-operations-v2` implementatie.

## Model: x_webinar (event)

Velden die de v2-code zelf al expliciet als verboden/dood bestempelt (`FORBIDDEN_FIELDS` in `odoo-contract.js`) — **veilig te verwijderen/archiveren**:

| Veld | Label | Type | Reden |
|---|---|---|---|
| `x_studio_event_type` | Event Type | selectie | Vervangen door relatie naar `x_webinar_event_type` / `x_studio_stage_id` |
| `x_studio_many2one_field_4p8_1jhb7es30` | "Nieuw Many2one" → x_webinar_event_type | many2one | Ongebruikte Studio-placeholder |
| `x_studio_binary_field_43c_1ilec7eit` (+ `_filename`) | "Nieuw Bestand" | binary/char | Ongebruikte Studio-placeholder |
| `x_studio_datetime_field_7v5_1ilea618c` | "Nieuw Datum/Tijd" | datetime | Ongebruikte Studio-placeholder |
| `x_studio_one2many_field_9hq_1ilea9sm6` | "Nieuw One2Many" → x_webinarregistrations | one2many | Ongebruikte placeholder-relatie |
| `x_studio_date` | Datum | date | Duur wordt nu berekend uit `event_datetime` + `duration_minutes` |
| `x_studio_publication_state` | Publication state | selectie | Vervangen door `x_studio_stage_id` (de stage = de publicatiestatus) |

Twijfelgeval (niet met zekerheid dood, niet gekoppeld aan v2 of v1):

| Veld | Label | Type | Opmerking |
|---|---|---|---|
| `x_studio_kanban_state` | Kanban status | selectie | Geen enkele referentie in v1 of v2-code. Mogelijk een los kanban-view-artefact in Odoo zelf — controleer eerst of er nog een kanban-view op dit model draait voor je het verwijdert. |

## Model: x_webinarregistrations (inschrijving)

| Veld | Label | Type | Reden |
|---|---|---|---|
| `x_studio_date` | Datum | date | Zelfde reden als hierboven (gedeeld FORBIDDEN_FIELDS) |

Twijfelgeval:

| Veld | Label | Type | Opmerking |
|---|---|---|---|
| `x_studio_temp_send_testmail` | temp send testmail | boolean | Nul referenties in v1 én v2. Ziet eruit als een handmatig testveld dat ooit rechtstreeks in Odoo is aangemaakt, nooit gekoppeld aan code. Waarschijnlijk veilig te verwijderen, maar niet met zekerheid — check eerst of er nog automations/views op steunen. |

## Alle overige velden

Alle andere Studio-velden op beide modellen (o.a. `event_datetime`, `duration_minutes`, `webinar_info`, `stage_id`, `tag_ids`, `capacity`, `ask_question`, `vimeo_url`, `mail_blocks_override`, `webinar_questions`, `webinar_attended`, `attendance_updated_at/by`, `attendance_update_origin`, `confirmation/reminder/recap_email_sent`, ...) worden **actief gebruikt** door de huidige v2-code en mogen niet aangeraakt worden.

## Conclusie

- **7 velden op x_webinar + 1 veld op x_webinarregistrations** zijn met zekerheid dood: ze staan letterlijk in de eigen "verboden velden"-lijst van de v2-code.
- **2 velden** (`x_studio_kanban_state`, `x_studio_temp_send_testmail`) zijn vermoedelijk ongebruikt maar niet met 100% zekerheid — controleer die kort in Odoo Studio zelf (kijk of er nog een view/automation op steunt) voor je ze verwijdert.
- Er zijn geen v1-velden gevonden die nog wél in de code verwacht worden maar intussen uit Odoo verdwenen zijn.

*Dit is enkel een rapport — er is niets aangepast in Odoo. Verwijderen/archiveren doe je zelf in Odoo Studio wanneer je klaar bent.*
