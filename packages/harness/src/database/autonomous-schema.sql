-- OneClaw Autonomous Database Schema
-- 
-- This schema enables OneClaw to:
-- - Store discovered businesses persistently
-- - Track outreach campaigns and their status
-- - Manage email sequences and follow-ups
-- - Build prospect databases over time
-- - Resume workflows where they left off

-- ============================================================================
-- BUSINESSES TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS businesses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Business Information
  name TEXT NOT NULL,
  website TEXT,
  phone TEXT,
  email TEXT,
  
  -- Location
  address TEXT,
  city TEXT,
  state TEXT,
  zip_code TEXT,
  country TEXT DEFAULT 'US',
  
  -- Google Data
  google_place_id TEXT UNIQUE,
  google_rating REAL,
  google_reviews INTEGER,
  google_url TEXT,
  
  -- Categorization
  niche TEXT,
  category TEXT,
  subcategory TEXT,
  keywords TEXT,
  
  -- Discovery Metadata
  discovery_source TEXT,
  discovery_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  discovery_job_id TEXT,
  
  -- Audit Results (JSON)
  audit_data TEXT,
  audit_date DATETIME,
  audit_score REAL,
  
  -- Contact Enrichment (JSON)
  contact_data TEXT,
  enrichment_date DATETIME,
  
  -- Status
  status TEXT DEFAULT 'discovered',
  notes TEXT,
  
  -- Timestamps
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_businesses_niche ON businesses(niche);
CREATE INDEX IF NOT EXISTS idx_businesses_status ON businesses(status);
CREATE INDEX IF NOT EXISTS idx_businesses_location ON businesses(city, state);
CREATE INDEX IF NOT EXISTS idx_businesses_discovery_date ON businesses(discovery_date);

-- ============================================================================
-- CAMPAIGNS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Campaign Info
  name TEXT NOT NULL,
  description TEXT,
  
  -- Targeting
  target_niche TEXT,
  target_location TEXT,
  target_criteria TEXT,
  
  -- Configuration
  email_template TEXT,
  follow_up_sequence TEXT,
  
  -- Stats
  total_businesses INTEGER DEFAULT 0,
  emails_sent INTEGER DEFAULT 0,
  emails_opened INTEGER DEFAULT 0,
  emails_replied INTEGER DEFAULT 0,
  
  -- Status
  status TEXT DEFAULT 'draft',
  
  -- Timestamps
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  started_at DATETIME,
  completed_at DATETIME,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- OUTREACH TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS outreach (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Relations
  business_id INTEGER NOT NULL,
  campaign_id INTEGER,
  
  -- Email Details
  email_type TEXT DEFAULT 'initial',
  email_subject TEXT,
  email_body TEXT,
  
  -- Sending
  sent_date DATETIME,
  sent_from_email TEXT,
  gmail_message_id TEXT,
  gmail_thread_id TEXT,
  
  -- Tracking
  opened BOOLEAN DEFAULT FALSE,
  opened_date DATETIME,
  clicked BOOLEAN DEFAULT FALSE,
  clicked_date DATETIME,
  replied BOOLEAN DEFAULT FALSE,
  replied_date DATETIME,
  
  -- Response
  response_text TEXT,
  response_sentiment TEXT,
  
  -- Follow-up
  next_followup_date DATETIME,
  followup_count INTEGER DEFAULT 0,
  
  -- Status
  status TEXT DEFAULT 'pending',
  
  -- Timestamps
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (business_id) REFERENCES businesses(id),
  FOREIGN KEY (campaign_id) REFERENCES campaigns(id)
);

CREATE INDEX IF NOT EXISTS idx_outreach_business ON outreach(business_id);
CREATE INDEX IF NOT EXISTS idx_outreach_campaign ON outreach(campaign_id);
CREATE INDEX IF NOT EXISTS idx_outreach_status ON outreach(status);
CREATE INDEX IF NOT EXISTS idx_outreach_next_followup ON outreach(next_followup_date);

-- ============================================================================
-- CONTACTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS contacts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Relations
  business_id INTEGER NOT NULL,
  
  -- Contact Info
  first_name TEXT,
  last_name TEXT,
  full_name TEXT,
  title TEXT,
  role TEXT,
  
  -- Contact Methods
  email TEXT,
  phone TEXT,
  linkedin_url TEXT,
  
  -- Social
  twitter_handle TEXT,
  facebook_url TEXT,
  
  -- Verification
  email_verified BOOLEAN DEFAULT FALSE,
  phone_verified BOOLEAN DEFAULT FALSE,
  
  -- Source
  source TEXT,
  confidence REAL,
  
  -- Timestamps
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (business_id) REFERENCES businesses(id)
);

CREATE INDEX IF NOT EXISTS idx_contacts_business ON contacts(business_id);
CREATE INDEX IF NOT EXISTS idx_contacts_email ON contacts(email);

-- ============================================================================
-- AUTONOMOUS_JOBS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS autonomous_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Job Info
  job_type TEXT NOT NULL,
  job_name TEXT,
  description TEXT,
  
  -- Configuration
  config TEXT,
  
  -- Schedule
  schedule_type TEXT DEFAULT 'once',
  cron_schedule TEXT,
  next_run DATETIME,
  
  -- Execution
  last_run DATETIME,
  last_status TEXT,
  last_result TEXT,
  run_count INTEGER DEFAULT 0,
  
  -- Status
  enabled BOOLEAN DEFAULT TRUE,
  status TEXT DEFAULT 'pending',
  
  -- Timestamps
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_autonomous_jobs_next_run ON autonomous_jobs(next_run, enabled);
CREATE INDEX IF NOT EXISTS idx_autonomous_jobs_type ON autonomous_jobs(job_type);

-- ============================================================================
-- KNOWLEDGE_BASE TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS knowledge_base (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  
  -- Knowledge Entry
  topic TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT,
  data_type TEXT DEFAULT 'text',
  
  -- Metadata
  source TEXT,
  confidence REAL,
  
  -- Usage
  access_count INTEGER DEFAULT 0,
  last_accessed DATETIME,
  
  -- Timestamps
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE(topic, key)
);

CREATE INDEX IF NOT EXISTS idx_knowledge_topic ON knowledge_base(topic);
CREATE INDEX IF NOT EXISTS idx_knowledge_key ON knowledge_base(key);

-- ============================================================================
-- TRIGGERS FOR UPDATED_AT
-- ============================================================================

CREATE TRIGGER IF NOT EXISTS update_businesses_timestamp 
  AFTER UPDATE ON businesses
  FOR EACH ROW
BEGIN
  UPDATE businesses SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_campaigns_timestamp 
  AFTER UPDATE ON campaigns
  FOR EACH ROW
BEGIN
  UPDATE campaigns SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_outreach_timestamp 
  AFTER UPDATE ON outreach
  FOR EACH ROW
BEGIN
  UPDATE outreach SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_contacts_timestamp 
  AFTER UPDATE ON contacts
  FOR EACH ROW
BEGIN
  UPDATE contacts SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_autonomous_jobs_timestamp 
  AFTER UPDATE ON autonomous_jobs
  FOR EACH ROW
BEGIN
  UPDATE autonomous_jobs SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_knowledge_base_timestamp 
  AFTER UPDATE ON knowledge_base
  FOR EACH ROW
BEGIN
  UPDATE knowledge_base SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
