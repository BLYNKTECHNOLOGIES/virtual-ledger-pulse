DELETE FROM public.client_verified_names cvn
USING public.clients c
WHERE cvn.client_id = c.id
  AND (c.buyer_approval_status  IN ('PENDING','NOT_APPLICABLE') OR c.buyer_approval_status  IS NULL)
  AND (c.seller_approval_status IN ('PENDING','NOT_APPLICABLE') OR c.seller_approval_status IS NULL);

DELETE FROM public.client_binance_nicknames cbn
USING public.clients c
WHERE cbn.client_id = c.id
  AND (c.buyer_approval_status  IN ('PENDING','NOT_APPLICABLE') OR c.buyer_approval_status  IS NULL)
  AND (c.seller_approval_status IN ('PENDING','NOT_APPLICABLE') OR c.seller_approval_status IS NULL);