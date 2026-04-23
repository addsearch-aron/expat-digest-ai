

## Fix Misaligned Article ↔ Summary/Translation Pairing

You were right — this is a pairing bug, not a hallucination. The translator did its job correctly; it just got handed the wrong source.

### Root cause

In `supabase/functions/digest/index.ts`, articles are processed in batches of 10 via a single LLM call (`batchSummarize` and `batchSummarizeAndTranslate`). The code blindly trusts that the model returns:
1. Exactly the same number of results as articles sent
2. In the same order

When the model returns a result with one item dropped, merged, or reordered, the loop `batch.forEach((b, j) => articleData.set(b.idx, results[j]))` assigns each article whatever summary/translation sits at the same array index — silently mismatching every article after the first dropped/swapped item.

That's why the screenshot shows a Spanish title about "musical brand identity" paired with an English text about "TecnoCampus anthem". Both pieces are real, both are internally consistent — they just belong to two different source articles in the same batch.

A second, smaller bug in the eval display: `evaluate/index.ts` reads `article.title`, but for translated articles the stored `title` is already the **translated** title (line 395 of digest). So the eval card's "Original (Spanish)" header sometimes shows English text. We'll fix that too.

### The fix

**1. Anchor batch results by ID, not array index** (`supabase/functions/digest/index.ts`)

Change both batch prompts to require an `id` field (the index passed in) on every returned result, and look up by that id instead of trusting position:

- Send articles as `Article id=0: ...`, `Article id=1: ...`
- Require the JSON response to include `id` on each result object
- Build a `Map<id, result>` and look up `results.find(r => r.id === j)` (or via the map) when assigning back to `batch[j]`
- If a result is missing for a given id, log a warning and fall back to `[title]` for that article (no silent mis-pairing)
- Validate `results.length === batch.length`; if not, log it and process only the matched ids

This applies to:
- `batchSummarize` (same-language path)
- `batchSummarizeAndTranslate` (foreign-language path)
- `batchClassifyAndDetect` (same risk for classification + language detection)

**2. Store the original title alongside the translated one** (`supabase/functions/digest/index.ts`)

Currently `articles.title` holds the translated title for foreign articles, so the eval has no way to show the true original. Add an `original_title` field to the insert payload (always set to `f.item.title`, the source RSS title). No DB migration is strictly required — the `articles` table likely accepts it; we'll confirm and add a column via migration if needed.

**3. Show the true original in the Translation eval** (`supabase/functions/evaluate/index.ts` and `EvaluationPage.tsx`)

- Backend: in `evaluateTranslation`, return `original_title` (from the new column, falling back to `article.title` for legacy rows) and keep `translated_title` separate.
- Frontend: render "Original" block with `original_title + original_summary`, "Translation" block with `translated_title + translated_summary`. This makes any remaining mis-pairing obvious at a glance.

**4. Add a sanity check in the eval itself** (`supabase/functions/evaluate/index.ts`)

Extend the judge prompt to also flag *topic mismatch between original and translation* as a possible "major distortion: source/translation appear to be different articles". This surfaces pairing bugs in future runs even if they slip past the code fix.

### Out of scope

- No retroactive fix of currently-stored mis-paired articles (they roll off via the 2-day retention; next digest run uses the fixed code)
- No change to thin-source handling — that fix from earlier stays as-is
- No change to classification accuracy logic, only the batch-pairing safety

### Files changed

- `supabase/functions/digest/index.ts` — id-anchored batch pairing in all three batch helpers; store `original_title`
- `supabase/functions/evaluate/index.ts` — return original title; add pairing-mismatch hint to judge prompt
- `src/pages/EvaluationPage.tsx` — render original title above original summary in Translation detail card
- `supabase/migrations/` — add `original_title text` column to `articles` if not already present

