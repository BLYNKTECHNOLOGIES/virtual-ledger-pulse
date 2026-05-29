export type TransactionType =
  | 'purchase_order'
  | 'sales_order'
  | 'bank_transaction'
  | 'wallet_transaction'
  | 'product_conversion';

import type { ReactNode } from 'react';

export interface DetailField {
  label: string;
  value: ReactNode;
  span?: 1 | 2;
}

export interface TransactionAdapterResult {
  title: string;
  subtitle?: string;
  badge?: { label: string; tone?: 'default' | 'success' | 'danger' | 'muted' };
  fields: DetailField[];
  deepLink?: { route: string; label: string; permission: string };
}

export interface TransactionAdapter {
  type: TransactionType;
  modulePermission: string;
  fetch: (id: string) => Promise<TransactionAdapterResult>;
}
