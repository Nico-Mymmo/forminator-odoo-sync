-- Productfeatures: een feature kan voor gewone VME's (vanaf een pakket) EN
-- voor OpenVME Pro gelden, los van elkaar aan te zetten (Nico, 2026-10-20).
-- `plan` = vanaf welk pakket voor VME's ('geen' = niet voor VME's),
-- `pro` = ook in OpenVME Pro. Wat op 'pro' stond, wordt 'geen' + pro.
ALTER TABLE product_features ADD COLUMN IF NOT EXISTS pro BOOLEAN NOT NULL DEFAULT FALSE;
UPDATE product_features SET plan = 'geen', pro = TRUE WHERE plan = 'pro';
