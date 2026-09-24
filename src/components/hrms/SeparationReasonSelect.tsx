import { useState } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  SEPARATION_GROUPS,
  SEPARATION_REASONS,
  separationGroupOf,
  type SeparationGroup,
} from "@/data/separationReasons";

/**
 * Two-step exit-reason picker: first Voluntary / Non-Voluntary, then only the
 * reasons of that group. Standard reasons are stored verbatim; the per-group
 * "Other" option reveals a free-text field whose text is stored instead, so
 * legacy/custom values round-trip correctly when editing.
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
  const knownGroup = separationGroupOf(value);
  const initiallyOther = value !== "" && !SEPARATION_REASONS.includes(value);
  const [group, setGroup] = useState<SeparationGroup | null>(knownGroup);
  const [otherMode, setOtherMode] = useState(initiallyOther);
  const [otherText, setOtherText] = useState(initiallyOther ? value : "");

  const activeGroup = SEPARATION_GROUPS.find((g) => g.key === group) ?? null;
  const triggerCls = compact ? "h-9 mt-1 text-foreground" : "text-foreground";

  return (
    <div className="space-y-2">
      <Select
        value={group ?? undefined}
        onValueChange={(v) => {
          const g = v as SeparationGroup;
          setGroup(g);
          setOtherMode(false);
          setOtherText("");
          onChange("");
        }}
      >
        <SelectTrigger className={triggerCls}>
          <SelectValue placeholder="Select type of separation" />
        </SelectTrigger>
        <SelectContent>
          {SEPARATION_GROUPS.map((g) => (
            <SelectItem key={g.key} value={g.key}>
              {g.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {activeGroup && (
        <Select
          value={otherMode ? activeGroup.otherLabel : value || undefined}
          onValueChange={(v) => {
            if (v === activeGroup.otherLabel) {
              setOtherMode(true);
              onChange(otherText);
            } else {
              setOtherMode(false);
              onChange(v);
            }
          }}
        >
          <SelectTrigger className={triggerCls}>
            <SelectValue placeholder="Select reason" />
          </SelectTrigger>
          <SelectContent>
            {activeGroup.reasons.map((r) => (
              <SelectItem key={r} value={r}>
                {r.replace(/^.*?— /, "")}
              </SelectItem>
            ))}
            <SelectItem value={activeGroup.otherLabel}>{activeGroup.otherLabel}</SelectItem>
          </SelectContent>
        </Select>
      )}

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
