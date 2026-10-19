-- Productfeatures: de keuzes van de achtergrondbouwer (src/lib/achtergrond.js).
-- Zelfde kolom als supabase/migrations/20261019140000_product_features_achtergrond.sql.
ALTER TABLE product_features ADD COLUMN achtergrond JSON_TEXT;
