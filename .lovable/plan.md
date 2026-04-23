

## Increase yield: have LLM keep most relevant Feedspot candidates

**Problem:** Feedspot returns 17 candidates for Spanish news, but the LLM picks only 4. The user manually identified 7+ relevant feeds on the same page. The model is over-filtering because (a) candidates are bare URLs with no context, (b) the prompt biases toward caution, and (c) there's no explicit "keep most" instruction.

### Changes — `supabase/functions/suggest-feeds/index.ts` only

**1. Extract publisher hints from Feedspot HTML, not just URLs.**
Feedspot list pages have a predictable structure: each entry has a heading (publisher name) followed by the feed link. Update `fetchFeedspotPage` to:
- Capture the `<h2>`/`<h3>`/`<h4>` text or anchor text near each extracted URL (look back ~500 chars in the HTML for the nearest heading or `<a ...>Name</a>`).
- Return `{ url, publisher }` with publisher populated when extractable.
- Pass these to the LLM as `- {publisher}: {url}` lines instead of bare URLs.

This gives the LLM enough context to confidently keep entries instead of dropping unknown URLs.

**2. Rewrite shortlist instructions in system prompt to maximize keep-rate.**
Replace the current "Important" block with:
> "You will receive a shortlist of candidate feeds discovered from a curated public RSS directory. Treat these as **pre-vetted real publishers**. Your job is to (a) **keep every candidate that plausibly serves a {language}-speaking expat in {country}** — when in doubt, keep it; the validator drops broken URLs. (b) Drop only obvious non-news entries (podcasts unrelated to news, single-topic hobby blogs, defunct sites). (c) Classify each kept entry as city / region / country. (d) You may add 0-3 additional well-known feeds you are confident exist."

**3. Raise quantity targets to match shortlist size.**
- city: 1-3 (unchanged)
- region: 3-6 (was 3-5)
- country: **6-15** (was 5-10) — when shortlist has 15+ candidates, allow keeping most.
- Add: "If the shortlist contains more than {target} relevant publishers, return more — do not artificially cap."

**4. Soften the "Avoid niche blogs / Prioritize quality over quantity" lines** — these conflict with the goal of keeping shortlist entries. Replace with: "For shortlist candidates, default to keeping. Quality filtering applies primarily to feeds you add yourself."

**5. Pass candidate count into the user prompt** so the model sees an explicit expectation:
> "The shortlist below contains {N} candidates. Aim to keep the majority that serve a {language}-speaking expat audience."

### Expected impact
- Spanish/Spain query: 17 candidates → LLM keeps ~10-13 → validator yields 6-10 valid feeds (vs current 4).
- Small/obscure locations unaffected (shortlist will simply be smaller).

### Out of scope
- Caching Feedspot pages.
- Switching parsing to a real HTML parser (regex with backward-search heading lookup is sufficient).
- Changing model, validator, auth, or rate-limit logic.

