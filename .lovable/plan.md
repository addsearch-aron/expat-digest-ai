

## Plan: 15 articles per source

Currently the function caps total processed articles at 15 (line 206) and final output at 10 (line 250). The user wants **15 articles per source** instead.

### Changes to `supabase/functions/digest/index.ts`:

1. **Remove the `maxPerFeed` cap on fetched items** (line 183) — instead, keep all fetched items per feed (RSS already filters to last 24h).

2. **Change `toProcess` limit** (line 206): Instead of a flat `15`, process up to `15 * feeds.length` items (15 per source).

3. **Change final article cap** (line 250): Allow up to `15 * feeds.length` processed articles (15 per source), tracking per-source counts.

4. **Add per-source tracking**: Keep a counter per feed URL, skip articles from a source once it hits 15.

This ensures each feed contributes up to 15 articles to the final digest, with no single source dominating.

