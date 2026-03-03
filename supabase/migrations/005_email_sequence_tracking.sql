-- Email Sequence Tracking
-- Adds columns to track multi-touch email sequences

-- Add sequence tracking columns
ALTER TABLE crm.email_campaigns 
ADD COLUMN IF NOT EXISTS sequence_number INT DEFAULT 1,
ADD COLUMN IF NOT EXISTS template_variant TEXT,
ADD COLUMN IF NOT EXISTS sequence_id UUID DEFAULT uuid_generate_v4();

-- Index for querying by sequence
CREATE INDEX IF NOT EXISTS idx_email_sequence ON crm.email_campaigns(sequence_id);
CREATE INDEX IF NOT EXISTS idx_email_sequence_num ON crm.email_campaigns(lead_id, sequence_number);

-- Comments
COMMENT ON COLUMN crm.email_campaigns.sequence_number IS '1 = first touch, 2 = follow-up, 3 = final touch';
COMMENT ON COLUMN crm.email_campaigns.template_variant IS 'Template used: long-form-hook, short-direct, social-proof, breakup, etc.';
COMMENT ON COLUMN crm.email_campaigns.sequence_id IS 'Groups all touches for the same lead in a campaign';
