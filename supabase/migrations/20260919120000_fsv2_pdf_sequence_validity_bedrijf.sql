-- ============================================================================
-- Koppelingen — offertenummer-generator, geldigheidstermijn en bedrijfsprofielen
-- ============================================================================
-- Drie losstaande uitbreidingen op de generate_pdf-stap, in één migratie omdat
-- ze alle drie hetzelfde patroon volgen (module-breed, per-sjabloon of losse
-- profieltabel) en samen zijn aangevraagd.
--
-- 1. Offertenummer: één doorlopende teller PER SJABLOON (niet per koppeling —
--    meerdere koppelingen die hetzelfde sjabloon gebruiken delen de reeks).
--    sequence_pattern is een string met {jaar} en {teller:N} (N = opvulbreedte
--    met nullen, bv. "{jaar}-OFFSYN-{teller:5}" -> "2026-OFFSYN-00001").
--    fs_v2_pdf_next_sequence() is een enkele atomische UPDATE...RETURNING --
--    geen aparte SELECT+FOR UPDATE nodig zoals bij round-robin, want hier is
--    er maar één teller om te verhogen, geen poule om te doorlopen.
-- 2. Geldigheidstermijn: geldigheid_dagen (NULL = geen automatische berekening,
--    "Tarieven geldig tot" blijft dan een gewoon veld). Resolutie (vandaag +
--    N dagen) gebeurt in pdf-step.js, niet hier.
-- 3. Bedrijfsprofielen: exact dezelfde tabel-vorm als fs_v2_pdf_templates
--    (id/name/data jsonb) -- data draagt de hele "Bedrijf"-groep (naam,
--    product, platform, kbo, biv, adres, email, telefoon, website). Een
--    koppeling kiest een profiel via fs_v2_targets.pdf_bedrijf_profiel_id in
--    plaats van elk bedrijf.*-veld apart te mappen.
--
-- RLS/trigger volgen hetzelfde patroon als 20260918120000_fsv2_pdf_templates.sql.
-- ============================================================================

BEGIN;

-- ── 1. Offertenummer-generator + geldigheidstermijn (op het sjabloon) ───────

ALTER TABLE fs_v2_pdf_templates
  ADD COLUMN IF NOT EXISTS sequence_pattern  TEXT,
  ADD COLUMN IF NOT EXISTS sequence_counter  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS geldigheid_dagen  INTEGER;

COMMENT ON COLUMN fs_v2_pdf_templates.sequence_pattern IS
  'Patroon voor het automatisch offertenummer, bv. "{jaar}-OFFSYN-{teller:5}". NULL = geen generator, het veld blijft een gewone mapping.';
COMMENT ON COLUMN fs_v2_pdf_templates.sequence_counter IS
  'Laatst uitgegeven volgnummer voor dit sjabloon. Verhoogd via fs_v2_pdf_next_sequence(), nooit rechtstreeks vanuit de Worker.';
COMMENT ON COLUMN fs_v2_pdf_templates.geldigheid_dagen IS
  'Aantal dagen dat de offerte geldig is vanaf het indieningsmoment. NULL = "Tarieven geldig tot" blijft een gewoon veld, geen automatische berekening.';

CREATE OR REPLACE FUNCTION fs_v2_pdf_next_sequence(p_template_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_next INTEGER;
BEGIN
  UPDATE fs_v2_pdf_templates
     SET sequence_counter = sequence_counter + 1
   WHERE id = p_template_id
   RETURNING sequence_counter INTO v_next;
  RETURN v_next;
END;
$$;

-- ── 2. fs_v2_bedrijf_profielen ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS fs_v2_bedrijf_profielen (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL,
  data       jsonb       NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE  fs_v2_bedrijf_profielen IS
  'Module-breed bedrijfsprofiel voor de generate_pdf-stap. data draagt de "Bedrijf"-groep (naam, product, platform, kbo, biv, adres, email, telefoon, website) uit public/offerte-data.js.';

DROP TRIGGER IF EXISTS trg_fs_v2_bedrijf_profielen_updated_at ON fs_v2_bedrijf_profielen;
CREATE TRIGGER trg_fs_v2_bedrijf_profielen_updated_at
  BEFORE UPDATE ON fs_v2_bedrijf_profielen
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE fs_v2_bedrijf_profielen ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fs_v2_bedrijf_profielen_deny_all" ON fs_v2_bedrijf_profielen;
CREATE POLICY "fs_v2_bedrijf_profielen_deny_all"
  ON fs_v2_bedrijf_profielen
  FOR ALL
  TO public
  USING (false)
  WITH CHECK (false);

-- Seed: het bestaande "Syndicoach"-bedrijfsblok uit het sjabloon, zodat er
-- meteen een profiel bestaat om aan de koppeling te hangen.
INSERT INTO fs_v2_bedrijf_profielen (name, data)
SELECT
  'Syndicoach',
  '{"naam":"Syndicoach","product":"Syndicoach Captain","platform":"OpenVME","kbo":"1040.396.957","biv":"202535","adres":"Borsbeeksebrug 1, 2600 Berchem","email":"info@syndicoach.be","telefoon":"03 657 28 50","website":"syndicoach.be"}'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM fs_v2_bedrijf_profielen);

-- ── 3. fs_v2_targets.pdf_bedrijf_profiel_id ─────────────────────────────────

ALTER TABLE fs_v2_targets
  ADD COLUMN IF NOT EXISTS pdf_bedrijf_profiel_id uuid REFERENCES fs_v2_bedrijf_profielen(id) ON DELETE SET NULL;

COMMENT ON COLUMN fs_v2_targets.pdf_bedrijf_profiel_id IS
  'Welk bedrijfsprofiel (fs_v2_bedrijf_profielen) deze generate_pdf-stap gebruikt voor de "Bedrijf"-gegevens. NULL = de sjabloonwaarden blijven staan.';

COMMIT;

-- Terugdraaien:
--   ALTER TABLE fs_v2_targets DROP COLUMN IF EXISTS pdf_bedrijf_profiel_id;
--   DROP TABLE IF EXISTS fs_v2_bedrijf_profielen;
--   DROP FUNCTION IF EXISTS fs_v2_pdf_next_sequence(UUID);
--   ALTER TABLE fs_v2_pdf_templates
--     DROP COLUMN IF EXISTS sequence_pattern,
--     DROP COLUMN IF EXISTS sequence_counter,
--     DROP COLUMN IF EXISTS geldigheid_dagen;
