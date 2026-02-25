
-- Fix ETH negative balance: insert a reconciliation CREDIT to zero it out
-- Current ETH balance is -0.23689059000000001 in wallet 6d9114f1-357b-41ee-8e5a-0dea754d5b4f
-- This was caused by a conversion approval that exceeded actual available balance

INSERT INTO wallet_transactions (
  wallet_id, asset_code, transaction_type, amount, reference_type, description, created_by
) VALUES (
  '6d9114f1-357b-41ee-8e5a-0dea754d5b4f',
  'ETH',
  'CREDIT',
  0.23689059,
  'RECONCILIATION',
  'Reconciliation: zeroing negative ETH balance caused by oversized conversion approval (data integrity fix)',
  'd1a85fd5-f5a8-47af-ae42-e0b4683d82c9'
);

-- Also fix BNB, SOL floating point dust (near zero but showing 5e-17 etc)
-- BNB: 0.00000000000000005
INSERT INTO wallet_transactions (
  wallet_id, asset_code, transaction_type, amount, reference_type, description, created_by
) VALUES (
  '6d9114f1-357b-41ee-8e5a-0dea754d5b4f',
  'BNB',
  'DEBIT',
  0.00000000000000005,
  'RECONCILIATION',
  'Reconciliation: sweep floating-point dust to zero',
  'd1a85fd5-f5a8-47af-ae42-e0b4683d82c9'
);

-- SOL: 0.000000000000002
INSERT INTO wallet_transactions (
  wallet_id, asset_code, transaction_type, amount, reference_type, description, created_by
) VALUES (
  '6d9114f1-357b-41ee-8e5a-0dea754d5b4f',
  'SOL',
  'DEBIT',
  0.000000000000002,
  'RECONCILIATION',
  'Reconciliation: sweep floating-point dust to zero',
  'd1a85fd5-f5a8-47af-ae42-e0b4683d82c9'
);
