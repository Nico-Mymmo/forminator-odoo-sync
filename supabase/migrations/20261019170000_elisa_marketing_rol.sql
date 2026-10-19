-- Elisa Denis (Odoo-gebruiker 33, elisa@mymmo.com) krijgt de marketingrol
-- (users.role = 'marketing_signature'), zoals "Rol wijzigen" in Beheer dat doet,
-- inclusief de module mail_signature_designer. Een beheerder blijft beheerder.

UPDATE users
SET role = 'marketing_signature'
WHERE (odoo_uid = 33 OR lower(email) = 'elisa@mymmo.com')
  AND role <> 'admin';

INSERT INTO user_modules (user_id, module_id, is_enabled, granted_by)
SELECT u.id, m.id, true, u.id
FROM users u
JOIN modules m ON m.code = 'mail_signature_designer'
WHERE (u.odoo_uid = 33 OR lower(u.email) = 'elisa@mymmo.com')
ON CONFLICT (user_id, module_id) DO UPDATE SET is_enabled = true;
