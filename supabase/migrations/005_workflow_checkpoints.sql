-- ============================================================================
-- Workflow State Persistence & Checkpointing
-- ============================================================================
-- 
-- Solves the problem where workflows lose intermediate data when a step fails.
-- Example: Discovery finds 100 businesses, but step 2 fails → all data lost.
-- 
-- Solution:
-- 1. workflow_steps: Checkpoint each step's output
-- 2. workflow_artifacts: Store large intermediate data (JSON/files)
-- 3. workflow_logs: Stream real-time progress logs
-- 
-- This enables:
-- - Resume from any failed step
-- - Access intermediate results even if workflow fails
-- - Real-time progress monitoring
-- - Cost tracking per step
-- ============================================================================

-- ============================================================================
-- ENSURE workflow_runs EXISTS FIRST (needed for foreign keys)
-- ============================================================================

-- Create workflow_runs if it doesn't exist (from migration 003 or standalone)
CREATE TABLE IF NOT EXISTS workflow_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id TEXT,
  workflow_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'success', 'failed', 'cancelled')),
  inputs JSONB DEFAULT '{}'::jsonb,
  outputs JSONB DEFAULT '{}'::jsonb,
  receipt JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  credits_used INTEGER DEFAULT 0,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Add new columns for workflow resumability
ALTER TABLE workflow_runs ADD COLUMN IF NOT EXISTS current_step INTEGER DEFAULT 0;
ALTER TABLE workflow_runs ADD COLUMN IF NOT EXISTS total_steps INTEGER DEFAULT 0;
ALTER TABLE workflow_runs ADD COLUMN IF NOT EXISTS can_resume BOOLEAN DEFAULT TRUE;
ALTER TABLE workflow_runs ADD COLUMN IF NOT EXISTS resumed_from_run_id UUID REFERENCES workflow_runs(id);
ALTER TABLE workflow_runs ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE workflow_runs ADD COLUMN IF NOT EXISTS actual_cost_usd DECIMAL(10,4) DEFAULT 0;

-- Index for resumable workflows
CREATE INDEX IF NOT EXISTS idx_workflow_runs_resumable 
  ON workflow_runs(node_id, status, can_resume) 
  WHERE status = 'failed' AND can_resume = TRUE;

-- ============================================================================
-- WORKFLOW STEPS: Step-level checkpointing
-- ============================================================================

