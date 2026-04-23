

## Tighten `suggest-feeds` prompt: confidence-first, fewer city feeds

Update the system prompt in `supabase/functions/suggest-feeds/index.ts` to require high URL confidence and lower city quantity targets.

### Changes

**File:** `supabase/functions/suggest-feeds/index.ts`

1. **Quantity targets** — update:
   - city: **0-2** (was 2-3)
   - region: 3-5 (unchanged)
   - country: 5-10 (unchanged)

2. **Add a new "URL confidence" rules block** to the system prompt:
   - Only return RSS URLs you are confident exist exactly as written.
   - Do NOT construct or guess RSS URLs using common patterns (e.g. `/rss/`, `/feed/`, `/xml`).
   - If unsure of the exact feed URL, omit the entry.
   - Prefer well-known publishers and top-level feeds.
   - Avoid obscure local outlets unless the RSS URL is known with high confidence.
   - City-level feeds are optional and should only be included if clearly known.

3. **Reconcile with prior "recall over conservatism" line** — remove or soften the existing "Prefer recall over extreme conservatism" guidance, since it directly contradicts the new confidence-first rules. Replace with: "Prefer precision over recall: it is better to return fewer high-confidence feeds than many guessed URLs."

### Unchanged
- User prompt template (city/country/language interpolation)
- Tool schema (`feeds: [{ url, title, level, description, publisher }]`)
- Model (`gpt-4.1`), auth, rate limiting, server-side validation

### Expected impact
- Fewer total suggestions, especially at city level for small towns like Sitges.
- Higher proportion of returned URLs should pass server-side validation.
- Trade-off accepted: lower yield, higher trust per result.

