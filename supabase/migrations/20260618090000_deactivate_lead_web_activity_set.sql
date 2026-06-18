-- ============================================================================
-- Deactiveer lead_web_activity information set
-- ============================================================================
-- De "Web activiteit +call" chip in de Leads-node was een dubbele: de
-- x_web_visitor L2-node in de spider doet hetzelfde via het standaardsysteem.
-- Dit set wordt gedeactiveerd zodat hij niet meer in de wizard verschijnt.
-- De trigger voor enrichWithWebActivity loopt nu via submodelSets['x_web_visitor_enabled'].
-- ============================================================================

UPDATE information_sets
SET is_active = FALSE
WHERE id = 'lead_web_activity';
