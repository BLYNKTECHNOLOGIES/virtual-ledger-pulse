import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ConflictItem {
  field: string;
  clientValue: string;
  counterpartyValue: string;
  onChoose: (value: string) => void;
}

interface Props {
  conflicts: ConflictItem[];
}

/**
 * Shows a small banner when client master data differs from counterparty records,
 * letting the operator choose which value to use.
 */
export function DataConflictBanner({ conflicts }: Props) {
  if (conflicts.length === 0) return null;

  return (
    <div className="rounded-md border border-amber-200 bg-amber-50/50 p-3 space-y-2">
      <div className="flex items-center gap-1.5 text-amber-700">
        <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
        <span className="text-[11px] font-semibold">Data Conflict — Choose Which Value to Use</span>
      </div>
      {conflicts.map((c, i) => (
        <div key={i} className="flex items-center gap-2 flex-wrap text-[11px]">
          <span className="text-muted-foreground font-medium min-w-[50px]">{c.field}:</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-6 text-[10px] px-2 border-blue-200 bg-blue-50 hover:bg-blue-100"
            onClick={() => c.onChoose(c.clientValue)}
          >
            Client: {c.clientValue}
          </Button>
          <span className="text-muted-foreground">vs</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-6 text-[10px] px-2 border-orange-200 bg-orange-50 hover:bg-orange-100"
            onClick={() => c.onChoose(c.counterpartyValue)}
          >
            Terminal: {c.counterpartyValue}
          </Button>
        </div>
      ))}
    </div>
  );
}
