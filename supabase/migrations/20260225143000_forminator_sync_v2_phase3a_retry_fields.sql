-- Forminator Sync V2 Phase 3A
-- Minimal retry/replay support fields on existing submissions table

ALTER TABLE fs_v2_submissions
  ADD COLUMN IF NOT EXISTS retry_status text,
  ADD COLUMN IF NOT EXISTS next_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS replay_of_submission_id uuid;

ALTER TABLE fs_v2_submissions
  ALTER COLUMN retry_count SET DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_fs_v2_submissions_retry_due
  ON fs_v2_submissions (status, next_retry_at)
  WHERE status = 'retry_scheduled';

CREATE INDEX IF NOT EXISTS idx_fs_v2_submissions_replay_of
  ON fs_v2_submissions (replay_of_submission_id)
  WHERE replay_of_submission_id IS NOT NULL;
