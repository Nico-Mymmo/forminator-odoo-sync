-- Productfeatures: de HEADER, de titel die extern gebruikt wordt (website,
-- nieuwsbrief). `name` blijft de korte, interne titel van de lijst links.
-- Leeg = de titel (Nico, 2026-10-22). Zelfde in D1: 0011_product_features_header.sql.
ALTER TABLE product_features ADD COLUMN IF NOT EXISTS header TEXT NOT NULL DEFAULT '';
