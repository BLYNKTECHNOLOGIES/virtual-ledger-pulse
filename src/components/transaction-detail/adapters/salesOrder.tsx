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
      .select('*, products:product_id ( code, name )')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error('Sales order not found');

    const qty = Number(data.quantity || 0);
    const unit = Number(data.price_per_unit || 0);
    const productCode = (data as any).products?.code || '—';
    const productName = (data as any).products?.name || '';

    return {
      title: `Sales Order ${data.order_number || ''}`.trim(),
      subtitle: data.client_name || undefined,
      badge: { label: String(data.status || '—') },
      fields: [
        { label: 'Date', value: data.order_date ? format(new Date(data.order_date), 'dd MMM yyyy') : '—' },
        { label: 'Status', value: String(data.status || '—') },
        { label: 'Payment Status', value: String(data.payment_status || '—') },
        { label: 'Asset', value: `${productCode}${productName ? ` · ${productName}` : ''}` },
        { label: 'Quantity', value: qty.toLocaleString('en-IN', { maximumFractionDigits: 8 }) },
        { label: 'Unit Price (₹)', value: formatINR(unit) },
        { label: 'Total (₹)', value: formatINR(Number(data.total_amount || 0)) },
        { label: 'Net Amount (₹)', value: formatINR(Number(data.net_amount || 0)) },
        { label: 'USDT Amount', value: data.usdt_amount ? Number(data.usdt_amount).toLocaleString('en-IN', { maximumFractionDigits: 8 }) : '—' },
        { label: 'Client Phone', value: data.client_phone || '—' },
        { label: 'Sale Type', value: data.sale_type || '—' },
        { label: 'Description', value: data.description || '—', span: 2 },
      ],
      deepLink: { route: `/sales?orderId=${data.id}`, label: 'Open in Sales', permission: 'sales_view' },
    };
  },
};
