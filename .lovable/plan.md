

## Plan: Fix digest errors and make it fast enough for 15 per source

### Problems identified

1. **Auth broken**: `getClaims()` doesn't exist in supabase-js v2. This causes the 500 "Unauthorized" error.
2. **Timeout**: 6 feeds × up to 15 articles = 90 articles. Each article makes 2-4 sequential OpenAI calls (detect language, classify, summarize, translate). That's 180-360 API calls done one-by-one — far exceeding the edge function timeout.

### Solution

#### 1. Fix authentication (`supabase/functions/digest/index.ts`)
Replace `getClaims()` with `auth.getUser(token)` using the anon client (the method that originally worked), or better: use the **service role** client's `auth.admin.getUserById()` after manually decoding the JWT `sub` claim. Simplest reliable approach: decode JWT payload (base64) to extract `sub`, no network call needed.

#### 2. Batch OpenAI calls to drastically reduce API round-trips

- **Combine language detection + classification into one call** per article (2 calls → 1)
- **Process articles in parallel batches** of 5-8 concurrently using `Promise.all`
- **Batch summarization**: summarize multiple articles in one OpenAI call (send 3-5 articles per call, get structured JSON back)
- **Batch translation**: translate multiple articles' bullets in one call

This reduces ~360 sequential calls to ~30-40 parallel batched calls, well within timeout.

#### 3. Add progress logging
Log key milestones (feeds fetched, articles to process, batches complete) for easier debugging.

### Files changed
- `supabase/functions/digest/index.ts` — rewrite auth + batch processing logic

### Estimated reduction
- Before: 180-360 sequential OpenAI calls (~3-6 min)
- After: ~30-40 batched parallel calls (~20-40 sec)

