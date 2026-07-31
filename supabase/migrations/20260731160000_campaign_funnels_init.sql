-- =============================================================================
-- Ad & sales campaigns — kern-schema (fase 1, stap 1)
--
-- Eén funnel = één "nieuwe ontwikkeling" (bv. Technisch beheer), zelf-
-- bevattend: geen gedeelde/herbruikbare bronnenbibliotheek of kaarten-
-- hergebruik over funnels heen (bewust uitgesteld, zie sparsessie 2026-07-31).
-- AI-ondersteund opstellen van argumentatie is eveneens fase 2 — dit schema
-- bevat dus geen AI-gerelateerde kolommen/tabellen.
--
-- Structuur: funnel -> swimlanes (één per user-issue) -> cards (post-its),
-- elke card hoort bij exact 1 van de 7 funnel-stages uit het Miro-sjabloon.
-- =============================================================================

CREATE TABLE IF NOT EXISTS campaign_funnels (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT        NOT NULL,
  description  TEXT,
  status       TEXT        NOT NULL DEFAULT 'concept'
                 CHECK (status IN ('concept', 'lopend', 'live', 'gearchiveerd')),
  created_by   UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Eén swimlane = één user-issue/pijnpunt binnen een funnel (bv. "reactief i.p.v.
-- preventief beheer"). Loopt door dezelfde 7 kolommen als de funnel.
CREATE TABLE IF NOT EXISTS campaign_swimlanes (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  funnel_id    UUID        NOT NULL REFERENCES campaign_funnels(id) ON DELETE CASCADE,
  title        TEXT        NOT NULL,
  description  TEXT,
  sort_order   INTEGER     NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Eén card = één post-it. `stage` volgt de 7 kolommen uit het Miro-sjabloon
-- 1:1 (Onderzoek & actiebladen -> Kernboodschap -> Argument/idee -> Kern-
-- argument -> Onderbouwing -> Product oplossing -> Conversiemomenten).
-- `card_type` is een vrij tag-veld (bv. 'reality_check', 'kernboodschap',
-- 'feature', 'touchpoint') zodat de UI kleuren/groepeert zoals in Miro,
-- zonder dat we nu al een apart lookup-type nodig hebben.
-- `source_ref` is een simpel vrij tekstveld (link/referentie) voor
-- onderbouwing-kaarten — GEEN aparte bronnenbibliotheek-tabel in deze fase.
CREATE TABLE IF NOT EXISTS campaign_cards (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  swimlane_id  UUID        NOT NULL REFERENCES campaign_swimlanes(id) ON DELETE CASCADE,
  stage        TEXT        NOT NULL
                 CHECK (stage IN (
                   'onderzoek', 'kernboodschap', 'argument', 'kernargument',
                   'onderbouwing', 'product', 'conversie'
                 )),
  content      TEXT        NOT NULL,
  card_type    TEXT,
  source_ref   TEXT,
  sort_order   INTEGER     NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_campaign_swimlanes_funnel_id ON campaign_swimlanes(funnel_id);
CREATE INDEX IF NOT EXISTS idx_campaign_cards_swimlane_id ON campaign_cards(swimlane_id);
CREATE INDEX IF NOT EXISTS idx_campaign_cards_stage ON campaign_cards(stage);
