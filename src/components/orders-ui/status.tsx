/**
 * One wording and one colour per status, shared by the lists and the dialogs
 * of the Sales and Purchase pages. Presentation only.
 */
import { cn } from "@/lib/utils";

export type ChipTone = "success" | "warning" | "danger" | "info" | "neutral";

/** Small pill using the ERP's ds-status styles. */
export function Chip({ tone = "neutral", children, className, title }: { tone?: ChipTone; children: React.ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cn("ds-status", `ds-status-${tone}`, className)}>
      {children}
    </span>
  );
}

const humanize = (value: string) => {
  const s = value.replace(/_/g, " ").trim().toLowerCase();
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "Unknown";
};

/* ── Sales order payment status (sales_orders.payment_status) ─────────────── */

export const SALES_PAYMENT_STATUS: Record<string, { label: string; tone: ChipTone }> = {
  COMPLETED: { label: "Completed", tone: "success" },
  PAYMENT_DONE: { label: "Payment done", tone: "success" },
  USER_PAYING: { label: "User paying", tone: "info" },
  PARTIAL: { label: "Partial payment", tone: "warning" },
  PENDING: { label: "Pending", tone: "neutral" },
  FAILED: { label: "Failed", tone: "danger" },
  ORDER_CANCELLED: { label: "Cancelled", tone: "danger" },
};

export function salesPaymentStatusMeta(status?: string | null) {
  const key = String(status || "").toUpperCase();
  return SALES_PAYMENT_STATUS[key] ?? { label: status ? humanize(String(status)) : "Unknown", tone: "neutral" as ChipTone };
}

export function SalesStatusChip({ status, className }: { status?: string | null; className?: string }) {
  const meta = salesPaymentStatusMeta(status);
  return <Chip tone={meta.tone} className={className}>{meta.label}</Chip>;
}

/* ── Purchase order status (purchase_orders.status) ───────────────────────── */

const PURCHASE_STATUS: Record<string, { label: string; tone: ChipTone }> = {
  COMPLETED: { label: "Completed", tone: "success" },
  PENDING: { label: "Pending", tone: "neutral" },
  FAILED: { label: "Failed", tone: "danger" },
  CANCELLED: { label: "Cancelled", tone: "danger" },
};

export function PurchaseStatusChip({ status, className }: { status?: string | null; className?: string }) {
  const key = String(status || "").toUpperCase();
  const meta = PURCHASE_STATUS[key] ?? { label: status ? humanize(String(status)) : "Unknown", tone: "neutral" as ChipTone };
  return <Chip tone={meta.tone} className={className}>{meta.label}</Chip>;
}

/* ── Terminal sync rows (terminal_sales_sync / terminal_purchase_sync .sync_status) ── */

export const SYNC_STATUS: Record<string, { label: string; tone: ChipTone }> = {
  synced_pending_approval: { label: "Pending approval", tone: "warning" },
  client_mapping_pending: { label: "Client mapping", tone: "info" },
  approved: { label: "Approved", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
  duplicate_blocked: { label: "Duplicate", tone: "neutral" },
  cancelled_on_binance: { label: "Cancelled on Binance", tone: "neutral" },
};

export function syncStatusMeta(status?: string | null) {
  return SYNC_STATUS[String(status || "")] ?? { label: status ? humanize(String(status)) : "Unknown", tone: "neutral" as ChipTone };
}

export function SyncStatusChip({ status, className }: { status?: string | null; className?: string }) {
  const meta = syncStatusMeta(status);
  return <Chip tone={meta.tone} className={className}>{meta.label}</Chip>;
}

/* ── Small sales / small buys batches (small_*_sync.sync_status) ──────────── */

export const BATCH_STATUS: Record<string, { label: string; tone: ChipTone }> = {
  pending_approval: { label: "Pending approval", tone: "warning" },
  processing: { label: "Processing", tone: "info" },
  approved: { label: "Approved", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
};

export function batchStatusMeta(status?: string | null) {
  return BATCH_STATUS[String(status || "")] ?? { label: status ? humanize(String(status)) : "Unknown", tone: "neutral" as ChipTone };
}

export function BatchStatusChip({ status, className }: { status?: string | null; className?: string }) {
  const meta = batchStatusMeta(status);
  return <Chip tone={meta.tone} className={className}>{meta.label}</Chip>;
}
