-- Add reply tracking columns to email_campaigns
-- Run this in Supabase SQL editor

ALTER TABLE crm.email_campaigns 
ADD COLUMN IF NOT EXISTS reply_detected_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS reply_snippet TEXT;

-- Add index for checking replies
CREATE INDEX IF NOT EXISTS idx_email_campaigns_reply_detected 
ON crm.email_campaigns(reply_detected_at) 
WHERE reply_detected_at IS NOT NULL;

-- Comment
COMMENT ON COLUMN crm.email_campaigns.reply_detected_at IS 'When a reply was detected by the reply checker';
COMMENT ON COLUMN crm.email_campaigns.reply_snippet IS 'First 500 chars of the reply';
