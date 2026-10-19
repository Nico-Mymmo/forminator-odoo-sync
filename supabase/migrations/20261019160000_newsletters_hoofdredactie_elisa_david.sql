-- Elisa Denis en David Selleslagh worden hoofdredactie van elke soort mailing
-- (newsletter_series.editor_user_ids). Gezocht op hun Odoo-gebruiker
-- (users.odoo_uid: Elisa 33, David 20) of hun adres op mymmo.com.
-- Idempotent: wie er al in staat, komt er niet dubbel in.

UPDATE newsletter_series s
SET editor_user_ids = ARRAY(
  SELECT DISTINCT x FROM unnest(
    s.editor_user_ids || ARRAY(
      SELECT u.id FROM users u
      WHERE u.odoo_uid IN (20, 33)
         OR lower(u.email) IN ('elisa@mymmo.com', 'david@mymmo.com')
    )
  ) AS x
);
