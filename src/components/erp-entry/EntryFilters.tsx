import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowDownUp, Search } from "lucide-react";
import { ErpEntrySource } from "@/hooks/useErpEntryFeed";

export type SourceFilter = "all" | ErpEntrySource;

interface Props {
  filter: SourceFilter;
  onFilterChange: (f: SourceFilter) => void;
  search: string;
  onSearchChange: (s: string) => void;
  sortDir: "asc" | "desc";
  onToggleSort: () => void;
  counts: Record<SourceFilter, number>;
}

const CHIPS: { key: SourceFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "deposit", label: "Deposits" },
  { key: "withdrawal", label: "Withdrawals" },
  { key: "terminal_buy", label: "Terminal Buy" },
  { key: "terminal_sale", label: "Terminal Sale" },
  { key: "small_buys", label: "Small Buys" },
  { key: "small_sales", label: "Small Sales" },
  { key: "conversion", label: "Conversions" },
];

export function EntryFilters({ filter, onFilterChange, search, onSearchChange, sortDir, onToggleSort, counts }: Props) {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {CHIPS.map((c) => {
          const active = filter === c.key;
          const count = counts[c.key] ?? 0;
          return (
            <Button
              key={c.key}
              variant={active ? "default" : "outline"}
              size="sm"
              onClick={() => onFilterChange(c.key)}
              className="h-8 text-xs"
            >
              {c.label}
              <span className={`ml-1.5 rounded-full px-1.5 text-[10px] ${active ? "bg-primary-foreground/20" : "bg-muted"}`}>
                {count}
              </span>
            </Button>
          );
        })}
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search order #, tx_id, counterparty, asset, amount…"
            className="pl-7 h-8 text-xs"
          />
        </div>
        <Button variant="outline" size="sm" onClick={onToggleSort} className="h-8 text-xs gap-1.5">
          <ArrowDownUp className="h-3.5 w-3.5" />
          {sortDir === "asc" ? "Oldest first" : "Newest first"}
        </Button>
      </div>
    </div>
  );
}
