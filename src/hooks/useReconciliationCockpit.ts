import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type ExceptionSeverity = "critical" | "warning" | "info";

export type LaneKey =
  | "drift"
  | "split_mismatch"
  | "negative_balance"
  | "stale_approval";

export interface ExceptionItem {
  /** Stable reference used to persist ack/resolve state. */
  ref: string;
  lane: LaneKey;
  severity: ExceptionSeverity;
  title: string;
  subtitle: string;
  detail: string;
  amountLabel?: string;
  occurredAt?: string | null;
  raw: any;
}

export interface ExceptionStateRow {
  exception_type: string;
  exception_ref: string;
  acknowledged_at: string | null;
  acknowledged_by_name: string | null;
  resolved_at: string | null;
  resolved_by_name: string | null;
  resolution_reason: string | null;
}

export interface Lane {
  key: LaneKey;
  title: string;
  description: string;
  items: ExceptionItem[];
}

export interface ReconciliationCockpitData {
  lanes: Lane[];
  stateByRef: Record<string, ExceptionStateRow>;
  totalOpen: number;
  totalCritical: number;
}

const STALE_APPROVAL_HOURS = 24;

function money(n: number | null | undefined) {
  const v = Number(n ?? 0);
  return v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function useReconciliationCockpit() {
  return useQuery<ReconciliationCockpitData>({
    queryKey: ["reconciliation-cockpit"],
    refetchInterval: 60000,
    queryFn: async () => {
      const staleCutoff = new Date(Date.now() - STALE_APPROVAL_HOURS * 3600 * 1000).toISOString();

      const [driftRes, splitRes, bankRes, walletRes, queueRes, stateRes] = await Promise.all([
        supabase
          .from("erp_drift_alerts")
          .select("*")
          .is("resolved_at", null)
          .order("created_at", { ascending: false })
          .limit(500),
        supabase.rpc("get_payment_split_mismatches" as any),
        supabase
          .from("bank_accounts")
          .select("id, account_name, bank_name, account_type, balance, account_status")
          .lt("balance", 0)
          .neq("account_type", "CREDIT"),
        supabase
          .from("wallets")
          .select("id, wallet_name, wallet_type, current_balance, is_active")
          .lt("current_balance", 0),
        supabase
          .from("erp_action_queue")
          .select("id, status, movement_time, asset_code, amount, entry_type, counterparty_name")
          .eq("status", "PENDING")
          .lt("movement_time", staleCutoff)
          .order("movement_time", { ascending: true })
          .limit(500),
        supabase
          .from("reconciliation_exception_state")
          .select(
            "exception_type, exception_ref, acknowledged_at, acknowledged_by_name, resolved_at, resolved_by_name, resolution_reason"
          ),
      ]);

      const stateByRef: Record<string, ExceptionStateRow> = {};
      for (const row of (stateRes.data as ExceptionStateRow[] | null) || []) {
        stateByRef[row.exception_ref] = row;
      }

      // --- Drift lane ---
      const driftItems: ExceptionItem[] = ((driftRes.data as any[]) || []).map((d) => ({
        ref: `drift:${d.id}`,
        lane: "drift" as LaneKey,
        severity: (d.severity === "critical" || d.severity === "high"
          ? "critical"
          : d.severity === "warning" || d.severity === "medium"
          ? "warning"
          : "info") as ExceptionSeverity,
        title: `${d.entity_name || d.entity_type} · ${d.asset_code || ""}`.trim(),
        subtitle: `Drift ${money(d.drift)} · ${d.source || "snapshot"}`,
        detail: `Tracked ${money(d.tracked_balance)} vs Calculated ${money(d.calculated_balance)}`,
        amountLabel: money(d.drift),
        occurredAt: d.created_at,
        raw: { ...d, ackColumn: true },
      }));

      // --- Payment split mismatch lane ---
      const splitItems: ExceptionItem[] = ((splitRes.data as any[]) || []).map((s) => ({
        ref: `split:${s.order_type}:${s.order_id}`,
        lane: "split_mismatch" as LaneKey,
        severity: (Math.abs(Number(s.delta)) > 100 ? "critical" : "warning") as ExceptionSeverity,
        title: `${s.order_type === "purchase" ? "Purchase" : "Sales"} #${s.order_number || s.order_id?.slice(0, 8)}`,
        subtitle: `${s.party_name || "—"} · Δ ${money(s.delta)}`,
        detail: `Splits ${money(s.split_total)} vs Order ${money(s.order_total)}`,
        amountLabel: money(s.delta),
        occurredAt: s.order_date,
        raw: s,
      }));

      // --- Negative balance lane ---
      const bankItems: ExceptionItem[] = ((bankRes.data as any[]) || []).map((b) => ({
        ref: `negbank:${b.id}`,
        lane: "negative_balance" as LaneKey,
        severity: "critical" as ExceptionSeverity,
        title: `${b.account_name} · ${b.bank_name}`,
        subtitle: `${b.account_type} account is negative`,
        detail: `Balance ${money(b.balance)}`,
        amountLabel: money(b.balance),
        raw: b,
      }));
      const walletItems: ExceptionItem[] = ((walletRes.data as any[]) || []).map((w) => ({
        ref: `negwallet:${w.id}`,
        lane: "negative_balance" as LaneKey,
        severity: "critical" as ExceptionSeverity,
        title: `${w.wallet_name} · ${w.wallet_type || "wallet"}`,
        subtitle: `Wallet balance is negative`,
        detail: `Balance ${money(w.current_balance)}`,
        amountLabel: money(w.current_balance),
        raw: w,
      }));

      // --- Stale approval lane ---
      const staleItems: ExceptionItem[] = ((queueRes.data as any[]) || []).map((q) => {
        const ageHrs = q.movement_time
          ? Math.floor((Date.now() - new Date(q.movement_time).getTime()) / 3600000)
          : 0;
        return {
          ref: `stale:${q.id}`,
          lane: "stale_approval" as LaneKey,
          severity: (ageHrs >= 72 ? "critical" : "warning") as ExceptionSeverity,
          title: `${q.entry_type || "Entry"} · ${q.asset_code || ""}`.trim(),
          subtitle: `Pending ${ageHrs}h · ${q.counterparty_name || "—"}`,
          detail: `Amount ${money(q.amount)} awaiting approval`,
          amountLabel: money(q.amount),
          occurredAt: q.movement_time,
          raw: q,
        };
      });

      const lanes: Lane[] = [
        {
          key: "drift",
          title: "Balance Drift",
          description: "Tracked vs calculated balance divergence from snapshots.",
          items: driftItems,
        },
        {
          key: "split_mismatch",
          title: "Payment Split Mismatches",
          description: "Orders where split totals diverge from the order value.",
          items: splitItems,
        },
        {
          key: "negative_balance",
          title: "Negative Balances",
          description: "Bank accounts / wallets that should never go below zero.",
          items: [...bankItems, ...walletItems],
        },
        {
          key: "stale_approval",
          title: "Stale Approvals",
          description: `Entries pending approval for more than ${STALE_APPROVAL_HOURS}h.`,
          items: staleItems,
        },
      ];

      // Open items = not resolved.
      const isOpen = (i: ExceptionItem) => !stateByRef[i.ref]?.resolved_at;
      const allItems = lanes.flatMap((l) => l.items);
      const totalOpen = allItems.filter(isOpen).length;
      const totalCritical = allItems.filter((i) => isOpen(i) && i.severity === "critical").length;

      return { lanes, stateByRef, totalOpen, totalCritical };
    },
  });
}
