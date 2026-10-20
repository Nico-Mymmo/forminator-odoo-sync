-- Zelfde als supabase/migrations/20261020150000_product_features_pro.sql.
ALTER TABLE product_features ADD COLUMN pro BOOLEAN NOT NULL DEFAULT 0;
UPDATE product_features SET plan = 'geen', pro = 1 WHERE plan = 'pro';
