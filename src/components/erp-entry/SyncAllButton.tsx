import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { useSyncAll } from "@/hooks/useErpEntrySyncAll";

export function SyncAllButton() {
  const sync = useSyncAll();
  return (
    <Button variant="outline" size="sm" disabled={sync.isPending} onClick={() => sync.mutate()} className="h-8 text-xs gap-1.5">
      <RefreshCw className={`h-3.5 w-3.5 ${sync.isPending ? "animate-spin" : ""}`} />
      {sync.isPending ? "Syncing…" : "Sync All"}
    </Button>
  );
}
