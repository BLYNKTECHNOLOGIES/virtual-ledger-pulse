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
      .select(`
        id, order_number, order_date, status, supplier_name,
        total_amount, net_payable_amount, payment_method,
        effective_usdt_qty, market_rate_usdt, notes,
        purchase_order_items ( quantity, unit_price, products ( code, name ) )
      `)
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error('Purchase order not found');

    const items = (data.purchase_order_items as any[]) || [];
    const first = items[0];
    const productCode = first?.products?.code || '—';
    const productName = first?.products?.name || '';
    const qty = Number(first?.quantity || 0);
    const unit = Number(first?.unit_price || 0);
    const effUsdt = Number(data.effective_usdt_qty || 0);

    return {
      title: `Purchase Order ${data.order_number || ''}`.trim(),
      subtitle: data.supplier_name || undefined,
      badge: { label: String(data.status || '—') },
      fields: [
        { label: 'Date', value: data.order_date ? format(new Date(data.order_date), 'dd MMM yyyy') : '—' },
        { label: 'Status', value: String(data.status || '—') },
        { label: 'Asset', value: `${productCode}${productName ? ` · ${productName}` : ''}` },
        { label: 'Quantity', value: qty.toLocaleString('en-IN', { maximumFractionDigits: 8 }) },
        { label: 'Unit Price (₹)', value: formatINR(unit) },
        { label: 'Total (₹)', value: formatINR(Number(data.total_amount || 0)) },
        { label: 'Net Payable (₹)', value: formatINR(Number(data.net_payable_amount || 0)) },
        { label: 'Effective USDT Qty', value: effUsdt.toLocaleString('en-IN', { maximumFractionDigits: 8 }) },
        { label: 'Market Rate (USDT/INR)', value: data.market_rate_usdt ? Number(data.market_rate_usdt).toLocaleString('en-IN', { maximumFractionDigits: 6 }) : '—' },
        { label: 'Payment Method', value: data.payment_method || '—' },
        { label: 'Notes', value: data.notes || '—', span: 2 },
      ],
      deepLink: { route: `/purchase?orderId=${data.id}`, label: 'Open in Purchase', permission: 'purchase_view' },
    };
  },
};
