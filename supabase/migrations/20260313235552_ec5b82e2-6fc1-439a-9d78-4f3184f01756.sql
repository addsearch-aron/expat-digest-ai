ALTER TABLE public.profiles ADD COLUMN digest_hour integer NOT NULL DEFAULT 8;
ALTER TABLE public.profiles ADD COLUMN digest_timezone text NOT NULL DEFAULT 'Europe/Berlin';