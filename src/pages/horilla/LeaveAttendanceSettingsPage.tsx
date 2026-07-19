import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Info, Lock, Pencil, Save, X, ExternalLink, Plus, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

/**
 * Leave & Attendance Settings — HRMS mirror of RazorpayX dashboard toggles.
 * Doctrine: RazorpayX is the payroll authority (mem://features/hr/payroll-doctrine).
 * The RazorpayX API exposes no CRUD for these org-level settings; update the
 * dashboard first, then mirror the state here so HRMS accrual/LOP/weekend
 * expectations stay aligned.
 */

type LeaveType = {
  code: string;
  name: string;
  default_leave: number | null;
  monthly_increment: number | null;
  max_leave: number | null;
  carry_forward: number | null;
  include_weekends: boolean;
};

type Settings = {
  id: string;
  attendance_enabled: boolean;
  attendance_enabled_for_contractors: boolean;
  weekend_sun: boolean;
  weekend_sat_1: boolean;
  weekend_sat_2: boolean;
  weekend_sat_3: boolean;
  weekend_sat_4: boolean;
  weekend_sat_5: boolean;
  leave_allow_negative_balance: boolean;
  leave_allow_half_day: boolean;
  leave_require_remark: boolean;
  attendance_show_on_payslip: boolean;
  lop_auto_add_for_unpaid: boolean;
  lop_calc_on_working_days: boolean;
  leave_calendar_financial_year: boolean;
  shifts_track_timings: boolean;
  leave_types_mirror: LeaveType[];
  leave_settings_updated_at: string | null;
};

const BOOL_FIELDS: Array<keyof Settings> = [
  "attendance_enabled", "attendance_enabled_for_contractors",
  "weekend_sun", "weekend_sat_1", "weekend_sat_2", "weekend_sat_3", "weekend_sat_4", "weekend_sat_5",
  "leave_allow_negative_balance", "leave_allow_half_day", "leave_require_remark",
  "attendance_show_on_payslip", "lop_auto_add_for_unpaid", "lop_calc_on_working_days",
  "leave_calendar_financial_year", "shifts_track_timings",
];

const emptyLeaveType = (): LeaveType => ({
  code: "", name: "", default_leave: 0, monthly_increment: 0, max_leave: 0, carry_forward: 0, include_weekends: false,
});

