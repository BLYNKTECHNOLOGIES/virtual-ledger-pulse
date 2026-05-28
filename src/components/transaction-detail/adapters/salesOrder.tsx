import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import type { TransactionAdapter } from '../types';

const formatINR = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n);

export const salesOrderAdapter: TransactionAdapter = {
  type: 'sales_order',
  modulePermission: 'sales_view',
  async fetch(id) {
    const { data, error } = await supabase
      .from('sales_orders')
      .select(`
        id, order_number, order_date, status, client_name,
        total_amount, net_receivable_amount, payment_method,
        notes,
        sales_order_items ( quantity, unit_price, products ( code, name ) )
      `)
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error('Sales order not found');

    const items = (data.sales_order_items as any[]) || [];
    const first = items[0];
    const productCode = first?.products?.code || '—';
    const productName = first?.products?.name || '';
    const qty = Number(first?.quantity || 0);
    const unit = Number(first?.unit_price || 0);

    return {
      title: `Sales Order ${data.order_number || ''}`.trim(),
      subtitle: data.client_name || undefined,
      badge: { label: String(data.status || '—') },
      fields: [
        { label: 'Date', value: data.order_date ? format(new Date(data.order_date), 'dd MMM yyyy') : '—' },
        { label: 'Status', value: String(data.status || '—') },
        { label: 'Asset', value: `${productCode}${productName ? ` · ${productName}` : ''}` },
        { label: 'Quantity', value: qty.toLocaleString('en-IN', { maximumFractionDigits: 8 }) },
        { label: 'Unit Price (₹)', value: formatINR(unit) },
        { label: 'Total (₹)', value: formatINR(Number(data.total_amount || 0)) },
        { label: 'Net Receivable (₹)', value: formatINR(Number(data.net_receivable_amount || 0)) },
        { label: 'Payment Method', value: data.payment_method || '—' },
        { label: 'Notes', value: data.notes || '—', span: 2 },
      ],
      deepLink: { route: `/sales?orderId=${data.id}`, label: 'Open in Sales', permission: 'sales_view' },
    };
  },
};
