-- ============================================================================
-- Koppelingen — formulieren die in de OM zelf gedefinieerd worden
-- ============================================================================
-- Datum: 2026-09-10
-- Zie docs/ontwerp-om-formulieren.md voor de volledige onderbouwing.
--
-- Doel: Forminator uitfaseren. Een koppeling kan vanaf nu haar eigen formulier
-- definieren; de WordPress-plugin mymmo-forms rendert dat schema server-side en
-- post een inzending terug naar dezelfde pipeline die Forminator vandaag voedt.
--
-- Wat deze migratie NIET doet, bewust:
--   * niets wijzigen aan fs_v2_integrations. Een OM-formulier is voor de
--     pipeline gewoon een derde source_type ('om_form') naast 'forminator' en
--     'generic_webhook'; die kolom is vrije tekst met default 'forminator', dus
--     er is geen ALTER nodig en bestaande rijen lopen geen risico.
--   * niets wijzigen aan fs_v2_targets/_mappings/_submissions. Het hele
--     uitvoeringspad blijft ongewijzigd — er komt GEEN tweede motor bij.
--
-- RLS volgt het patroon van 20260821120000_fix_rls_disabled_in_public.sql:
-- aan, met een expliciete deny-all voor `public`. Alle databasetoegang loopt
-- via getSupabaseClient(env) met de service_role-sleutel, die RLS bypasst; de
-- echte rechtencontrole gebeurt in de Worker-routes.
--
-- Idempotent by design: IF NOT EXISTS overal, DROP POLICY IF EXISTS voor elke
-- CREATE POLICY.
-- ============================================================================

BEGIN;

-- ── 1. fs_v2_forms ──────────────────────────────────────────────────────────
--
-- integration_id is UNIEK: een koppeling heeft hoogstens een formulier. Dat is
-- een bewuste beperking. Het formulier en wat er met een inzending gebeurt zijn
-- in de praktijk een ding; een formulier dat n koppelingen voedt maakt de vraag
-- "wat gebeurt er met deze inzending?" onbeantwoordbaar vanuit het formulier.
-- Wil je dezelfde velden met een andere afhandeling, maak dan twee koppelingen.
--
-- version telt op bij elke bewaarde wijziging en voedt de ETag van de publieke
-- schema-respons. Bewust een teller en GEEN timestamp: een gegenereerd-op-tijd
-- in de ETag betekent dat If-None-Match nooit matcht en elke verversing de
-- volledige body ophaalt. Dat is exact de fout die meta.generated_at in de
-- events-API maakte.

