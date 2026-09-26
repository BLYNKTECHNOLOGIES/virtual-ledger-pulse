ALTER TABLE public.wallets ADD COLUMN IF NOT EXISTS closed_at timestamptz, ADD COLUMN IF NOT EXISTS closed_by uuid, ADD COLUMN IF NOT EXISTS close_reason text;

CREATE OR REPLACE FUNCTION public.is_super_admin_user(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (SELECT 1 FROM public.get_super_admin_ids() s WHERE s.user_id=_uid)
$$;

CREATE OR REPLACE FUNCTION public.close_wallet(p_wallet_id uuid, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE w record; adj_id uuid; b record; n int := 0; v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR NOT public.is_super_admin_user(v_uid) THEN
    RAISE EXCEPTION 'Only Super Admin can close a wallet';
  END IF;
  IF coalesce(trim(p_reason),'')='' THEN RAISE EXCEPTION 'Reason is required'; END IF;
  SELECT * INTO w FROM public.wallets WHERE id=p_wallet_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Wallet not found'; END IF;
  IF w.closed_at IS NOT NULL THEN RAISE EXCEPTION 'Wallet is already closed'; END IF;
  IF lower(w.wallet_name)='balance adjustment wallet' THEN RAISE EXCEPTION 'The Balance Adjustment Wallet cannot be closed'; END IF;
  SELECT id INTO adj_id FROM public.wallets WHERE lower(wallet_name)='balance adjustment wallet' LIMIT 1;
  IF adj_id IS NULL THEN RAISE EXCEPTION 'Balance Adjustment Wallet missing'; END IF;

  FOR b IN SELECT asset_code, balance FROM public.wallet_asset_balances WHERE wallet_id=p_wallet_id AND abs(balance) > 0 LOOP
    INSERT INTO public.wallet_transactions(wallet_id, transaction_type, amount, reference_type, description, created_by, asset_code)
    VALUES (p_wallet_id, CASE WHEN b.balance>0 THEN 'DEBIT' ELSE 'CREDIT' END, abs(b.balance), 'MANUAL_ADJUSTMENT',
            'Wallet closed: '||p_reason, v_uid, b.asset_code);
    INSERT INTO public.wallet_transactions(wallet_id, transaction_type, amount, reference_type, description, created_by, asset_code)
    VALUES (adj_id, CASE WHEN b.balance>0 THEN 'CREDIT' ELSE 'DEBIT' END, abs(b.balance), 'MANUAL_ADJUSTMENT',
            'Wallet closed ('||w.wallet_name||'): '||p_reason, v_uid, b.asset_code);
    n := n+1;
  END LOOP;

  UPDATE public.wallets SET is_active=false, closed_at=now(), closed_by=v_uid, close_reason=p_reason, updated_at=now() WHERE id=p_wallet_id;
  RETURN jsonb_build_object('zeroed_assets', n);
END $$;

CREATE OR REPLACE FUNCTION public.reopen_wallet(p_wallet_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_super_admin_user(auth.uid()) THEN
    RAISE EXCEPTION 'Only Super Admin can reopen a wallet';
  END IF;
  UPDATE public.wallets SET is_active=true, closed_at=NULL, closed_by=NULL, close_reason=NULL, updated_at=now()
  WHERE id=p_wallet_id AND closed_at IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Wallet is not closed'; END IF;
END $$;

-- Block new postings to a closed wallet
CREATE OR REPLACE FUNCTION public.block_closed_wallet_tx()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.wallets WHERE id=NEW.wallet_id AND closed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Wallet is closed. Reopen it before posting entries.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_block_closed_wallet_tx ON public.wallet_transactions;
CREATE TRIGGER trg_block_closed_wallet_tx BEFORE INSERT ON public.wallet_transactions FOR EACH ROW EXECUTE FUNCTION public.block_closed_wallet_tx();

-- Prevent reactivating a closed wallet through a plain edit
CREATE OR REPLACE FUNCTION public.guard_closed_wallet_active()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
  IF NEW.closed_at IS NOT NULL AND NEW.is_active THEN NEW.is_active := false; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_closed_wallet_active ON public.wallets;
CREATE TRIGGER trg_guard_closed_wallet_active BEFORE UPDATE ON public.wallets FOR EACH ROW EXECUTE FUNCTION public.guard_closed_wallet_active();

REVOKE ALL ON FUNCTION public.close_wallet(uuid,text), public.reopen_wallet(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_wallet(uuid,text), public.reopen_wallet(uuid) TO authenticated;