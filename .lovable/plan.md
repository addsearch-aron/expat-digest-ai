

## Loosen prompt for `suggest-feeds` to improve recall

Replace the current strict prompt in `supabase/functions/suggest-feeds/index.ts` with the user-supplied version. Server-side URL validation already filters bad results, so allowing the model to be slightly more permissive should raise valid-feed yield without lowering quality.

### Changes

**File:** `supabase/functions/suggest-feeds/index.ts`

1. **System prompt** — replace existing string with the new one:
   - Frames model as expert on local/regional/national outlets.
   - Defines `city` / `region` / `country` levels explicitly.
   - Allows "reasonably likely" URLs since validation happens server-side.
   - Keeps quantity targets: city 2-3, region 3-5, country 5-10.
   - Keeps at most 1-2 English sources for expats.
   - Adds guidance to fall back to nearest real metro outlet rather than promoting national feeds to city level.

2. **User prompt** — keep current template (city, country, language interpolation). No change needed since the system prompt now carries the location context wording.

3. **Tool schema** — unchanged: `{ feeds: [{ url, title, level, description, publisher }] }`.

4. **Validation, model (`gpt-4.1`), auth, rate limiting** — all unchanged.

### Out of scope
- Two-pass prompting (deferred)
- Debug query param (deferred)
- Model swap or validator changes

### Expected impact
- Slightly more candidates per request (especially regional and national), most of which should pass validation.
- City-level results still constrained by reality for small towns like Sitges, but national/regional yield should improve noticeably.

