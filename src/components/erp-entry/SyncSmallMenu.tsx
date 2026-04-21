import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown, Package } from "lucide-react";
import { useSyncSmallBuys, useSyncSmallSales } from "@/hooks/useErpEntrySyncAll";

export function SyncSmallMenu() {
  const buys = useSyncSmallBuys();
  const sales = useSyncSmallSales();
  const pending = buys.isPending || sales.isPending;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={pending} className="h-8 text-xs gap-1.5">
          <Package className="h-3.5 w-3.5" />
          {pending ? "Syncing…" : "Sync Small"}
          <ChevronDown className="h-3 w-3" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="text-xs">Manual bulk grouping</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={buys.isPending} onClick={() => buys.mutate()}>
          Sync Small Buys now
        </DropdownMenuItem>
        <DropdownMenuItem disabled={sales.isPending} onClick={() => sales.mutate()}>
          Sync Small Sales now
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
