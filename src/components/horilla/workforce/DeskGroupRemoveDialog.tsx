import { useState } from "react";
import { ResponsiveDialog } from "@/components/horilla/primitives/ResponsiveDialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRehomeLine, useRemoveDeskGroup } from "@/hooks/hrms/useWorkforceTiming";

const deskCount = (s: any) => (s?.is_active === false ? 0 : Number(s?.max_operational_capacity ?? s?.physical_seats) || 0);

/**
 * Removing a desk group: lines that follow it must first switch to fixed numbers or another group
 * (the database refuses otherwise), then removal is recorded with a reason. A move to another group
 * is picked, previewed ("required 8 → 6") and confirmed; the removal reason is the change reason.
 */
export function DeskGroupRemoveDialog({ seat, seats, plans, lineLabel, onClose }: {
  seat: any | null; seats: any[]; plans: any[]; lineLabel: (p: any) => string; onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [picked, setPicked] = useState<Record<string, string>>({});
  const rehome = useRehomeLine();
  const remove = useRemoveDeskGroup();
  const following = seat ? plans.filter((p) => p.is_active !== false && p.follow_desks && p.seat_capacity_id === seat.id) : [];
  const others = seat ? seats.filter((s) => s.id !== seat.id && s.is_active !== false && s.department_id === seat.department_id) : [];
  const close = () => { setReason(""); setPicked({}); onClose(); };
  const changeReason = reason.trim() ? `Desk group removal: ${reason.trim()}` : "";
  const seatName = (s: any) => s?.positions?.title || s?.notes || "Desk group";

  return (
    <ResponsiveDialog open={!!seat} onOpenChange={(o) => !o && close()} title="Remove this desk group?"
      footer={<>
        <Button variant="outline" onClick={close}>Back</Button>
        <Button variant="destructive" disabled={following.length > 0 || !reason.trim() || remove.isPending}
          onClick={() => remove.mutate({ id: seat.id, reason }, { onSuccess: close })}>Remove</Button>
      </>}>
      <div className="space-y-4 text-sm">
        <div className="space-y-1">
          <Label htmlFor="desk-remove-reason">Reason</Label>
          <Textarea id="desk-remove-reason" value={reason} onChange={(e) => setReason(e.target.value)} className="text-foreground" placeholder="e.g. Floor reorganised" />
          {following.length > 0 && <p className="text-xs text-muted-foreground">Give the reason first — it is saved as the reason for each line change below.</p>}
        </div>
        {following.length > 0 ? (
          <div className="space-y-2">
            <p className="text-foreground">
              {following.length} staffing line{following.length === 1 ? " follows" : "s follow"} these desks. Removing the group would drop their required number to 0 and cancel their automatic hiring requests, so choose what each line does first.
            </p>
            <ul className="space-y-2">
              {following.map((p) => {
                const target = others.find((s) => s.id === picked[p.id]);
                return (
                  <li key={p.id} className="space-y-2 rounded-md border border-border p-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-foreground">{lineLabel(p)} <span className="text-muted-foreground">· {p.required_hc} required</span></span>
                      <span className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" disabled={rehome.isPending || !changeReason}
                          onClick={() => rehome.mutate({ planId: p.id, seatId: null, reason: changeReason })}>Keep {p.required_hc} as a fixed number</Button>
                        {others.length > 0 && (
                          <Select value={picked[p.id] ?? ""} onValueChange={(v) => setPicked((m) => ({ ...m, [p.id]: v }))}>
                            <SelectTrigger className="h-8 w-48 text-foreground"><SelectValue placeholder="Move to desk group…" /></SelectTrigger>
                            <SelectContent>
                              {others.map((s) => <SelectItem key={s.id} value={s.id}>{seatName(s)} · {deskCount(s)} desks</SelectItem>)}
                            </SelectContent>
                          </Select>
                        )}
                      </span>
                    </div>
                    {target && (
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/50 p-2">
                        <span className="text-foreground">Follow {seatName(target)}: required {p.required_hc} → {deskCount(target)}</span>
                        <span className="flex gap-2">
                          <Button size="sm" variant="ghost" onClick={() => setPicked((m) => { const n = { ...m }; delete n[p.id]; return n; })}>Cancel</Button>
                          <Button size="sm" disabled={rehome.isPending || !changeReason}
                            onClick={() => rehome.mutate({ planId: p.id, seatId: target.id, reason: changeReason })}>Confirm move</Button>
                        </span>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : (
          <p className="text-muted-foreground">No staffing line follows these desks. The desk count stops being tracked; lines only linked to it are unlinked, and the history keeps your reason.</p>
        )}
      </div>
    </ResponsiveDialog>
  );
}
