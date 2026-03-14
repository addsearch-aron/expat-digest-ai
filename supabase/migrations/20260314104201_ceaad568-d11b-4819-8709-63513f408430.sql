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