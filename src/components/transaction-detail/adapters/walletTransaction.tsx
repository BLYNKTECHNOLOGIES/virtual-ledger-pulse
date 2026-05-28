import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import type { TransactionAdapter } from '../types';

export const walletTransactionAdapter: TransactionAdapter = {
  type: 'wallet_transaction',
  modulePermission: 'stock_view',
  async fetch(id) {
    const { data, error } = await supabase
      .from('wallet_transactions')
      .select('*, wallets ( wallet_name )')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error('Wallet transaction not found');

    const amount = Number(data.amount || 0);
    const before = Number(data.balance_before || 0);
    const after = Number(data.balance_after || 0);

    return {
      title: `${data.transaction_type || 'Wallet Transaction'} · ${data.asset_code || ''}`.trim(),
      subtitle: (data as any).wallets?.wallet_name || undefined,
      badge: {
        label: data.is_reversed ? 'REVERSED' : String(data.transaction_type || '—'),
        tone: data.is_reversed ? 'danger' : 'default',
      },
      fields: [
        { label: 'Date', value: data.created_at ? format(new Date(data.created_at), 'dd MMM yyyy, HH:mm:ss') : '—' },
        { label: 'Type', value: String(data.transaction_type || '—') },
        { label: 'Asset', value: data.asset_code || '—' },
        { label: 'Amount', value: amount.toLocaleString('en-IN', { maximumFractionDigits: 8 }) },
        { label: 'Balance Before', value: before.toLocaleString('en-IN', { maximumFractionDigits: 8 }) },
        { label: 'Balance After', value: after.toLocaleString('en-IN', { maximumFractionDigits: 8 }) },
        { label: 'Effective USDT Qty', value: data.effective_usdt_qty ? Number(data.effective_usdt_qty).toLocaleString('en-IN', { maximumFractionDigits: 8 }) : '—' },
        { label: 'Market Rate (USDT)', value: data.market_rate_usdt ? Number(data.market_rate_usdt).toLocaleString('en-IN', { maximumFractionDigits: 6 }) : '—' },
        { label: 'Reference Type', value: data.reference_type || '—' },
        { label: 'Reference ID', value: data.reference_id || '—' },
        { label: 'Description', value: data.description || '—', span: 2 },
      ],
      deepLink: { route: `/stock?txId=${data.id}`, label: 'Open in Stock', permission: 'stock_view' },
    };
  },
};
