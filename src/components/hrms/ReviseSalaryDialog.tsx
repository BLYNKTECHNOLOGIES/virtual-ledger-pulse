import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { toast } from "sonner";
import { useComplianceSettings } from "@/hooks/hrms/useComplianceSettings";
import { Switch } from "@/components/ui/switch";


const RECURRING_TYPES = [
  { value: "increment", label: "Increment / Hike" },
  { value: "promotion", label: "Promotion" },
  { value: "correction", label: "Correction" },
  { value: "demotion", label: "Demotion / Decrease" },
];

const ONE_TIME_TYPES = [
  { value: "bonus", label: "Bonus" },
  { value: "performance_incentive", label: "Performance Incentive" },
  { value: "retention_bonus", label: "Retention Bonus" },
  { value: "special_allowance", label: "Special Allowance" },
  { value: "ad_hoc", label: "Ad-hoc Adjustment" },
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  presetEmployeeId?: string;
}

type Mode = "recurring" | "one_time" | "statutory";

export function ReviseSalaryDialog({ open, onOpenChange, presetEmployeeId }: Props) {
  const qc = useQueryClient();
  const { user } = useAuth();

  const [mode, setMode] = useState<Mode>("recurring");
  const [employeeId, setEmployeeId] = useState<string>("");
  const [revisionType, setRevisionType] = useState<string>("increment");
  const [newTotal, setNewTotal] = useState<string>("");
  const [newBasic, setNewBasic] = useState<string>("");
  const [effectiveFrom, setEffectiveFrom] = useState<Date>(new Date());
  const [reason, setReason] = useState<string>("");

  // One-time fields
  const [oneTimeAmount, setOneTimeAmount] = useState<string>("");
  const [payoutMonth, setPayoutMonth] = useState<Date>(new Date());
  const [notes, setNotes] = useState<string>("");

  // Statutory toggle fields (null = "use global default")
  const [pfEnabled, setPfEnabled] = useState<boolean | null>(null);
  const [esiEnabled, setEsiEnabled] = useState<boolean | null>(null);
  const [ptEnabled, setPtEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    if (open) {
      setMode("recurring");
      setEmployeeId(presetEmployeeId || "");
      setRevisionType("increment");
      setNewTotal("");
      setNewBasic("");
      setEffectiveFrom(new Date());
      setReason("");
      setOneTimeAmount("");
      setPayoutMonth(new Date());
      setNotes("");
      setPfEnabled(null);
      setEsiEnabled(null);
      setPtEnabled(null);
    }
  }, [open, presetEmployeeId]);

  useEffect(() => {
    if (mode === "recurring") setRevisionType("increment");
    else if (mode === "one_time") setRevisionType("bonus");
    else setRevisionType("statutory_toggle");
  }, [mode]);


  const { data: employees = [] } = useQuery({
    queryKey: ["hr_employees_for_revision"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_employees")
        .select("id, first_name, last_name, badge_id, basic_salary, total_salary, is_active, pf_enabled, esi_enabled, pt_enabled")
        .order("is_active", { ascending: false })
        .order("first_name");
      if (error) throw error;
      return data || [];
    },
    enabled: open,
  });

  const employee = useMemo(
    () => employees.find((e: any) => e.id === employeeId),
    [employees, employeeId],
  );

  // Seed statutory switches from the selected employee's current flags
  useEffect(() => {
    if (mode !== "statutory" || !employee) return;
    setPfEnabled(employee.pf_enabled ?? null);
    setEsiEnabled(employee.esi_enabled ?? null);
    setPtEnabled(employee.pt_enabled ?? null);
  }, [employeeId, mode, employee]);


  const currentBasic = Number(employee?.basic_salary || 0);
  const currentTotal = Number(employee?.total_salary || 0);
  const nT = parseFloat(newTotal) || 0;
  const nB = parseFloat(newBasic) || 0;
  const totalDelta = nT - currentTotal;
  const totalDeltaPct = currentTotal > 0 ? (totalDelta / currentTotal) * 100 : 0;

  const reasonRequired = revisionType === "promotion" || revisionType === "demotion";
  const isScheduled = mode === "recurring" && effectiveFrom > new Date(new Date().setHours(23, 59, 59, 999));

  const mutation = useMutation({
    mutationFn: async () => {
      if (!employeeId) throw new Error("Select an employee");

      const u = user as any;
      const approvedBy =
        [u?.firstName, u?.lastName].filter(Boolean).join(" ") ||
        u?.email ||
        "System";

      if (mode === "recurring") {
        if (!newTotal) throw new Error("Enter the new total salary");
        if (reasonRequired && !reason.trim()) throw new Error("Reason is mandatory for Promotion / Demotion");

        const { data, error } = await (supabase as any).rpc("apply_salary_revision", {
          p_employee_id: employeeId,
          p_new_basic: nB || null,
          p_new_total: nT,
          p_revision_type: revisionType,
          p_reason: reason || null,
          p_effective_from: format(effectiveFrom, "yyyy-MM-dd"),
          p_approved_by: approvedBy,
        });
        if (error) throw error;
        return { kind: "recurring", data };
      }

      if (mode === "one_time") {
        const amt = parseFloat(oneTimeAmount);
        if (!amt || amt <= 0) throw new Error("Enter a valid amount");

        const { error } = await (supabase as any)
          .from("hr_salary_revisions")
          .insert({
            employee_id: employeeId,
            revision_type: revisionType,
            one_time_amount: amt,
            payout_month: format(payoutMonth, "yyyy-MM-01"),
            effective_from: format(payoutMonth, "yyyy-MM-01"),
            revision_reason: reason || null,
            notes: notes || null,
            approved_by: approvedBy,
            status: "APPLIED",
          });
        if (error) throw error;
        return { kind: "one_time" };
      }

      // statutory toggle
      if (!reason.trim()) throw new Error("Reason is mandatory for a statutory enrollment change (e.g. 'Training period exemption')");
      // Resolve nulls against the employee's current flags (null means "leave as-is")
      const finalPf = pfEnabled === null ? (employee?.pf_enabled ?? true) : pfEnabled;
      const finalEsi = esiEnabled === null ? (employee?.esi_enabled ?? true) : esiEnabled;
      const finalPt = ptEnabled === null ? (employee?.pt_enabled ?? true) : ptEnabled;

      const { data, error } = await (supabase as any).rpc("apply_statutory_revision", {
        p_employee_id: employeeId,
        p_pf_enabled: finalPf,
        p_esi_enabled: finalEsi,
        p_pt_enabled: finalPt,
        p_effective_from: format(effectiveFrom, "yyyy-MM-dd"),
        p_reason: reason,
        p_approved_by: approvedBy,
      });
      if (error) throw error;
      return { kind: "statutory", data };
    },
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["hr_salary_revisions"] });
      qc.invalidateQueries({ queryKey: ["hr_employees"] });
      qc.invalidateQueries({ queryKey: ["employee-compensation-history"] });
      qc.invalidateQueries({ queryKey: ["hr_employees_for_revision"] });
      qc.invalidateQueries({ queryKey: ["data_health_unknown_enrollment"] });
      if (res?.kind === "recurring") {
        toast.success(
          res.data?.status === "SCHEDULED"
            ? `Revision scheduled for ${res.data.effective_from}`
            : "Salary revision applied",
        );
        if (employeeId) {
          import("@/lib/razorpayPushback").then(m => m.pushSalaryToRazorpay(employeeId));
        }
      } else if (res?.kind === "statutory") {
        const status = res.data?.status;
        if (status === "NOOP") {
          toast.info("No change — statutory flags already match.");
        } else if (status === "SCHEDULED") {
          toast.success(`Statutory change scheduled for ${res.data?.effective_from}`);
        } else {
          toast.success("Statutory enrollment updated locally. Pushing to Razorpay…");
          if (employeeId) {
            import("@/lib/razorpayPushback").then(m => m.pushStatutoryToRazorpay(employeeId, { triggeredFrom: "revise_salary_dialog" }));
          }
        }
      } else {
        toast.success("One-time compensation recorded");
      }
      onOpenChange(false);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const typeOptions = mode === "recurring" ? RECURRING_TYPES : ONE_TIME_TYPES;


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Compensation Change</DialogTitle>
          <DialogDescription>
            Record a recurring salary revision (CTC change), a one-time payout (bonus, incentive), or a statutory enrollment toggle (PF / ESI / PT — used for training-period exemptions).
          </DialogDescription>
        </DialogHeader>

        {/* Mode toggle */}
        <div className="grid grid-cols-3 gap-1.5 p-1 bg-muted rounded-lg">
          <button
            type="button"
            onClick={() => setMode("recurring")}
            className={cn(
              "text-[11px] sm:text-xs font-medium py-2 rounded-md transition-colors",
              mode === "recurring" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
            )}
          >
            CTC change
          </button>
          <button
            type="button"
            onClick={() => setMode("one_time")}
            className={cn(
              "text-[11px] sm:text-xs font-medium py-2 rounded-md transition-colors",
              mode === "one_time" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
            )}
          >
            One-time payout
          </button>
          <button
            type="button"
            onClick={() => setMode("statutory")}
            className={cn(
              "text-[11px] sm:text-xs font-medium py-2 rounded-md transition-colors",
              mode === "statutory" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
            )}
          >
            Statutory toggle
          </button>
        </div>


        <div className="space-y-3">
          <div>
            <Label>Employee</Label>
            <Select value={employeeId} onValueChange={setEmployeeId} disabled={!!presetEmployeeId}>
              <SelectTrigger className="text-foreground">
                <SelectValue placeholder="Select employee..." />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {employees.map((e: any) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.first_name} {e.last_name} {e.badge_id ? `· ${e.badge_id}` : ""}{!e.is_active ? " (Separated)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {employee && mode === "recurring" && (
              <p className="text-xs text-muted-foreground mt-1">
                Current CTC ₹{currentTotal.toLocaleString("en-IN")} · Basic ₹{currentBasic.toLocaleString("en-IN")}
              </p>
            )}
          </div>

          {mode !== "statutory" && (
            <div>
              <Label>Type</Label>
              <Select value={revisionType} onValueChange={setRevisionType}>
                <SelectTrigger className="text-foreground"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {typeOptions.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}


          {mode === "recurring" ? (
            <>
              <div>
                <Label>Effective from</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal text-foreground")}>
                      <CalendarIcon className="h-4 w-4 mr-2" />
                      {format(effectiveFrom, "PPP")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={effectiveFrom} onSelect={(d) => d && setEffectiveFrom(d)} initialFocus className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>New Total (CTC) ₹</Label>
                  <Input type="number" inputMode="decimal" value={newTotal} onChange={(e) => setNewTotal(e.target.value)} className="text-foreground" placeholder="e.g. 60000" />
                  {nT > 0 && currentTotal > 0 && (
                    <p className={cn("text-xs mt-1", totalDelta >= 0 ? "text-success" : "text-destructive")}>
                      {totalDelta >= 0 ? "+" : ""}₹{totalDelta.toLocaleString("en-IN")} ({totalDeltaPct.toFixed(1)}%)
                    </p>
                  )}
                </div>
                <div>
                  <Label>New Basic ₹</Label>
                  <Input type="number" inputMode="decimal" value={newBasic} onChange={(e) => setNewBasic(e.target.value)} className="text-foreground" placeholder="Optional" />
                  <p className="text-xs text-muted-foreground mt-1">Leave blank to keep basic unchanged.</p>
                </div>
              </div>

              <DefaultStructurePreview annualCtc={nT} />


              <div>
                <Label>Reason / notes {reasonRequired && <span className="text-destructive">*</span>}</Label>
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)} className="text-foreground" placeholder={reasonRequired ? "Required for promotion/demotion" : "Optional"} rows={2} />
              </div>

              {isScheduled && (
                <div className="text-xs bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30 rounded p-2">
                  Future-dated — will be scheduled and auto-applied on {format(effectiveFrom, "PPP")}.
                </div>
              )}
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Amount ₹</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={oneTimeAmount}
                    onChange={(e) => setOneTimeAmount(e.target.value)}
                    className="text-foreground"
                    placeholder="e.g. 15000"
                  />
                </div>
                <div>
                  <Label>Payout month</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start text-left font-normal text-foreground">
                        <CalendarIcon className="h-4 w-4 mr-2" />
                        {format(payoutMonth, "MMM yyyy")}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={payoutMonth} onSelect={(d) => d && setPayoutMonth(d)} initialFocus className="p-3 pointer-events-auto" />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              <div>
                <Label>Reason</Label>
                <Input value={reason} onChange={(e) => setReason(e.target.value)} className="text-foreground" placeholder="e.g. Q4 performance, Diwali bonus" />
              </div>

              <div>
                <Label>Notes</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="text-foreground" placeholder="Optional details" rows={2} />
              </div>

              <div className="text-xs bg-muted/50 border border-border rounded p-2 text-muted-foreground">
                One-time payouts are logged against the employee's compensation history and do NOT change their CTC.
                Pay it out through the next payroll run or Razorpay one-off ad-hoc payout.
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={
              mutation.isPending ||
              !employeeId ||
              (mode === "recurring" ? !newTotal : !oneTimeAmount)
            }
          >
            {mode === "recurring"
              ? (isScheduled ? "Schedule revision" : "Apply revision")
              : "Record payout"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Live breakdown mirroring the RazorpayX default structure. Renders only when
// the org toggle `use_xpayroll_default_structure` is ON in the compliance mirror
// and the user has typed a valid CTC — so revisions align with what Razorpay
// will actually apply on push.
function DefaultStructurePreview({ annualCtc }: { annualCtc: number }) {
  const { data: settings } = useComplianceSettings();
  if (!settings?.use_xpayroll_default_structure) return null;
  const components = settings.default_structure_components ?? [];
  if (!annualCtc || annualCtc <= 0 || components.length === 0) return null;
  const monthly = annualCtc / 12;
  const rows = components.map(c => {
    const monthlyAmt = c.mode === "percentage" ? (monthly * (c.value || 0)) / 100 : (c.value || 0);
    return { ...c, monthly: monthlyAmt, annual: monthlyAmt * 12 };
  });
  return (
    <div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-xs">
      <div className="flex items-center justify-between mb-1.5">
        <span className="font-medium text-foreground">RazorpayX default breakup</span>
        <span className="text-[10px] text-muted-foreground">Mirror preview · not yet pushed</span>
      </div>
      <div className="space-y-0.5">
        {rows.map(r => (
          <div key={r.key} className="flex justify-between font-mono tabular-nums">
            <span className="text-muted-foreground">
              {r.label} {r.mode === "percentage" ? `(${r.value}%)` : "(fixed)"}
            </span>
            <span>₹{Math.round(r.monthly).toLocaleString("en-IN")}/mo</span>
          </div>
        ))}
      </div>
    </div>
  );
}
