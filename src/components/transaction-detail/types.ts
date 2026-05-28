import type { ReactNode } from 'react';

export type TransactionType =
  | 'purchase_order'
  | 'sales_order'
  | 'bank_transaction';

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
  /** Permission required to NAVIGATE to the source module. View-only dialog is always allowed. */
  modulePermission: string;
  /** Fetches the record and returns a normalized render spec. */
  fetch: (id: string) => Promise<TransactionAdapterResult>;
}
