-- FSV2: round robin als vaste-waarde-bron op mapping-niveau (source_type 'round_robin_pool').
-- Los van fs_v2_targets.activity_user_pool (create_activity) en Calendly's eigen
-- pooling -- drie aparte round-robin-mechanismen, met opzet drie aparte states.
-- Zie CLAUDE.md "Round robin als vaste-waarde-bron in koppeling-mappings".

ALTER TABLE fs_v2_mappings
  ADD COLUMN IF NOT EXISTS round_robin_pool  JSONB,
  ADD COLUMN IF NOT EXISTS round_robin_mode  TEXT,
  ADD COLUMN IF NOT EXISTS round_robin_index INTEGER NOT NULL DEFAULT 0;

-- Atomic round-robin: returns the next hr.employee id from the pool and advances
-- the index. Uses FOR UPDATE to prevent race conditions when multiple submissions
-- arrive simultaneously. Mirrors fs_v2_rr_next_user (fs_v2_targets), but keyed on
-- mapping_id since the pool lives on the mapping row, not the target.
CREATE OR REPLACE FUNCTION fs_v2_rr_next_pool_member(p_mapping_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_pool JSONB;
  v_idx  INTEGER;
  v_len  INTEGER;
  v_emp  INTEGER;
BEGIN
  SELECT round_robin_pool, round_robin_index
    INTO v_pool, v_idx
    FROM fs_v2_mappings
   WHERE id = p_mapping_id
     FOR UPDATE;

  IF v_pool IS NULL OR jsonb_array_length(v_pool) = 0 THEN
    RETURN NULL;
  END IF;

  v_len := jsonb_array_length(v_pool);
  v_emp := (v_pool->>(v_idx % v_len))::INTEGER;

  UPDATE fs_v2_mappings
     SET round_robin_index = (v_idx + 1) % v_len
   WHERE id = p_mapping_id;

  RETURN v_emp;
END;
$$;
