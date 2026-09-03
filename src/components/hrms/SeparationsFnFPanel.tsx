import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SeparationReasonSelect } from "@/components/hrms/SeparationReasonSelect";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { AlertTriangle, UserMinus, Plus, Pencil, CalendarClock, Send } from "lucide-react";
import { FnFSettlementDialog } from "@/components/hrms/FnFSettlementDialog";

/**
 * Cockpit Step 3 — Separations & Full & Final for the selected payroll cycle.
 *
 * Everything here works on the SAME records as the Full & Final page and the
 * exit checklist: the shared FnFSettlementDialog does the create/edit, and
 * resignation initiation writes the same employee fields as the Separation
 * page. Nothing is forked or duplicated.
 */

const EDITABLE_STATUSES = ["draft", "calculated"];

function monthKey(iso?: string | null) {
  return (iso || "").slice(0, 7);
}

function inr(n: any) {
  return `₹${Number(n ?? 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
}

function statusTone(s: string) {
  switch (s) {
    case "paid":
      return "border-success/40 bg-success/10 text-success";
    case "approved":
      return "border-info/40 bg-info/10 text-info";
    case "cancelled":
      return "border-muted bg-muted text-muted-foreground";
    default:
      return "border-warning/40 bg-warning/10 text-warning";
  }
}

export default function SeparationsFnFPanel({ month }: { month?: string }) {
  const qc = useQueryClient();
  const cycle = monthKey(month) || new Date().toISOString().slice(0, 7);
  const cycleLabel = new Date(`${cycle}-01T00:00:00Z`).toLocaleString("en-IN", {
    month: "long",
    year: "numeric",
  });

  const [dialogFor, setDialogFor] = useState<
    | { mode: "edit"; settlement: any }
    | { mode: "create"; employee: any }
    | null
  >(null);
  const [showInitiate, setShowInitiate] = useState(false);
  const [form, setForm] = useState({
    employee_id: "",
    resignation_date: "",
    notice_period_end_date: "",
    last_working_day: "",
    separation_reason: "",
  });

  const { data: settlements = [], isLoading } = useQuery({
    queryKey: ["hr_fnf_settlements"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_fnf_settlements")
        .select(
          "*, hr_employees!hr_fnf_settlements_employee_id_fkey(first_name, last_name, badge_id, last_working_day)",
        )
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: separated = [] } = useQuery({
    queryKey: ["hr_separated_employees_cockpit"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_employees")
        .select(
          "id, first_name, last_name, badge_id, last_working_day, notice_period_end_date, resignation_date, resignation_status, is_active",
        )
        .not("resignation_status", "is", null)
        .order("last_working_day", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const { data: activeEmployees = [] } = useQuery({
    queryKey: ["active-employees-for-resignation"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_employees")
        .select("id, badge_id, first_name, last_name")
        .eq("is_active", true)
        .is("resignation_status", null)
        .order("first_name");
      if (error) throw error;
      return data || [];
    },
  });

  const live = settlements.filter((s: any) => s.status !== "cancelled");

  // Settlements tagged for this payroll cycle (legacy rows fall back to their
  // last working day month — same rule the cockpit step uses in SQL).
  const cycleSettlements = useMemo(
    () =>
      live.filter(
        (s: any) => monthKey(s.payroll_month || s.last_working_day) === cycle,
      ),
    [live, cycle],
  );

  const settledIds = new Set(live.map((s: any) => s.employee_id));

  // Exits whose separation lands in this month but which have no settlement yet.
  const exitsWithoutFnF = useMemo(
    () =>
      separated.filter((e: any) => {
        const when =
          e.last_working_day || e.notice_period_end_date || e.resignation_date;
        return (
          monthKey(when) === cycle &&
          String(e.resignation_status || "").toLowerCase() !== "cancelled" &&
          !settledIds.has(e.id)
        );
      }),
    [separated, cycle, settledIds],
  );

  // Settlements sitting on another cycle but whose employee exited in this one —
  // easy to mis-tag, so surface them with a one-click retag.
  const misTagged = useMemo(
    () =>
      live.filter((s: any) => {
        const tagged = monthKey(s.payroll_month || s.last_working_day);
        const lwd = monthKey(s.last_working_day || s.hr_employees?.last_working_day);
        return (
          tagged !== cycle &&
          lwd === cycle &&
          EDITABLE_STATUSES.includes(String(s.status))
        );
      }),
    [live, cycle],
  );

  const retag = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("hr_fnf_settlements")
        .update({ payroll_month: `${cycle}-01`, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(`Payroll cycle set to ${cycleLabel}`);
      qc.invalidateQueries({ queryKey: ["hr_fnf_settlements"] });
      qc.invalidateQueries({ queryKey: ["hr_cockpit_month_state"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Draft → calculated (same transition as the "Submit" action on the F&F page).
  const submitDraft = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any)
        .from("hr_fnf_settlements")
        .update({ status: "calculated", updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Submitted — settlement is now awaiting approval");
      qc.invalidateQueries({ queryKey: ["hr_fnf_settlements"] });
      qc.invalidateQueries({ queryKey: ["hr_cockpit_month_state"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const initiate = useMutation({

    mutationFn: async () => {
      if (!form.employee_id) throw new Error("Select an employee");
      if (!form.resignation_date || !form.last_working_day)
        throw new Error("Resignation date and last working day are required");
      const { error } = await supabase
        .from("hr_employees")
        .update({
          resignation_status: "pending_approval",
          resignation_date: form.resignation_date,
          notice_period_end_date: form.notice_period_end_date || null,
          last_working_day: form.last_working_day,
          separation_reason: form.separation_reason,
        })
        .eq("id", form.employee_id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Resignation submitted for approval");
      setShowInitiate(false);
      setForm({
        employee_id: "",
        resignation_date: "",
        notice_period_end_date: "",
        last_working_day: "",
        separation_reason: "",
      });
      qc.invalidateQueries({ queryKey: ["hr_separated_employees_cockpit"] });
      qc.invalidateQueries({ queryKey: ["active-employees-for-resignation"] });
      qc.invalidateQueries({ queryKey: ["resignation-employees"] });
      qc.invalidateQueries({ queryKey: ["hr_cockpit_month_state"] });
    },
    onError: (e: any) => toast.error(e.message),
  });

  const afterSaved = () => {
    setDialogFor(null);
    qc.invalidateQueries({ queryKey: ["hr_fnf_settlements"] });
    qc.invalidateQueries({ queryKey: ["hr_separated_employees_cockpit"] });
    qc.invalidateQueries({ queryKey: ["hr_cockpit_month_state"] });
  };

  const openUnfinished = cycleSettlements.filter((s: any) =>
    ["draft", "calculated", "pending_approval"].includes(String(s.status)),
  ).length;
  const approvedUnpushed = cycleSettlements.filter(
    (s: any) =>
      s.status === "approved" &&
      !["pushed", "nothing_to_push"].includes(String(s.razorpay_push_status || "")),
  ).length;

  const initials = (a?: string, b?: string) =>
    `${(a || "").charAt(0)}${(b || "").charAt(0)}`.toUpperCase() || "–";

  const SectionHead = ({
    icon: Icon,
    title,
    count,
    tone = "muted",
  }: {
    icon: any;
    title: string;
    count?: number;
    tone?: "muted" | "warning" | "destructive";
  }) => (
    <div className="flex items-center gap-2">
      <Icon
        className={`h-3.5 w-3.5 shrink-0 ${
          tone === "destructive"
            ? "text-destructive"
            : tone === "warning"
              ? "text-warning"
              : "text-muted-foreground"
        }`}
      />
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
        {title}
      </p>
      {typeof count === "number" && (
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
          {count}
        </span>
      )}
      <span className="h-px flex-1 bg-border" />
    </div>
  );

  const Avatar = ({ text, tone }: { text: string; tone?: string }) => (
    <div
      className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-[11px] font-semibold ${
        tone || "bg-primary/10 text-primary"
      }`}
    >
      {text}
    </div>
  );

  return (
    <div className="p-3 md:p-6 space-y-5 max-w-5xl mx-auto">
      {/* Header */}
      <div className="rounded-xl border bg-card p-4 md:p-5 space-y-3">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 space-y-1">
            <h3 className="text-base md:text-lg font-semibold leading-tight">
              Separations &amp; Full &amp; Final
              <span className="text-muted-foreground font-normal"> — {cycleLabel}</span>
            </h3>
            <p className="text-xs text-muted-foreground max-w-2xl">
              Everything settled here is the same record as on the Full &amp; Final page.
              Approved settlements reach payroll through the Inputs step, tagged as F&amp;F.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="ml-auto gap-1.5 w-full sm:w-auto"
            onClick={() => setShowInitiate(true)}
          >
            <UserMinus className="h-4 w-4" /> Initiate resignation
          </Button>
        </div>

        {/* At-a-glance counters */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {[
            { label: "Scheduled F&F", value: cycleSettlements.length, tone: "" },
            { label: "Unfinished", value: openUnfinished, tone: "text-warning" },
            { label: "Approved, not pushed", value: approvedUnpushed, tone: "text-warning" },
            { label: "Exits without F&F", value: exitsWithoutFnF.length, tone: "text-destructive" },
          ].map((m) => (
            <div key={m.label} className="rounded-lg border bg-muted/30 px-3 py-2">
              <p className={`text-lg font-semibold tabular-nums leading-none ${m.tone}`}>
                {m.value}
              </p>
              <p className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                {m.label}
              </p>
            </div>
          ))}
        </div>
      </div>

      {(openUnfinished > 0 || approvedUnpushed > 0 || exitsWithoutFnF.length > 0) && (
        <Card className="border-warning/40 bg-warning/5">
          <CardContent className="p-3 text-xs space-y-1.5">
            {exitsWithoutFnF.length > 0 && (
              <p className="flex gap-2">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning" />
                {exitsWithoutFnF.length} exit(s) this cycle have no settlement yet.
              </p>
            )}
            {openUnfinished > 0 && (
              <p className="flex gap-2">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning" />
                {openUnfinished} settlement(s) still unfinished (draft / calculated / awaiting approval).
              </p>
            )}
            {approvedUnpushed > 0 && (
              <p className="flex gap-2">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-warning" />
                {approvedUnpushed} approved settlement(s) not yet pushed to RazorpayX — clear
                them on the Inputs push step.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* 1) Settlements scheduled for this cycle */}
      <div className="space-y-2.5">
        <SectionHead
          icon={CalendarClock}
          title="F&F scheduled for this payroll cycle"
          count={cycleSettlements.length}
        />
        {isLoading ? (
          <div className="space-y-2">
            {[0, 1].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-muted/50" />
            ))}
          </div>
        ) : cycleSettlements.length === 0 ? (
          <div className="rounded-xl border border-dashed p-6 text-center">
            <p className="text-sm text-muted-foreground">
              No settlement is scheduled for {cycleLabel}.
            </p>
          </div>
        ) : (
          cycleSettlements.map((s: any) => {
            const emp = s.hr_employees || {};
            return (
              <Card key={s.id} className="transition-colors hover:border-primary/40">
                <CardContent className="p-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                  <Avatar text={initials(emp.first_name, emp.last_name)} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">
                      {emp.first_name} {emp.last_name}
                      <span className="text-muted-foreground font-normal">
                        {" "}
                        · {emp.badge_id}
                      </span>
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      LWD {s.last_working_day || emp.last_working_day || "—"} · Net{" "}
                      <span className="tabular-nums font-medium text-foreground">
                        {inr(s.net_payable)}
                      </span>
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 ml-auto flex-wrap">
                    <Badge variant="outline" className={statusTone(String(s.status))}>
                      {String(s.status).replace("_", " ")}
                    </Badge>
                    {s.razorpay_push_status && (
                      <Badge variant="outline" className="text-[10px] font-normal">
                        RazorpayX {String(s.razorpay_push_status).replace(/_/g, " ")}
                      </Badge>
                    )}
                    {EDITABLE_STATUSES.includes(String(s.status)) ? (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 gap-1.5"
                          onClick={() => setDialogFor({ mode: "edit", settlement: s })}
                        >
                          <Pencil className="h-3.5 w-3.5" /> Edit
                        </Button>
                        {String(s.status) === "draft" && (
                          <Button
                            size="sm"
                            className="h-8 gap-1.5"
                            disabled={submitDraft.isPending}
                            onClick={() => submitDraft.mutate(s.id)}
                          >
                            <Send className="h-3.5 w-3.5" /> Submit
                          </Button>
                        )}
                      </>
                    ) : (

                      <span className="text-[11px] text-muted-foreground">
                        Locked — manage on the F&amp;F page
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* 2) Exits in this month with no F&F */}
      {exitsWithoutFnF.length > 0 && (
        <div className="space-y-2.5">
          <SectionHead
            icon={AlertTriangle}
            title="Exits this cycle without a settlement"
            count={exitsWithoutFnF.length}
            tone="destructive"
          />
          {exitsWithoutFnF.map((e: any) => (
            <Card key={e.id} className="border-destructive/30 bg-destructive/[0.03]">
              <CardContent className="p-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                <Avatar
                  text={initials(e.first_name, e.last_name)}
                  tone="bg-destructive/10 text-destructive"
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {e.first_name} {e.last_name}
                    <span className="text-muted-foreground font-normal"> · {e.badge_id}</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    LWD {e.last_working_day || e.notice_period_end_date || e.resignation_date} ·{" "}
                    {String(e.resignation_status || "").replace("_", " ")}
                  </p>
                </div>
                <Button
                  size="sm"
                  className="h-8 gap-1.5 ml-auto"
                  onClick={() => setDialogFor({ mode: "create", employee: e })}
                >
                  <Plus className="h-3.5 w-3.5" /> Create F&amp;F
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* 3) Mis-tagged cycles */}
      {misTagged.length > 0 && (
        <div className="space-y-2.5">
          <SectionHead
            icon={CalendarClock}
            title="Exited this cycle but tagged to another payroll month"
            count={misTagged.length}
            tone="warning"
          />
          {misTagged.map((s: any) => (
            <Card key={s.id} className="border-warning/40 bg-warning/[0.04]">
              <CardContent className="p-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                <Avatar
                  text={initials(s.hr_employees?.first_name, s.hr_employees?.last_name)}
                  tone="bg-warning/10 text-warning"
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">
                    {s.hr_employees?.first_name} {s.hr_employees?.last_name}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Tagged to {monthKey(s.payroll_month || s.last_working_day)} · LWD{" "}
                    {s.last_working_day || "—"}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 ml-auto"
                  disabled={retag.isPending}
                  onClick={() => retag.mutate(s.id)}
                >
                  Move to {cycle}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}


      {/* Shared create/edit dialog — identical to the F&F page and exit checklist */}
      <FnFSettlementDialog
        open={!!dialogFor}
        onOpenChange={(o) => !o && setDialogFor(null)}
        settlement={dialogFor?.mode === "edit" ? dialogFor.settlement : null}
        fixedEmployee={dialogFor?.mode === "create" ? dialogFor.employee : null}
        onSaved={afterSaved}
      />

      <Dialog open={showInitiate} onOpenChange={setShowInitiate}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Initiate resignation</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Employee</Label>
              <Select
                value={form.employee_id}
                onValueChange={(v) => setForm({ ...form, employee_id: v })}
              >
                <SelectTrigger className="h-9 mt-1 text-foreground">
                  <SelectValue placeholder="Select employee" />
                </SelectTrigger>
                <SelectContent>
                  {activeEmployees.map((e: any) => (
                    <SelectItem key={e.id} value={e.id}>
                      {e.first_name} {e.last_name} · {e.badge_id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Resignation date</Label>
                <Input
                  className="h-9 mt-1 text-foreground"
                  type="date"
                  value={form.resignation_date}
                  onChange={(e) => setForm({ ...form, resignation_date: e.target.value })}
                />
              </div>
              <div>
                <Label>Notice period end</Label>
                <Input
                  className="h-9 mt-1 text-foreground"
                  type="date"
                  value={form.notice_period_end_date}
                  onChange={(e) =>
                    setForm({ ...form, notice_period_end_date: e.target.value })
                  }
                />
              </div>
            </div>
            <div>
              <Label>Last working day</Label>
              <Input
                className="h-9 mt-1 text-foreground"
                type="date"
                value={form.last_working_day}
                onChange={(e) => setForm({ ...form, last_working_day: e.target.value })}
              />
            </div>
            <div>
              <Label>Reason</Label>
              <SeparationReasonSelect
                compact
                value={form.separation_reason}
                onChange={(v) => setForm({ ...form, separation_reason: v })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInitiate(false)}>
              Cancel
            </Button>
            <Button onClick={() => initiate.mutate()} disabled={initiate.isPending}>
              {initiate.isPending ? "Submitting…" : "Submit for approval"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
