-- Productfeatures: de keuzes van de achtergrondbouwer (src/lib/achtergrond.js).
-- image_url blijft het beeld dat overal getoond wordt (bij een achtergrond: de
-- gemaakte PNG); hier staat hoe ze gemaakt is (kleur, swirl, plek, het
-- oorspronkelijke componentje), zodat je ze later kan bijstellen. NULL = geen.
ALTER TABLE product_features ADD COLUMN IF NOT EXISTS achtergrond JSONB;
