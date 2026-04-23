

## Root cause: confidence rules suppress everything except 1-2 English feeds

### What's happening
Logs from the last 6 Sitges/Spain calls:
- Model proposes only **2-3 feeds total** (down from 6 before the tightening).
- Of those, **0-1 pass validation** because the model now mostly returns one safe English feed (The Local / BBC) and skips the Spanish-language nationals it's less "100% sure" about by exact URL.

The new "URL confidence rules" block, combined with "Prefer precision over recall", made the model so risk-averse that it abandons the quantity targets entirely. The instruction "Only return RSS URLs you are confident exist exactly as written" + "If unsure, omit the entry" effectively overrides the "5-10 country" target. GPT-4.1 has weak calibration for "I know this exact URL", so it collapses to a trivial set.

The previous, looser prompt was actually producing more *validated* feeds (1-3) than the new one (0-1), because validation already filters bad URLs — making the model self-censor as well is double filtering.

### Fix: rebalance the prompt

**File:** `supabase/functions/suggest-feeds/index.ts` — system prompt only.

1. **Remove** the "URL confidence rules" block entirely (lines 176–182). Server-side validation already does this job; asking the model to also gatekeep just suppresses real publishers.

2. **Soften** the "precision over recall" line (173) back to a balanced version:
   > "All URLs are validated server-side, so prefer providing more candidate feeds from real, well-known publishers over withholding. Do not, however, fabricate URLs using generic patterns like `/rss` or `/feed` if you have no specific knowledge of that publisher's feed."

3. **Restore city target to 1-3** (was 0-2). Even small towns usually have 1 nearby metro outlet worth surfacing; 0-2 with the strict rules produced 0 every time.

4. **Add an explicit anchor list cue** to the country-level guidance:
   > "For country-level feeds, prioritize major national publishers and public broadcasters (e.g. national newspapers of record, the country's public radio/TV broadcaster, established wire services). These typically have well-known, stable RSS endpoints."
   This nudges the model toward outlets whose feed URLs it actually knows, without us hardcoding country lists.

5. **Keep** quantity targets: city 1-3, region 3-5, country 5-10.

### Unchanged
- User prompt template
- Tool schema, model (`gpt-4.1`), validator, auth, rate limit

### Expected impact
- Model returns 6-12 candidates again instead of 2-3.
- Validation drops the bad ones (as designed), leaving ~3-6 valid feeds for Sitges-class queries instead of 0-1.

