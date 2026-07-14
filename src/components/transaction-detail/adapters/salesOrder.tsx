import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import type { TransactionAdapter } from '../types';
import { MonoValue } from '../fieldHelpers';

const formatINR = (n: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(n);

export const salesOrderAdapter: TransactionAdapter = {
  type: 'sales_order',
  modulePermission: 'sales_view',
  async fetch(id) {
    const { data, error } = await supabase
      .from('sales_orders')
      .select('*, products:product_id ( code, name ), wallets:wallet_id ( wallet_name ), clients:client_id ( name, client_id )')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error('Sales order not found');

    const qty = Number(data.quantity || 0);
    const unit = Number(data.price_per_unit || 0);
    const productCode = (data as any).products?.code || '—';
    const productName = (data as any).products?.name || '';
    const client = (data as any).clients;

    let createdByName: string | null = null;
    if (data.created_by) {
      const { data: u } = await supabase
        .from('users')
        .select('first_name, last_name, email, username')
        .eq('id', data.created_by)
        .maybeSingle();
      createdByName = [u?.first_name, u?.last_name].filter(Boolean).join(' ') || u?.username || u?.email || null;
    }

    // Fetch payment splits
    const { data: splits } = await supabase
      .from('sales_order_payment_splits')
      .select('amount, payment_method_id, sales_payment_methods:payment_method_id ( name )')
      .eq('sales_order_id', id);

    const splitsLabel = splits && splits.length
      ? splits
          .map((s: any) => `${s.sales_payment_methods?.name || 'Method'}: ${formatINR(Number(s.amount || 0))}`)
          .join(' · ')
      : '—';

    return {
      title: `Sales Order ${data.order_number || ''}`.trim(),
      subtitle: data.client_name || undefined,
      badge: { label: String(data.status || '—') },
      fields: [
        { label: 'Date', value: data.order_date ? format(new Date(data.order_date), 'dd MMM yyyy') : '—' },
        { label: 'Status', value: String(data.status || '—') },
        { label: 'Payment Status', value: String(data.payment_status || '—') },
        { label: 'Settlement Status', value: data.settlement_status || '—' },
        { label: 'Asset', value: `${productCode}${productName ? ` · ${productName}` : ''}` },
        { label: 'Quantity', value: qty.toLocaleString('en-IN', { maximumFractionDigits: 8 }) },
        { label: 'Unit Price (₹)', value: formatINR(unit) },
        { label: 'Total (₹)', value: formatINR(Number(data.total_amount || 0)) },
        { label: 'Fee % / Fee (₹)', value: `${data.fee_percentage ?? 0}% · ${formatINR(Number(data.fee_amount || 0))}` },
        { label: 'Net Amount (₹)', value: formatINR(Number(data.net_amount || 0)) },
        { label: 'USDT Amount', value: data.usdt_amount ? Number(data.usdt_amount).toLocaleString('en-IN', { maximumFractionDigits: 8 }) : '—' },
        { label: 'Effective USDT Qty', value: data.effective_usdt_qty ? Number(data.effective_usdt_qty).toLocaleString('en-IN', { maximumFractionDigits: 8 }) : '—' },
        { label: 'Market Rate (USDT/INR)', value: data.market_rate_usdt ? Number(data.market_rate_usdt).toLocaleString('en-IN', { maximumFractionDigits: 6 }) : '—' },
        { label: 'Client', value: client ? `${client.name}${client.client_code ? ` (${client.client_code})` : ''}` : data.client_name || '—' },
        { label: 'Client Phone', value: data.client_phone || '—' },
        { label: 'Client State', value: data.client_state || '—' },
        { label: 'Sale Type', value: data.sale_type || '—' },
        { label: 'Off-Market', value: data.is_off_market ? 'Yes' : 'No' },
        { label: 'Risk Level', value: data.risk_level || '—' },
        { label: 'Cosmos Alert', value: data.cosmos_alert ? 'Yes' : 'No' },
        { label: 'Wallet', value: (data as any).wallets?.wallet_name || '—' },
        { label: 'Platform', value: data.platform || '—' },
        { label: 'Source', value: data.source || '—' },
        { label: 'Split Payment', value: data.is_split_payment ? 'Yes' : 'No' },
        { label: 'Payment Splits', value: splitsLabel, span: 2 },
        { label: 'Created By', value: createdByName || '—' },
        { label: 'Created At', value: data.created_at ? format(new Date(data.created_at), 'dd MMM yyyy, HH:mm:ss') : '—' },
        { label: 'Settled At', value: data.settled_at ? format(new Date(data.settled_at), 'dd MMM yyyy, HH:mm:ss') : '—' },
        { label: 'Description', value: data.description || '—', span: 2 },
        { label: 'Order ID', value: <MonoValue>{data.id}</MonoValue>, span: 2 },
      ],
      deepLink: { route: `/sales?orderId=${data.id}`, label: 'Open in Sales', permission: 'sales_view' },
    };
  },
};
