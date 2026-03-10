# 📧 Home Services Campaign System - Master Index

## 🎯 Quick Navigation

### 🚀 Getting Started (Start Here!)
👉 **[START_HERE.md](./START_HERE.md)** - Complete quick start guide with copy-paste commands

### 📖 Core Documentation
1. **[CAMPAIGN_README.md](./CAMPAIGN_README.md)** - Main overview and introduction
2. **[QUICK_REFERENCE.md](./QUICK_REFERENCE.md)** - Fast command reference (5 min read)
3. **[LAUNCH_CHECKLIST.md](./LAUNCH_CHECKLIST.md)** - Step-by-step launch checklist with checkboxes
4. **[CAMPAIGN_TESTING_GUIDE.md](./CAMPAIGN_TESTING_GUIDE.md)** - Complete testing process (30 min read)
5. **[CAMPAIGN_SYSTEM_SUMMARY.md](./CAMPAIGN_SYSTEM_SUMMARY.md)** - Technical architecture and design

---

## 📂 File Structure

### Documentation Files (6 files)
```
├── START_HERE.md                    👈 Start here!
├── CAMPAIGN_README.md               Main overview
├── QUICK_REFERENCE.md               Fast reference
├── LAUNCH_CHECKLIST.md              Launch checklist
├── CAMPAIGN_TESTING_GUIDE.md        Complete guide
└── CAMPAIGN_SYSTEM_SUMMARY.md       Technical docs
```

### Scripts (8 files)
```
scripts/
├── run-home-services-migration.ts          Database setup
├── check-home-services-status.ts           System status
├── generate-home-services-campaigns.ts     Main generator ⭐
├── test-email-generation.ts                Quality tester
├── review-campaigns.ts                     Interactive reviewer
├── export-approved-campaigns.ts            CSV exporter
├── mark-campaigns-sent.ts                  Status tracker
└── check-review-status.ts                  Review status
```

### Database (1 file)
```
packages/harness/migrations/
└── 010_home_services_campaigns.sql         Schema definition
```

### Generated Files
```
exports/                                    Created by system
├── campaigns-all-[timestamp].csv
├── campaigns-riley-[timestamp].csv
├── campaigns-madison-[timestamp].csv
├── campaigns-bailey-[timestamp].csv
└── campaigns-summary-[timestamp].json
```

---

## 🎮 NPM Commands

### Setup
```bash
pnpm db:migrate              # Create database tables (run once)
```

### Core Workflow
```bash
pnpm campaign:status         # Check system status
pnpm campaign:generate       # Generate campaigns (edit BATCH_SIZE & DRY_RUN first)
pnpm campaign:test           # Test email quality
pnpm campaign:review         # Review & approve (interactive)
pnpm campaign:export         # Export to CSV
pnpm campaign:sent           # Mark as sent (interactive)
```

### Monitoring
```bash
pnpm leads:check             # Check review scraping progress
```

---

## 🗺️ Documentation Roadmap

### For First-Time Users
**Day 1**: Read these in order
1. **START_HERE.md** (15 min) - Quick start with commands
2. **QUICK_REFERENCE.md** (5 min) - Memorize key commands
3. Then run: `pnpm db:migrate` and `pnpm campaign:status`

**Day 2**: Hands-on
4. **LAUNCH_CHECKLIST.md** (2 hours) - Follow step-by-step
5. Generate your first 20 campaigns
6. Review, approve, and send test batch

**Day 3+**: Deep dive
7. **CAMPAIGN_TESTING_GUIDE.md** (30 min) - Advanced testing
8. **CAMPAIGN_SYSTEM_SUMMARY.md** (reference) - Technical details

### For Technical Users
1. **CAMPAIGN_SYSTEM_SUMMARY.md** - Understand architecture
2. **Review script files** - See implementation details
3. **CAMPAIGN_TESTING_GUIDE.md** - Testing methodology
4. **QUICK_REFERENCE.md** - Command reference

### For Business Users
1. **START_HERE.md** - Overview and setup
2. **LAUNCH_CHECKLIST.md** - Follow checkboxes
3. **QUICK_REFERENCE.md** - What to look for in emails
4. Skip technical docs

---

## 🎯 What Each Document Covers

### START_HERE.md 🌟
**Read first** - Complete quick start guide
- ✅ Copy-paste commands
- ✅ Expected outputs
- ✅ Example emails
- ✅ Cost breakdown
- ✅ Success metrics
- ✅ What to do next

