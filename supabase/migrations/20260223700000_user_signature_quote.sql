-- ════════════════════════════════════════════════════════════════════════════
-- Migration: add inspirational quote fields to user_signature_settings
-- ════════════════════════════════════════════════════════════════════════════
-- Adds four new user-layer columns so each user can display a personal quote
-- block in their email signature (position: below event promo, above disclaimer).

ALTER TABLE user_signature_settings
  ADD COLUMN IF NOT EXISTS quote_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS quote_text    TEXT,
  ADD COLUMN IF NOT EXISTS quote_author  TEXT,
  ADD COLUMN IF NOT EXISTS quote_date    TEXT;