CREATE TABLE IF NOT EXISTS workflow_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Reference to parent workflow run
  run_id UUID NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  
  -- Step identification
  step_index INTEGER NOT NULL,
  step_name TEXT NOT NULL,
  
  -- Execution status
  status TEXT NOT NULL DEFAULT 'pending' 
    CHECK (status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
  
  -- Step I/O (small data - up to 1MB)
  input JSONB DEFAULT '{}'::jsonb,
  output JSONB DEFAULT '{}'::jsonb,
  error_message TEXT,
  
  -- Timing
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  
  -- Cost tracking
  estimated_cost_usd DECIMAL(10,4) DEFAULT 0,
  actual_cost_usd DECIMAL(10,4) DEFAULT 0,
  
  -- Retry handling
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_workflow_steps_run ON workflow_steps(run_id, step_index);
CREATE INDEX idx_workflow_steps_status ON workflow_steps(status);

-- ============================================================================
-- WORKFLOW ARTIFACTS: Large intermediate data storage
-- ============================================================================

CREATE TABLE IF NOT EXISTS workflow_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Reference to parent workflow run
  run_id UUID NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  step_id UUID REFERENCES workflow_steps(id) ON DELETE CASCADE,
  
  -- Artifact identification
  artifact_type TEXT NOT NULL, -- 'businesses', 'contacts', 'enriched_data', etc.
  artifact_key TEXT NOT NULL,  -- Unique key within the run
  
  -- Storage options
  storage_type TEXT NOT NULL DEFAULT 'json' 
    CHECK (storage_type IN ('json', 's3', 'supabase_storage')),
  
  -- For JSON type: inline data (up to ~10MB per artifact)
  data JSONB,
  
  -- For S3/Storage type: reference
  storage_path TEXT,
  storage_bucket TEXT,
  
  -- Metadata
  size_bytes BIGINT,
  compressed BOOLEAN DEFAULT FALSE,
  mime_type TEXT,
  
  -- TTL for cleanup (artifacts auto-delete after 7 days by default)
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_workflow_artifacts_run ON workflow_artifacts(run_id);
CREATE INDEX idx_workflow_artifacts_key ON workflow_artifacts(run_id, artifact_key);
CREATE INDEX idx_workflow_artifacts_expires ON workflow_artifacts(expires_at);

-- ============================================================================
-- WORKFLOW LOGS: Real-time streaming logs
-- ============================================================================

CREATE TABLE IF NOT EXISTS workflow_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Reference to parent workflow run
  run_id UUID NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  step_id UUID REFERENCES workflow_steps(id) ON DELETE CASCADE,
  
  -- Log entry
  level TEXT NOT NULL CHECK (level IN ('debug', 'info', 'warn', 'error')),
  message TEXT NOT NULL,
  
  -- Context
  step_name TEXT,
  step_index INTEGER,
  
  -- Structured data (optional)
  data JSONB,
  
  -- Timestamp
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_workflow_logs_run ON workflow_logs(run_id, timestamp DESC);
CREATE INDEX idx_workflow_logs_step ON workflow_logs(step_id, timestamp DESC);
CREATE INDEX idx_workflow_logs_level ON workflow_logs(run_id, level, timestamp DESC);

-- ============================================================================
-- FUNCTIONS: Helper functions
-- ============================================================================

-- Function to get latest artifact by key
CREATE OR REPLACE FUNCTION get_latest_artifact(
  p_run_id UUID,
  p_artifact_key TEXT
) RETURNS JSONB AS $$
DECLARE
  artifact_data JSONB;
BEGIN
  SELECT data INTO artifact_data
  FROM workflow_artifacts
  WHERE run_id = p_run_id 
    AND artifact_key = p_artifact_key
    AND storage_type = 'json'
  ORDER BY created_at DESC
  LIMIT 1;
  
  RETURN artifact_data;
END;
$$ LANGUAGE plpgsql;

-- Function to get all completed step outputs for a run
CREATE OR REPLACE FUNCTION get_completed_step_outputs(
  p_run_id UUID
) RETURNS TABLE(
  step_index INTEGER,
  step_name TEXT,
  output JSONB,
  completed_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ws.step_index,
    ws.step_name,
    ws.output,
    ws.completed_at
  FROM workflow_steps ws
  WHERE ws.run_id = p_run_id
    AND ws.status = 'completed'
  ORDER BY ws.step_index ASC;
END;
$$ LANGUAGE plpgsql;

-- Function to cleanup expired artifacts
CREATE OR REPLACE FUNCTION cleanup_expired_artifacts() RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM workflow_artifacts
  WHERE expires_at < NOW();
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGERS: Auto-update timestamps
-- ============================================================================

CREATE TRIGGER update_workflow_steps_updated_at
BEFORE UPDATE ON workflow_steps
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- RLS POLICIES
-- ============================================================================

ALTER TABLE workflow_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_logs ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY "Service role full access to workflow_steps"
  ON workflow_steps FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Service role full access to workflow_artifacts"
  ON workflow_artifacts FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

CREATE POLICY "Service role full access to workflow_logs"
  ON workflow_logs FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

-- Users can read their own workflow data
CREATE POLICY "Users can view their workflow steps"
  ON workflow_steps FOR SELECT
  USING (run_id IN (
    SELECT id FROM workflow_runs WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can view their workflow artifacts"
  ON workflow_artifacts FOR SELECT
  USING (run_id IN (
    SELECT id FROM workflow_runs WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can view their workflow logs"
  ON workflow_logs FOR SELECT
  USING (run_id IN (
    SELECT id FROM workflow_runs WHERE user_id = auth.uid()
  ));

-- ============================================================================
-- VIEWS: Dashboard & Monitoring
-- ============================================================================

-- View: Failed workflows that can be resumed
CREATE VIEW resumable_workflows AS
SELECT 
  wr.id as run_id,
  wr.node_id,
  wr.workflow_id,
  wr.status,
  wr.current_step,
  wr.total_steps,
  wr.error_message,
  wr.created_at,
  wr.started_at,
  wr.completed_at,
  -- Count completed steps
  (SELECT COUNT(*) FROM workflow_steps WHERE run_id = wr.id AND status = 'completed') as completed_steps,
  -- Get artifacts count
  (SELECT COUNT(*) FROM workflow_artifacts WHERE run_id = wr.id) as artifacts_count
FROM workflow_runs wr
WHERE wr.status = 'failed' 
  AND wr.can_resume = TRUE
ORDER BY wr.created_at DESC;

-- View: Workflow progress summary
CREATE VIEW workflow_progress AS
SELECT 
  wr.id as run_id,
  wr.workflow_id,
  wr.status,
  wr.current_step,
  wr.total_steps,
  CASE 
    WHEN wr.total_steps > 0 THEN 
      ROUND((wr.current_step::NUMERIC / wr.total_steps::NUMERIC) * 100, 1)
    ELSE 0
  END as progress_percent,
  wr.actual_cost_usd,
  wr.started_at,
  wr.completed_at,
  EXTRACT(EPOCH FROM (COALESCE(wr.completed_at, NOW()) - wr.started_at)) as duration_seconds,
  -- Recent logs
  (
    SELECT json_agg(json_build_object(
      'level', level,
      'message', message,
      'timestamp', timestamp
    ) ORDER BY timestamp DESC)
    FROM (
      SELECT level, message, timestamp
      FROM workflow_logs
      WHERE run_id = wr.id
      ORDER BY timestamp DESC
      LIMIT 10
    ) recent_logs
  ) as recent_logs
FROM workflow_runs wr
ORDER BY wr.created_at DESC;

-- ============================================================================
-- SCHEDULED CLEANUP (via pg_cron if available)
-- ============================================================================

-- Cleanup expired artifacts daily at 3 AM
-- Uncomment if pg_cron extension is installed:
-- SELECT cron.schedule(
--   'cleanup-expired-artifacts',
--   '0 3 * * *',  -- 3 AM daily
--   $$ SELECT cleanup_expired_artifacts(); $$
-- );

-- ============================================================================
-- COMMENTS (Documentation)
-- ============================================================================

COMMENT ON TABLE workflow_steps IS 'Step-level checkpointing for workflow resumability';
COMMENT ON TABLE workflow_artifacts IS 'Large intermediate data storage for workflow steps';
COMMENT ON TABLE workflow_logs IS 'Real-time streaming logs for workflow monitoring';
COMMENT ON VIEW resumable_workflows IS 'Failed workflows that can be resumed from last checkpoint';
COMMENT ON VIEW workflow_progress IS 'Real-time progress tracking for all workflows';
