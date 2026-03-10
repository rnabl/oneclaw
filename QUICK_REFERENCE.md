# Campaign Testing Quick Reference

## 🚀 Quick Commands

```bash
# Check current status
pnpm campaign:status

# Generate campaigns (edit BATCH_SIZE & DRY_RUN in script first)
pnpm campaign:generate

# Test quality
pnpm campaign:test

# Review & approve (interactive)
pnpm campaign:review

# Export to CSV
pnpm campaign:export

# Mark as sent (interactive)
pnpm campaign:sent

# Check review scraping
pnpm leads:check
```

## 📝 Testing Workflow (5 Minutes)

### 1. Quick Status Check
```bash
pnpm campaign:status
```
Look for: Available leads with signals, current campaign count

### 2. Generate Test Batch (DRY RUN)
```bash
# First: Edit scripts/generate-home-services-campaigns.ts
# Line 21-22:
#   const BATCH_SIZE = 10;
#   const DRY_RUN = true;

pnpm campaign:generate
```
Look for: Preview of 10 emails, word counts, subjects

### 3. Generate Real Batch
```bash
# Edit script again:
#   const DRY_RUN = false;

pnpm campaign:generate
```
Look for: "✅ Campaign created" messages

### 4. Test Quality
```bash
pnpm campaign:test
```
Look for: Pass rate (target: 100%), uniqueness (target: 100%)

### 5. Review & Approve
```bash
pnpm campaign:review
# Enter batch size: 10
# For each: Press 'a' to approve or 'e'/'b' to edit
```
Look for: Natural language, proper personalization

### 6. Export
```bash
pnpm campaign:export
```
Look for: CSV files in `exports/` directory

## ⚡ Fast Testing (1 Hour)

```bash
# 1. Status (30 seconds)
pnpm campaign:status

# 2. Generate 20 campaigns (2 minutes)
# Edit: BATCH_SIZE=20, DRY_RUN=false
pnpm campaign:generate

# 3. Test quality (10 seconds)
pnpm campaign:test

# 4. Review sample (10 minutes)
pnpm campaign:review
# Review first 5 carefully, approve rest if pattern good

# 5. Export (5 seconds)
pnpm campaign:export

# 6. Send test emails manually from Gmail (30 minutes)
# Open exports/campaigns-riley-[timestamp].csv
# Send first 10 emails manually

# 7. Mark as sent (1 minute)
pnpm campaign:sent
# Choose option 2 (from exports/)
```

## 🎯 Quality Checks (What to Look For)

### ✅ Good Email
```
Subject: saw you're hiring for hvac technician

Hey Ryan,

Noticed you're hiring an HVAC Technician, looks like growth mode.

Tested ChatGPT for hvac in Austin. ABC HVAC came up, you didn't.

I can get TechPro HVAC showing up in ChatGPT in 6 weeks.

Worth a quick chat?

Riley
```

**Why it's good**:
- 51 words (40-75 range) ✅
- Lowercase subject ✅
- Natural tone ✅
- Specific signal (hiring) ✅
- Competitor mentioned ✅
- Clear value prop (ChatGPT ranking) ✅
- Soft CTA ✅

### ❌ Bad Email
```
Subject: Quick Question, Saw You're Hiring For HVAC Technician, Quick Question

Hey Ryan,

I noticed that your company, TechPro HVAC, is currently hiring for a position — an HVAC Technician — which clearly indicates significant growth and expansion in your business operations.

I ran a comprehensive test on ChatGPT's AI search results for HVAC services in the Austin metropolitan area, and unfortunately your company did not appear in the recommendations, while ABC HVAC and several other competitors were prominently featured.

I would be happy to schedule a call at your earliest convenience to discuss how we can improve your visibility.

Best regards,
Riley Thompson
```

**Why it's bad**:
- 112 words (over 75) ❌
- Capitalized subject ❌
- "Quick Question" repeated ❌
- Em dash (—) used ❌
- Too formal/salesy ❌
- Over-explained ❌

## 🔧 Common Fixes

### Too Long (>75 words)
**Before**: "I noticed that you're hiring for an HVAC Technician, which clearly indicates..."
**After**: "Noticed you're hiring an HVAC Technician, looks like growth mode."

### Too Formal
**Before**: "I would be happy to schedule a call at your earliest convenience"
**After**: "Worth a quick chat?"

### Em Dash
**Before**: "ChatGPT for hvac — not ranked"
**After**: "ChatGPT for hvac, not ranked"

### Capitalized Subject
**Before**: "Saw You're Hiring For HVAC Tech"
**After**: "saw you're hiring for hvac tech"

### Duplicate Phrases
**Before**: "quick question, hiring for tech, quick question"
**After**: "quick question, hiring for tech"

## 📊 Success Metrics

### Phase 1: Test Batch (20 emails)
- Quality pass rate: 90%+
- Approval rate: 80%+
- Deliverability: 95%+
- Reply rate: 2%+ (target: 1 reply)

### Phase 2: Medium Batch (100 emails)
- Quality pass rate: 95%+
- Approval rate: 85%+
- Deliverability: 97%+
- Reply rate: 3%+ (target: 3 replies)

### Phase 3: Full Launch (500+ emails)
- Quality pass rate: 98%+
- Approval rate: 90%+
- Deliverability: 98%+
- Reply rate: 4%+ (target: 20+ replies)

## 🚨 Red Flags

Stop and investigate if:
- Pass rate <80% on quality test
- More than 3 bounces in first 20 emails
- Any spam complaints
- Approval rate <70% on manual review
- Duplicate subjects across batch
- Generic emails (no personalization)

## 💡 Pro Tips

1. **Start tiny**: 10 emails DRY_RUN, review carefully
2. **Check competitors**: Google the competitor names to verify they're real
3. **Read out loud**: If it sounds salesy, it is
4. **Test signals**: Try hiring vs reviews signals separately
5. **Monitor closely**: Check Gmail spam folder after first sends
6. **Iterate fast**: Make tweaks after every 20 emails
7. **Track variants**: Note which template variants perform best
8. **Use exports**: Keep CSV files for tracking responses

## 📁 File Locations

### Scripts
- `scripts/generate-home-services-campaigns.ts` - **Edit BATCH_SIZE & DRY_RUN here**
- `scripts/check-home-services-status.ts`
- `scripts/test-email-generation.ts`
- `scripts/review-campaigns.ts`
- `scripts/export-approved-campaigns.ts`
- `scripts/mark-campaigns-sent.ts`

### Exports
- `exports/campaigns-all-[timestamp].csv` - All approved
- `exports/campaigns-riley-[timestamp].csv` - Riley's batch
- `exports/campaigns-madison-[timestamp].csv` - Madison's batch
- `exports/campaigns-bailey-[timestamp].csv` - Bailey's batch
- `exports/campaigns-summary-[timestamp].json` - Tracking data

### Database
- `crm.home_services_leads` - Migrated leads
- `crm.home_services_campaigns` - Generated campaigns

## 🎯 Today's Goal

**Generate, test, review, and approve 20 high-quality campaigns ready to send**

Time estimate: 1-2 hours

1. ✅ Status check (1 min)
2. ✅ Generate 20 (5 min)
3. ✅ Test quality (1 min)
4. ✅ Review sample (30 min)
5. ✅ Export (1 min)
6. ✅ Send test batch manually (30 min)
7. ✅ Monitor & iterate (next day)

**Let's go! Start with:** `pnpm campaign:status`
