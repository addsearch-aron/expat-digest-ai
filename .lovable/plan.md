

## Fix Hallucinated Translations from Thin RSS Content

The "Major distortion" you saw happens when an RSS item has little or no `content` field. The summarizer falls back to repeating the title, then the translator invents plausible-sounding details to fill the gap. We'll fix it at both stages and surface the cause in the evaluation view.

### 1. Skip thin articles at ingestion (`supabase/functions/digest/index.ts`)

Before sending to the LLM, check the length of the article's `content`. If it's under ~200 characters:
- Skip the LLM call entirely
- Use the title as the summary verbatim
- Skip translation (use original title as both `summary` and `translated_summary`)

No LLM call = no invention. This is the real fix.

### 2. Tighten translator prompt (`supabase/functions/digest/index.ts`)

Add explicit guardrails to the translation system prompt:
- "Translate ONLY what is in the source. Do NOT add facts, names, dates, numbers, or context not present in the input."
- "If the source is a single sentence, output a single sentence. Do not expand."
- "If the source is just a title with no body, return only the translated title — do not invent a summary."

Belt-and-suspenders in case a thin article slips through.

### 3. Show source length + Thin source chip (`src/pages/EvaluationPage.tsx` and `supabase/functions/evaluate/index.ts`)

- Backend: include `originalContentLength` on each Translation and Faithfulness detail row.
- Frontend: in the detail card, show `Original (47 chars)` under the heading. If under 200 chars, add a yellow `Thin source` chip so you can immediately tell "model hallucinated from nothing" apart from "model genuinely mistranslated".

### Out of scope
- No DB schema changes
- No retroactive cleanup of existing thin summaries (they roll off via the 7-day retention)
- No re-running of past evaluations

### Files changed
- `supabase/functions/digest/index.ts` — thin-source skip + tightened translator prompt
- `supabase/functions/evaluate/index.ts` — include source length in details
- `src/pages/EvaluationPage.tsx` — source length display + Thin source chip

