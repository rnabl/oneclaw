# 🚀 Campaign Launch Checklist

## Pre-Launch Setup (5 minutes)

### 1. Database Migration
- [ ] Run migration: `pnpm db:migrate`
- [ ] Verify tables exist in Supabase dashboard
- [ ] Check `crm.home_services_leads` table
- [ ] Check `crm.home_services_campaigns` table

### 2. Environment Variables
- [ ] `SUPABASE_URL` set in `.env`
- [ ] `SUPABASE_SERVICE_ROLE_KEY` set in `.env`
- [ ] `OPENROUTER_API_KEY` set in `.env` (for DeepSeek polish)

### 3. Review Scraping Status
- [ ] Run: `pnpm leads:check`
- [ ] Verify ~730 leads with reviews
- [ ] Confirm review data is enriched

## Phase 1: Dry Run Test (10 minutes)

### 4. Configure Generator
- [ ] Edit `scripts/generate-home-services-campaigns.ts`
- [ ] Set `BATCH_SIZE = 10`
- [ ] Set `DRY_RUN = true`
- [ ] Save file

### 5. Generate Test Batch
- [ ] Run: `pnpm campaign:generate`
- [ ] Review 10 email previews
- [ ] Check word counts (40-75)
- [ ] Check subject format (lowercase, no duplicates)
- [ ] Verify competitors look real
- [ ] Confirm signals are relevant
- [ ] Note: **No data saved to DB yet**

### 6. Review Quality
- [ ] Subjects are lowercase ✅
- [ ] No em dashes (—) ✅
- [ ] Word count in range ✅
- [ ] Personalization accurate ✅
- [ ] Tone conversational ✅
- [ ] Competitor names realistic ✅

## Phase 2: First Real Batch (30 minutes)

### 7. Enable Live Mode
- [ ] Edit `scripts/generate-home-services-campaigns.ts`
- [ ] Set `BATCH_SIZE = 20`
- [ ] Set `DRY_RUN = false`
- [ ] Save file

### 8. Generate Real Campaigns
- [ ] Run: `pnpm campaign:generate`
- [ ] Wait for completion (~2 minutes)
- [ ] Verify "✅ Campaign created" messages
- [ ] Check final summary (20 processed)

### 9. Check Status
- [ ] Run: `pnpm campaign:status`
- [ ] Verify 20 campaigns created
- [ ] Check approval_status = 'pending_approval'
- [ ] Confirm distribution across signals

### 10. Test Quality
- [ ] Run: `pnpm campaign:test`
- [ ] Check pass rate (target: 90%+)
- [ ] Check uniqueness (target: 100%)
- [ ] Review any failed campaigns
- [ ] Note issues for manual review

### 11. Manual Review & Approval
- [ ] Run: `pnpm campaign:review`
- [ ] Enter batch size: `20`
- [ ] Review each campaign carefully:
  - [ ] Press `a` to approve good ones
  - [ ] Press `e` to edit subject if needed
  - [ ] Press `b` to edit body if needed
  - [ ] Press `r` to reject bad ones
- [ ] Aim for 16-18 approvals (80-90%)

### 12. Export Approved Campaigns
- [ ] Run: `pnpm campaign:export`
- [ ] Check `exports/` directory created
- [ ] Verify CSV files generated:
  - [ ] `campaigns-all-[timestamp].csv`
  - [ ] `campaigns-riley-[timestamp].csv`
  - [ ] `campaigns-madison-[timestamp].csv`
  - [ ] `campaigns-bailey-[timestamp].csv`
- [ ] Review summary JSON file

## Phase 3: Send Test Batch (1 hour)

### 13. Gmail Setup
- [ ] Log into riley@closelanepro.com
- [ ] Log into madison@closelanepro.com
- [ ] Log into bailey@closelanepro.com
- [ ] Check spam folders are clear

### 14. Manual Send (First 10)
- [ ] Open `campaigns-riley-[timestamp].csv`
- [ ] For first 10 rows:
  - [ ] Copy email address
  - [ ] Copy subject
  - [ ] Copy body
  - [ ] Send from Riley's Gmail
  - [ ] Add to tracking spreadsheet
- [ ] Check sent folder confirms 10 sent
- [ ] Wait 30 minutes

### 15. Monitor Deliverability
- [ ] Check Gmail sent folder (should be 10)
- [ ] Check spam folder (should be 0)
- [ ] Wait for bounce notifications (should be 0)
- [ ] Check for auto-replies
- [ ] No spam complaints ✅

