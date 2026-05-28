import type { TransactionAdapter, TransactionType } from './types';
import { purchaseOrderAdapter } from './adapters/purchaseOrder';
import { salesOrderAdapter } from './adapters/salesOrder';
import { bankTransactionAdapter } from './adapters/bankTransaction';

const adapters: Record<TransactionType, TransactionAdapter> = {
  purchase_order: purchaseOrderAdapter,
  sales_order: salesOrderAdapter,
  bank_transaction: bankTransactionAdapter,
};

export function getAdapter(type: TransactionType): TransactionAdapter {
  const adapter = adapters[type];
  if (!adapter) throw new Error(`No transaction adapter registered for type "${type}"`);
  return adapter;
}
