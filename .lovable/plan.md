

## Cache Executive Summaries in Database

### Problem
The `summarize-brief` edge function is called on every page load (line 38 of `DailyBriefPage.tsx`), making a redundant OpenAI API call each time. No caching exists.

### Plan

#### 1. Database migration — `executive_summaries` table
Create a table to store generated summaries with a 7-day retention policy.

```sql
CREATE TABLE public.executive_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  summary text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.executive_summaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own summaries" ON public.executive_summaries FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own summaries" ON public.executive_summaries FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own summaries" ON public.executive_summaries FOR DELETE TO authenticated USING (auth.uid() = user_id);
```

#### 2. Cron job — delete summaries older than 7 days
Add to the existing daily 3 AM UTC cleanup cron:

```sql
SELECT cron.schedule(
  'delete-old-summaries-daily',
  '0 3 * * *',
  $$DELETE FROM public.executive_summaries WHERE created_at < now() - INTERVAL '7 days'$$
);
```

#### 3. `digest` edge function — generate and store summary at digest time
After saving articles (line 354), call OpenAI to generate the executive summary (same logic as `summarize-brief`) and insert it into `executive_summaries`. This means the summary is ready before the user opens the page.

#### 4. `DailyBriefPage.tsx` — cache-first loading
- On page load: query `executive_summaries` for latest row (ordered by `created_at desc`, limit 1). If found, display it immediately — no API call.
- On "Generate Digest" click: after digest completes, fetch the new summary from the table (digest function already saved it).
- Remove the `generateSummary()` call from `loadArticles()`.

### Result
- Page loads instantly with cached summary (one SELECT).
- Summary only regenerated when a new digest runs.
- Old summaries auto-deleted after 7 days.

