-- ============================================================================
-- Koppelingen — ook de pdf's uit de offerte-editor in fs_v2_generated_documents
-- ============================================================================
-- Datum: 2026-09-29
--
-- Tot nu toe kwamen hier enkel de pdf's van een generate_pdf-stap in. Een
-- offerte die sales zelf opmaakt in offerte.html ging via window.print() en
-- werd nergens bewaard -- wie ze een week later terug nodig had, moest ze
-- opnieuw maken en hopen dat hij dezelfde gegevens nog wist.
--
-- Nu maakt de editor de pdf op de server (dezelfde renderPdf() als de stap)
-- en komt ze in dezelfde tabel, met:
--   source      'pipeline' (een stap) of 'manual' (de editor)
--   template_id welk sjabloon
--   created_by  wie ze maakte (enkel bij 'manual')
--   label       klant en gebouw, om op te zoeken zonder de pdf te openen
-- Een handmatige pdf hoort bij geen koppeling, dus integration_id mag leeg.
-- ============================================================================

BEGIN;

ALTER TABLE fs_v2_generated_documents
  ALTER COLUMN integration_id DROP NOT NULL;

ALTER TABLE fs_v2_generated_documents
  ADD COLUMN IF NOT EXISTS source      text NOT NULL DEFAULT 'pipeline',
  ADD COLUMN IF NOT EXISTS template_id uuid REFERENCES fs_v2_pdf_templates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS label       text;

ALTER TABLE fs_v2_generated_documents
  DROP CONSTRAINT IF EXISTS fs_v2_generated_documents_source_check;
ALTER TABLE fs_v2_generated_documents
  ADD CONSTRAINT fs_v2_generated_documents_source_check CHECK (source IN ('pipeline', 'manual'));

-- Het overzicht "Recente pdf's" leest over ALLE koppelingen heen, nieuwste eerst.
CREATE INDEX IF NOT EXISTS idx_fs_v2_generated_documents_created
  ON fs_v2_generated_documents (created_at DESC);

COMMIT;

-- Terugdraaien (enkel zolang er geen handmatige rijen zijn):
--   DELETE FROM fs_v2_generated_documents WHERE source = 'manual';
--   ALTER TABLE fs_v2_generated_documents
--     DROP COLUMN label, DROP COLUMN created_by, DROP COLUMN template_id, DROP COLUMN source,
--     ALTER COLUMN integration_id SET NOT NULL;