CREATE TABLE IF NOT EXISTS fs_v2_forms (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id  uuid        NOT NULL,
  slug            text        NOT NULL,
  name            text        NOT NULL,
  description     text,

  -- draft = onvindbaar via de publieke API (404, niet 403: dat iets bestaat is
  -- zelf informatie). Zo kan een half afgewerkt formulier nooit per ongeluk op
  -- een pagina staan; voorbekijken doe je in de OM.
  status          text        NOT NULL DEFAULT 'draft',
  version         integer     NOT NULL DEFAULT 1,

  submit_label    text        NOT NULL DEFAULT 'Versturen',

  -- Na een geslaagde inzending: een melding tonen, of doorsturen.
  success_mode    text        NOT NULL DEFAULT 'message',
  success_message text        NOT NULL DEFAULT 'Bedankt, we hebben je bericht goed ontvangen.',
  redirect_url    text,

  -- CSS-variabelen (kleur, afronding, spatiering). Bewust vrij vorm-JSON en
  -- geen kolommen: de plugin zet ze een-op-een om in custom properties, zodat
  -- een site ze in haar eigen thema kan overschrijven.
  theme           jsonb       NOT NULL DEFAULT '{}'::jsonb,

  -- Lege array = elke geconfigureerde site mag dit formulier ophalen.
  -- In v1 wordt dit bewaard maar nog niet afgedwongen (zie het ontwerp).
  allowed_sites   jsonb       NOT NULL DEFAULT '[]'::jsonb,

  published_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT fk_fs_v2_forms_integration
    FOREIGN KEY (integration_id)
    REFERENCES fs_v2_integrations(id)
    ON DELETE CASCADE,

  CONSTRAINT uq_fs_v2_forms_integration UNIQUE (integration_id),
  CONSTRAINT uq_fs_v2_forms_slug        UNIQUE (slug),

  CONSTRAINT ck_fs_v2_forms_status
    CHECK (status IN ('draft', 'published')),
  CONSTRAINT ck_fs_v2_forms_success_mode
    CHECK (success_mode IN ('message', 'redirect')),

  -- Een slug zit in een shortcode en in een publieke URL: kleine letters,
  -- cijfers en koppeltekens. Hier afdwingen in plaats van erop vertrouwen dat
  -- de UI het netjes doet.
  CONSTRAINT ck_fs_v2_forms_slug_shape
    CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

COMMENT ON TABLE  fs_v2_forms IS
  'Formulierdefinitie van een koppeling. De OM is de enige bron; WordPress bewaart hiervan enkel een cache.';
COMMENT ON COLUMN fs_v2_forms.version IS
  'Telt op bij elke save. Voedt de ETag van de publieke schema-respons — nooit een timestamp gebruiken.';
COMMENT ON COLUMN fs_v2_forms.status IS
  'draft | published. Een concept geeft 404 op de publieke API.';

CREATE INDEX IF NOT EXISTS idx_fs_v2_forms_status_slug
  ON fs_v2_forms (status, slug);

-- ── 2. fs_v2_form_fields ────────────────────────────────────────────────────
--
-- field_key IS de payloadsleutel. Dat is het hele punt van dit project: waar
-- Forminator 'text-1' en 'name-1' stuurt (en het mapping-scherm daarom een
-- subsequence-heuristiek nodig heeft om te raden wat je bedoelde), typ je hier
-- zelf 'email' of 'gebouw_type' en staat dat letterlijk in de payload.
--
-- REGEL: field_key ligt VAST zodra het formulier een inzending heeft. Het label
-- mag altijd wijzigen, de sleutel niet — die staat in fs_v2_mappings.source_value
-- van elke stap en in elke bewaarde source_payload. Hem stil hernoemen betekent
-- dat een koppeling zonder foutmelding een leeg veld naar Odoo schrijft. Dat
-- wordt in de Worker afgedwongen (de database kan niet zien of er al een
-- inzending is), en de UI zet het veld op slot met de reden erbij.
--
-- 'heading' en 'paragraph' zijn opmaak, geen invoer: ze leveren niets aan de
-- payload. Ze staan bewust in dezelfde tabel, want ze staan in dezelfde
-- volgorde — een aparte tabel zou de sortering over twee plekken verdelen.

CREATE TABLE IF NOT EXISTS fs_v2_form_fields (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id       uuid        NOT NULL,
  order_index   integer     NOT NULL DEFAULT 0,

  field_key     text        NOT NULL,
  field_type    text        NOT NULL DEFAULT 'text',

  label         text        NOT NULL DEFAULT '',
  help_text     text,
  placeholder   text,

  is_required   boolean     NOT NULL DEFAULT false,
  default_value text,

  -- [{ "value": "...", "label": "..." }] voor select | radio | checkbox_group.
  options       jsonb       NOT NULL DEFAULT '[]'::jsonb,

  -- Layout-hint voor de renderer: volle breedte of halve kolom.
  width         text        NOT NULL DEFAULT 'full',

  -- { minlength, maxlength, min, max, pattern } — leeg = enkel type + required.
  validation    jsonb       NOT NULL DEFAULT '{}'::jsonb,

  -- Seed voor fs_v2_field_transforms: bij het opslaan van het formulier vult de
  -- OM ONTBREKENDE transform-rijen aan met deze waarde. Bestaande rijen worden
  -- nooit overschreven — iemand kan er bewust iets anders van gemaakt hebben.
  odoo_field_type text      NOT NULL DEFAULT 'text',

  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT fk_fs_v2_form_fields_form
    FOREIGN KEY (form_id)
    REFERENCES fs_v2_forms(id)
    ON DELETE CASCADE,

  CONSTRAINT uq_fs_v2_form_fields_key UNIQUE (form_id, field_key),

  CONSTRAINT ck_fs_v2_form_fields_type
    CHECK (field_type IN (
      'text', 'email', 'tel', 'number', 'date', 'textarea',
      'select', 'radio', 'checkbox', 'checkbox_group',
      'hidden', 'heading', 'paragraph'
    )),
  CONSTRAINT ck_fs_v2_form_fields_width
    CHECK (width IN ('full', 'half')),
  CONSTRAINT ck_fs_v2_form_fields_odoo_type
    CHECK (odoo_field_type IN (
      'text', 'boolean', 'integer', 'float', 'selection', 'many2one'
    )),

  -- Dezelfde vorm als een Odoo-veldnaam en als een JSON-sleutel zonder
  -- verrassingen: geen punten (normalizeFormValues gebruikt die vorm al voor
  -- samengestelde velden), geen spaties, geen hoofdletters.
  CONSTRAINT ck_fs_v2_form_fields_key_shape
    CHECK (field_key ~ '^[a-z][a-z0-9_]*$')
);

COMMENT ON COLUMN fs_v2_form_fields.field_key IS
  'De payloadsleutel. Onveranderlijk zodra het formulier een inzending heeft (afgedwongen in de Worker).';
COMMENT ON COLUMN fs_v2_form_fields.odoo_field_type IS
  'Seed voor fs_v2_field_transforms. Vult enkel ontbrekende rijen aan, overschrijft nooit.';

CREATE INDEX IF NOT EXISTS idx_fs_v2_form_fields_form_order
  ON fs_v2_form_fields (form_id, order_index);

-- ── 3. updated_at bijhouden ─────────────────────────────────────────────────
--
-- update_updated_at_column() wordt in deze repo al gebruikt (o.a. door
-- forminator_forms), maar staat in GEEN ENKELE migratie: ze is ooit buiten de
-- migraties om in de database gezet. Daarom hier een vangnet dat ze aanmaakt
-- als ze ontbreekt — en die de bestaande definitie NIET vervangt als ze er wel
-- staat (andere triggers hangen eraan). Met een vaste search_path, conform
-- 20260225123000_fix_function_search_path_mutable.sql.

DO $$
BEGIN
  IF to_regprocedure('public.update_updated_at_column()') IS NULL THEN
    CREATE FUNCTION public.update_updated_at_column()
    RETURNS trigger
    LANGUAGE plpgsql
    SET search_path = public
    AS $fn$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $fn$;
  END IF;
END
$$;

DROP TRIGGER IF EXISTS trg_fs_v2_forms_updated_at ON fs_v2_forms;
CREATE TRIGGER trg_fs_v2_forms_updated_at
  BEFORE UPDATE ON fs_v2_forms
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_fs_v2_form_fields_updated_at ON fs_v2_form_fields;
CREATE TRIGGER trg_fs_v2_form_fields_updated_at
  BEFORE UPDATE ON fs_v2_form_fields
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ── 4. RLS: aan + deny-all voor public ──────────────────────────────────────

ALTER TABLE fs_v2_forms       ENABLE ROW LEVEL SECURITY;
ALTER TABLE fs_v2_form_fields ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "fs_v2_forms_deny_all" ON fs_v2_forms;
CREATE POLICY "fs_v2_forms_deny_all"
  ON fs_v2_forms
  FOR ALL
  TO public
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "fs_v2_form_fields_deny_all" ON fs_v2_form_fields;
CREATE POLICY "fs_v2_form_fields_deny_all"
  ON fs_v2_form_fields
  FOR ALL
  TO public
  USING (false)
  WITH CHECK (false);

COMMIT;

-- Terugdraaien:
--   DROP TABLE IF EXISTS fs_v2_form_fields;
--   DROP TABLE IF EXISTS fs_v2_forms;
-- Er is niets anders gewijzigd, dus dit is een volledige rollback.
