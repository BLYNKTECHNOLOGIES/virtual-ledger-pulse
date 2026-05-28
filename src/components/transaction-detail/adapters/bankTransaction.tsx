import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import type { TransactionAdapter } from '../types';
import { Attachment, MonoValue } from '../fieldHelpers';

const formatINR = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n);

export const bankTransactionAdapter: TransactionAdapter = {
  type: 'bank_transaction',
  modulePermission: 'bams_view',
  async fetch(id) {
    const { data, error } = await supabase
      .from('bank_transactions')
      .select('*, bank_accounts:bank_account_id ( account_name, bank_name, account_number ), clients:client_id ( name, client_code )')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error('Bank transaction not found');

    const amount = Number(data.amount || 0);
    const isExpense = data.transaction_type === 'EXPENSE';
    const ba = (data as any).bank_accounts;
    const client = (data as any).clients;

    // Resolve creator name
    let createdByName: string | null = null;
    if (data.created_by) {
      const { data: u } = await supabase
        .from('users')
        .select('first_name, last_name, email, username')
        .eq('id', data.created_by)
        .maybeSingle();
      createdByName = u?.name || u?.email || null;
    }

    const bankLabel = ba
      ? `${ba.account_name || ba.bank_name || '—'}${ba.account_number ? ` · ****${String(ba.account_number).slice(-4)}` : ''}`
      : '—';

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
        { label: 'Reference No.', value: data.reference_number || '—' },
        { label: 'Bank Account', value: bankLabel },
        { label: 'Balance Before (₹)', value: data.balance_before != null ? formatINR(Number(data.balance_before)) : '—' },
        { label: 'Balance After (₹)', value: data.balance_after != null ? formatINR(Number(data.balance_after)) : '—' },
        { label: 'Related Account', value: data.related_account_name || '—' },
        { label: 'Client', value: client ? `${client.name}${client.client_code ? ` (${client.client_code})` : ''}` : '—' },
        { label: 'Created By', value: createdByName || '—' },
        { label: 'Created At', value: data.created_at ? format(new Date(data.created_at), 'dd MMM yyyy, HH:mm:ss') : '—' },
        { label: 'Sequence No.', value: data.sequence_no != null ? String(data.sequence_no) : '—' },
        { label: 'Reversed', value: data.is_reversed ? 'Yes' : 'No' },
        ...(data.is_reversed ? [{ label: 'Reversal Reason', value: data.reversal_reason || '—', span: 2 as const }] : []),
        { label: 'Description', value: data.description || '—', span: 2 },
        { label: 'Transaction ID', value: <MonoValue>{data.id}</MonoValue>, span: 2 },
        { label: 'Receipt / Bill', value: <Attachment url={data.bill_url} />, span: 2 },
      ],
      deepLink: { route: `/bams?txId=${data.id}`, label: 'Open in BAMS', permission: 'bams_view' },
    };
  },
};
