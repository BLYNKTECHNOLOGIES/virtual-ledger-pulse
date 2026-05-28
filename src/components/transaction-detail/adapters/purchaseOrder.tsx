import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import type { TransactionAdapter } from '../types';
import { Attachment, MonoValue } from '../fieldHelpers';

const formatINR = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n);

export const purchaseOrderAdapter: TransactionAdapter = {
  type: 'purchase_order',
  modulePermission: 'purchase_view',
  async fetch(id) {
    const { data, error } = await supabase
      .from('purchase_orders')
      .select('*, bank_accounts:bank_account_id ( account_name, bank_name, account_number ), wallets:wallet_id ( wallet_name )')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error('Purchase order not found');

    const qty = Number(data.quantity || 0);
    const unit = Number(data.price_per_unit || 0);
    const effUsdt = Number(data.effective_usdt_qty || 0);
    const ba = (data as any).bank_accounts;
    const bankLabel = ba
      ? `${ba.account_name || ba.bank_name || ''}${ba.account_number ? ` · ****${String(ba.account_number).slice(-4)}` : ''}`
      : data.bank_account_name || '—';

    let createdByName: string | null = null;
    if (data.created_by) {
      const { data: u } = await supabase
        .from('users')
        .select('name, email')
        .eq('id', data.created_by)
        .maybeSingle();
      createdByName = u?.name || u?.email || null;
    }

    return {
      title: `Purchase Order ${data.order_number || ''}`.trim(),
      subtitle: data.supplier_name || undefined,
      badge: { label: String(data.status || '—') },
      fields: [
        { label: 'Date', value: data.order_date ? format(new Date(data.order_date), 'dd MMM yyyy') : '—' },
        { label: 'Status', value: String(data.status || '—') },
        { label: 'Supplier', value: data.supplier_name || '—' },
        { label: 'Contact Number', value: data.contact_number || '—' },
        { label: 'Asset', value: data.product_name || data.product_category || '—' },
        { label: 'Quantity', value: qty.toLocaleString('en-IN', { maximumFractionDigits: 8 }) },
        { label: 'Unit Price (₹)', value: formatINR(unit) },
        { label: 'Total (₹)', value: formatINR(Number(data.total_amount || 0)) },
        { label: 'Fees (₹)', value: data.fee_amount ? formatINR(Number(data.fee_amount)) : '—' },
        { label: 'Tax (₹)', value: data.tax_amount ? formatINR(Number(data.tax_amount)) : '—' },
        { label: 'TDS Applied', value: data.tds_applied ? `Yes${data.tds_amount ? ` · ${formatINR(Number(data.tds_amount))}` : ''}` : 'No' },
        { label: 'PAN Number', value: data.pan_number || '—' },
        { label: 'Net Payable (₹)', value: formatINR(Number(data.net_payable_amount || 0)) },
        { label: 'Total Paid (₹)', value: data.total_paid ? formatINR(Number(data.total_paid)) : '—' },
        { label: 'Effective USDT Qty', value: effUsdt.toLocaleString('en-IN', { maximumFractionDigits: 8 }) },
        { label: 'Market Rate (USDT/INR)', value: data.market_rate_usdt ? Number(data.market_rate_usdt).toLocaleString('en-IN', { maximumFractionDigits: 6 }) : '—' },
        { label: 'Payment Method', value: data.payment_method_used || data.payment_method_type || '—' },
        { label: 'Bank Account', value: bankLabel },
        { label: 'UPI ID', value: data.upi_id || '—' },
        { label: 'IFSC', value: data.ifsc_code || '—' },
        { label: 'Wallet', value: (data as any).wallets?.wallet_name || '—' },
        { label: 'Warehouse', value: data.warehouse_name || '—' },
        { label: 'Assigned To', value: data.assigned_to || '—' },
        { label: 'Off-Market', value: data.is_off_market ? 'Yes' : 'No' },
        { label: 'Safe Fund', value: data.is_safe_fund ? 'Yes' : 'No' },
        { label: 'Source', value: data.source || '—' },
        { label: 'Created By', value: createdByName || '—' },
        { label: 'Created At', value: data.created_at ? format(new Date(data.created_at), 'dd MMM yyyy, HH:mm:ss') : '—' },
        { label: 'Notes', value: data.notes || data.description || '—', span: 2 },
        { label: 'Order ID', value: <MonoValue>{data.id}</MonoValue>, span: 2 },
        { label: 'Payment Proof', value: <Attachment url={data.payment_proof_url} label="Payment proof" />, span: 2 },
        ...(data.failure_proof_url
          ? [{ label: 'Failure Proof', value: <Attachment url={data.failure_proof_url} label="Failure proof" />, span: 2 as const }]
          : []),
      ],
      deepLink: { route: `/purchase?orderId=${data.id}`, label: 'Open in Purchase', permission: 'purchase_view' },
    };
  },
};
