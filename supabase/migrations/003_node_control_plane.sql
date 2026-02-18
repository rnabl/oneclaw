-- OneClaw Node Control Plane Tables
-- For managing distributed OneClaw nodes

-- Node Registry
CREATE TABLE IF NOT EXISTS nodes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  environment TEXT NOT NULL CHECK (environment IN ('private', 'managed', 'hybrid')),
  status TEXT NOT NULL DEFAULT 'offline' CHECK (status IN ('online', 'offline', 'error')),
  last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Node capabilities
  executors JSONB DEFAULT '[]'::jsonb,
  
  -- Node owner (user_id from auth.users if paired)
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Node Pairing Codes
CREATE TABLE IF NOT EXISTS node_pairing_codes (
  code TEXT PRIMARY KEY,
  node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Workflow Runs (on nodes)
CREATE TABLE IF NOT EXISTS workflow_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  workflow_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'success', 'failed', 'cancelled')),
  
  -- Inputs and outputs
  inputs JSONB DEFAULT '{}'::jsonb,
  outputs JSONB DEFAULT '{}'::jsonb,
  
  -- Execution trace (receipt)
  receipt JSONB,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  -- Billing
  credits_used INTEGER DEFAULT 0,
  
  -- User who triggered the workflow
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_nodes_status ON nodes(status);
CREATE INDEX IF NOT EXISTS idx_nodes_owner ON nodes(owner_id);
CREATE INDEX IF NOT EXISTS idx_pairing_codes_expires ON node_pairing_codes(expires_at) WHERE NOT used;
CREATE INDEX IF NOT EXISTS idx_workflow_runs_node ON workflow_runs(node_id);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_status ON workflow_runs(status);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_created ON workflow_runs(created_at DESC);

-- Updated_at trigger for nodes
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_nodes_updated_at
BEFORE UPDATE ON nodes
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

-- RLS Policies
ALTER TABLE nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE node_pairing_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_runs ENABLE ROW LEVEL SECURITY;

-- Users can see their own nodes
CREATE POLICY "Users can view their own nodes"
  ON nodes FOR SELECT
  USING (auth.uid() = owner_id);

-- Users can update their own nodes (heartbeat)
CREATE POLICY "Users can update their own nodes"
  ON nodes FOR UPDATE
  USING (auth.uid() = owner_id);

-- Users can insert nodes (pairing)
CREATE POLICY "Users can insert nodes"
  ON nodes FOR INSERT
  WITH CHECK (true); -- Will be restricted by owner_id after pairing

-- Service role can manage all nodes
CREATE POLICY "Service role full access to nodes"
  ON nodes FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

-- Pairing codes - service role only
CREATE POLICY "Service role full access to pairing codes"
  ON node_pairing_codes FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');

-- Workflow runs - users can see their own
CREATE POLICY "Users can view their workflow runs"
  ON workflow_runs FOR SELECT
  USING (auth.uid() = user_id OR auth.uid() IN (
    SELECT owner_id FROM nodes WHERE id = workflow_runs.node_id
  ));

-- Service role full access to workflow runs
CREATE POLICY "Service role full access to workflow runs"
  ON workflow_runs FOR ALL
  USING (auth.jwt()->>'role' = 'service_role');
