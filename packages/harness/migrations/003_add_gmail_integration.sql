-- Gmail Integration Tables
-- Migration: 003_add_gmail_integration
-- Description: Add tables for Gmail OAuth, email queue, and message history

-- Create gmail_accounts table
CREATE TABLE IF NOT EXISTS gmail_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  access_token TEXT NOT NULL, -- Encrypted with AES-256-GCM
  refresh_token TEXT NOT NULL, -- Encrypted with AES-256-GCM
  token_expires_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN DEFAULT true,
  daily_send_count INTEGER DEFAULT 0,
  daily_send_reset_at TIMESTAMPTZ DEFAULT now(),
  last_sent_at TIMESTAMPTZ, -- Track last send time for rate limiting
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  CONSTRAINT gmail_accounts_user_email_unique UNIQUE(user_id, email)
);

-- RLS for gmail_accounts
ALTER TABLE gmail_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own gmail accounts"
  ON gmail_accounts FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own gmail accounts"
  ON gmail_accounts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own gmail accounts"
  ON gmail_accounts FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own gmail accounts"
  ON gmail_accounts FOR DELETE
  USING (auth.uid() = user_id);

-- Indexes for gmail_accounts
CREATE INDEX idx_gmail_accounts_user ON gmail_accounts(user_id);
CREATE INDEX idx_gmail_accounts_active ON gmail_accounts(user_id, is_active) WHERE is_active = true;

-- Create email_queue table
CREATE TABLE IF NOT EXISTS email_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gmail_account_id UUID REFERENCES gmail_accounts(id) ON DELETE SET NULL,
  business_id UUID, -- Optional reference to businesses table if it exists
  
  to_email TEXT NOT NULL,
  to_name TEXT,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  
  scheduled_for TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'cancelled')),
  error_message TEXT,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  sent_at TIMESTAMPTZ
);

-- RLS for email_queue
ALTER TABLE email_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own email queue"
  ON email_queue FOR ALL
  USING (auth.uid() = user_id);

-- Indexes for email_queue
CREATE INDEX idx_email_queue_user ON email_queue(user_id, created_at DESC);
CREATE INDEX idx_email_queue_pending ON email_queue(scheduled_for) WHERE status = 'pending';
CREATE INDEX idx_email_queue_status ON email_queue(status, scheduled_for);

-- Create email_messages table
CREATE TABLE IF NOT EXISTS email_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  gmail_account_id UUID REFERENCES gmail_accounts(id) ON DELETE SET NULL,
  business_id UUID, -- Optional reference to businesses table if it exists
  
  gmail_message_id TEXT, -- Gmail's message ID for threading
  gmail_thread_id TEXT, -- Gmail's thread ID
  
  direction TEXT NOT NULL CHECK (direction IN ('outbound', 'inbound')),
  from_email TEXT NOT NULL,
  to_email TEXT NOT NULL,
  subject TEXT,
  body_preview TEXT, -- First 200 chars
  body_full TEXT,
  
  is_read BOOLEAN DEFAULT false,
  is_replied BOOLEAN DEFAULT false,
  
  sent_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS for email_messages
ALTER TABLE email_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own email messages"
  ON email_messages FOR ALL
  USING (auth.uid() = user_id);

-- Indexes for email_messages
CREATE INDEX idx_email_messages_user ON email_messages(user_id, created_at DESC);
CREATE INDEX idx_email_messages_gmail_thread ON email_messages(gmail_thread_id) WHERE gmail_thread_id IS NOT NULL;
CREATE INDEX idx_email_messages_business ON email_messages(business_id) WHERE business_id IS NOT NULL;
CREATE INDEX idx_email_messages_direction ON email_messages(user_id, direction, created_at DESC);
CREATE INDEX idx_email_messages_unread ON email_messages(user_id, is_read) WHERE is_read = false;

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for gmail_accounts updated_at
CREATE TRIGGER update_gmail_accounts_updated_at
  BEFORE UPDATE ON gmail_accounts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Comments for documentation
COMMENT ON TABLE gmail_accounts IS 'Connected Gmail accounts for users via OAuth';
COMMENT ON TABLE email_queue IS 'Scheduled emails waiting to be sent';
COMMENT ON TABLE email_messages IS 'Email history (sent/received) for Unibox';

COMMENT ON COLUMN gmail_accounts.access_token IS 'Encrypted Google OAuth access token (AES-256-GCM)';
COMMENT ON COLUMN gmail_accounts.refresh_token IS 'Encrypted Google OAuth refresh token (AES-256-GCM)';
COMMENT ON COLUMN gmail_accounts.daily_send_count IS 'Number of emails sent today (resets daily)';
COMMENT ON COLUMN gmail_accounts.last_sent_at IS 'Timestamp of last email sent (for 60s rate limit)';
COMMENT ON COLUMN email_queue.scheduled_for IS 'When the email should be sent';
COMMENT ON COLUMN email_messages.gmail_message_id IS 'Gmail API message ID for threading';
COMMENT ON COLUMN email_messages.gmail_thread_id IS 'Gmail API thread ID for grouping';
