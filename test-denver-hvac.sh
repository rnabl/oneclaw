#!/bin/bash

# Test: Denver HVAC Discovery with AI Rankings
# This tests the complete SDR discovery workflow

echo "🧪 Testing OneClaw SDR Discovery"
echo "================================"
echo ""
echo "City: Denver, CO"
echo "Niche: HVAC"
echo "Limit: 10 businesses"
echo ""
echo "Expected cost: ~\$0.02"
echo "Expected time: ~30 seconds"
echo ""

# Check if Supabase is configured
if [ -z "$SUPABASE_URL" ]; then
  echo "⚠️  Warning: SUPABASE_URL not set"
  echo "   Data will not be stored in Supabase"
  echo ""
fi

# Check if Perplexity is configured
if [ -z "$PERPLEXITY_API_KEY" ]; then
  echo "⚠️  Warning: PERPLEXITY_API_KEY not set"
  echo "   AI rankings check will be skipped"
  echo ""
fi

# Run the test
echo "Starting test..."
echo ""

curl -X POST http://localhost:9000/execute \
  -H "Content-Type: application/json" \
  -d '{
    "workflowId": "complete-sdr-discovery",
    "input": {
      "niche": "hvac",
      "city": "Denver",
      "state": "CO",
      "service": "AC repair",
      "limit": 10,
      "runCMOAnalysis": false,
      "checkAIRankings": true
    },
    "tenantId": "test-denver",
    "tier": "pro"
  }' | jq '.'

echo ""
echo "✅ Test complete!"
echo ""
echo "Check Supabase for results:"
echo "  SELECT * FROM crm.leads WHERE city = 'Denver';"
echo "  SELECT * FROM analytics.ai_visibility_tracking LIMIT 10;"
echo ""
