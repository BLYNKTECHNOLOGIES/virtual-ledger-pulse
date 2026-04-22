import { Badge } from "@/components/ui/badge";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ShoppingCart,
  DollarSign,
  Package,
  Repeat,
  XCircle,
} from "lucide-react";
import { ErpEntrySource } from "@/hooks/useErpEntryFeed";
import { RejectedErpEntryRow } from "@/hooks/useErpEntryRejectedFeed";

const ICONS: Record<ErpEntrySource, { Icon: any; tone: string; bg: string }> = {
  deposit: { Icon: ArrowDownToLine, tone: "text-emerald-600", bg: "bg-emerald-100" },
  withdrawal: { Icon: ArrowUpFromLine, tone: "text-amber-600", bg: "bg-amber-100" },
  terminal_buy: { Icon: ShoppingCart, tone: "text-blue-600", bg: "bg-blue-100" },
  terminal_sale: { Icon: DollarSign, tone: "text-purple-600", bg: "bg-purple-100" },
  small_buys: { Icon: Package, tone: "text-indigo-600", bg: "bg-indigo-100" },
  small_sales: { Icon: Package, tone: "text-pink-600", bg: "bg-pink-100" },
  conversion: { Icon: Repeat, tone: "text-cyan-600", bg: "bg-cyan-100" },
};

interface Props {
  row: RejectedErpEntryRow;
}

export function RejectedEntryRow({ row }: Props) {
  const meta = ICONS[row.source];
  const Icon = meta.Icon;
  const occurred = new Date(row.occurred_at);
  const rejected = new Date(row.rejected_at);

  return (
    <div className="flex flex-wrap items-start gap-2 sm:gap-3 rounded-lg border border-destructive/20 bg-destructive/[0.03] p-2.5 sm:p-3">
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${meta.bg} relative`}>
        <Icon className={`h-4 w-4 ${meta.tone}`} />
        <XCircle className="absolute -bottom-1 -right-1 h-3.5 w-3.5 text-destructive bg-background rounded-full" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
          <span className="truncate">{row.label}</span>
          <Badge variant="destructive" className="h-5 text-[10px]">Rejected</Badge>
        </div>
        <div className="mt-0.5 truncate text-xs text-muted-foreground">{row.sublabel || "—"}</div>
        {row.rejection_reason && (
          <div className="mt-1 text-[11px] text-destructive/90 italic break-words">
            Reason: {row.rejection_reason}
          </div>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
          <span>Occurred: {occurred.toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
          <span>·</span>
          <span>Rejected: {rejected.toLocaleString(undefined, { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
          {row.rejected_by_name && (
            <>
              <span>·</span>
              <span>by {row.rejected_by_name}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
