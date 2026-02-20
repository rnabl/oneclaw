# OneClaw SKILLS

## Available Execution Methods

| Method | Avg Time | Avg Cost | Reliability | Use When |
|--------|----------|----------|-------------|----------|
| direct | less than 1s | $0.001 | N/A | Simple questions, no tools needed |
| brave_search | 2s | $0.002 | High | Quick research, finding info |
| apify_gmaps | 15s | $0.05 | Medium | Find businesses, restaurants |
| playwright_single | 10s | $0.02 | Medium | Single page scrape |
| playwright_parallel | 25s | $0.15 | High | Multi-page (fast but may hit limits) |
| golf_booking_hybrid | 25s | $0.17 | High | Best for tee times |
| hvac_contact_hybrid | 120s | $0.25 | High | Lead generation with owner extraction |

## Fallback Chains

### Golf Booking
1. golf_booking_hybrid (parallel + vision)
2. golf_booking_sequential (one-by-one, full logs)
3. show_manual_links (return URLs for user to check)

### Website Scraping
1. playwright_parallel (fast, may hit rate limits)
2. playwright_single (slower, more reliable)
3. brave_search_for_manual (just find the URLs)

### Business Discovery
1. apify_gmaps (structured data)
2. brave_search (fallback search)
3. ask_user_for_urls (manual input)

## Cost Optimization Tips

- Use direct LLM for simple tasks (weather, definitions)
- Use brave_search instead of Playwright for simple lookups
- Batch parallel requests when possible (but monitor for rate limits)
- Cache results in conversation state for follow-up questions

## Pattern Recognition

When you see these patterns, take action:

| Pattern | Meaning | Action |
|---------|---------|--------|
| timeout in logs | Request took too long | Switch to sequential |
| 429 status | Rate limited | Wait 5s, retry or switch method |
| 403 status | Blocked | Try stealth mode or fallback |
| CAPTCHA | Anti-bot detection | Abort, suggest manual |
| Multiple failures | Method unreliable | Update MEMORY.md, use fallback |
