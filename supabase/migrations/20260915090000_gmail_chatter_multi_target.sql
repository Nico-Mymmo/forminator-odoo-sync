-- Gmail → chatter: hetzelfde bericht kan bij MEERDERE leads horen.
--
-- WAAROM DIT NODIG IS. `gmail_captured_messages` had één `odoo_model`/
-- `odoo_res_id`-paar per bericht, en de adres-opzoeking pakte met `limit: 1`
-- steeds de best passende (meest recent bijgewerkte) lead. Bestaan er twee
-- leads met hetzelfde e-mailadres — een actieve en een verloren, of gewoon
-- twee dubbele inschrijvingen — dan kreeg alleen die ene lead het bericht en
-- bleef de rest zonder spoor van het gesprek. Voor een verloren lead die
-- opnieuw contact opneemt (heractivatie) betekende dat: de mail landde enkel
-- op de andere, actieve lead, en de verloren lead zelf bleef stil.
--
-- `gmail_captured_messages.odoo_model`/`odoo_res_id` blijven bestaan als de
-- PRIMAIRE (eerste) match — dat is wat de bestaande draadherkenning
-- (rfc822_message_id → odoo_res_id) en het beheerscherm al gebruiken. Deze
-- tabel komt ERBIJ voor de volledige lijst: één rij per (bericht, lead)-paar
-- die het bericht daadwerkelijk gekregen heeft.
create table if not exists gmail_captured_message_targets (
  id                      bigserial   primary key,
  gmail_message_id        text        not null references gmail_captured_messages(gmail_message_id) on delete cascade,
  odoo_model              text        not null,
  odoo_res_id             bigint      not null,
  odoo_chatter_message_id bigint,
  match_method            text,
  created_at              timestamptz not null default now(),
  unique (gmail_message_id, odoo_model, odoo_res_id)
);

comment on table gmail_captured_message_targets is
  'Eén rij per (Gmail-bericht, Odoo-record) waar het bericht daadwerkelijk in de chatter is geplaatst. Eén bericht kan bij meerdere leads horen (zelfde e-mailadres op meerdere leads, waaronder verloren leads) — deze tabel draagt die volledige lijst, gmail_captured_messages.odoo_res_id blijft de eerste/primaire match.';

-- Draadherkenning: alle bekende doelen voor een set berichten in één keer.
create index if not exists gmail_captured_targets_message_idx
  on gmail_captured_message_targets (gmail_message_id);

-- Alles wat ooit naar één lead ging.
create index if not exists gmail_captured_targets_odoo_idx
  on gmail_captured_message_targets (odoo_model, odoo_res_id);

ALTER TABLE gmail_captured_message_targets ENABLE ROW LEVEL SECURITY;
