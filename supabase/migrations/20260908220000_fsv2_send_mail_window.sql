-- ─────────────────────────────────────────────────────────────────────────────
-- FSV2: send_mail — verzendvenster
--
-- De vertraging alleen is niet genoeg. Iemand die om 01:30 een aanvraag doet,
-- krijgt met 90 minuten vertraging een "persoonlijke" mail om 03:00. Dat is
-- precies het tegenovergestelde van wat de vertraging moet bereiken: het leest
-- als een machine, want geen mens typt dat dan.
--
-- Vandaar een venster per stap. Valt het berekende moment erbuiten, dan
-- schuift de mail naar de eerstvolgende opening. Nooit naar vroeger -- een
-- mail vervroegen zou de vertraging ongedaan maken.
--
-- Minuten sinds middernacht, niet 'HH:MM': dan is er niets te parsen en kan er
-- geen tijdzone-verwarring in een tekstveld sluipen. De tijdzone is
-- Europe/Brussels, hard in de code (src/modules/forminator-sync-v2/mail-step.js)
-- omdat alle ontvangers hier zitten; een kolom ervoor zou alleen maar een
-- extra plek zijn waar iemand iets fout kan zetten.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE fs_v2_targets
  ADD COLUMN IF NOT EXISTS mail_window_start_min INTEGER NOT NULL DEFAULT 480,   -- 08:00
  ADD COLUMN IF NOT EXISTS mail_window_end_min   INTEGER NOT NULL DEFAULT 1200;  -- 20:00

COMMENT ON COLUMN fs_v2_targets.mail_window_start_min
  IS 'Vroegste verzendmoment, minuten sinds middernacht in Europe/Brussels. 480 = 08:00.';
COMMENT ON COLUMN fs_v2_targets.mail_window_end_min
  IS 'Laatste verzendmoment, minuten sinds middernacht in Europe/Brussels. 1200 = 20:00. Gelijk aan start = geen venster (altijd versturen).';

-- Rollback:
-- ALTER TABLE fs_v2_targets
--   DROP COLUMN IF EXISTS mail_window_start_min,
--   DROP COLUMN IF EXISTS mail_window_end_min;
