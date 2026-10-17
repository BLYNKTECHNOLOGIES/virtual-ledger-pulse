import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useActiveJobRequirementLinks } from "@/lib/ats/jobRequirements";
import { buildRequirementSlots, hiddenRequirementOptions, requirementCoversShift as covers, slotsToLinks } from "@/lib/ats/requirementOptions";

const NONE = "__none";

export interface ReqOption { id: string; label: string; status: string; raw: any }

/**
 * Hiring-requirement links for a job. One shift → a single picker (the job's requisition_id).
 * Several shifts → one picker per shift; the job's existing main link stays the main link,
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

  const multi = shiftIds.length > 1;
  const shiftName = (id: string) => shiftOptions.find((s) => s.id === id)?.label ?? "Shift";
  const rawOf = (id: string) => reqOptions.find((o) => o.id === id)?.raw;

  // Rebuild from the links whenever they or the job's shifts change; earlier picks keep their slot
  // and the main link (requisition_id) is placed first, so it is never swapped or shown as "Not linked".
  useEffect(() => {
    setSlots((prev) => buildRequirementSlots(shiftIds, primaryId, extraIds, rawOf, prev));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobId, primaryId, extraIds.join(","), shiftIds.join(","), reqOptions.length]);

  const chosenIds = useMemo(() => new Set(Object.values(slots).filter(Boolean)), [slots]);
  const hiddenOptions = useMemo(
    () => hiddenRequirementOptions(reqOptions, linkedElsewhere.data, chosenIds, shiftIds),
    [reqOptions, linkedElsewhere.data, chosenIds, shiftIds],
  );
  const hiddenCount = hiddenOptions.length;

  const optionVisible = (o: ReqOption) => showLinked || chosenIds.has(o.id) || !linkedElsewhere.data?.has(o.id);

  const setSlot = (slot: string, reqId: string) => {
    const next = { ...slots, [slot]: reqId };
    if (!reqId) delete next[slot];
    setSlots(next);
    const { primary, extras } = slotsToLinks(next, shiftIds, primaryId);
    onChange(primary, extras);
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
            {value && !opts.some((o) => o.id === value) && (
              <SelectItem value={value}>{reqOptions.find((o) => o.id === value)?.label ?? "Linked request (no longer open for recruitment)"}</SelectItem>
            )}
            {opts.map((o) => (
              <SelectItem key={o.id} value={o.id}>
                <span>{o.label}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {linkedElsewhere.data?.has(o.id) && o.id !== value ? `linked to ${linkedElsewhere.data.get(o.id)?.jobTitle} · ` : ""}{o.status}
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
        ? shiftIds.map((s) => renderSelect(s, <>Hiring request for {shiftName(s)}</>, s))
        : renderSelect(shiftIds[0] ?? "__single", "Hiring request (optional)")}
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
        <Button type="button" variant="ghost" size="sm" className="h-auto whitespace-normal text-left gap-1.5 text-xs text-muted-foreground" aria-expanded={showLinked} aria-controls="hidden-job-requirements" onClick={() => setShowLinked((v) => !v)}>
          {showLinked ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          {showLinked ? "Hide" : "Show"} {hiddenCount} request{hiddenCount === 1 ? "" : "s"} already linked to a job
        </Button>
      )}
      {showLinked && hiddenCount > 0 && (
        <div id="hidden-job-requirements" className="space-y-2 border-l border-border pl-3">
          {hiddenOptions.map((o) => (
            <div key={o.id} className="space-y-1.5 py-2">
              <p className="break-words text-sm text-foreground">{o.label}</p>
              <p className="break-words text-xs text-muted-foreground">Linked to {linkedElsewhere.data?.get(o.id)?.jobTitle}</p>
              <div className="flex flex-wrap gap-2">
                {(multi ? shiftIds.filter((s) => covers(o.raw, s)) : [shiftIds[0] ?? "__single"]).every((s) => slots[s]) && (
                  <p className="text-xs text-muted-foreground">Set the {multi ? "matching shift's" : ""} picker to "Not linked" first to use this one instead.</p>
                )}
                {(multi ? shiftIds.filter((s) => covers(o.raw, s)) : [shiftIds[0] ?? "__single"]).filter((s) => !slots[s]).map((s) => (
                  <Button key={s} type="button" variant="outline" size="sm" className="h-auto whitespace-normal text-left" onClick={() => setSlot(s, o.id)}>
                    <Plus className="h-3.5 w-3.5 shrink-0" />{multi ? `Use for ${shiftName(s)}` : "Use this request"}
                  </Button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
