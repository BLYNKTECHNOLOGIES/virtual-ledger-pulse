import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SEPARATION_REASONS, SEPARATION_REASON_OTHER } from "@/data/separationReasons";

/**
 * Selectable exit-reason picker. Standard reasons are stored verbatim;
 * "Other (specify)" reveals a free-text field whose text is stored instead,
 * so legacy/custom values round-trip correctly when editing.
 */
export function SeparationReasonSelect({
  value,
  onChange,
  compact,
}: {
  value: string;
  onChange: (v: string) => void;
  compact?: boolean;
}) {
  const initiallyOther = value !== "" && !SEPARATION_REASONS.includes(value);
  const [otherMode, setOtherMode] = useState(initiallyOther);
  const [otherText, setOtherText] = useState(initiallyOther ? value : "");

  return (
    <div className="space-y-2">
      <Select
        value={otherMode ? SEPARATION_REASON_OTHER : value || undefined}
        onValueChange={(v) => {
          if (v === SEPARATION_REASON_OTHER) {
            setOtherMode(true);
            onChange(otherText);
          } else {
            setOtherMode(false);
            onChange(v);
          }
        }}
      >
        <SelectTrigger className={compact ? "h-9 mt-1 text-foreground" : "text-foreground"}>
          <SelectValue placeholder="Select exit reason" />
        </SelectTrigger>
        <SelectContent>
          {SEPARATION_REASONS.map((r) => (
            <SelectItem key={r} value={r}>
              {r}
            </SelectItem>
          ))}
          <SelectItem value={SEPARATION_REASON_OTHER}>{SEPARATION_REASON_OTHER}</SelectItem>
        </SelectContent>
      </Select>
      {otherMode && (
        <Textarea
          className={compact ? "text-foreground" : undefined}
          rows={2}
          value={otherText}
          onChange={(e) => {
            setOtherText(e.target.value);
            onChange(e.target.value);
          }}
          placeholder="Type the exit reason…"
        />
      )}
    </div>
  );
}
