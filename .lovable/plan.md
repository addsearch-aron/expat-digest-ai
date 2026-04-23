

## Per-Item Evaluation Details with Side-by-Side Comparison

You'll be able to expand each evaluation card and see the original text, the model's output, and the judge's verdict + explanation for every sampled item.

### What you'll see per evaluation

**Summary Faithfulness** (per article)
- Article title
- **Original content** (excerpt from the source article, ~500 chars)
- **Generated summary** (the paragraph the model produced)
- Verdict badge: `Supported` / `Partial` / `Not supported`
- Judge's explanation (why the verdict)

**Translation Quality** (per article, 10 sampled)
- Article title
- **Original text** (title + summary in source language)
- **Translated text** (title + summary in your preferred language)
- Verdict badge: `Accurate` / `Minor issues` / `Major distortion`
- Judge's explanation pointing to the specific issue

**Topic Classification** (per article, 10 sampled)
- Article title + content excerpt
- **Expected topic** (judge's independent classification)
- **Predicted topic** (what the model assigned)
- Status: ✓ match / ✗ mismatch
- Judge's reasoning when they disagree

### Implementation

**Backend — `supabase/functions/evaluate/index.ts`**
Expand the `details` payload returned by each evaluation to include the source fields needed for comparison:
- Faithfulness: add `originalContent` (truncated article content) and `generatedSummary` to each detail row
- Translation: add `originalTitle`, `originalSummary`, `translatedTitle`, `translatedSummary`
- Classification: add `articleTitle`, `contentExcerpt`, plus existing `expected` / `predicted`
- Ensure the judge prompt requests an `explanation` field for every item (already present for translation; add for faithfulness and classification)

**Frontend — `src/pages/EvaluationPage.tsx`**
Under each card, add a `<Collapsible>` "View details (N items)" section. Each item renders as a sub-card with:
- Two-column layout (Original | Output) on desktop, stacked on mobile
- Verdict badge (green/yellow/red) at the top right
- Explanation text below the comparison
Uses existing Badge, Collapsible, and Card components — no new dependencies.

### Out of scope
- No DB schema changes (everything fits in the existing `evaluation_results.results` JSONB)
- No history browser for past eval runs (current run only)
- No re-running individual items

