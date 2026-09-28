-- ============================================================================
-- Mail Signature Designer — de event-voorkeur is weer van de GEBRUIKER
-- ============================================================================
-- Migration: 2026-09-21
--
-- Draait 20260223400000_user_signature_hidden_event_id.sql terug in betekenis
-- (niet in kolommen). Die migratie verving de boolean `show_event_promo` door
-- `hidden_event_id`, zodat een opt-out enkel gold voor DAT ene event: bij een
-- nieuw event kwam het blok vanzelf terug.
--
-- Dat is niet wat een eigenaar van zijn handtekening verwacht. Wie het vinkje
-- uitzet, zegt "ik wil hier geen events" -- niet "ik wil dit ene event niet".
-- Het weer aanzetten zonder dat iemand erom vraagt, is een wijziging aan de
-- handtekening van een ander.
--
-- De rolverdeling is nu:
--   • marketing zet klaar WELK event getoond wordt (via Eventbeheer);
--   • de eigenaar beslist OF er events in zijn handtekening staan.
--
-- `hidden_event_id` blijft bestaan maar wordt niet meer gelezen of geschreven:
-- de kolom droppen zou deze wijziging onomkeerbaar maken, en de waarde is het
-- enige spoor van wie ooit een opt-out zette.
-- ============================================================================

ALTER TABLE user_signature_settings
  ADD COLUMN IF NOT EXISTS show_event_promo BOOLEAN NOT NULL DEFAULT true;

COMMENT ON COLUMN user_signature_settings.show_event_promo IS
  'Wil deze gebruiker events in zijn handtekening? Blijvend: wordt NOOIT '
  'automatisch teruggezet wanneer marketing een ander event klaarzet.';

-- Backfill: wie ooit een event verborg, krijgt geen events meer.
--
-- Dat is de enige lezing die klopt met de nieuwe regel. Het alternatief --
-- iedereen op true zetten -- zou betekenen dat mensen die het blok bewust
-- wegklikten het morgen terugkrijgen, en dat is precies het gedrag dat deze
-- migratie afschaft. Iemand die zich bedenkt, zet het vinkje zelf terug aan.
UPDATE user_signature_settings
   SET show_event_promo = false
 WHERE hidden_event_id IS NOT NULL;

COMMENT ON COLUMN user_signature_settings.hidden_event_id IS
  'VERVALLEN sinds 2026-09-21. Vervangen door show_event_promo. Niet meer '
  'gelezen of geschreven; bewaard als spoor van de oude per-event opt-out.';