### CAMPAIGN_README.md 📘
**Main overview** - Introduction and reference
- System overview
- Features and capabilities
- Command reference
- Testing phases
- File structure
- Troubleshooting

### QUICK_REFERENCE.md ⚡
**Fast reference** - Keep this open while working
- Quick commands
- 5-minute workflow
- 1-hour workflow
- Good vs bad examples
- Common fixes
- Pro tips

### LAUNCH_CHECKLIST.md ✅
**Step-by-step guide** - Use this for your first launch
- Pre-launch setup (5 min)
- Dry run test (10 min)
- First real batch (30 min)
- Send test batch (1 hour)
- Monitor & iterate (24-48 hours)
- Scale to 100 (ongoing)
- Success criteria
- Emergency procedures

### CAMPAIGN_TESTING_GUIDE.md 📚
**Complete guide** - Deep dive into testing
- Testing process overview
- Quality checklist
- Batch testing strategy
- Monitoring & iteration
- Tips for success
- Example workflows

### CAMPAIGN_SYSTEM_SUMMARY.md 🏗️
**Technical overview** - Architecture and design
- System architecture diagram
- Component breakdown
- Data flow
- Key features
- Configuration
- File reference
- Support info

---

## 🎓 Learning Path

### Beginner (Never used before)
**Time**: 2-3 hours total
1. Read START_HERE.md (15 min)
2. Read QUICK_REFERENCE.md (5 min)
3. Run migration and status check (5 min)
4. Follow LAUNCH_CHECKLIST.md Phase 1-2 (1 hour)
5. Generate and review 20 campaigns (1 hour)

### Intermediate (Ready to send)
**Time**: 3-4 hours total
1. Review QUICK_REFERENCE.md (5 min)
2. Follow LAUNCH_CHECKLIST.md Phase 3 (1 hour)
3. Send test batch of 10 emails (30 min)
4. Monitor for 24-48 hours
5. Read CAMPAIGN_TESTING_GUIDE.md (30 min)
6. Iterate and improve (ongoing)

### Advanced (Scaling up)
**Time**: Ongoing
1. Review CAMPAIGN_TESTING_GUIDE.md (30 min)
2. Read CAMPAIGN_SYSTEM_SUMMARY.md (reference)
3. Generate batches of 100-200
4. A/B test signals and variants
5. Optimize based on data
6. Customize templates

---

## 🔍 Quick Look-Ups

### "How do I...?"

**Generate my first campaign?**
→ START_HERE.md → Step 2 (Dry Run Test)

**Test email quality?**
→ QUICK_REFERENCE.md → Quality Checks section

**Approve campaigns?**
→ LAUNCH_CHECKLIST.md → Step 11 (Manual Review)

**Export to CSV?**
→ Any guide → Look for `pnpm campaign:export`

**Fix a bad email?**
→ QUICK_REFERENCE.md → Common Fixes section

**Understand the system?**
→ CAMPAIGN_SYSTEM_SUMMARY.md → System Architecture

**Troubleshoot issues?**
→ CAMPAIGN_README.md → Support & Troubleshooting

**See success metrics?**
→ START_HERE.md → Success Metrics section

**Learn best practices?**
→ CAMPAIGN_TESTING_GUIDE.md → Tips for Success

---

## 💡 Pro Tips

### For Fastest Onboarding
1. Read START_HERE.md (15 min)
2. Run `pnpm db:migrate` and `pnpm campaign:status`
3. Open QUICK_REFERENCE.md in separate tab
4. Follow LAUNCH_CHECKLIST.md checkboxes
5. Keep this index open for navigation

### For Best Results
1. Always start with DRY_RUN=true
2. Test with 10-20 emails first
3. Review samples carefully
4. Monitor closely after first send
5. Iterate based on data

### For Scaling
1. Master small batches first
2. Automate what works
3. Track variant performance
4. A/B test systematically
5. Optimize continuously

---

## 📊 System Status

✅ **Complete and Production-Ready**

- Database schema: ✅
- Generation scripts: ✅
- Quality testing: ✅
- Review tools: ✅
- Export system: ✅
- Documentation: ✅
- Example workflows: ✅

**Ready to launch!**

---

## 🚀 Next Step

**Start here**: [START_HERE.md](./START_HERE.md)

Then run:
```bash
pnpm db:migrate
pnpm campaign:status
```

**Good luck with your campaign!** 🎉
