import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Armchair, ListPlus, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/shared/EmptyState";
import { ResponsiveDialog } from "@/components/horilla/primitives/ResponsiveDialog";
import {
  useLmsAccess, useLmsInvalidate, useLmsKras, useLmsModuleKras, useLmsModules, useLmsPlans, useLmsPositions, useLmsSeats,
} from "@/hooks/lms/useLmsData";
import { useLmsNav } from "@/hooks/lms/useLmsNav";
import { deleteSeat, saveSeat } from "@/lib/lms/actions";
import { LMS_DEPARTMENTS, departmentName } from "@/lib/lms/constants";
import { minutesLabel } from "@/lib/lms/format";
import { resolvePlanModules } from "@/lib/lms/planBuilder";
import type { LmsKra, LmsSeat } from "@/lib/lms/types";
import { ConfirmAction, ErrorBlock, LoadingBlock, ReadOnlyNote, SectionTitle, errorText } from "./LmsShared";
import { KraPickerDialog } from "./LmsPickers";

type SeatRow = LmsSeat & { kra_codes: string[] };

export function LmsSeats() {
  const { go } = useLmsNav();
  const { canManage } = useLmsAccess();
  const invalidate = useLmsInvalidate();
  const seatsQ = useLmsSeats();
  const krasQ = useLmsKras();
  const modulesQ = useLmsModules();
  const linksQ = useLmsModuleKras();
  const positionsQ = useLmsPositions();
  const plansQ = useLmsPlans();
  const [editing, setEditing] = useState<SeatRow | "new" | null>(null);

  const kraMap = useMemo(() => new Map((krasQ.data ?? []).map((k) => [k.code, k])), [krasQ.data]);
  const positions = useMemo(() => new Map((positionsQ.data ?? []).map((p) => [p.id, p.title])), [positionsQ.data]);

  const summary = (s: SeatRow) => {
    const r = resolvePlanModules({
      kraCodes: s.kra_codes, kras: kraMap, modules: modulesQ.data ?? [], moduleKras: linksQ.data ?? [],
      include: { company: true, department: true, subdepartment: true, platform: true },
    });
    const minutes = r.modules.reduce((x, m) => x + (m.duration_minutes || 0), 0);
    const ready = r.modules.filter((m) => m.status === "approved").length;
    return { modules: r.modules.length, minutes, ready };
  };

  if (seatsQ.error && !seatsQ.data) return <ErrorBlock error={seatsQ.error} onRetry={() => seatsQ.refetch()} />;
  if (seatsQ.isLoading || krasQ.isLoading) return <LoadingBlock rows={4} />;

  const seats = seatsQ.data ?? [];
  return (
    <div className="space-y-4">
      <SectionTitle
        title="Seats"
        description="A seat is a job's set of KRAs (for example, Binance chat operator). Choosing a seat in a new plan fills in its KRAs."
        actions={canManage ? <Button onClick={() => setEditing("new")}><Plus className="mr-1.5 h-4 w-4" /> New seat</Button> : undefined}
      />
      {!canManage ? <ReadOnlyNote /> : null}
      {seats.length === 0 ? (
        <Card>
          <EmptyState icon={Armchair} title="No seats yet" description="Create the seats you hire for most, starting with the Binance chat operator." action={canManage ? <Button size="sm" onClick={() => setEditing("new")}>New seat</Button> : undefined} />
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {seats.map((s) => {
            const sm = summary(s);
            const planCount = (plansQ.data ?? []).filter((p) => p.seat_id === s.id).length;
            return (
              <Card key={s.id} className={s.is_active ? undefined : "opacity-70"}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">{s.name}</p>
                      <p className="t-secondary">
                        {[s.department_code ? departmentName(s.department_code) : null, s.position_id ? positions.get(s.position_id) : null].filter(Boolean).join(" · ") || "—"}
                      </p>
                    </div>
                    {!s.is_active ? <Badge variant="muted">Inactive</Badge> : null}
                  </div>
                  {s.description ? <p className="text-sm text-muted-foreground">{s.description}</p> : null}
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-md bg-muted/40 py-2"><p className="t-kpi text-xl">{s.kra_codes.length}</p><p className="t-secondary">KRAs</p></div>
                    <div className="rounded-md bg-muted/40 py-2"><p className="t-kpi text-xl">{sm.modules}</p><p className="t-secondary">modules</p></div>
                    <div className="rounded-md bg-muted/40 py-2"><p className="t-kpi text-xl">{sm.ready}</p><p className="t-secondary">ready</p></div>
                  </div>
                  <p className="t-secondary">{minutesLabel(sm.minutes)} of teaching · {planCount} plan{planCount === 1 ? "" : "s"}</p>
                  <div className="flex flex-wrap gap-2">
                    {canManage ? <Button size="sm" variant="outline" onClick={() => setEditing(s)}><Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit</Button> : null}
                    {canManage && s.is_active ? <Button size="sm" variant="outline" onClick={() => go("new-plan", { seat: s.id })}><ListPlus className="mr-1.5 h-3.5 w-3.5" /> New plan</Button> : null}
                    {canManage ? (
                      <ConfirmAction
                        title={`Delete the seat "${s.name}"?`}
                        description="Plans made from this seat keep their KRAs; they just stop pointing to the seat."
                        confirmLabel="Delete"
                        destructive
                        onConfirm={async () => {
                          try {
                            await deleteSeat(s.id);
                            toast.success("Seat deleted");
                            await invalidate();
                          } catch (e) {
                            toast.error(errorText(e));
                          }
                        }}
                      >
                        {(open) => <Button size="sm" variant="ghost" className="text-destructive" onClick={open}><Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete</Button>}
                      </ConfirmAction>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      <SeatDialog
        open={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        seat={editing && editing !== "new" ? editing : null}
        kras={krasQ.data}
        positions={positionsQ.data ?? []}
        onSaved={() => invalidate()}
      />
    </div>
  );
}

function SeatDialog({ open, onOpenChange, seat, kras, positions, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; seat: SeatRow | null; kras: LmsKra[] | undefined;
  positions: { id: string; title: string }[]; onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [dept, setDept] = useState<string>("none");
  const [position, setPosition] = useState<string>("none");
  const [description, setDescription] = useState("");
  const [active, setActive] = useState(true);
  const [codes, setCodes] = useState<string[]>([]);
  const [picker, setPicker] = useState(false);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!open) return;
    setName(seat?.name ?? "");
    setDept(seat?.department_code ?? "none");
    setPosition(seat?.position_id ?? "none");
    setDescription(seat?.description ?? "");
    setActive(seat?.is_active ?? true);
    setCodes(seat?.kra_codes ?? []);
  }, [open, seat]);
  const kraMap = useMemo(() => new Map((kras ?? []).map((k) => [k.code, k])), [kras]);
  const save = async () => {
    setSaving(true);
    try {
      await saveSeat({
        id: seat?.id, name, department_code: dept === "none" ? null : dept, position_id: position === "none" ? null : position,
        description, is_active: active, kra_codes: codes, previous_codes: seat?.kra_codes ?? [],
      });
      toast.success(seat ? "Seat saved" : "Seat created");
      onSaved();
      onOpenChange(false);
    } catch (e) {
      const msg = errorText(e);
      toast.error(/duplicate|unique/i.test(msg) ? "A seat with this name already exists." : msg);
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      <ResponsiveDialog
        open={open && !picker}
        onOpenChange={(o) => !saving && onOpenChange(o)}
        title={seat ? "Edit seat" : "New seat"}
        description="A job's name and its KRAs."
        contentClassName="max-w-2xl"
        footer={
          <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
            <Button onClick={save} disabled={saving || !name.trim()}>{saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null} Save</Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="lms-sname">Name</Label>
            <Input id="lms-sname" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Binance chat operator" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Department</Label>
              <Select value={dept} onValueChange={setDept}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {LMS_DEPARTMENTS.map((d) => <SelectItem key={d.code} value={d.code}>{d.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>HR position</Label>
              <Select value={position} onValueChange={setPosition}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {positions.map((p) => <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lms-sdesc">Description</Label>
            <Textarea id="lms-sdesc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm"><Switch checked={active} onCheckedChange={setActive} /> Active</label>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label>KRAs ({codes.length})</Label>
              <Button size="sm" variant="outline" onClick={() => setPicker(true)}><ListPlus className="mr-1.5 h-3.5 w-3.5" /> Choose KRAs</Button>
            </div>
            {codes.length === 0 ? <p className="text-sm text-muted-foreground">No KRAs yet.</p> : (
              <ul className="max-h-56 space-y-1 overflow-y-auto rounded-md border border-border p-2 text-sm">
                {codes.map((c) => (
                  <li key={c}><span className="t-mono mr-1.5 text-xs text-muted-foreground">{c}</span>{kraMap.get(c)?.name ?? "Not in the catalogue"}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </ResponsiveDialog>
      <KraPickerDialog
        open={open && picker}
        onOpenChange={(o) => setPicker(o)}
        kras={kras}
        selected={codes}
        onDone={(c) => setCodes(c.sort((a, b) => (kraMap.get(a)?.sort_order ?? 0) - (kraMap.get(b)?.sort_order ?? 0)))}
        title="KRAs for this seat"
      />
    </>
  );
}