const num = (v: any): number | null => {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export default function LeaveAttendanceSettingsPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Partial<Settings>>({});

  const { data: settings, isLoading } = useQuery({
    queryKey: ["hr_razorpay_settings_leave"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_razorpay_settings")
        .select("*")
        .eq("is_singleton", true)
        .maybeSingle();
      if (error) throw error;
      return data as Settings;
    },
  });

  useEffect(() => {
    if (settings && !editing) {
      const next: any = {};
      BOOL_FIELDS.forEach(f => { next[f] = (settings as any)[f]; });
      next.leave_types_mirror = Array.isArray(settings.leave_types_mirror)
        ? JSON.parse(JSON.stringify(settings.leave_types_mirror))
        : [];
      setDraft(next);
    }
  }, [settings, editing]);

  const dirty = useMemo(() => {
    if (!settings) return false;
    if (BOOL_FIELDS.some(f => (draft as any)[f] !== (settings as any)[f])) return true;
    return JSON.stringify(draft.leave_types_mirror ?? []) !== JSON.stringify(settings.leave_types_mirror ?? []);
  }, [draft, settings]);

  const set = (k: keyof Settings, v: any) => setDraft(p => ({ ...p, [k]: v }));

  const updateLeaveType = (idx: number, patch: Partial<LeaveType>) => {
    setDraft(p => {
      const arr = [...(p.leave_types_mirror ?? [])];
      arr[idx] = { ...arr[idx], ...patch };
      return { ...p, leave_types_mirror: arr };
    });
  };
  const addLeaveType = () => setDraft(p => ({ ...p, leave_types_mirror: [...(p.leave_types_mirror ?? []), emptyLeaveType()] }));
  const removeLeaveType = (idx: number) => setDraft(p => ({ ...p, leave_types_mirror: (p.leave_types_mirror ?? []).filter((_, i) => i !== idx) }));

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const payload: any = { ...draft, leave_settings_updated_at: new Date().toISOString(), leave_settings_updated_by: user?.id ?? null };
    // Sanitize leave-type numerics.
    payload.leave_types_mirror = (draft.leave_types_mirror ?? []).map(t => ({
      code: (t.code || "").trim().toLowerCase(),
      name: (t.name || "").trim(),
      default_leave: num(t.default_leave),
      monthly_increment: num(t.monthly_increment),
      max_leave: num(t.max_leave),
      carry_forward: num(t.carry_forward),
      include_weekends: !!t.include_weekends,
    })).filter(t => t.name);
    const { error } = await (supabase as any).from("hr_razorpay_settings").update(payload).eq("id", settings.id);
    setSaving(false);
    if (error) { toast.error(error.message || "Failed to save"); return; }
    toast.success("Leave & attendance mirror updated");
    setEditing(false);
    qc.invalidateQueries({ queryKey: ["hr_razorpay_settings_leave"] });
    qc.invalidateQueries({ queryKey: ["hr_razorpay_settings_compliance_public"] });
  };

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!settings) return <div className="p-6 text-sm text-destructive">No Razorpay settings row found.</div>;

  const readOnly = !editing;
  const lastUpdated = settings.leave_settings_updated_at
    ? formatDistanceToNow(new Date(settings.leave_settings_updated_at), { addSuffix: true })
    : "never";
  const leaveTypes: LeaveType[] = draft.leave_types_mirror ?? [];

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Leave & Attendance Settings</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Mirror of your RazorpayX Leaves & Attendance dashboard. Last mirrored {lastUpdated}.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <a href="https://x.razorpay.com/payroll/settings" target="_blank" rel="noreferrer">
              <ExternalLink className="h-3.5 w-3.5 mr-1" /> Open on RazorpayX
            </a>
          </Button>
          {readOnly ? (
            <Button size="sm" onClick={() => setEditing(true)}>
              <Pencil className="h-3.5 w-3.5 mr-1" /> Edit mirror
            </Button>
          ) : (
            <>
              <Button size="sm" variant="outline" disabled={saving} onClick={() => setEditing(false)}>
                <X className="h-3.5 w-3.5 mr-1" /> Cancel
              </Button>
              <Button size="sm" disabled={saving || !dirty} onClick={save}>
                <Save className="h-3.5 w-3.5 mr-1" /> {saving ? "Saving…" : "Save mirror"}
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-primary/20 bg-primary/5 p-3 flex gap-2 items-start">
        <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">RazorpayX is the payroll authority.</span>{" "}
          Change these switches on the RazorpayX dashboard <em>first</em>, then update this mirror.
          HRMS reads these values to derive weekend patterns, leave accruals, LOP calculation, and
          half-day / remark enforcement on the ERP employee-facing surface.
        </p>
      </div>

      {readOnly && (
        <div className="rounded-lg border border-muted-foreground/20 bg-muted/40 px-3 py-2 flex gap-2 items-center text-xs text-muted-foreground">
          <Lock className="h-3.5 w-3.5" />
          Read-only. Click <span className="font-medium text-foreground mx-1">Edit mirror</span> to change values.
        </div>
      )}

      {/* Attendance */}
      <Section title="Attendance">
        <div className="pb-2">
          <Label className="text-xs">Attendance Enabled?</Label>
          <Select
            value={draft.attendance_enabled ? "yes" : "no"}
            onValueChange={v => set("attendance_enabled", v === "yes")}
            disabled={readOnly}
          >
            <SelectTrigger className="mt-1 max-w-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="yes">Yes</SelectItem>
              <SelectItem value="no">No</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <CheckRow
          label="Enable attendance for contractors"
          checked={!!draft.attendance_enabled_for_contractors}
          onChange={v => set("attendance_enabled_for_contractors", v)}
          disabled={readOnly}
        />
      </Section>

      {/* Weekend pattern */}
      <Section
        title="Weekend"
        subtitle="Days marked as weekly off. Sundays are typically on; Saturday pattern varies (1st & 3rd, alternating, etc.)."
      >
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {([
            ["Sun", "weekend_sun"],
            ["1st Sat", "weekend_sat_1"],
            ["2nd Sat", "weekend_sat_2"],
            ["3rd Sat", "weekend_sat_3"],
            ["4th Sat", "weekend_sat_4"],
            ["5th Sat", "weekend_sat_5"],
          ] as Array<[string, keyof Settings]>).map(([label, key]) => (
            <label
              key={key}
              className="flex flex-col items-center gap-1 rounded-md border border-border/60 bg-muted/20 py-2 text-[11px]"
            >
              <span className="font-medium text-foreground">{label}</span>
              <Checkbox
                checked={!!(draft as any)[key]}
                onCheckedChange={v => set(key, !!v)}
                disabled={readOnly}
              />
            </label>
          ))}
        </div>
      </Section>

      {/* Types of leaves */}
      <Section
        title="Types of Leaves"
        subtitle="Mirror of the leave-type catalogue defined on RazorpayX. Amounts are in days."
      >
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-muted-foreground border-b">
                <th className="py-1.5 pr-2">Type</th>
                <th className="py-1.5 px-2 w-20">Default</th>
                <th className="py-1.5 px-2 w-24">Monthly Inc.</th>
                <th className="py-1.5 px-2 w-20">Max</th>
                <th className="py-1.5 px-2 w-24">Carry Fwd</th>
                <th className="py-1.5 px-2 w-20 text-center">Incl. WE</th>
                {!readOnly && <th className="py-1.5 pl-2 w-8" />}
              </tr>
            </thead>
            <tbody>
              {leaveTypes.map((t, i) => (
                <tr key={i} className="border-b border-border/40 align-middle">
                  <td className="py-1 pr-2">
                    <Input
                      className="h-8 text-xs"
                      placeholder="e.g. Casual Leave"
                      value={t.name}
                      onChange={e => updateLeaveType(i, { name: e.target.value })}
                      disabled={readOnly}
                    />
                  </td>
                  <td className="py-1 px-2">
                    <NumInput value={t.default_leave} onChange={v => updateLeaveType(i, { default_leave: v })} readOnly={readOnly} />
                  </td>
                  <td className="py-1 px-2">
                    <NumInput value={t.monthly_increment} onChange={v => updateLeaveType(i, { monthly_increment: v })} readOnly={readOnly} />
                  </td>
                  <td className="py-1 px-2">
                    <NumInput value={t.max_leave} onChange={v => updateLeaveType(i, { max_leave: v })} readOnly={readOnly} />
                  </td>
                  <td className="py-1 px-2">
                    <NumInput value={t.carry_forward} onChange={v => updateLeaveType(i, { carry_forward: v })} readOnly={readOnly} />
                  </td>
                  <td className="py-1 px-2 text-center">
                    <Checkbox
                      checked={!!t.include_weekends}
                      onCheckedChange={v => updateLeaveType(i, { include_weekends: !!v })}
                      disabled={readOnly}
                    />
                  </td>
                  {!readOnly && (
                    <td className="py-1 pl-2">
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => removeLeaveType(i)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
              {!leaveTypes.length && (
                <tr><td colSpan={7} className="py-4 text-center text-muted-foreground">No leave types configured.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {!readOnly && (
          <Button size="sm" variant="outline" className="mt-2" onClick={addLeaveType}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add leave type
          </Button>
        )}
      </Section>

      {/* Leave policy */}
      <Section title="Leave Policy">
        <CheckRow
          label="Allow employees to have negative leave balance"
          checked={!!draft.leave_allow_negative_balance}
          onChange={v => set("leave_allow_negative_balance", v)}
          disabled={readOnly}
        />
        <CheckRow
          label="Allow half-day leave requests"
          checked={!!draft.leave_allow_half_day}
          onChange={v => set("leave_allow_half_day", v)}
          disabled={readOnly}
        />
        <CheckRow
          label="Employees must enter a remark when applying for leave / half day"
          checked={!!draft.leave_require_remark}
          onChange={v => set("leave_require_remark", v)}
          disabled={readOnly}
        />
        <CheckRow
          label="Show Attendance on Payslip"
          checked={!!draft.attendance_show_on_payslip}
          onChange={v => set("attendance_show_on_payslip", v)}
          disabled={readOnly}
        />
        <CheckRow
          label="Automatically add loss-of-pay for unpaid leaves"
          checked={!!draft.lop_auto_add_for_unpaid}
          onChange={v => set("lop_auto_add_for_unpaid", v)}
          disabled={readOnly}
        />
        <CheckRow
          label="Calculate loss-of-pay on working days instead of total days in a month"
          hint="Per-day salary = monthly gross / working days. If off, calendar days (28–31) is used."
          checked={!!draft.lop_calc_on_working_days}
          onChange={v => set("lop_calc_on_working_days", v)}
          disabled={readOnly}
        />
      </Section>

      {/* Calendar & Shifts */}
      <Section title="Leaves Calendar & Shifts">
        <CheckRow
          label="Use Financial Year (Apr–Mar) instead of Calendar Year (Jan–Dec)"
          checked={!!draft.leave_calendar_financial_year}
          onChange={v => set("leave_calendar_financial_year", v)}
          disabled={readOnly}
        />
        <CheckRow
          label="Track shift timings"
          hint="Enables shift-based clock-in/out reconciliation on the attendance engine."
          checked={!!draft.shifts_track_timings}
          onChange={v => set("shifts_track_timings", v)}
          disabled={readOnly}
        />
      </Section>

      <div className="flex items-center gap-2 text-[11px] text-muted-foreground pt-1">
        <Badge variant="outline" className="text-[10px]">MIRROR</Badge>
        Values do not push to RazorpayX (no org-settings API endpoint) — they drive HRMS-side
        weekend detection, leave accrual, and LOP projection so both systems agree.
      </div>
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="py-3 px-4 bg-muted/40">
        <CardTitle className="text-sm">{title}</CardTitle>
        {subtitle && <p className="text-[11px] text-muted-foreground mt-1">{subtitle}</p>}
      </CardHeader>
      <CardContent className="p-4 space-y-2">{children}</CardContent>
    </Card>
  );
}

function CheckRow({
  label, hint, checked, onChange, disabled,
}: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <div className="min-w-0 flex-1">
        <p className="text-sm text-foreground">{label}</p>
        {hint && <p className="text-[11px] text-muted-foreground mt-0.5">{hint}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}

function NumInput({ value, onChange, readOnly }: { value: number | null; onChange: (v: number | null) => void; readOnly?: boolean }) {
  return (
    <Input
      type="number"
      inputMode="decimal"
      step="0.5"
      className="h-8 text-xs text-foreground"
      value={value ?? ""}
      onChange={e => onChange(e.target.value === "" ? null : Number(e.target.value))}
      disabled={readOnly}
    />
  );
}