### 16. Mark as Sent
- [ ] Run: `pnpm campaign:sent`
- [ ] Choose option 2 (from exports/)
- [ ] Select recent CSV file
- [ ] Confirm marking 10 as sent
- [ ] Verify status updated in database

## Phase 4: Monitor & Iterate (24-48 hours)

### 17. Track Engagement
- [ ] Check Gmail for replies (target: 1-2)
- [ ] Note reply tone (positive/negative)
- [ ] Check open rates if tracking enabled
- [ ] Log any bounces or issues

### 18. Analyze Results
- [ ] Reply rate: ___%
- [ ] Bounce rate: ___%
- [ ] Positive replies: ___
- [ ] Negative/spam complaints: ___
- [ ] Meeting requests: ___

### 19. Iterate Based on Results
- [ ] Identify best performing signals
- [ ] Note which competitors work well
- [ ] Adjust templates if needed
- [ ] Refine word count ranges
- [ ] Test different CTAs

### 20. Scale Decision
- [ ] If reply rate ≥2% → ✅ Scale to 100
- [ ] If bounce rate >5% → ❌ Fix issues
- [ ] If spam complaints >0 → ❌ Pause & adjust
- [ ] If positive replies → ✅ Continue

## Phase 5: Scale to 100 (if Phase 4 successful)

### 21. Generate Next Batch
- [ ] Edit generator: `BATCH_SIZE = 100`
- [ ] Run: `pnpm campaign:generate`
- [ ] Test quality: `pnpm campaign:test`
- [ ] Review sample (20-30): `pnpm campaign:review`

### 22. Approve & Export
- [ ] Aim for 85-90 approvals
- [ ] Export: `pnpm campaign:export`
- [ ] Review CSV files

### 23. Send in Waves
- [ ] **Day 1**: Send 30 emails (10 per sender)
- [ ] **Day 2**: Send 30 emails
- [ ] **Day 3**: Send 30 emails
- [ ] **Day 4**: Send remaining
- [ ] Mark each batch as sent after sending

### 24. Monitor at Scale
- [ ] Daily reply tracking
- [ ] Daily bounce monitoring
- [ ] Weekly performance review
- [ ] Adjust templates based on data

## Success Criteria

### Phase 1 (Dry Run)
- [x] 10 emails generated
- [x] 100% pass visual inspection
- [x] No obvious issues

### Phase 2 (First Real Batch)
- [ ] 20 campaigns created
- [ ] 90%+ pass quality test
- [ ] 16-18 approved manually
- [ ] CSV files exported successfully

### Phase 3 (Test Send)
- [ ] 10 emails sent successfully
- [ ] 0 bounces
- [ ] 0 spam complaints
- [ ] ≥1 positive reply (within 48h)

### Phase 4 (Monitor)
- [ ] Reply rate ≥2%
- [ ] Bounce rate <5%
- [ ] Positive reply sentiment
- [ ] No deliverability issues

### Phase 5 (Scale)
- [ ] 100 campaigns generated
- [ ] 85+ approved
- [ ] Sent in 4-day waves
- [ ] Reply rate maintained ≥2%

## Emergency Procedures

### If Bounce Rate >5%
1. **PAUSE IMMEDIATELY**
2. Check email list quality
3. Verify email format
4. Review content for spam triggers
5. Contact 1-2 leads to verify emails
6. Fix issues before resuming

### If Spam Complaint Received
1. **STOP ALL SENDING**
2. Review content immediately
3. Check CAN-SPAM compliance
4. Remove complainant from list
5. Analyze what triggered complaint
6. Adjust templates before resuming

### If Low Reply Rate (<1%)
1. Continue monitoring (may need more time)
2. Review subject line effectiveness
3. Test different signals
4. Try different template variants
5. Adjust personalization
6. Consider A/B testing

## Notes & Observations

### What Worked Well:
- 

### What Needs Improvement:
- 

### Template Performance:
- Hiring signals: ___%
- Reviews signals: ___%
- V1 variant: ___%
- V2 variant: ___%
- V3 variant: ___%

### Next Actions:
- 

---

**Start Date**: _______________
**Phase 1 Complete**: _______________
**Phase 2 Complete**: _______________
**Phase 3 Complete**: _______________
**Phase 4 Complete**: _______________
**Phase 5 Complete**: _______________

**Ready to launch!** Start with: `pnpm db:migrate`
