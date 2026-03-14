import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FileText } from "lucide-react";

interface FinancialIntermediationNoteProps {
  note: string;
  onChange: (note: string) => void;
}

export const DEFAULT_FI_NOTE =
  "This invoice represents service charges for financial intermediation and transaction facilitation services.\nGST is applied only on the service fees on the transactional spread.";

export default function FinancialIntermediationNote({ note, onChange }: FinancialIntermediationNoteProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
          <FileText className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h3 className="font-semibold text-foreground">Invoice Note</h3>
          <p className="text-xs text-muted-foreground">This note will appear on financial intermediation invoices</p>
        </div>
      </div>
      <div>
        <Label>Note (editable)</Label>
        <Textarea
          rows={3}
          value={note}
          onChange={(e) => onChange(e.target.value)}
          className="mt-1"
        />
      </div>
    </div>
  );
}
