-- =============================================================================
-- om-sales 0002 — Syndicoach-pakket op de partner
-- =============================================================================
-- res.partner.x_syndicoach_pack (assistant | captain | coach): welke dienst
-- Syndicoach levert aan het gebouw, naast de OpenVME-software. Een van de
-- belangrijkste filters van het tabblad Verkoop. Gevuld door de partnersync;
-- na deze migratie doet die ronde één keer alles opnieuw (sync.js, schema 2).
-- =============================================================================

ALTER TABLE partners ADD COLUMN syndicoach_pack TEXT;

-- Welk schema de rijen van een model hebben (sync.js PARTNER_SCHEMA): verschilt
-- het, dan haalt de volgende ronde alles opnieuw op in plaats van enkel wat in
-- Odoo veranderde.
ALTER TABLE sync_state ADD COLUMN schema INTEGER;
