-- Create function to update timestamps
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  city TEXT DEFAULT '',
  preferred_language TEXT DEFAULT 'English',
  topics TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- User feeds table
CREATE TABLE public.user_feeds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  feed_url TEXT NOT NULL,
  title TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_feeds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own feeds" ON public.user_feeds FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own feeds" ON public.user_feeds FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own feeds" ON public.user_feeds FOR DELETE USING (auth.uid() = user_id);

-- Articles table
CREATE TABLE public.articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  source TEXT DEFAULT '',
  url TEXT NOT NULL,
  content TEXT DEFAULT '',
  published_at TIMESTAMPTZ,
  language TEXT DEFAULT '',
  topic TEXT DEFAULT '',
  summary TEXT[] DEFAULT '{}',
  translated_summary TEXT[] DEFAULT '{}',
  is_translated BOOLEAN DEFAULT false,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own articles" ON public.articles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own articles" ON public.articles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own articles" ON public.articles FOR DELETE USING (auth.uid() = user_id);

-- Auto-delete articles older than 2 days
CREATE OR REPLACE FUNCTION public.delete_old_articles()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM public.articles WHERE created_at < now() - INTERVAL '2 days';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER cleanup_old_articles
AFTER INSERT ON public.articles
FOR EACH ROW EXECUTE FUNCTION public.delete_old_articles();

-- Evaluation results table
CREATE TABLE public.evaluation_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  eval_type TEXT NOT NULL,
  results JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.evaluation_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own evaluations" ON public.evaluation_results FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own evaluations" ON public.evaluation_results FOR INSERT WITH CHECK (auth.uid() = user_id);