-- Cache the normalized order feed used for crypto inventory
DROP MATERIALIZED VIEW IF EXISTS public.fin_crypto_order_mv;
CREATE MATERIALIZED VIEW public.fin_crypto_order_mv AS
SELECT * FROM public.fin_crypto_order_v;

CREATE UNIQUE INDEX fin_crypto_order_mv_pk ON public.fin_crypto_order_mv (side, order_id);
CREATE INDEX fin_crypto_order_mv_date ON public.fin_crypto_order_mv (order_date);

GRANT SELECT ON public.fin_crypto_order_mv TO authenticated;
GRANT ALL ON public.fin_crypto_order_mv TO service_role;

CREATE OR REPLACE VIEW public.fin_crypto_excluded_orders_v AS
SELECT o.side, o.order_id, o.order_number, o.order_date, o.counterparty,
       o.qty AS recorded_quantity, o.total_amount, round(o.implied_rate, 6) AS implied_rate,
       'Implied rate below INR 70 per unit - quantity field is a data error'::text AS reason
FROM public.fin_crypto_order_mv o
WHERE o.implied_rate IS NOT NULL AND o.implied_rate < 70;

CREATE OR REPLACE FUNCTION public.fin_crypto_inventory(p_as_of date DEFAULT CURRENT_DATE)
RETURNS TABLE(purchased_qty numeric, sold_qty numeric, fee_qty numeric,
              derived_qty numeric, wallet_qty numeric, variance_pct numeric,
              wac_rate numeric, excluded_orders bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH clean AS (
    SELECT * FROM public.fin_crypto_order_mv o
    WHERE o.order_date <= p_as_of
      AND (o.implied_rate IS NULL OR o.implied_rate >= 70)
  ),
  agg AS (
    SELECT
      COALESCE(sum(qty) FILTER (WHERE side='PURCHASE'),0) AS buy,
      COALESCE(sum(qty) FILTER (WHERE side='SALE'),0)     AS sell,
      CASE WHEN COALESCE(sum(qty) FILTER (WHERE side='PURCHASE' AND implied_rate IS NOT NULL),0) > 0
           THEN sum(total_amount) FILTER (WHERE side='PURCHASE' AND implied_rate IS NOT NULL)
                / sum(qty) FILTER (WHERE side='PURCHASE' AND implied_rate IS NOT NULL)
           ELSE NULL END AS wac
    FROM clean
  ),
  fees AS (
    SELECT COALESCE(sum(fd.fee_amount),0) AS fee_qty
    FROM public.wallet_fee_deductions fd
    WHERE fd.created_at::date <= p_as_of
  ),
  held AS (
    SELECT COALESCE(sum(balance),0) AS wallet_qty
    FROM public.wallet_asset_balances WHERE asset_code = 'USDT'
  ),
  ex AS (SELECT count(*) AS n FROM public.fin_crypto_order_mv e
         WHERE e.order_date <= p_as_of AND e.implied_rate IS NOT NULL AND e.implied_rate < 70)
  SELECT a.buy, a.sell, f.fee_qty,
         a.buy - a.sell - f.fee_qty,
         h.wallet_qty,
         CASE WHEN h.wallet_qty <> 0
              THEN abs((a.buy - a.sell - f.fee_qty) - h.wallet_qty) / abs(h.wallet_qty) * 100
              ELSE NULL END,
         a.wac,
         ex.n
  FROM agg a, fees f, held h, ex;
$$;

CREATE OR REPLACE FUNCTION public.fin_crypto_entity_allocation(p_as_of date DEFAULT CURRENT_DATE)
RETURNS TABLE(subsidiary_id uuid, legal_name text, purchase_value numeric, share_pct numeric,
              allocated_qty numeric, mapped_qty numeric, basis text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH inv AS (SELECT * FROM public.fin_crypto_inventory(p_as_of)),
  shares AS (
    SELECT o.subsidiary_id, sum(o.total_amount) AS purchase_value
    FROM public.fin_crypto_order_mv o
    WHERE o.side = 'PURCHASE' AND o.order_date <= p_as_of
      AND (o.implied_rate IS NULL OR o.implied_rate >= 70)
    GROUP BY o.subsidiary_id
  ),
  tot AS (SELECT COALESCE(sum(purchase_value),0) AS v FROM shares),
  mapped AS (
    SELECT h.subsidiary_id, sum(h.quantity) AS mapped_qty
    FROM public.fin_wallet_entity_holdings_v h
    WHERE h.subsidiary_id IS NOT NULL AND h.asset_code = 'USDT'
    GROUP BY h.subsidiary_id
  )
  SELECT s.subsidiary_id,
         sub.firm_name,
         s.purchase_value,
         CASE WHEN tot.v > 0 THEN s.purchase_value / tot.v * 100 ELSE 0 END,
         CASE WHEN tot.v > 0 THEN inv.derived_qty * s.purchase_value / tot.v ELSE 0 END,
         m.mapped_qty,
         CASE WHEN m.mapped_qty IS NOT NULL THEN 'MAPPED_WALLET' ELSE 'PURCHASE_SHARE_ALLOCATION' END
  FROM shares s
  CROSS JOIN tot CROSS JOIN inv
  LEFT JOIN public.subsidiaries sub ON sub.id = s.subsidiary_id
  LEFT JOIN mapped m ON m.subsidiary_id = s.subsidiary_id;
$$;

CREATE OR REPLACE FUNCTION public.fin_crypto_refresh()
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.fin_crypto_order_mv;
  RETURN 'refreshed';
END;
$$;

GRANT EXECUTE ON FUNCTION public.fin_crypto_refresh() TO authenticated, service_role;