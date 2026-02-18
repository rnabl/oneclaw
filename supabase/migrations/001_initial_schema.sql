-- iClaw Initial Schema
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
-- Stores subscriber information and links to Stripe
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_number TEXT UNIQUE NOT NULL,
    name TEXT,
    tier TEXT DEFAULT 'none' CHECK (tier IN ('none', 'starter', 'pro')),
    stripe_customer_id TEXT UNIQUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Usage tracking table
-- Logs actions for potential overage billing
CREATE TABLE IF NOT EXISTS usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_number TEXT NOT NULL REFERENCES users(phone_number) ON DELETE CASCADE,
    action TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    billing_period TEXT NOT NULL,  -- Format: 'YYYY-MM' e.g., '2026-02'
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Session vault table (for storing encrypted browser cookies)
-- Optional: for services like Starbucks, Pizza Hut
CREATE TABLE IF NOT EXISTS session_vault (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_number TEXT NOT NULL REFERENCES users(phone_number) ON DELETE CASCADE,
    service_name TEXT NOT NULL,  -- e.g., 'starbucks', 'pizzahut', 'doordash'
    encrypted_session TEXT NOT NULL,  -- Encrypted cookie data
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(phone_number, service_name)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone_number);
CREATE INDEX IF NOT EXISTS idx_users_stripe ON users(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_usage_phone_period ON usage(phone_number, billing_period);
CREATE INDEX IF NOT EXISTS idx_usage_period ON usage(billing_period);
CREATE INDEX IF NOT EXISTS idx_session_vault_phone ON session_vault(phone_number);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at trigger to users table
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Apply updated_at trigger to session_vault table
DROP TRIGGER IF EXISTS update_session_vault_updated_at ON session_vault;
CREATE TRIGGER update_session_vault_updated_at
    BEFORE UPDATE ON session_vault
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_vault ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (for Edge Functions)
CREATE POLICY "Service role full access on users" ON users
    FOR ALL
    USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on usage" ON usage
    FOR ALL
    USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on session_vault" ON session_vault
    FOR ALL
    USING (auth.role() = 'service_role');

-- Anon key can read users (for checking tier from OpenClaw)
CREATE POLICY "Anon can read users" ON users
    FOR SELECT
    USING (true);

-- Anon key can insert usage (for logging from OpenClaw)
CREATE POLICY "Anon can insert usage" ON usage
    FOR INSERT
    WITH CHECK (true);

-- Comments for documentation
COMMENT ON TABLE users IS 'iClaw subscribers with their subscription tier';
COMMENT ON TABLE usage IS 'Action tracking for usage-based billing';
COMMENT ON TABLE session_vault IS 'Encrypted browser sessions for third-party services';
COMMENT ON COLUMN users.tier IS 'Subscription tier: none, starter ($19/mo), or pro ($49/mo)';
COMMENT ON COLUMN usage.billing_period IS 'Format: YYYY-MM for monthly aggregation';
