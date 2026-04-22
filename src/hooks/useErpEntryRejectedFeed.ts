import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ErpEntryRow, ErpEntrySource } from "@/hooks/useErpEntryFeed";

function fmtAmount(n: number, asset: string) {
  if (!isFinite(n)) return `${n} ${asset}`;
  const abs = Math.abs(n);
  const decimals = abs >= 1 ? 2 : 6;
  return `${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: decimals })} ${asset}`;
}

export interface RejectedErpEntryRow extends ErpEntryRow {
  rejected_at: number;
  rejected_by_name?: string | null;
  rejection_reason?: string | null;
}

const PAGE_LIMIT = 500;

export function useErpEntryRejectedFeed(enabled: boolean = true) {
  return useQuery({
    queryKey: ["erp-entry-rejected-feed"],
    enabled,
    refetchInterval: 60000,
    queryFn: async (): Promise<RejectedErpEntryRow[]> => {
      const [
        actionQueueRes,
        terminalBuyRes,
        terminalSaleRes,
        smallBuysRes,
        smallSalesRes,
        conversionRes,
      ] = await Promise.all([
        supabase
          .from("erp_action_queue")
          .select("*")
          .eq("status", "REJECTED")
          .order("updated_at", { ascending: false })
          .limit(PAGE_LIMIT),
        supabase
          .from("terminal_purchase_sync")
          .select("*")
          .eq("sync_status", "rejected")
          .order("synced_at", { ascending: false })
          .limit(PAGE_LIMIT),
        supabase
          .from("terminal_sales_sync")
          .select("*")
          .eq("sync_status", "rejected")
          .order("synced_at", { ascending: false })
          .limit(PAGE_LIMIT),
        supabase
          .from("small_buys_sync" as any)
          .select("*")
          .eq("sync_status", "rejected")
          .order("time_window_start", { ascending: false })
          .limit(PAGE_LIMIT),
        supabase
          .from("small_sales_sync" as any)
          .select("*")
          .eq("sync_status", "rejected")
          .order("time_window_start", { ascending: false })
          .limit(PAGE_LIMIT),
        supabase
          .from("erp_product_conversions" as any)
          .select("*, wallets:wallet_id(wallet_name), creator:created_by(username), approver:approved_by(username), rejector:rejected_by(username)")
          .eq("status", "REJECTED")
          .order("rejected_at", { ascending: false })
          .limit(PAGE_LIMIT),
      ]);

      const rows: RejectedErpEntryRow[] = [];

      for (const r of (actionQueueRes.data || []) as any[]) {
        const isDeposit = r.movement_type === "deposit";
        const source: ErpEntrySource = isDeposit ? "deposit" : "withdrawal";
        const amount = Number(r.amount || 0);
        const rejectedAt = r.updated_at ? new Date(r.updated_at).getTime() : Date.now();
        rows.push({
          id: `aq:${r.id}`,
          source,
          occurred_at: Number(r.movement_time) || new Date(r.created_at).getTime(),
          asset: r.asset,
          amount,
          amountLabel: fmtAmount(amount, r.asset),
          direction: isDeposit ? "in" : "out",
          label: `${isDeposit ? "Deposit" : "Withdrawal"} · ${fmtAmount(amount, r.asset)}`,
          sublabel: [r.network, r.tx_id ? `${r.tx_id.slice(0, 8)}…` : null].filter(Boolean).join(" · ") || "Binance movement",
          reasonHint: "Rejected Binance movement.",
          raw: r,
          rejected_at: rejectedAt,
          rejection_reason: r.reject_reason ?? r.rejection_reason ?? null,
        });
      }

      for (const r of (terminalBuyRes.data || []) as any[]) {
        const od = r.order_data || {};
        const qty = parseFloat(od.amount || "0");
        const asset = (od.asset || "USDT").toUpperCase();
        const rejectedAt = r.updated_at ? new Date(r.updated_at).getTime() : new Date(r.synced_at).getTime();
        rows.push({
          id: `tp:${r.id}`,
          source: "terminal_buy",
          occurred_at: Number(od.create_time) || new Date(r.synced_at).getTime(),
          asset,
          amount: qty,
          amountLabel: fmtAmount(qty, asset),
          direction: "in",
          label: `Terminal Buy · ${fmtAmount(qty, asset)}`,
          sublabel: [
            r.binance_order_number ? `Order ${r.binance_order_number.slice(-8)}` : null,
            od.pay_method,
            r.counterparty_name,
          ].filter(Boolean).join(" · "),
          reasonHint: "Rejected Binance BUY order.",
          raw: r,
          rejected_at: rejectedAt,
          rejection_reason: r.rejection_reason ?? r.reject_reason ?? null,
        });
      }

      for (const r of (terminalSaleRes.data || []) as any[]) {
        const od = r.order_data || {};
        const qty = parseFloat(od.amount || "0");
        const asset = (od.asset || "USDT").toUpperCase();
        const rejectedAt = r.updated_at ? new Date(r.updated_at).getTime() : new Date(r.synced_at).getTime();
        rows.push({
          id: `ts:${r.id}`,
          source: "terminal_sale",
          occurred_at: Number(od.create_time) || new Date(r.synced_at).getTime(),
          asset,
          amount: qty,
          amountLabel: fmtAmount(qty, asset),
          direction: "out",
          label: `Terminal Sale · ${fmtAmount(qty, asset)}`,
          sublabel: [
            r.binance_order_number ? `Order ${r.binance_order_number.slice(-8)}` : null,
            od.pay_method,
            r.counterparty_name,
          ].filter(Boolean).join(" · "),
          reasonHint: "Rejected Binance SELL order.",
          raw: r,
          rejected_at: rejectedAt,
          rejection_reason: r.rejection_reason ?? r.reject_reason ?? null,
        });
      }

      for (const r of (smallBuysRes.data || []) as any[]) {
        const asset = r.asset_code || "USDT";
        const qty = Number(r.total_quantity || 0);
        const rejectedAt = r.updated_at ? new Date(r.updated_at).getTime() : new Date(r.created_at).getTime();
        rows.push({
          id: `sb:${r.id}`,
          source: "small_buys",
          occurred_at: r.time_window_start ? new Date(r.time_window_start).getTime() : new Date(r.created_at).getTime(),
          asset,
          amount: qty,
          amountLabel: fmtAmount(qty, asset),
          direction: "in",
          label: `Small Buys batch · ${r.order_count} orders · ${fmtAmount(qty, asset)}`,
          sublabel: [
            r.sync_batch_id,
            r.time_window_start && r.time_window_end
              ? `${new Date(r.time_window_start).toLocaleString()} → ${new Date(r.time_window_end).toLocaleString()}`
              : null,
          ].filter(Boolean).join(" · "),
          reasonHint: "Rejected Small Buys batch.",
          raw: r,
          rejected_at: rejectedAt,
          rejection_reason: r.rejection_reason ?? r.reject_reason ?? null,
        });
      }

      for (const r of (smallSalesRes.data || []) as any[]) {
        const asset = r.asset_code || "USDT";
        const qty = Number(r.total_quantity || 0);
        const rejectedAt = r.updated_at ? new Date(r.updated_at).getTime() : new Date(r.created_at).getTime();
        rows.push({
          id: `ss:${r.id}`,
          source: "small_sales",
          occurred_at: r.time_window_start ? new Date(r.time_window_start).getTime() : new Date(r.created_at).getTime(),
          asset,
          amount: qty,
          amountLabel: fmtAmount(qty, asset),
          direction: "out",
          label: `Small Sales batch · ${r.order_count} orders · ${fmtAmount(qty, asset)}`,
          sublabel: [
            r.sync_batch_id,
            r.time_window_start && r.time_window_end
              ? `${new Date(r.time_window_start).toLocaleString()} → ${new Date(r.time_window_end).toLocaleString()}`
              : null,
          ].filter(Boolean).join(" · "),
          reasonHint: "Rejected Small Sales batch.",
          raw: r,
          rejected_at: rejectedAt,
          rejection_reason: r.rejection_reason ?? r.reject_reason ?? null,
        });
      }

      for (const r of (conversionRes.data || []) as any[]) {
        const qty = Number(r.quantity || 0);
        const asset = r.asset_code;
        const tradeTime = (r.metadata as any)?.trade_time
          ? Number((r.metadata as any).trade_time)
          : new Date(r.created_at).getTime();
        const rejectedAt = r.rejected_at ? new Date(r.rejected_at).getTime() : new Date(r.created_at).getTime();
        rows.push({
          id: `cv:${r.id}`,
          source: "conversion",
          occurred_at: tradeTime,
          asset,
          amount: qty,
          amountLabel: fmtAmount(qty, asset),
          direction: r.side === "BUY" ? "in" : "out",
          label: `Conversion · ${r.side} ${fmtAmount(qty, asset)}`,
          sublabel: [r.reference_no, r.wallets?.wallet_name].filter(Boolean).join(" · "),
          reasonHint: "Rejected spot-trade conversion.",
          raw: r,
          rejected_at: rejectedAt,
          rejected_by_name: r.rejector?.username ?? null,
          rejection_reason: r.rejection_reason ?? null,
        });
      }

      // Sort newest-rejected first by default
      rows.sort((a, b) => b.rejected_at - a.rejected_at);
      return rows;
    },
  });
}
