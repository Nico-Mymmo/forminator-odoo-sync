-- ============================================================================
-- Koppelingen — gegenereerde documenten (generate_pdf) in R2, niet in Odoo
-- ============================================================================
-- Datum: 2026-09-19
--
-- WAAROM DIT BESTAAT. Elke generate_pdf-uitvoering maakte tot nu toe een
-- nieuw ir.attachment aan in Odoo -- bij honderden offertes is dat honderden
-- megabytes PERMANENTE Postgres-opslag in Odoo, voor een document dat na
-- verzending zelden nog iemand in Odoo zelf opzoekt. Vanaf nu wordt de pdf
-- ALLEEN in de gedeelde R2_ASSETS-bucket bewaard (prefix "fsv2-generated-
-- pdfs/", zie FOREIGN_MODULE_PREFIXES in asset-manager/lib/namespace.js en de
-- publieke-asset-uitsluiting in src/router/public-routes.js -- dit is BEWUST
-- NIET publiek serveerbaar, in tegenstelling tot fsv2-tracker-logos/).
--
-- Deze tabel is de index erbovenop: zonder haar zou "welke documenten bestaan
-- er voor deze koppeling" een dure R2-list-operatie per keer zijn, en zou er
-- geen plek zijn om op te ruimen. Odoo krijgt bij het versturen nog steeds
-- TIJDELIJK een eigen ir.attachment (Postmark kan niet naar een R2-link
-- verwijzen) -- exact hetzelfde patroon als de Asset Manager-mailbijlagen in
-- mail-attachments.js, gecachet op (r2_key, etag).
--
-- RLS/trigger volgen hetzelfde patroon als de andere fs_v2_*-tabellen.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS fs_v2_generated_documents (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid        NOT NULL REFERENCES fs_v2_integrations(id) ON DELETE CASCADE,
  target_id      uuid        REFERENCES fs_v2_targets(id) ON DELETE SET NULL,
  submission_id  uuid        REFERENCES fs_v2_submissions(id) ON DELETE SET NULL,
  r2_key         text        NOT NULL,
  filename       text        NOT NULL,
  bytes          integer     NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE fs_v2_generated_documents IS
  'Index van pdf''s die een generate_pdf-stap in R2 (fsv2-generated-pdfs/) heeft gezet -- de inhoud staat NIET in Odoo. Tabblad "Documenten" op de koppeling leest en ruimt hier op.';

CREATE INDEX IF NOT EXISTS idx_fs_v2_generated_documents_integration
  ON fs_v2_generated_documents (integration_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fs_v2_generated_documents_target_submission
  ON fs_v2_generated_documents (target_id, submission_id)
  WHERE target_id IS NOT NULL AND submission_id IS NOT NULL;

ALTER TABLE fs_v2_generated_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fs_v2_generated_documents_deny_all" ON fs_v2_generated_documents;
CREATE POLICY "fs_v2_generated_documents_deny_all"
  ON fs_v2_generated_documents
  FOR ALL
  TO public
  USING (false)
  WITH CHECK (false);

COMMIT;

-- Terugdraaien:
--   DROP TABLE IF EXISTS fs_v2_generated_documents;
-- (De R2-objecten onder fsv2-generated-pdfs/ blijven dan wel bestaan -- ruim
-- die apart op via de Cloudflare-dashboard of een eenmalig script als nodig.)
