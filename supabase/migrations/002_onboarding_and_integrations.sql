-- iClaw v2: Onboarding & OAuth Integrations
-- Run this in your Supabase SQL Editor AFTER 001_initial_schema.sql

-- Add onboarding columns to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS onboarding_state TEXT DEFAULT 'new' 
    CHECK (onboarding_state IN ('new', 'selecting', 'awaiting_oauth', 'ready'));

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS selected_skills TEXT[] DEFAULT '{}';

-- Integrations table for OAuth tokens
CREATE TABLE IF NOT EXISTS integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK (provider IN ('google', 'apple', 'microsoft')),
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    token_expires_at TIMESTAMPTZ,
    scopes TEXT[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, provider)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_integrations_user ON integrations(user_id);
CREATE INDEX IF NOT EXISTS idx_integrations_provider ON integrations(provider);
CREATE INDEX IF NOT EXISTS idx_users_onboarding ON users(onboarding_state);

-- Apply updated_at trigger to integrations
DROP TRIGGER IF EXISTS update_integrations_updated_at ON integrations;
CREATE TRIGGER update_integrations_updated_at
    BEFORE UPDATE ON integrations
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- RLS for integrations
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on integrations" ON integrations
    FOR ALL
    USING (auth.role() = 'service_role');

-- Comments
COMMENT ON TABLE integrations IS 'OAuth tokens for connected services (Gmail, Calendar, etc.)';
COMMENT ON COLUMN users.onboarding_state IS 'new = first contact, selecting = choosing skills, awaiting_oauth = waiting for auth, ready = setup complete';
COMMENT ON COLUMN users.selected_skills IS 'Array of skill IDs: email, calendar, food, golf';
COMMENT ON COLUMN integrations.provider IS 'OAuth provider: google, apple, microsoft';
COMMENT ON COLUMN integrations.scopes IS 'OAuth scopes granted';
