import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import type { TransactionAdapter } from '../types';

const formatINR = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n);

export const bankTransactionAdapter: TransactionAdapter = {
  type: 'bank_transaction',
  modulePermission: 'bams_view',
  async fetch(id) {
    const { data, error } = await supabase
      .from('bank_transactions')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error('Bank transaction not found');

    const amount = Number(data.amount || 0);
    const isExpense = data.transaction_type === 'EXPENSE';

    return {
      title: data.category || data.transaction_type || 'Bank Transaction',
      subtitle: data.description || undefined,
      badge: {
        label: String(data.transaction_type || '—'),
        tone: isExpense ? 'danger' : 'success',
      },
      fields: [
        { label: 'Date', value: data.transaction_date ? format(new Date(data.transaction_date), 'dd MMM yyyy') : '—' },
        { label: 'Type', value: String(data.transaction_type || '—') },
        { label: 'Category', value: data.category || '—' },
        { label: 'Amount (₹)', value: formatINR(amount) },
        { label: 'Reference No.', value: (data as any).reference_number || '—' },
        { label: 'Bank Account', value: (data as any).bank_account_id || '—' },
        { label: 'Description', value: data.description || '—', span: 2 },
      ],
      deepLink: { route: `/bams?txId=${data.id}`, label: 'Open in BAMS', permission: 'bams_view' },
    };
  },
};
