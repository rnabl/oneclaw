-- Add columns to track per-user OpenClaw instances
-- Run this in Supabase SQL editor

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS openclaw_port INTEGER,
ADD COLUMN IF NOT EXISTS openclaw_token TEXT,
ADD COLUMN IF NOT EXISTS openclaw_provisioned_at TIMESTAMPTZ;

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_users_openclaw_port ON users(openclaw_port);

COMMENT ON COLUMN users.openclaw_port IS 'Port number for this user''s OpenClaw container';
COMMENT ON COLUMN users.openclaw_token IS 'Auth token for this user''s OpenClaw instance';
COMMENT ON COLUMN users.openclaw_provisioned_at IS 'When the OpenClaw instance was created';
