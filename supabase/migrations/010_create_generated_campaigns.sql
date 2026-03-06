-- Create generated_campaigns table for storing AI-generated email campaigns
-- Separate from email_campaigns for now, can merge later

CREATE TABLE IF NOT EXISTS crm.generated_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES crm.leads(id) ON DELETE CASCADE,
  
  -- Campaign content
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  
  -- Metadata
  campaign_type TEXT DEFAULT 'job_posting_ai_visibility',
  service_detected TEXT,
  category_detected TEXT, -- b2b or b2c
  job_role TEXT,
  
  -- Status
  status TEXT DEFAULT 'draft', -- draft, ready, sent, delivered, opened, replied
  
  -- Timestamps
  generated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  sent_at TIMESTAMP WITH TIME ZONE,
  
  -- Indexes
  UNIQUE(lead_id, campaign_type)
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_generated_campaigns_lead_id ON crm.generated_campaigns(lead_id);
CREATE INDEX IF NOT EXISTS idx_generated_campaigns_status ON crm.generated_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_generated_campaigns_generated_at ON crm.generated_campaigns(generated_at);

-- Add RLS policies
ALTER TABLE crm.generated_campaigns ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Service role has full access to generated_campaigns"
  ON crm.generated_campaigns
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE crm.generated_campaigns IS 'AI-generated email campaigns for leads. Separate from email_campaigns for now, can merge later.';
