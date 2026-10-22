-- Zelfde als supabase/migrations/20261022120000_product_features_header.sql.
ALTER TABLE product_features ADD COLUMN header TEXT NOT NULL DEFAULT '';
