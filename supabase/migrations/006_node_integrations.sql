-- Node Integrations: OAuth tokens for OneClaw nodes (uses string IDs, not UUIDs)
-- This allows nodes to store OAuth tokens without requiring a user in the users table

CREATE TABLE IF NOT EXISTS node_integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    node_id TEXT NOT NULL,
    provider TEXT NOT NULL CHECK (provider IN ('google', 'apple', 'microsoft')),
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    token_expires_at TIMESTAMPTZ,
    scopes TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(node_id, provider)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_node_integrations_node ON node_integrations(node_id);
CREATE INDEX IF NOT EXISTS idx_node_integrations_provider ON node_integrations(provider);

-- Apply updated_at trigger
DROP TRIGGER IF EXISTS update_node_integrations_updated_at ON node_integrations;
CREATE TRIGGER update_node_integrations_updated_at
    BEFORE UPDATE ON node_integrations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE node_integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on node_integrations" ON node_integrations
    FOR ALL
    USING (auth.role() = 'service_role');

-- Grant permissions to service_role
GRANT ALL ON node_integrations TO service_role;

COMMENT ON TABLE node_integrations IS 'OAuth tokens for OneClaw nodes (string-based node IDs)';
