import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import type { TransactionAdapter } from '../types';

const formatINR = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n);

export const purchaseOrderAdapter: TransactionAdapter = {
  type: 'purchase_order',
  modulePermission: 'purchase_view',
  async fetch(id) {
    const { data, error } = await supabase
      .from('purchase_orders')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error('Purchase order not found');

    const qty = Number(data.quantity || 0);
    const unit = Number(data.price_per_unit || 0);
    const effUsdt = Number(data.effective_usdt_qty || 0);

    return {
      title: `Purchase Order ${data.order_number || ''}`.trim(),
      subtitle: data.supplier_name || undefined,
      badge: { label: String(data.status || '—') },
      fields: [
        { label: 'Date', value: data.order_date ? format(new Date(data.order_date), 'dd MMM yyyy') : '—' },
        { label: 'Status', value: String(data.status || '—') },
        { label: 'Asset', value: data.product_name || data.product_category || '—' },
        { label: 'Quantity', value: qty.toLocaleString('en-IN', { maximumFractionDigits: 8 }) },
        { label: 'Unit Price (₹)', value: formatINR(unit) },
        { label: 'Total (₹)', value: formatINR(Number(data.total_amount || 0)) },
        { label: 'Net Payable (₹)', value: formatINR(Number(data.net_payable_amount || 0)) },
        { label: 'Effective USDT Qty', value: effUsdt.toLocaleString('en-IN', { maximumFractionDigits: 8 }) },
        { label: 'Market Rate (USDT/INR)', value: data.market_rate_usdt ? Number(data.market_rate_usdt).toLocaleString('en-IN', { maximumFractionDigits: 6 }) : '—' },
        { label: 'Payment Method', value: data.payment_method_used || data.payment_method_type || '—' },
        { label: 'Bank Account', value: data.bank_account_name || '—' },
        { label: 'Notes', value: data.notes || data.description || '—', span: 2 },
      ],
      deepLink: { route: `/purchase?orderId=${data.id}`, label: 'Open in Purchase', permission: 'purchase_view' },
    };
  },
};
