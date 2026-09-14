-- Gmail → Odoo-chatter: opvangen van mail die medewerkers rechtstreeks in Gmail
-- versturen en ontvangen, en die als bericht op de juiste lead zetten.
--
-- WAAROM TWEE TABELLEN EN GEEN ÉÉN. `gmail_sync_state` is per MEDEWERKER en
-- houdt bij hoe ver we zijn (Gmail's historyId); `gmail_captured_messages` is
-- per BERICHT en is de idempotentiesleutel. Die twee hebben een andere
-- levensduur: de sync-stand wordt voortdurend overschreven, een bericht wordt
-- één keer geschreven en daarna alleen nog gelezen.
--
-- WAAROM WE ELK BEKEKEN BERICHT BEWAREN, OOK EEN NIET-GEKOPPELD. Zonder die
-- rij zouden we bij elke ronde opnieuw de headers van dezelfde mail ophalen om
-- opnieuw te concluderen dat we hem niet kunnen plaatsen. En het is meteen de
-- werklijst: een mail die we niet aan een lead konden hangen hoort zichtbaar te
-- zijn, niet stil weggegooid.

create table if not exists gmail_sync_state (
  user_email        text primary key,
  history_id        text,
  last_synced_at    timestamptz,
  last_error        text,
  messages_seen     bigint      not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table gmail_sync_state is
  'Per medewerker: hoe ver de Gmail-sync staat. history_id is Gmail''s cursor; leeg = nog nooit gesynchroniseerd, dan volgt een bootstrap over de recente mail.';

create table if not exists gmail_captured_messages (
  gmail_message_id  text primary key,
  user_email        text        not null,
  gmail_thread_id   text,
  -- De RFC822 Message-ID uit de headers. Dit is de sleutel waarmee een ANTWOORD
  -- later via In-Reply-To/References aan dezelfde lead gehangen wordt.
  rfc822_message_id text,
  in_reply_to       text,
  direction         text        not null check (direction in ('outgoing', 'incoming')),
  counterpart_email text,
  subject           text,
  internal_date     timestamptz,

  -- 'posted'     = als bericht in de Odoo-chatter gezet
  -- 'unmatched'  = geen lead of contact gevonden; wacht op handmatige toewijzing
  -- 'skipped'    = bewust overgeslagen (intern verkeer, automatische mail, lus)
  -- 'failed'     = Odoo gaf een fout; mag opnieuw geprobeerd worden
  status            text        not null check (status in ('posted', 'unmatched', 'skipped', 'failed')),
  skip_reason       text,

  odoo_model        text,
  odoo_res_id       bigint,
  odoo_message_id   bigint,
  match_method      text,
  error_message     text,

  created_at        timestamptz not null default now()
);

comment on table gmail_captured_messages is
  'Eén rij per Gmail-bericht dat de sync bekeken heeft. Primaire sleutel is Gmail''s eigen message-id, zodat hetzelfde bericht nooit twee keer in de chatter belandt.';

-- De werklijst: niet-geplaatste mail, nieuwste eerst.
create index if not exists gmail_captured_unmatched_idx
  on gmail_captured_messages (status, internal_date desc)
  where status in ('unmatched', 'failed');

-- Een antwoord terugvinden op basis van References/In-Reply-To.
create index if not exists gmail_captured_rfc822_idx
  on gmail_captured_messages (rfc822_message_id)
  where rfc822_message_id is not null;

-- Alles van één lead bij elkaar.
create index if not exists gmail_captured_odoo_idx
  on gmail_captured_messages (odoo_model, odoo_res_id);

create index if not exists gmail_captured_user_idx
  on gmail_captured_messages (user_email, internal_date desc);
