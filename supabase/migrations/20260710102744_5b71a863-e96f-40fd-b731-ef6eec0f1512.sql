
DROP FUNCTION IF EXISTS public.resolve_client_by_userno(text);

CREATE TABLE public.client_binance_usernos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  cp_userno text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  source text NOT NULL DEFAULT 'order_detail',
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_binance_usernos_cp_userno_key UNIQUE (cp_userno)
);

CREATE INDEX idx_cbu_client_id ON public.client_binance_usernos(client_id);
CREATE INDEX idx_cbu_cp_userno ON public.client_binance_usernos(cp_userno);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_binance_usernos TO authenticated;
GRANT ALL ON public.client_binance_usernos TO service_role;

ALTER TABLE public.client_binance_usernos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read userno mappings"
  ON public.client_binance_usernos FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert userno mappings"
  ON public.client_binance_usernos FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated can update userno mappings"
  ON public.client_binance_usernos FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated can delete userno mappings"
  ON public.client_binance_usernos FOR DELETE TO authenticated USING (true);

INSERT INTO public.client_binance_usernos (client_id, cp_userno, source, first_seen_at, last_seen_at)
SELECT DISTINCT ON (coi.cp_userno)
       cbn.client_id,
       coi.cp_userno,
       'backfill',
       now(),
       now()
FROM cp_order_identity coi
JOIN client_binance_nicknames cbn
  ON lower(cbn.nickname) = lower(coi.nickname) AND cbn.is_active = true
JOIN clients c ON c.id = cbn.client_id AND c.is_deleted = false
WHERE coi.cp_userno IS NOT NULL
ORDER BY coi.cp_userno, coi.create_time DESC NULLS LAST
ON CONFLICT (cp_userno) DO NOTHING;

CREATE OR REPLACE FUNCTION public.link_client_userno(
  p_client_id uuid,
  p_cp_userno text,
  p_source text DEFAULT 'order_detail'
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF p_cp_userno IS NULL OR btrim(p_cp_userno) = '' THEN
    RETURN;
  END IF;

  INSERT INTO public.client_binance_usernos (client_id, cp_userno, source, first_seen_at, last_seen_at)
  VALUES (p_client_id, btrim(p_cp_userno), COALESCE(p_source, 'order_detail'), now(), now())
  ON CONFLICT (cp_userno) DO UPDATE
    SET last_seen_at = now(),
        is_active = true;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_client_by_userno(p_cp_userno text)
RETURNS TABLE(cp_userno text, client_id uuid, client_name text)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT cbu.cp_userno, c.id, c.name
  FROM client_binance_usernos cbu
  JOIN clients c ON c.id = cbu.client_id AND c.is_deleted = false
  WHERE cbu.cp_userno = btrim(p_cp_userno)
    AND cbu.is_active = true
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.get_client_usernos(p_client_id uuid)
RETURNS TABLE(cp_userno text, nicknames text[], order_count bigint)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT cbu.cp_userno,
         COALESCE(array_agg(DISTINCT coi.nickname) FILTER (WHERE coi.nickname IS NOT NULL), '{}') AS nicknames,
         count(coi.order_number) AS order_count
  FROM client_binance_usernos cbu
  LEFT JOIN cp_order_identity coi ON coi.cp_userno = cbu.cp_userno
  WHERE cbu.client_id = p_client_id
    AND cbu.is_active = true
  GROUP BY cbu.cp_userno
  ORDER BY count(coi.order_number) DESC;
$$;
