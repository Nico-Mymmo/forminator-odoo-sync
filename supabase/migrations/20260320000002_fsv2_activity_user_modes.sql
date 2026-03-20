-- FSV2: activity user assignment modes + working-days support
-- Adds three columns to fs_v2_targets and an atomic round-robin RPC function.

ALTER TABLE fs_v2_targets
  ADD COLUMN IF NOT EXISTS activity_user_mode  TEXT NOT NULL DEFAULT 'fixed',
  ADD COLUMN IF NOT EXISTS activity_user_pool  JSONB,
  ADD COLUMN IF NOT EXISTS activity_rr_index   INTEGER NOT NULL DEFAULT 0;

-- Atomic round-robin: returns the next user_id from the pool and advances the index.
-- Uses FOR UPDATE to prevent race conditions when multiple submissions arrive simultaneously.
CREATE OR REPLACE FUNCTION fs_v2_rr_next_user(p_target_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_pool   JSONB;
  v_idx    INTEGER;
  v_len    INTEGER;
  v_user   INTEGER;
BEGIN
  SELECT activity_user_pool, activity_rr_index
    INTO v_pool, v_idx
    FROM fs_v2_targets
   WHERE id = p_target_id
     FOR UPDATE;

  IF v_pool IS NULL OR jsonb_array_length(v_pool) = 0 THEN
    RETURN NULL;
  END IF;

  v_len  := jsonb_array_length(v_pool);
  v_user := (v_pool->>(v_idx % v_len))::INTEGER;

  UPDATE fs_v2_targets
     SET activity_rr_index = (v_idx + 1) % v_len
   WHERE id = p_target_id;

  RETURN v_user;
END;
$$;
