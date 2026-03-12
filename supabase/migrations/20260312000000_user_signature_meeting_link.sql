-- ════════════════════════════════════════════════════════════════════════════
-- Migration: add meeting link fields to user_signature_settings
-- ════════════════════════════════════════════════════════════════════════════
-- Adds four new user-layer columns so each user can display a personal
-- "meeting link" block in their email signature (position: directly below
-- contact details, above LinkedIn and event promo blocks).
--
-- The block shows a small calendar icon with a configurable heading and
-- subtext. Clicking it opens the user's Calendly / Google Meet booking URL.

ALTER TABLE user_signature_settings
  ADD COLUMN IF NOT EXISTS meeting_link_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS meeting_link_url     TEXT,
  ADD COLUMN IF NOT EXISTS meeting_link_heading TEXT,
  ADD COLUMN IF NOT EXISTS meeting_link_subtext TEXT;
