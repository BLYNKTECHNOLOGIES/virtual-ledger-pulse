import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getSmallBuysConfig } from "@/hooks/useSmallBuysSync";
import { getSmallSalesConfig } from "@/hooks/useSmallSalesSync";

export type ErpEntrySource =
  | "deposit"
  | "withdrawal"
  | "terminal_buy"
  | "terminal_sale"
  | "small_buys"
  | "small_sales"
  | "conversion";

export interface ErpEntryRow {
  id: string;
  source: ErpEntrySource;
  occurred_at: number; // epoch ms — actual transaction time
  asset: string;
  amount: number;
  amountLabel: string;
  direction: "in" | "out" | "neutral";
  label: string; // primary line
  sublabel: string; // secondary line
  reasonHint: string; // tooltip explanation
  raw: any; // original record passed to dialog
}

const PENDING_TERMINAL_STATUSES = ["synced_pending_approval", "client_mapping_pending"];

function fmtAmount(n: number, asset: string) {
  if (!isFinite(n)) return `${n} ${asset}`;
  const abs = Math.abs(n);
  const decimals = abs >= 1 ? 2 : 6;
  return `${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: decimals })} ${asset}`;
}

export function useErpEntryFeed() {
  return useQuery({
    queryKey: ["erp-entry-feed"],
    refetchInterval: 30000,
    queryFn: async (): Promise<ErpEntryRow[]> => {
      const [
        actionQueueRes,
        terminalBuyRes,
        terminalSaleRes,
        smallBuysRes,
        smallSalesRes,
        conversionRes,
        sbConfig,
        ssConfig,
      ] = await Promise.all([
        supabase
          .from("erp_action_queue")
          .select("*")
          .eq("status", "PENDING")
          .order("movement_time", { ascending: false })
          .limit(500),
        supabase
          .from("terminal_purchase_sync")
          .select("*")
          .in("sync_status", PENDING_TERMINAL_STATUSES)
          .order("synced_at", { ascending: false })
          .limit(500),
        supabase
          .from("terminal_sales_sync")
          .select("*")
          .in("sync_status", PENDING_TERMINAL_STATUSES)
          .order("synced_at", { ascending: false })
          .limit(500),
        supabase
          .from("small_buys_sync" as any)
          .select("*")
          .eq("sync_status", "pending_approval")
          .order("time_window_start", { ascending: false })
          .limit(200),
        supabase
          .from("small_sales_sync" as any)
          .select("*")
          .eq("sync_status", "pending_approval")
          .order("time_window_start", { ascending: false })
          .limit(200),
        supabase
          .from("erp_product_conversions" as any)
          .select("*, wallets:wallet_id(wallet_name), creator:created_by(username), approver:approved_by(username), rejector:rejected_by(username)")
          .eq("status", "PENDING_APPROVAL")
          .order("created_at", { ascending: false })
          .limit(500),
        getSmallBuysConfig(),
        getSmallSalesConfig(),
      ]);

      const rows: ErpEntryRow[] = [];

      // 1) Deposits / Withdrawals from erp_action_queue
      for (const r of (actionQueueRes.data || []) as any[]) {
        const isDeposit = r.movement_type === "deposit";
        const source: ErpEntrySource = isDeposit ? "deposit" : "withdrawal";
        const amount = Number(r.amount || 0);
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
          reasonHint: `Binance ${r.movement_type} not yet recorded in ERP. Choose Purchase / Sales / Wallet Transfer.`,
          raw: r,
        });
      }

      // 2) Terminal Purchase (individual, excluding small-buys range)
      for (const r of (terminalBuyRes.data || []) as any[]) {
        const od = r.order_data || {};
        const total = parseFloat(od.total_price || "0");
        if (sbConfig?.is_enabled && total >= sbConfig.min_amount && total <= sbConfig.max_amount) continue;
        const qty = parseFloat(od.amount || "0");
        const asset = (od.asset || "USDT").toUpperCase();
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
          reasonHint:
            r.sync_status === "client_mapping_pending"
              ? "Counterparty not matched to a client. Review and assign."
              : "Completed Binance BUY order awaiting purchase entry.",
          raw: r,
        });
      }

      // 3) Terminal Sales (individual, excluding small-sales range)
      for (const r of (terminalSaleRes.data || []) as any[]) {
        const od = r.order_data || {};
        const total = parseFloat(od.total_price || "0");
        if (ssConfig?.is_enabled && total >= ssConfig.min_amount && total <= ssConfig.max_amount) continue;
        const qty = parseFloat(od.amount || "0");
        const asset = (od.asset || "USDT").toUpperCase();
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
          reasonHint:
            r.sync_status === "client_mapping_pending"
              ? "Counterparty not matched to a client. Review and assign."
              : "Completed Binance SELL order awaiting sales entry.",
          raw: r,
        });
      }

      // 4) Small Buys batches (one row per pending batch)
      for (const r of (smallBuysRes.data || []) as any[]) {
        const asset = r.asset_code || "USDT";
        const qty = Number(r.total_quantity || 0);
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
          reasonHint: "Small-amount BUY orders grouped on operator-triggered Sync Small Buys.",
          raw: r,
        });
      }

      // 5) Small Sales batches
      for (const r of (smallSalesRes.data || []) as any[]) {
        const asset = r.asset_code || "USDT";
        const qty = Number(r.total_quantity || 0);
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
          reasonHint: "Small-amount SELL orders grouped on operator-triggered Sync Small Sales.",
          raw: r,
        });
      }

      // 6) Pending spot-trade conversions
      for (const r of (conversionRes.data || []) as any[]) {
        const qty = Number(r.quantity || 0);
        const asset = r.asset_code;
        const tradeTime = (r.metadata as any)?.trade_time
          ? Number((r.metadata as any).trade_time)
          : new Date(r.created_at).getTime();
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
          reasonHint: "Spot-trade conversion awaiting approval.",
          raw: r,
        });
      }

      return rows;
    },
  });
}
