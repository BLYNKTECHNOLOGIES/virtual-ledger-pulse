-- 1. Wallet -> entity mapping (wallets table is NEVER written to)
CREATE TABLE public.fin_wallet_entity_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id uuid NOT NULL UNIQUE REFERENCES public.wallets(id) ON DELETE CASCADE,
  subsidiary_id uuid NULL REFERENCES public.subsidiaries(id),
  previous_subsidiary_id uuid NULL REFERENCES public.subsidiaries(id),
  assigned_by uuid NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fin_wallet_entity_map TO authenticated;
GRANT ALL ON public.fin_wallet_entity_map TO service_role;
ALTER TABLE public.fin_wallet_entity_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fin_wallet_map_select" ON public.fin_wallet_entity_map
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "fin_wallet_map_admin_write" ON public.fin_wallet_entity_map
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'super_admin'));

-- 2. Assignment log
CREATE TABLE public.fin_wallet_entity_assignment_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id uuid NOT NULL,
  old_subsidiary_id uuid NULL,
  new_subsidiary_id uuid NULL,
  changed_by uuid NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.fin_wallet_entity_assignment_log TO authenticated;
GRANT ALL ON public.fin_wallet_entity_assignment_log TO service_role;
ALTER TABLE public.fin_wallet_entity_assignment_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fin_wallet_log_select" ON public.fin_wallet_entity_assignment_log
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "fin_wallet_log_insert" ON public.fin_wallet_entity_assignment_log
  FOR INSERT TO authenticated WITH CHECK (true);

-- 3. Statement generation log
CREATE TABLE public.fin_balance_sheet_generation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subsidiary_id uuid NULL REFERENCES public.subsidiaries(id),
  period_start date NOT NULL,
  period_end date NOT NULL,
  valuation_basis text NOT NULL DEFAULT 'COST',
  is_draft boolean NOT NULL DEFAULT false,
  failed_checks text[] NOT NULL DEFAULT '{}',
  checksum text,
  totals jsonb NOT NULL DEFAULT '{}'::jsonb,
  export_format text,
  generated_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.fin_balance_sheet_generation_log TO authenticated;
GRANT ALL ON public.fin_balance_sheet_generation_log TO service_role;
ALTER TABLE public.fin_balance_sheet_generation_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fin_bs_log_select" ON public.fin_balance_sheet_generation_log
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "fin_bs_log_insert" ON public.fin_balance_sheet_generation_log
  FOR INSERT TO authenticated WITH CHECK (true);

-- 4. security_invoker on fin_* views only
ALTER VIEW public.fin_bank_entity_map_v        SET (security_invoker = true);
ALTER VIEW public.fin_entity_master_v          SET (security_invoker = true);
ALTER VIEW public.fin_entity_txn_v             SET (security_invoker = true);
ALTER VIEW public.fin_entity_receivable_v      SET (security_invoker = true);
ALTER VIEW public.fin_entity_payable_v         SET (security_invoker = true);
ALTER VIEW public.fin_unattributed_pool_v      SET (security_invoker = true);
ALTER VIEW public.fin_intercompany_v           SET (security_invoker = true);
ALTER VIEW public.fin_intercompany_position_v  SET (security_invoker = true);
ALTER VIEW public.fin_transfer_unpaired_v      SET (security_invoker = true);
ALTER VIEW public.fin_unanchored_accounts_v    SET (security_invoker = true);
ALTER VIEW public.fin_exclusion_disclosure_v   SET (security_invoker = true);
ALTER VIEW public.fin_hash_chain_check_v       SET (security_invoker = true);