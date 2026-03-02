-- Add email column to node_integrations table
-- This stores the connected account's email for display purposes

ALTER TABLE node_integrations 
ADD COLUMN IF NOT EXISTS email TEXT;

-- Add index for looking up by email
CREATE INDEX IF NOT EXISTS idx_node_integrations_email ON node_integrations(email);
