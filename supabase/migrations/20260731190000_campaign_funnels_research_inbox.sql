-- ============================================================================
-- Ad & Sales Campaigns — onderzoek-inbox (fase 2)
-- ============================================================================
-- Bijsturing na sparsessie 2026-07-31: geen lege funnel die je overal manueel
-- invult, maar een gefaseerde workflow. Stap 1 = ruwe onderzoeksinput (eigen
-- ideeën, actiebladen, klantbevraging) verzamelen in een "inbox", die daarna
-- via AI gegroepeerd wordt tot "Inzichten" (voorheen swimlanes genoemd in de
-- code/DB — de tabelnaam campaign_swimlanes blijft ongewijzigd om een risico-
-- volle rename te vermijden, enkel de UI-labels veranderen naar "Inzicht").
--
-- Een kaart hoort dus niet meer verplicht bij een swimlane: zolang ze in de
-- inbox zit (nog niet gegroepeerd) heeft ze enkel een funnel_id en geen
-- swimlane_id. Eenmaal gegroepeerd (of rechtstreeks toegevoegd aan een
-- bestaand Inzicht) krijgt ze een swimlane_id. Inbox-kaarten zijn altijd
-- stage='onderzoek' -- de CHECK-constraint hieronder dwingt dat af: enkel
-- onderzoek-kaarten mogen swimlane-loos zijn, alle andere stages (2A t/m 4)
-- horen altijd bij een concreet Inzicht.
-- ============================================================================

-- 1. funnel_id toevoegen (elke kaart kent zijn funnel, ook in de inbox-fase)
ALTER TABLE campaign_cards ADD COLUMN IF NOT EXISTS funnel_id UUID REFERENCES campaign_funnels(id) ON DELETE CASCADE;

-- 2. Backfill voor bestaande kaarten (incl. de Technisch beheer-seed) via hun swimlane
UPDATE campaign_cards cc
SET funnel_id = sw.funnel_id
FROM campaign_swimlanes sw
WHERE cc.swimlane_id = sw.id
  AND cc.funnel_id IS NULL;

-- 3. Nu iedere rij een funnel_id heeft: verplicht maken
ALTER TABLE campaign_cards ALTER COLUMN funnel_id SET NOT NULL;

-- 4. swimlane_id mag voortaan leeg zijn (inbox-item, nog niet gegroepeerd)
ALTER TABLE campaign_cards ALTER COLUMN swimlane_id DROP NOT NULL;

-- 5. Data-integriteit: enkel onderzoek-kaarten mogen swimlane-loos (inbox) zijn
ALTER TABLE campaign_cards
  ADD CONSTRAINT campaign_cards_inbox_only_onderzoek
  CHECK (swimlane_id IS NOT NULL OR stage = 'onderzoek');

CREATE INDEX IF NOT EXISTS idx_campaign_cards_funnel_id ON campaign_cards(funnel_id);
CREATE INDEX IF NOT EXISTS idx_campaign_cards_inbox ON campaign_cards(funnel_id) WHERE swimlane_id IS NULL;

-- ============================================================================
-- END MIGRATION
-- ============================================================================
