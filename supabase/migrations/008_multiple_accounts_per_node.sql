-- Allow multiple Gmail accounts per node
-- Change unique constraint from (node_id, provider) to (node_id, provider, email)

-- Drop the old unique constraint
ALTER TABLE node_integrations DROP CONSTRAINT IF EXISTS node_integrations_node_id_provider_key;

-- Add new unique constraint that includes email
ALTER TABLE node_integrations ADD CONSTRAINT node_integrations_node_id_provider_email_key 
  UNIQUE (node_id, provider, email);
