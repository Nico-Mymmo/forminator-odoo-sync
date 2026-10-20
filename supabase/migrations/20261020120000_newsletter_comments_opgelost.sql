-- Nieuwsbrieven: een opmerking kan afgevinkt worden als ze opgelost is (2026-10-20).
-- Opmerkingen zijn zichtbaar voor iedereen met de module; de teller op een blok
-- telt enkel wat nog open is.
ALTER TABLE newsletter_comments ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;
ALTER TABLE newsletter_comments ADD COLUMN IF NOT EXISTS resolved_by UUID;
