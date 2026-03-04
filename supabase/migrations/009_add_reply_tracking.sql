-- Add reply tracking columns to email_campaigns
ALTER TABLE crm.email_campaigns 
ADD COLUMN IF NOT EXISTS reply_detected_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS reply_snippet TEXT;

-- Index for finding campaigns that need reply checking
CREATE INDEX IF NOT EXISTS idx_email_campaigns_reply_check 
ON crm.email_campaigns (sent_at, reply_detected_at) 
WHERE sent_at IS NOT NULL AND reply_detected_at IS NULL;
