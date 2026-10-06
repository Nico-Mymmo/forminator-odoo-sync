-- ============================================================================
-- AV-slides -- Wist-je-weetje en het prikbord voor de maandelijkse AV
-- ============================================================================
-- Migration: 2026-10-06
--
-- Eén rij per maand. `content` is wat de redacteur in het scherm klaarzette
-- (tekst, gekozen kaarten, beeld, review); de vormen op de slides worden daar
-- telkens opnieuw uit berekend (src/modules/av-slides/lib/layout.js), dus ze
-- staan hier niet. Verjaardagen en events blijven in Odoo; wat hier staat is
-- een momentopname die opnieuw opgehaald kan worden zonder handwerk te verliezen.
-- ============================================================================

CREATE TABLE IF NOT EXISTS av_slide_editions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month            TEXT NOT NULL UNIQUE,
  av_date          DATE NOT NULL,
  content          JSONB NOT NULL DEFAULT '{}'::jsonb,
  presentation_url TEXT,
  inserted_at      TIMESTAMPTZ,
  inserted_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by       UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT av_slide_editions_month_vorm CHECK (month ~ '^\d{4}-(0[1-9]|1[0-2])$')
);

ALTER TABLE av_slide_editions ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE av_slide_editions IS 'AV-slides: per maand de inhoud van Wist-je-weetje en het prikbord. Zie src/modules/av-slides/.';

-- ─── MODULE REGISTRATION ─────────────────────────────────────────────────────

INSERT INTO modules (code, name, description, route, icon, is_active, is_default, display_order)
VALUES (
  'av_slides',
  'AV-slides',
  'Wist-je-weetje en het prikbord voor de maandelijkse AV',
  '/av-slides',
  'presentation',
  true,
  false,
  140
)
ON CONFLICT (code) DO NOTHING;

-- Admins; anderen krijgen toegang via Beheer.
INSERT INTO user_modules (user_id, module_id, is_enabled, granted_by)
SELECT u.id, m.id, true, u.id
FROM users u
CROSS JOIN modules m
WHERE u.role = 'admin'
  AND m.code = 'av_slides'
  AND NOT EXISTS (
    SELECT 1 FROM user_modules um
    WHERE um.user_id = u.id AND um.module_id = m.id
  );
