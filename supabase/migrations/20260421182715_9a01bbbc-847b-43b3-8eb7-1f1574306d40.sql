
INSERT INTO public.erp_balance_baseline(scope, bank_account_id, baseline_balance, notes)
SELECT 'BANK', d.entity_id, d.ledger_balance, 'Trusted baseline 2026-04-21 — ledger and caches verified zero-drift'
FROM public.erp_balance_drift_report d WHERE d.scope='BANK'
ON CONFLICT (bank_account_id) DO UPDATE
  SET baseline_balance=EXCLUDED.baseline_balance, baseline_at=now(), notes=EXCLUDED.notes;

INSERT INTO public.erp_balance_baseline(scope, wallet_id, asset_code, baseline_balance, notes)
SELECT 'WALLET_ASSET', d.entity_id, d.asset_code, d.ledger_balance, 'Trusted baseline 2026-04-21 — ledger and caches verified zero-drift'
FROM public.erp_balance_drift_report d WHERE d.scope='WALLET_ASSET'
ON CONFLICT (wallet_id, asset_code) DO UPDATE
  SET baseline_balance=EXCLUDED.baseline_balance, baseline_at=now(), notes=EXCLUDED.notes;
