

## Add web-search augmentation to `suggest-feeds` (balanced approach)

Augment the LLM-only flow with a real-source discovery step so the model has actual feed URLs to choose from instead of guessing. Target: 4–6 validated feeds per request.

### Approach: hybrid (Feedspot scrape + LLM filter), no new dependencies

1. **Discover candidate feeds from Feedspot** before calling the LLM.
   - Build slugged URLs from the user's location and language and fetch them server-side from the edge function:
     - `https://rss.feedspot.com/{country_slug}_news_rss_feeds/`
     - `https://rss.feedspot.com/{language_slug}_news_rss_feeds/` (e.g. `spanish_news_rss_feeds`)
     - `https://rss.feedspot.com/{city_slug}_news_rss_feeds/` (only if city provided)
   - Parse the returned HTML with a lightweight regex pass to extract candidate feed URLs (links matching `https?://[^"'<> ]+(rss|feed|atom|xml|rss\.xml|/feed/)`), plus the publisher name from the surrounding heading text.
   - Cap at ~30 candidates total, dedupe by URL.
   - Wrap fetches in `Promise.allSettled` with a 4s timeout; if Feedspot returns 404 or fails, fall back to the existing LLM-only flow gracefully.

2. **Pass candidates to the LLM as a curated shortlist.**
   - Add a new section to the user prompt: "Here are candidate feeds discovered from a public directory. Select the ones genuinely relevant to {city}/{country} for a {language}-speaking expat, classify each as city/region/country, and add 0–3 additional well-known feeds you know exist."
   - The LLM's job changes from "recall feed URLs from memory" to "filter and classify a real list" — much higher precision.
   - Keep quantity targets: city 1–3, region 3–5, country 5–10.

3. **Validate as today.** Existing `validateFeed()` runs unchanged on the LLM's final selection.

### Why Feedspot

- Public, no auth, predictable URL slugs per country/language/city.
- Each list page contains the actual feed URLs in plain HTML — extractable with one regex pass, no JS rendering needed.
- For Spain alone: `/spanish_news_rss_feeds/`, `/spain_news_rss_feeds/`, `/madrid_news_rss_feeds/`, `/barcelona_news_rss_feeds/` etc. all exist.

### File changes

- **`supabase/functions/suggest-feeds/index.ts`** — only file touched.
  - Add `slugify()` helper (lowercase, spaces→underscores, strip diacritics).
  - Add `fetchFeedspotCandidates(city, country, language)` returning `{url, publisher}[]`.
  - Insert candidates into the user prompt before the OpenAI call.
  - Soften system prompt to acknowledge the shortlist (remove "you actually know" wording from user prompt).
  - Keep model `gpt-4.1`, validator, auth, rate limit unchanged.

### Out of scope

- Caching Feedspot responses (can add later if rate-limit issues appear).
- Robots.txt compliance review beyond a basic UA string — Feedspot pages are publicly indexed and we fetch ≤3 pages per user request, well under any reasonable threshold.
- Switching to a paid search API (Perplexity/Firecrawl) — only worth doing if Feedspot proves insufficient.

### Expected impact

- Spanish/Sitges-class queries: 8–15 real candidate URLs from Feedspot → LLM picks ~6–10 → validator yields 4–6 valid feeds.
- Big drop in fabricated URLs since the LLM is choosing from a real list, not generating from memory.
- Adds ~500ms–1.5s latency from the parallel Feedspot fetches; acceptable for the balanced trade-off.

