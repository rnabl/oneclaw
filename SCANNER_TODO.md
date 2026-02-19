# Website Scanner Integration - Progress & TODO

## ✅ Completed Today

### Code Implementation
- [x] Created comprehensive website scanner (`packages/harness/src/scanners/website-scanner.ts`)
  - 50+ data points per website
  - SEO, contact, social, booking, chatbot, pixel, tech stack detection
  - AI readability scoring (0-100)
  - Batch processing with concurrency control
  
- [x] Integrated scanner into discovery workflow (`packages/harness/src/workflows/discovery.ts`)
  - Replaced HEAD checks with `scanWebsitesBatch()`
  - Updates enrichment fields
  - Scans first 10 businesses with websites
  
- [x] Added dependencies
  - `cheerio ^1.2.0` installed
  - Module exports created
  
- [x] Discord bot improvements
  - Rich embeds with Blurple color
  - Pagination system (in-memory storage)
  - Proper numbering (11, 12, 13...)
  - "Page X/Y" indicators
  - Clickable website links
  - Signal display per business

### Git Commits
- `8a74c85` - Discord rich embeds and pagination
- `a90eb04` - Website scanner integration
- `62fbaf1` - Add cheerio dependency
- `2fdca14` - Update lockfile

## ❌ Issues Found

### Website Scanner Not Working
**Symptom:** Discovery workflow completed but no scanning logs appeared, signals still showing as placeholders

**Possible Causes:**
1. **Import/Module Issue**: Scanner might not be properly imported or built
2. **Runtime Error**: Scanner might be throwing errors that are being caught silently
3. **Type Mismatch**: The enrichment fields might not be getting set properly
4. **Build Cache**: Turbo might be using cached builds without the new scanner code

### Logs Missing
- Expected: Detailed logs like "Scanning websites for enrichment signals", "Scan complete: X/Y accessible"
- Actual: Only generic step logs (step 3: 170 bytes, 112 bytes)
- This suggests the scanner code might not be executing at all

## 🔍 TODO for Tomorrow

### 1. Debug Why Scanner Isn't Running
**Priority: HIGH**

Check:
- [ ] Verify `scanWebsitesBatch` import in `discovery.ts` is correct
- [ ] Check if `packages/harness` is being built by turbo before `apps/api`
- [ ] Add explicit error logging around scanner calls
- [ ] Check if any TypeScript compilation errors are being silently ignored
- [ ] Verify the scanner is exported from `packages/harness/src/scanners/index.ts`
- [ ] Check main harness index exports (`packages/harness/src/index.ts`)

### 2. Add Better Error Handling
**Priority: HIGH**

```typescript
// In discovery.ts, wrap scanner in try-catch with explicit logging
try {
  await ctx.log('info', `About to scan ${websitesToScan.length} websites`);
  const scanResults = await scanWebsitesBatch(websitesToScan, 5, 8000);
  await ctx.log('info', `Scan results: ${JSON.stringify(scanResults.length)}`);
} catch (error) {
  await ctx.log('error', `Scanner failed: ${error.message}`, { error: String(error) });
}
```

### 3. Test Scanner Standalone
**Priority: HIGH**

Create test script to verify scanner works independently:
```typescript
// scripts/test-scanner.ts
import { scanWebsite } from '../packages/harness/src/scanners/website-scanner';

async function test() {
  const result = await scanWebsite('https://example.com', 10000);
  console.log(JSON.stringify(result, null, 2));
}

test();
```

### 4. Check Build Configuration
**Priority: MEDIUM**

- [ ] Verify `packages/harness/tsconfig.json` includes scanners directory
- [ ] Check if turbo is building harness before api
- [ ] Look at `turbo.json` for build dependencies
- [ ] Try `pnpm run build` to see if compilation succeeds

### 5. Alternative: Move Scanner to API Package
**Priority: LOW (fallback option)**

If module resolution is the issue:
- Move scanner to `apps/api/src/scanners/`
- Update imports in `discovery.ts`
- Avoid cross-package import issues

### 6. Verify Schema Fields
**Priority: LOW**

Double-check that enrichment fields in `BusinessSchema` match what we're setting:
- `seoOptimized`
- `hasAds`
- `hasSocials`
- `hasBooking`
- `hasChatbot`
- `aiReadable`

### 7. Add Debug Mode
**Priority: MEDIUM**

Add environment variable to enable verbose scanner logging:
```typescript
if (process.env.DEBUG_SCANNER === 'true') {
  // Log every step of scanning
}
```

## 🐛 Debugging Commands

```bash
# Rebuild everything
pnpm run build

# Check if harness exports scanner
node -e "import('@oneclaw/harness/dist/index.js').then(m => console.log(m))"

# Test scanner directly
npx tsx scripts/test-scanner.ts

# Check TypeScript errors
cd packages/harness && npx tsc --noEmit

# Restart with fresh build
pnpm run clean  # if this exists
pnpm install
pnpm run build
pnpm run dev
```

## 📝 Notes

### Why Scanner Might Not Show Errors
- The `try-catch` in discovery workflow catches all errors
- Errors might be logged at 'debug' level which isn't shown
- Silent failures in Promise.allSettled won't throw

### Expected Behavior
When working correctly, logs should show:
```
[Artifacts] Stored log for step 3: "Scanning websites for enrichment signals"
[Artifacts] Stored log for step 3: "Found 7 businesses with websites"
[Artifacts] Stored log for step 3: "Performing comprehensive scan on 7 websites"
[Artifacts] Stored log for step 3: "Scan complete: 5/7 accessible"
[debug] "Business Name: structured-data, booking:calendly, cms:wordpress"
```

### Quick Win Alternative
If scanner is too complex to debug quickly:
1. Keep the HEAD request approach for now
2. Just check website accessibility (working ✓ or not ✗)
3. Save full scanning for $5 enrichment tier
4. At least show which businesses have working websites

## 📚 Resources

- Scanner implementation: `packages/harness/src/scanners/website-scanner.ts`
- Discovery workflow: `packages/harness/src/workflows/discovery.ts`
- Integration docs: `WEBSITE_SCANNER_INTEGRATION.md`
- Previous logs: terminal 627808.txt (line 37-64)

## 🎯 Success Criteria

Tomorrow's goal is to see this in Discord:
```
1. Joe's Plumbing | (214) 555-0100
Web: [joesplumbing.com](https://joesplumbing.com) | SEO: ✓ | Ads: ✓ | Soc: ✓ | Cal: ✗ | Bot: ✗ | AI: ✓
```

Instead of:
```
1. Joe's Plumbing | (214) 555-0100
Web: [joesplumbing.com](https://joesplumbing.com) | SEO: ? | Ads: ? | Soc: ? | Cal: ? | Bot: ? | AI: ?
```

---

**Status:** Scanner code is written and integrated, but not executing. Debugging needed tomorrow.
**Next Session:** Start with standalone scanner test, then trace through discovery workflow execution.
