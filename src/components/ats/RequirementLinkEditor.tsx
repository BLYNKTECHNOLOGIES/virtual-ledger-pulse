import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useActiveJobRequirementLinks } from "@/lib/ats/jobRequirements";

const NONE = "__none";

export interface ReqOption { id: string; label: string; status: string; raw: any }

/** A requirement covers a shift when it has no staffing line (unrestricted) or its line lists the shift. */
const covers = (raw: any, shiftId: string) =>
  !raw?.plan_shift_ids || raw.plan_shift_ids.length === 0 || raw.plan_shift_ids.includes(shiftId);

/**
 * Hiring-requirement links for a job. One shift → a single picker (the job's requisition_id).
 * Several shifts → one picker per shift; the first non-empty slot stays the job's primary link,
 * the rest are written to ats_job_requirements. Requirements already linked to another active
 * job are hidden behind an expander.
 */
export function RequirementLinkEditor({ jobId, shiftIds, shiftOptions, reqOptions, primaryId, extraIds, onChange, onPick }: {
  jobId?: string | null;
  shiftIds: string[];
  shiftOptions: { id: string; label: string }[];
  reqOptions: ReqOption[];
  primaryId: string;
  extraIds: string[];
  /** (primary, extras) after any slot change. */
  onChange: (primary: string, extras: string[]) => void;
  /** A slot went from empty to a requirement — JobEditor auto-fills empty fields from it. */
  onPick: (reqId: string) => void;
}) {
  const linkedElsewhere = useActiveJobRequirementLinks(jobId);
  const [showLinked, setShowLinked] = useState(false);
  const [slots, setSlots] = useState<Record<string, string>>({});
  const dirty = useRef(false);

  const multi = shiftIds.length > 1;
  const shiftName = (id: string) => shiftOptions.find((s) => s.id === id)?.label ?? "Shift";

  // (Re)build slots from the incoming links until HR touches a picker.
  useEffect(() => {
    if (dirty.current) return;
    const pool = [primaryId, ...extraIds].filter(Boolean);
    const next: Record<string, string> = {};
    const rest: string[] = [];
    for (const id of pool) {
      const raw = reqOptions.find((o) => o.id === id)?.raw;
      const slot = shiftIds.find((s) => !next[s] && (!raw || covers(raw, s))) ?? shiftIds.find((s) => !next[s]);
      if (slot) next[slot] = id; else rest.push(id);
    }
    rest.forEach((id, i) => { next[`__extra_${i}`] = id; });
    setSlots(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, primaryId, extraIds.join(","), shiftIds.join(","), reqOptions.length]);

  const chosenIds = useMemo(() => new Set(Object.values(slots).filter(Boolean)), [slots]);
  const hiddenCount = useMemo(
    () => reqOptions.filter((o) => linkedElsewhere.data?.has(o.id) && !chosenIds.has(o.id)).length,
    [reqOptions, linkedElsewhere.data, chosenIds],
  );

  const optionVisible = (o: ReqOption) => showLinked || chosenIds.has(o.id) || !linkedElsewhere.data?.has(o.id);

  const setSlot = (slot: string, reqId: string) => {
    dirty.current = true;
    const next = { ...slots, [slot]: reqId };
    if (!reqId) delete next[slot];
    setSlots(next);
    const values = [
      ...shiftIds.map((s) => next[s]).filter(Boolean),
      ...Object.keys(next).filter((k) => k.startsWith("__extra_")).sort().map((k) => next[k]).filter(Boolean),
    ];
    onChange(values[0] ?? "", values.slice(1));
    if (reqId && !slots[slot]) onPick(reqId);
  };

  const renderSelect = (slot: string, label: React.ReactNode, filterShift?: string) => {
    const value = slots[slot] ?? "";
    const opts = reqOptions.filter((o) =>
      (!filterShift || o.id === value || covers(o.raw, filterShift)) &&
      (!chosenIds.has(o.id) || o.id === value) &&
      optionVisible(o));
    return (
      <div className="space-y-1.5" key={slot}>
        <Label>{label}</Label>
        <Select value={value || NONE} onValueChange={(v) => setSlot(slot, v === NONE ? "" : v)}>
          <SelectTrigger className="text-foreground"><SelectValue placeholder="Not linked" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE}>Not linked</SelectItem>
            {opts.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                <span>{o.label}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {linkedElsewhere.data?.has(o.id) && o.id !== value ? `linked to ${linkedElsewhere.data.get(o.id)!.jobTitle} · ` : ""}{o.status}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {multi
        ? shiftIds.map((s) => renderSelect(s, <>Requirement for {shiftName(s)}</>, s))
        : renderSelect(shiftIds[0] ?? "__single", "Hiring requirement (optional)")}
      {Object.keys(slots).filter((k) => k.startsWith("__extra_") && slots[k]).map((k) => {
        const o = reqOptions.find((x) => x.id === slots[k]);
        return (
          <div key={k} className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-sm">
            <span className="min-w-0 truncate text-foreground">{o?.label ?? slots[k]}</span>
            <Button type="button" size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={() => setSlot(k, "")} aria-label="Remove link"><X className="h-3.5 w-3.5" /></Button>
          </div>
        );
      })}
      {hiddenCount > 0 && (
        <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground" onClick={() => setShowLinked((v) => !v)}>
          {showLinked ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          {showLinked ? "Hide" : "Show"} {hiddenCount} requirement{hiddenCount === 1 ? "" : "s"} already linked to a job
        </Button>
      )}
    </div>
  );
}
