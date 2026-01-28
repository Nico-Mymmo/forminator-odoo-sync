-- Sales Insight Explorer - Query Persistence
-- Migration: Create sales_insight_queries table
-- 
-- Purpose: Store validated QueryDefinitions for re-execution
-- Source: Iteration 4 - Query Persistence & Execution Bridge

CREATE TABLE sales_insight_queries (
  -- Primary key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Query metadata
  name TEXT NOT NULL,
  description TEXT,
  base_model TEXT NOT NULL,
  
  -- Full QueryDefinition as JSONB
  query_definition JSONB NOT NULL,
  
  -- Source tracking
  source TEXT NOT NULL CHECK (source IN ('preset', 'user')),
  
  -- Complexity hint from validator
  complexity_hint TEXT CHECK (complexity_hint IN ('simple', 'moderate', 'complex', 'very_complex')),
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX idx_sales_insight_queries_base_model ON sales_insight_queries(base_model);
CREATE INDEX idx_sales_insight_queries_source ON sales_insight_queries(source);
CREATE INDEX idx_sales_insight_queries_created_at ON sales_insight_queries(created_at DESC);

-- Updated timestamp trigger
CREATE OR REPLACE FUNCTION update_sales_insight_queries_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_sales_insight_queries_updated_at
  BEFORE UPDATE ON sales_insight_queries
  FOR EACH ROW
  EXECUTE FUNCTION update_sales_insight_queries_updated_at();

-- Row Level Security (RLS)
ALTER TABLE sales_insight_queries ENABLE ROW LEVEL SECURITY;

-- Policy: All authenticated users can read
CREATE POLICY "Allow authenticated read access"
  ON sales_insight_queries
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy: All authenticated users can insert
CREATE POLICY "Allow authenticated insert access"
  ON sales_insight_queries
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Policy: All authenticated users can update
CREATE POLICY "Allow authenticated update access"
  ON sales_insight_queries
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Policy: All authenticated users can delete
CREATE POLICY "Allow authenticated delete access"
  ON sales_insight_queries
  FOR DELETE
  TO authenticated
  USING (true);

-- Comments for documentation
COMMENT ON TABLE sales_insight_queries IS 'Stores validated QueryDefinitions for Sales Insight Explorer';
COMMENT ON COLUMN sales_insight_queries.query_definition IS 'Full QueryDefinition object (validated before insert)';
COMMENT ON COLUMN sales_insight_queries.source IS 'Either preset (from generator) or user (manual creation)';
COMMENT ON COLUMN sales_insight_queries.complexity_hint IS 'From assessQueryComplexity() - guidance only';
