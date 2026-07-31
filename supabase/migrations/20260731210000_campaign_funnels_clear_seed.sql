-- ============================================================================
-- Ad & Sales Campaigns — seed-data verwijderen
-- ============================================================================
-- Op verzoek (sparsessie 2026-07-31): de module moet blanco starten, niet met
-- de "Technisch beheer"-voorbeeldfunnel uit 20260731180000_..._seed_technisch_
-- beheer.sql. campaign_swimlanes en campaign_cards hebben allebei
-- ON DELETE CASCADE op funnel_id (resp. rechtstreeks en via swimlane_id),
-- dus één DELETE op campaign_funnels volstaat.
--
-- Idempotent: DELETE op naam raakt niets als de funnel al weg is.
-- ============================================================================

DELETE FROM campaign_funnels WHERE name = 'Technisch beheer';

-- ============================================================================
-- END MIGRATION
-- ============================================================================
