CREATE TABLE public.public_site_stats_cache (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  payload jsonb NOT NULL,
  computed_at timestamptz NOT NULL DEFAULT now(),
  refresh_started_at timestamptz
);
GRANT ALL ON public.public_site_stats_cache TO service_role;
ALTER TABLE public.public_site_stats_cache ENABLE ROW LEVEL SECURITY;