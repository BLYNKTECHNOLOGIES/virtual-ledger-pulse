import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ShoppingCart,
  DollarSign,
  Package,
  Repeat,
  Info,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ErpEntryRow, ErpEntrySource } from "@/hooks/useErpEntryFeed";

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
  row: ErpEntryRow;
  isFocused: boolean;
  onOpen: () => void;
  onReject?: () => void;
  onFocus: () => void;
}

const STALE_MS = 6 * 60 * 60 * 1000;

export function EntryRow({ row, isFocused, onOpen, onReject, onFocus }: Props) {
  const meta = ICONS[row.source];
  const Icon = meta.Icon;
  const isStale = Date.now() - row.occurred_at > STALE_MS;
  const time = new Date(row.occurred_at);

  return (
    <div
      tabIndex={0}
      onFocus={onFocus}
      onClick={onFocus}
      className={`flex flex-wrap items-center gap-2 sm:gap-3 rounded-lg border bg-card p-2.5 sm:p-3 transition-colors hover:bg-accent/40 cursor-default ${
        isFocused ? "ring-2 ring-primary border-primary" : "border-border"
      }`}
    >
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${meta.bg}`}>
        <Icon className={`h-4 w-4 ${meta.tone}`} />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm font-medium">
          <span className="truncate">{row.label}</span>
          {isStale && (
            <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
              <span className="h-1.5 w-1.5 rounded-full bg-destructive" />
              Stale
            </span>
          )}
        </div>
        <div className="mt-0.5 truncate text-xs text-muted-foreground">{row.sublabel || "—"}</div>
        <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground sm:hidden">
          <span>{time.toLocaleDateString(undefined, { day: "2-digit", month: "short" })}</span>
          <span>·</span>
          <span>{time.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</span>
        </div>
      </div>

      <div className="hidden text-right md:block">
        <div className="text-xs font-medium">{time.toLocaleDateString(undefined, { day: "2-digit", month: "short" })}</div>
        <div className="text-[11px] text-muted-foreground">{time.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}</div>
      </div>

      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button className="text-muted-foreground hover:text-foreground shrink-0" aria-label="Why is this here?">
              <Info className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="left" className="max-w-xs text-xs">
            {row.reasonHint}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <div className="flex items-center gap-1.5 ml-auto sm:ml-0 w-full sm:w-auto justify-end">
        <Button size="sm" className="h-7 px-3 text-xs flex-1 sm:flex-none" onClick={onOpen}>
          {row.source === "conversion" ? "Approve" : row.source === "deposit" || row.source === "withdrawal" ? "Entry" : "Review"}
        </Button>
        {onReject && (
          <Button size="sm" variant="outline" className="h-7 px-3 text-xs flex-1 sm:flex-none" onClick={onReject}>
            Reject
          </Button>
        )}
      </div>
    </div>
  );
}
