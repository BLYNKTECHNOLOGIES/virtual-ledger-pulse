import { useState } from "react";
import { ResponsiveDialog } from "@/components/horilla/primitives/ResponsiveDialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRehomeLine, useRemoveDeskGroup } from "@/hooks/hrms/useWorkforceTiming";

/**
 * Removing a desk group: lines that follow it must first switch to fixed numbers or another group
 * (the database refuses otherwise), then removal is recorded with a reason.
 */
export function DeskGroupRemoveDialog({ seat, seats, plans, lineLabel, onClose }: {
  seat: any | null; seats: any[]; plans: any[]; lineLabel: (p: any) => string; onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const rehome = useRehomeLine();
  const remove = useRemoveDeskGroup();
  const following = seat ? plans.filter((p) => p.is_active !== false && p.follow_desks && p.seat_capacity_id === seat.id) : [];
  const others = seat ? seats.filter((s) => s.id !== seat.id && s.is_active !== false && s.department_id === seat.department_id) : [];
  const close = () => { setReason(""); onClose(); };

  return (
    <ResponsiveDialog open={!!seat} onOpenChange={(o) => !o && close()} title="Remove this desk group?"
      footer={<>
        <Button variant="outline" onClick={close}>Back</Button>
        <Button variant="destructive" disabled={following.length > 0 || !reason.trim() || remove.isPending}
          onClick={() => remove.mutate({ id: seat.id, reason }, { onSuccess: close })}>Remove</Button>
      </>}>
      <div className="space-y-4 text-sm">
        {following.length > 0 ? (
          <div className="space-y-2">
            <p className="text-foreground">
              {following.length} staffing line{following.length === 1 ? " follows" : "s follow"} these desks. Removing the group would drop their required number to 0 and cancel their automatic hiring requests, so choose what each line does first.
            </p>
            <ul className="space-y-2">
              {following.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-2">
                  <span className="text-foreground">{lineLabel(p)} <span className="text-muted-foreground">· {p.required_hc} required</span></span>
                  <span className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" disabled={rehome.isPending}
                      onClick={() => rehome.mutate({ planId: p.id, seatId: null })}>Keep {p.required_hc} as a fixed number</Button>
                    {others.length > 0 && (
                      <Select onValueChange={(v) => rehome.mutate({ planId: p.id, seatId: v })}>
                        <SelectTrigger className="h-8 w-48 text-foreground"><SelectValue placeholder="Move to desk group…" /></SelectTrigger>
                        <SelectContent>
                          {others.map((s) => <SelectItem key={s.id} value={s.id}>{s.positions?.title || s.notes || "Desk group"} · {s.max_operational_capacity ?? s.physical_seats} desks</SelectItem>)}
                        </SelectContent>
                      </Select>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-muted-foreground">No staffing line follows these desks. The desk count stops being tracked; the history keeps your reason.</p>
        )}
        <div className="space-y-1">
          <Label htmlFor="desk-remove-reason">Reason</Label>
          <Textarea id="desk-remove-reason" value={reason} onChange={(e) => setReason(e.target.value)} className="text-foreground" placeholder="e.g. Floor reorganised" />
        </div>
      </div>
    </ResponsiveDialog>
  );
}
