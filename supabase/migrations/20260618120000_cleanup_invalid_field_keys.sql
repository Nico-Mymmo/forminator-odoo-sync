-- ============================================================================
-- Cleanup: verwijder verkeerd benoemde velden uit information_set_fields
-- ============================================================================
-- Odoo Studio-velden beginnen altijd met 'x_'. Velden die beginnen met 's_'
-- zijn foutief aangemaakt (waarschijnlijk 's_studio_support_user_id' ipv
-- 'x_studio_support_user_id') en bestaan niet (meer) in Odoo.
-- Deze migration verwijdert ze permanent.
-- ============================================================================

DELETE FROM information_set_fields
WHERE field_key LIKE 's_studio_%';
