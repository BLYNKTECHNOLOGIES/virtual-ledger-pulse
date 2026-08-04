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
import { additionTypeCode } from "@/lib/hrms/additionType";


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
  { value: "one_time_correction", label: "Correction" },
];

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  presetEmployeeId?: string;
}

type Mode = "recurring" | "addition" | "deduction" | "one_time" | "statutory";

const ADDITION_KINDS = [
  { value: "bonus", label: "Bonus" },
  { value: "arrears", label: "Arrears" },
  { value: "reimbursement", label: "Reimbursement" },
  { value: "other", label: "Other" },
];

const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);

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

  // Payroll input (addition / deduction) fields
  const [inputAmount, setInputAmount] = useState<string>("");
  const [inputLabel, setInputLabel] = useState<string>("");
  const [inputPeriod, setInputPeriod] = useState<Date>(startOfMonth(new Date()));
  const [additionKind, setAdditionKind] = useState<string>("bonus");
  const [taxable, setTaxable] = useState<boolean>(true);

  // One-time payout (record-only) payment date
  const [paidOn, setPaidOn] = useState<Date>(new Date());

  // Statutory toggle fields (null = "use global default")
  const [pfEnabled, setPfEnabled] = useState<boolean | null>(null);
  const [esiEnabled, setEsiEnabled] = useState<boolean | null>(null);
  const [ptEnabled, setPtEnabled] = useState<boolean | null>(null);

  // When effective date is in the future, operator can override and apply the
  // change right now instead of scheduling it for the future date.
  const [applyNow, setApplyNow] = useState<boolean>(false);



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
      setInputAmount("");
      setInputLabel("");
      setInputPeriod(startOfMonth(new Date()));
      setAdditionKind("bonus");
      setTaxable(true);
      setPaidOn(new Date());
      setPfEnabled(null);
      setEsiEnabled(null);
      setPtEnabled(null);
      setApplyNow(false);
    }
  }, [open, presetEmployeeId]);

  useEffect(() => {
    if (mode === "recurring") setRevisionType("increment");
    else if (mode === "one_time") setRevisionType("bonus");
    else if (mode === "addition") setRevisionType("payroll_addition");
    else if (mode === "deduction") setRevisionType("payroll_deduction");
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

  // RazorpayX link — required to stage additions / deductions on a payroll month.
  const { data: razorpayEmployeeId } = useQuery({
    queryKey: ["hr_razorpay_map_for_revision", employeeId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_razorpay_employee_map")
        .select("razorpay_employee_id")
        .eq("hr_employee_id", employeeId)
        .maybeSingle();
      if (error) throw error;
      return (data?.razorpay_employee_id as string | undefined) ?? null;
    },
    enabled: open && !!employeeId,
  });


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
  // Future-dated revisions are supported: they are saved as SCHEDULED and
  // promoted (employee CTC updated + pushed to RazorpayX) by the daily
  // hr-promote-scheduled-salary-revisions cron on the effective date.
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
  const rawFutureDated = effectiveFrom > new Date(new Date().setHours(23, 59, 59, 999));
  const isFutureDated = rawFutureDated && !applyNow;
  const effectiveDateForRpc = applyNow && rawFutureDated ? new Date() : effectiveFrom;


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
        // Future-dated → the RPC stores as SCHEDULED and the daily cron promotes + pushes to RazorpayX on the effective date.

        const { data, error } = await (supabase as any).rpc("apply_salary_revision", {
          p_employee_id: employeeId,
          p_new_basic: nB || null,
          p_new_total: nT,
          p_revision_type: revisionType,
          p_reason: reason || null,
          p_effective_from: format(effectiveDateForRpc, "yyyy-MM-dd"),
          p_approved_by: approvedBy,
        });
        if (error) throw error;
        return { kind: "recurring", data };
      }

      if (mode === "addition" || mode === "deduction") {
        const amt = parseFloat(inputAmount);
        if (!amt || amt <= 0) throw new Error("Enter a valid amount");
        if (!inputLabel.trim()) throw new Error("Enter a label — it appears on the payroll run and payslip");
        if (startOfMonth(inputPeriod) < startOfMonth(new Date()))
          throw new Error("Backdated additions / deductions are not allowed — pick the current month or a future month");
        if (!razorpayEmployeeId)
          throw new Error("Employee is not linked to RazorpayX — link them from Data Health first.");

        const period = format(startOfMonth(inputPeriod), "yyyy-MM-01");
        const table = mode === "addition" ? "hr_payroll_input_additions" : "hr_payroll_input_deductions";
        const payload: any = {
          hr_employee_id: employeeId,
          razorpay_employee_id: razorpayEmployeeId,
          period_month: period,
          label: inputLabel.trim().slice(0, 80),
          amount: Math.round(amt),
          created_by: (user as any)?.id ?? null,
        };
        if (mode === "addition") {
          payload.addition_type = additionTypeCode(additionKind);
          payload.taxable = taxable;
        }

        const { data: input, error: inputErr } = await (supabase as any)
          .from(table)
          .insert(payload)
          .select("id")
          .single();
        if (inputErr) throw inputErr;

        const { error } = await (supabase as any)
          .from("hr_salary_revisions")
          .insert({
            employee_id: employeeId,
            revision_type: mode === "addition" ? "payroll_addition" : "payroll_deduction",
            one_time_amount: Math.round(amt),
            payout_month: period,
            effective_from: period,
            revision_reason: inputLabel.trim() || null,
            notes: notes || null,
            approved_by: approvedBy,
            status: "APPLIED",
            payroll_input_id: input?.id ?? null,
            payroll_input_kind: mode,
          });
        if (error) throw error;
        return { kind: "payroll_input", mode, period };
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
            payout_month: format(startOfMonth(paidOn), "yyyy-MM-01"),
            effective_from: format(paidOn, "yyyy-MM-dd"),
            payout_paid_on: format(paidOn, "yyyy-MM-dd"),
            payout_channel: "outside_payroll",
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
      // Future-dated statutory changes: apply_statutory_revision stores a SCHEDULED row (handled by that RPC).
      // Require an explicit choice for any flag whose current value is unknown —
      // otherwise the switch's default "Exempt" appearance would silently push
      // Enrolled=true to Razorpay.
      const unknownUntouched: string[] = [];
      if (pfEnabled === null && (employee?.pf_enabled ?? null) === null) unknownUntouched.push("PF");
      if (esiEnabled === null && (employee?.esi_enabled ?? null) === null) unknownUntouched.push("ESI");
      if (ptEnabled === null && (employee?.pt_enabled ?? null) === null) unknownUntouched.push("PT");
      if (unknownUntouched.length > 0) {
        throw new Error(`Current ${unknownUntouched.join(", ")} enrollment is unknown — toggle each switch explicitly to Enrolled or Exempt before applying.`);
      }
      const finalPf = pfEnabled === null ? (employee?.pf_enabled as boolean) : pfEnabled;
      const finalEsi = esiEnabled === null ? (employee?.esi_enabled as boolean) : esiEnabled;
      const finalPt = ptEnabled === null ? (employee?.pt_enabled as boolean) : ptEnabled;

      const { data, error } = await (supabase as any).rpc("apply_statutory_revision", {
        p_employee_id: employeeId,
        p_pf_enabled: finalPf,
        p_esi_enabled: finalEsi,
        p_pt_enabled: finalPt,
        p_effective_from: format(effectiveDateForRpc, "yyyy-MM-dd"),
        p_reason: reason,
        p_approved_by: approvedBy,
      });
      if (error) throw error;
      return { kind: "statutory", data };
    },
    onSuccess: async (res: any) => {
      qc.invalidateQueries({ queryKey: ["hr_salary_revisions"] });
      qc.invalidateQueries({ queryKey: ["hr_employees"] });
      qc.invalidateQueries({ queryKey: ["employee-compensation-history"] });
      qc.invalidateQueries({ queryKey: ["hr_employees_for_revision"] });
      qc.invalidateQueries({ queryKey: ["data_health_unknown_enrollment"] });
      qc.invalidateQueries({ queryKey: ["hr_salary_push_latest"] });

      if (res?.kind === "recurring") {
        toast.success(
          res.data?.status === "SCHEDULED"
            ? `Revision scheduled for ${res.data.effective_from}`
            : "Salary revision applied in HRMS",
        );
        // Await the RazorpayX push — revision is NOT considered finalized until RazorpayX
        // read-back confirms the new CTC. On failure we keep the dialog open so the operator can retry
        // or open Data Health, and the row will render with a "Not synced" badge.
        if (employeeId && res.data?.status !== "SCHEDULED") {
          const toastId = toast.loading("Pushing new CTC to RazorpayX and verifying…");
          try {
            const mod = await import("@/lib/razorpayPushback");
            const push = await mod.pushSalaryToRazorpay(employeeId, {
              triggeredFrom: "revise_salary_dialog",
              silent: true,
              expectedTotal: nT,
            });
            qc.invalidateQueries({ queryKey: ["hr_salary_push_latest"] });
            if (push.ok && typeof push.verifiedTotal === "number" && Math.abs(push.verifiedTotal - nT) <= 1) {
              toast.success(
                `Verified in RazorpayX: annual CTC = ₹${push.verifiedTotal.toLocaleString("en-IN")}`,
                { id: toastId },
              );
              onOpenChange(false);
            } else if (push.skipped) {
              toast.warning(
                "HRMS revision is saved but NOT finalized. Employee is not linked to RazorpayX — link them from Data Health and push again.",
                { id: toastId },
              );
            } else {
              // Either the push failed OR the verified total didn't match.
              // Do NOT close the dialog — operator needs to retry.
              toast.error(
                `RazorpayX push NOT verified — HRMS revision is saved but NOT finalized.`,
                { id: toastId, description: (push.error || "Unknown mismatch").slice(0, 220) },
              );
            }
          } catch (e: any) {
            toast.error(`RazorpayX push failed: ${e?.message || e}`, { id: toastId });
          }
        } else {
          onOpenChange(false);
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
        onOpenChange(false);
      } else if (res?.kind === "payroll_input") {
        qc.invalidateQueries({ queryKey: ["payroll_input_additions"] });
        qc.invalidateQueries({ queryKey: ["payroll_input_deductions"] });
        qc.invalidateQueries({ queryKey: ["gate_lop"] });
        toast.success(
          `${res.mode === "addition" ? "Addition" : "Deduction"} staged on the ${format(new Date(res.period), "MMM yyyy")} payroll month`,
          { description: "Push it to RazorpayX from the Payroll Cockpit (Step 5 · Additions & Deductions)." },
        );
        onOpenChange(false);
      } else {
        // one_time — record-only. Paid outside payroll; nothing is pushed to RazorpayX.
        toast.success("One-time payout recorded as paid outside payroll", {
          description: "Nothing was sent to RazorpayX. Use Addition if it should ride on a payroll run.",
        });
        onOpenChange(false);
      }


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
            Record a CTC change, stage an addition or deduction on a payroll month, log a one-time payout paid outside payroll, or toggle statutory enrollment (PF / ESI / PT).
          </DialogDescription>
        </DialogHeader>

        {/* Mode toggle */}
        <div className="grid grid-cols-3 gap-1.5 p-1 bg-muted rounded-lg">
          {([
            { key: "recurring", label: "CTC change" },
            { key: "addition", label: "Addition" },
            { key: "deduction", label: "Deduction" },
            { key: "one_time", label: "One-time payout" },
            { key: "statutory", label: "Statutory toggle" },
          ] as { key: Mode; label: string }[]).map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => setMode(m.key)}
              className={cn(
                "text-[11px] sm:text-xs font-medium py-2 rounded-md transition-colors",
                mode === m.key ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
              )}
            >
              {m.label}
            </button>
          ))}
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

          {(mode === "recurring" || mode === "one_time") && (
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

          {(mode === "addition" || mode === "deduction") && (
            <>
              {employeeId && razorpayEmployeeId === null && (
                <div className="text-xs bg-destructive/10 text-destructive border border-destructive/30 rounded p-2">
                  This employee is not linked to RazorpayX — link them from Data Health before staging payroll inputs.
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Amount ₹</Label>
                  <Input
                    type="number"
                    inputMode="decimal"
                    value={inputAmount}
                    onChange={(e) => setInputAmount(e.target.value)}
                    className="text-foreground"
                    placeholder="e.g. 5000"
                  />
                </div>
                <div>
                  <Label>Payroll month</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start text-left font-normal text-foreground">
                        <CalendarIcon className="h-4 w-4 mr-2" />
                        {format(inputPeriod, "MMM yyyy")}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={inputPeriod}
                        onSelect={(d) => d && setInputPeriod(startOfMonth(d))}
                        disabled={(d) => startOfMonth(d) < startOfMonth(new Date())}
                        initialFocus
                        className="p-3 pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                  <p className="text-[11px] text-muted-foreground mt-1">Current month onwards only — no backdating.</p>
                </div>
              </div>

              <div>
                <Label>Label <span className="text-destructive">*</span></Label>
                <Input
                  value={inputLabel}
                  onChange={(e) => setInputLabel(e.target.value)}
                  className="text-foreground"
                  placeholder={mode === "addition" ? "e.g. Performance bonus" : "e.g. Asset damage recovery"}
                />
                <p className="text-[11px] text-muted-foreground mt-1">This becomes the head shown on the RazorpayX run and the payslip.</p>
              </div>

              {mode === "addition" && (
                <div className="grid grid-cols-2 gap-3 items-end">
                  <div>
                    <Label>Addition kind</Label>
                    <Select value={additionKind} onValueChange={setAdditionKind}>
                      <SelectTrigger className="text-foreground"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ADDITION_KINDS.map(k => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <label className="flex items-center gap-2 pb-2">
                    <Switch checked={taxable} onCheckedChange={setTaxable} />
                    <span className="text-sm text-foreground">Taxable</span>
                  </label>
                </div>
              )}

              <div>
                <Label>Notes</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="text-foreground" placeholder="Optional details" rows={2} />
              </div>

              <div className="text-xs bg-muted/50 border border-border rounded p-2 text-muted-foreground">
                This is staged into that month's payroll inputs. Push it to RazorpayX from the Payroll Cockpit
                (Step 5 · Additions & Deductions) — nothing is sent from here.
              </div>
            </>
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

              {rawFutureDated && (
                <div className="text-xs bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30 rounded p-2 space-y-2">
                  {isFutureDated ? (
                    <p>Effective date is in the future — this revision will be saved as <strong>Scheduled</strong>. HRMS will automatically update the employee's CTC and push it to RazorpayX on <strong>{format(effectiveFrom, "PPP")}</strong>. Nothing is sent to Razorpay before that date.</p>
                  ) : (
                    <p><strong>Apply now</strong> is on — this revision will be applied and pushed to RazorpayX immediately using today's date, ignoring the future effective date above.</p>
                  )}
                  <label className="flex items-center gap-2 pt-1 border-t border-amber-500/20">
                    <Switch checked={applyNow} onCheckedChange={setApplyNow} />
                    <span className="text-foreground">Apply now instead of scheduling</span>
                  </label>
                </div>
              )}
            </>
          ) : mode === "one_time" ? (
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
                  <Label>Paid on</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="w-full justify-start text-left font-normal text-foreground">
                        <CalendarIcon className="h-4 w-4 mr-2" />
                        {format(paidOn, "PPP")}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar mode="single" selected={paidOn} onSelect={(d) => d && setPaidOn(d)} initialFocus className="p-3 pointer-events-auto" />
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
                Record-keeping only: the payout is treated as <strong>paid outside payroll</strong> on the date above.
                Nothing is pushed to RazorpayX and the CTC is unchanged. If it should ride on a payroll run, use <strong>Addition</strong> instead.
              </div>
            </>
          ) : mode === "addition" || mode === "deduction" ? null : (

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

              <div className="rounded-lg border border-border divide-y divide-border">
                {[
                  { key: "pf", label: "Provident Fund (PF)", hint: "Disable during unpaid training / stipend-only periods. When disabled, no 12% employee or 13% employer contribution.", value: pfEnabled, set: setPfEnabled, current: employee?.pf_enabled },
                  { key: "esi", label: "Employee State Insurance (ESI)", hint: "Applies only if gross ≤ ₹21,000. Disable for training exemptions or when contractually excluded.", value: esiEnabled, set: setEsiEnabled, current: employee?.esi_enabled },
                  { key: "pt", label: "Professional Tax (PT)", hint: "State-mandated slab tax on gross salary.", value: ptEnabled, set: setPtEnabled, current: employee?.pt_enabled },
                ].map((row) => {
                  const currentUnknown = row.current === null || row.current === undefined;
                  const untouchedUnknown = currentUnknown && row.value === null;
                  return (
                    <div key={row.key} className="flex items-start gap-3 p-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium">{row.label}</span>
                          <span className={cn(
                            "text-[10px] uppercase tracking-wide",
                            currentUnknown ? "text-amber-600 dark:text-amber-400 font-semibold" : "text-muted-foreground"
                          )}>
                            Current: {row.current === true ? "Enrolled" : row.current === false ? "Exempt" : "Unknown"}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">{row.hint}</p>
                        {untouchedUnknown && (
                          <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1">
                            Choose Enrolled or Exempt explicitly — the switch will not be pushed until you do.
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <Switch
                          checked={row.value === true}
                          onCheckedChange={(v) => row.set(v)}
                        />
                        <span className={cn(
                          "text-[10px]",
                          untouchedUnknown ? "text-amber-600 dark:text-amber-400 font-semibold"
                            : row.value === true ? "text-success" : "text-muted-foreground"
                        )}>
                          {untouchedUnknown ? "Not set" : row.value === true ? "Enrolled" : "Exempt"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div>
                <Label>Reason <span className="text-destructive">*</span></Label>
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)} className="text-foreground" placeholder="e.g. Training period exemption, contractual exclusion" rows={2} />
              </div>

              <div className="text-xs bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30 rounded p-2 space-y-1">
                <p><strong>Two-way sync:</strong> This updates the employee flags in HRMS (used by the Shadow Payroll engine) and pushes the same toggles to RazorpayX (pf-enabled / esi-enabled / professional-tax-enabled).</p>
                <p>RazorpayX requires operator envelope verification on the People edit endpoint before the change is finalised.</p>
              </div>

              {rawFutureDated && (
                <div className="text-xs bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30 rounded p-2 space-y-2">
                  {isFutureDated ? (
                    <p>Effective date is in the future — statutory toggles will be saved as <strong>Scheduled</strong> and pushed to RazorpayX on <strong>{format(effectiveFrom, "PPP")}</strong>.</p>
                  ) : (
                    <p><strong>Apply now</strong> is on — statutory toggles will be applied and pushed to RazorpayX immediately using today's date.</p>
                  )}
                  <label className="flex items-center gap-2 pt-1 border-t border-amber-500/20">
                    <Switch checked={applyNow} onCheckedChange={setApplyNow} />
                    <span className="text-foreground">Apply now instead of scheduling</span>
                  </label>
                </div>
              )}
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
              (mode === "recurring" ? !newTotal : mode === "one_time" ? !oneTimeAmount : !reason.trim())
            }
          >
            {mode === "recurring"
              ? (isFutureDated ? `Schedule for ${format(effectiveFrom, "d MMM yyyy")}` : "Apply revision")
              : mode === "one_time"
                ? "Record payout"
                : (isFutureDated ? `Schedule for ${format(effectiveFrom, "d MMM yyyy")}` : "Apply & push to Razorpay")}
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
