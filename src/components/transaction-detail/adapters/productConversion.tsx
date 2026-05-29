import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import type { TransactionAdapter } from '../types';
import { MonoValue } from '../fieldHelpers';
import { formatSmartDecimal } from '@/lib/format-smart-decimal';

export const productConversionAdapter: TransactionAdapter = {
  type: 'product_conversion',
  modulePermission: 'stock_view',
  async fetch(id) {
    const { data, error } = await supabase
      .from('erp_product_conversions' as any)
      .select('*, wallets:wallet_id ( wallet_name ), creator:created_by ( username, first_name, last_name ), approver:approved_by ( username, first_name, last_name ), rejector:rejected_by ( username, first_name, last_name )')
      .eq('id', id)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error('Conversion not found');

    const c = data as any;
    const name = (u: any) =>
      u ? ([u.first_name, u.last_name].filter(Boolean).join(' ') || u.username || '—') : '—';

    const statusTone = c.status === 'APPROVED' ? 'success' : c.status === 'REJECTED' ? 'danger' : 'muted';

    return {
      title: `Conversion ${c.reference_no || ''}`.trim(),
      subtitle: `${c.side} · ${c.asset_code}`,
      badge: { label: c.status === 'PENDING_APPROVAL' ? 'Pending' : String(c.status || '—'), tone: statusTone },
      fields: [
        { label: 'Reference No.', value: c.reference_no || '—' },
        { label: 'Date', value: c.created_at ? format(new Date(c.created_at), 'dd MMM yyyy, HH:mm:ss') : '—' },
        { label: 'Wallet', value: c.wallets?.wallet_name || '—' },
        { label: 'Side', value: c.side || '—' },
        { label: 'Asset', value: c.asset_code || '—' },
        { label: 'Quantity', value: formatSmartDecimal(c.quantity) },
        { label: 'Price (USD)', value: `$${formatSmartDecimal(c.price_usd, 9)}` },
        { label: 'Gross USD Value', value: `$${formatSmartDecimal(c.gross_usd_value)}` },
        { label: 'Fee', value: Number(c.fee_amount) > 0 ? `${formatSmartDecimal(c.fee_amount, 9)} ${c.fee_asset} (${c.fee_percentage ?? 0}%)` : '—' },
        { label: 'Net Asset Change', value: `${c.side === 'BUY' ? '+' : '-'}${formatSmartDecimal(c.net_asset_change)} ${c.asset_code}` },
        { label: 'Net USDT Change', value: `${c.side === 'BUY' ? '-' : '+'}${formatSmartDecimal(c.net_usdt_change)}` },
        { label: 'Execution Rate (USDT)', value: c.execution_rate_usdt ? `$${formatSmartDecimal(c.execution_rate_usdt)}` : '—' },
        { label: 'Cost Out (USDT)', value: c.cost_out_usdt ? `$${formatSmartDecimal(c.cost_out_usdt, 4)}` : '—' },
        { label: 'Realized P&L (USDT)', value: c.realized_pnl_usdt != null ? `${Number(c.realized_pnl_usdt) >= 0 ? '+' : ''}$${formatSmartDecimal(c.realized_pnl_usdt, 4)}` : '—' },
        { label: 'Market Rate Snapshot', value: c.market_rate_snapshot ? formatSmartDecimal(c.market_rate_snapshot) : '—' },
        { label: 'Local Price', value: c.local_price != null ? `${formatSmartDecimal(c.local_price)} ${c.local_currency || 'INR'}` : '—' },
        { label: 'FX Rate to USDT', value: c.fx_rate_to_usdt != null ? formatSmartDecimal(c.fx_rate_to_usdt) : '—' },
        { label: 'Created By', value: name(c.creator) },
        { label: 'Approved By', value: c.status === 'APPROVED' ? `${name(c.approver)}${c.approved_at ? ` · ${format(new Date(c.approved_at), 'dd MMM HH:mm')}` : ''}` : '—' },
        { label: 'Rejected By', value: c.status === 'REJECTED' ? `${name(c.rejector)}${c.rejected_at ? ` · ${format(new Date(c.rejected_at), 'dd MMM HH:mm')}` : ''}` : '—' },
        ...(c.rejection_reason ? [{ label: 'Rejection Reason', value: c.rejection_reason, span: 2 as const }] : []),
        { label: 'Conversion ID', value: <MonoValue>{c.id}</MonoValue>, span: 2 },
      ],
      deepLink: { route: `/stock?tab=conversions&txId=${c.id}`, label: 'Open in Conversions', permission: 'stock_view' },
    };
  },
};
