-- ============================================================================
-- Add Missing Core Columns to crm.leads
-- ============================================================================
-- This ensures all essential columns exist in crm.leads table
-- ============================================================================

-- Add address column if missing
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'crm' 
    AND table_name = 'leads' 
    AND column_name = 'address'
  ) THEN
    ALTER TABLE crm.leads ADD COLUMN address TEXT;
    RAISE NOTICE 'Added address column';
  ELSE
    RAISE NOTICE 'address column already exists';
  END IF;
END $$;

-- Add other location columns if missing
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'crm' 
    AND table_name = 'leads' 
    AND column_name = 'country'
  ) THEN
    ALTER TABLE crm.leads ADD COLUMN country TEXT DEFAULT 'US';
    RAISE NOTICE 'Added country column';
  ELSE
    RAISE NOTICE 'country column already exists';
  END IF;
END $$;

-- Verify all essential columns exist
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'crm'
  AND table_name = 'leads'
  AND column_name IN (
    'address', 'city', 'state', 'zip_code', 'country',
    'source_type', 'source_metadata'
  )
ORDER BY column_name;
