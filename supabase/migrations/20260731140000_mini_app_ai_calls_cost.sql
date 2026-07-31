-- Mini-apps AI — kostenschatting per aanroep + index voor het admin-usagerapport.
--
-- estimated_cost_usd: berekend server-side bij het loggen van elke aanroep
-- (src/modules/mini-apps/lib/ai-pricing.js -> estimateCostUsd), op basis van
-- tokens_in/tokens_out en de publieke lijstprijs van het gebruikte model.
-- Dit is een SCHATTING (geen caching/batch-korting verrekend) -- zie de
-- doc-comment in ai-pricing.js voor de motivatie. Bestaande rijs van vóór
-- deze migratie hebben estimated_cost_usd = NULL; het admin-rapport valt
-- voor die rijen terug op een on-the-fly schatting via dezelfde tabel.
ALTER TABLE mini_app_ai_calls
  ADD COLUMN IF NOT EXISTS estimated_cost_usd NUMERIC(12, 6);

-- Het admin-usagerapport (GET /admin/api/ai-usage) filtert altijd op een
-- created_at-datumvenster over de VOLLEDIGE tabel (niet per app zoals de
-- bestaande rate-limit-query) -- aparte index nodig naast de bestaande
-- (mini_app_id, created_at) uit de oorspronkelijke migratie.
CREATE INDEX IF NOT EXISTS idx_mini_app_ai_calls_created_at
  ON mini_app_ai_calls (created_at);

CREATE INDEX IF NOT EXISTS idx_mini_app_ai_calls_user_id
  ON mini_app_ai_calls (user_id);
