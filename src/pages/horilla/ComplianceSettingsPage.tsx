import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { AlertTriangle, Info, Lock, Pencil, Save, X, ExternalLink } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

/**
 * Compliance Settings — HRMS mirror of RazorpayX Payroll Settings.
 *
 * Per doctrine (mem://features/hr/payroll-doctrine): RazorpayX is the payroll
 * authority. HRMS is a faithful image. These toggles reflect the org-level
 * choices set on the RazorpayX dashboard so drift alerts and CTC projections
 * stay accurate. The RazorpayX Payroll API exposes NO endpoint for org-level
 * payroll settings — updates must be made on the dashboard first, then
 * mirrored here.
 */

type Settings = {
  id: string;
  xpayroll_handles_salary: boolean;
  xpayroll_handles_contractors: boolean;
  bank_transfer_method: "NEFT" | "IMPS" | "RTGS";
  bank_verification_upload_proof: boolean;
  bank_verification_auto_approve_name_match: boolean;
  compliance_files_salary_tds: boolean;
  compliance_files_nonsalary_tds: boolean;
  compliance_files_pf: boolean;
  compliance_files_esi: boolean;
  compliance_files_pt: boolean;
  pf_include_employer_in_ctc: boolean;
  pf_include_admin_edli_in_ctc: boolean;
  pf_wages_basic_only: boolean;
  pf_wage_cap_15000: boolean;
  esi_include_employer_in_ctc: boolean;
  esi_include_additions_in_wages: boolean;
  compliance_settings_updated_at: string | null;
  compliance_settings_updated_by: string | null;
};

const FIELDS: Array<keyof Settings> = [
  "xpayroll_handles_salary",
  "xpayroll_handles_contractors",
  "bank_transfer_method",
  "bank_verification_upload_proof",
  "bank_verification_auto_approve_name_match",
  "compliance_files_salary_tds",
  "compliance_files_nonsalary_tds",
  "compliance_files_pf",
  "compliance_files_esi",
  "compliance_files_pt",
  "pf_include_employer_in_ctc",
  "pf_include_admin_edli_in_ctc",
  "pf_wages_basic_only",
  "pf_wage_cap_15000",
  "esi_include_employer_in_ctc",
  "esi_include_additions_in_wages",
];

export default function ComplianceSettingsPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Partial<Settings>>({});

  const { data: settings, isLoading } = useQuery({
    queryKey: ["hr_razorpay_settings_compliance"],
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
      const next: Partial<Settings> = {};
      FIELDS.forEach(f => { (next as any)[f] = (settings as any)[f]; });
      setDraft(next);
    }
  }, [settings, editing]);

  const dirty = useMemo(() => {
    if (!settings) return false;
    return FIELDS.some(f => (draft as any)[f] !== (settings as any)[f]);
  }, [draft, settings]);

  const set = (k: keyof Settings, v: any) => setDraft(p => ({ ...p, [k]: v }));

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    const { data: { user } } = await supabase.auth.getUser();
    const payload: any = { ...draft, compliance_settings_updated_at: new Date().toISOString(), compliance_settings_updated_by: user?.id ?? null };
    const { error } = await (supabase as any)
      .from("hr_razorpay_settings")
      .update(payload)
      .eq("id", settings.id);
    setSaving(false);
    if (error) { toast.error(error.message || "Failed to save"); return; }
    toast.success("Compliance mirror updated");
    setEditing(false);
    qc.invalidateQueries({ queryKey: ["hr_razorpay_settings_compliance"] });
  };

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  if (!settings) return <div className="p-6 text-sm text-destructive">No Razorpay settings row found.</div>;

  const readOnly = !editing;
  const lastUpdated = settings.compliance_settings_updated_at
    ? formatDistanceToNow(new Date(settings.compliance_settings_updated_at), { addSuffix: true })
    : "never";

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Compliance Settings</h1>
          <p className="text-xs text-muted-foreground mt-1">
            Mirror of your RazorpayX Payroll Settings. Last mirrored {lastUpdated}.
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
              <Button size="sm" variant="outline" disabled={saving} onClick={() => { setEditing(false); }}>
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
          Drift alerts, CTC projections and statutory expectations inside HRMS read from these values —
          keeping them aligned prevents false mismatches.
        </p>
      </div>

      {readOnly && (
        <div className="rounded-lg border border-muted-foreground/20 bg-muted/40 px-3 py-2 flex gap-2 items-center text-xs text-muted-foreground">
          <Lock className="h-3.5 w-3.5" />
          Read-only. Click <span className="font-medium text-foreground mx-1">Edit mirror</span> to change values.
        </div>
      )}

      {/* Section: Payments handled by XPayroll */}
      <Section title="Which payments does RazorpayX handle for you">
        <SwitchRow
          label="Salary transfers to employees' bank accounts"
          checked={!!draft.xpayroll_handles_salary}
          onChange={v => set("xpayroll_handles_salary", v)}
          disabled={readOnly}
        />
        <SwitchRow
          label="Payments to contractors, vendors, consultants etc."
          checked={!!draft.xpayroll_handles_contractors}
          onChange={v => set("xpayroll_handles_contractors", v)}
          disabled={readOnly}
        />
        <div className="pt-2">
          <Label className="text-xs">Preferred method for bank transfer</Label>
          <Select
            value={draft.bank_transfer_method || "NEFT"}
            onValueChange={v => set("bank_transfer_method", v)}
            disabled={readOnly}
          >
            <SelectTrigger className="mt-1 max-w-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="NEFT">NEFT</SelectItem>
              <SelectItem value="IMPS">IMPS</SelectItem>
              <SelectItem value="RTGS">RTGS</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground mt-1">
            NEFT is available 24×7 on RazorpayX Lite.
          </p>
        </div>
      </Section>

      {/* Section: Bank verification */}
      <Section title="Bank Account Verification Settings">
        <SwitchRow
          label="Upload proof for verification"
          checked={!!draft.bank_verification_upload_proof}
          onChange={v => set("bank_verification_upload_proof", v)}
          disabled={readOnly}
        />
        <SwitchRow
          label="Auto-approve if the account holder name matches the employee name"
          hint="Available only for current accounts."
          checked={!!draft.bank_verification_auto_approve_name_match}
          onChange={v => set("bank_verification_auto_approve_name_match", v)}
          disabled={readOnly}
        />
      </Section>

      {/* Section: Compliance payments */}
      <Section
        title="Compliance Payments Settings"
        subtitle="Disabling any of these does NOT stop the deduction inside payslips — it only means RazorpayX will not file it for you."
      >
        <SwitchRow
          label="Salary TDS payments (if applicable)"
          checked={!!draft.compliance_files_salary_tds}
          onChange={v => set("compliance_files_salary_tds", v)}
          disabled={readOnly}
        />
        <SwitchRow
          label="Non-salary TDS payments (for contractors)"
          checked={!!draft.compliance_files_nonsalary_tds}
          onChange={v => set("compliance_files_nonsalary_tds", v)}
          disabled={readOnly}
        />
        <SwitchRow
          label="PF payments and filing (if applicable)"
          checked={!!draft.compliance_files_pf}
          onChange={v => set("compliance_files_pf", v)}
          disabled={readOnly}
        />
        <SwitchRow
          label="ESI payments and filing (if applicable)"
          checked={!!draft.compliance_files_esi}
          onChange={v => set("compliance_files_esi", v)}
          disabled={readOnly}
        />
        <SwitchRow
          label="Professional tax payments and filing (if applicable)"
          checked={!!draft.compliance_files_pt}
          onChange={v => set("compliance_files_pt", v)}
          disabled={readOnly}
        />

        {(!draft.compliance_files_salary_tds || !draft.compliance_files_nonsalary_tds) && (
          <div className="mt-2 rounded border border-warning/40 bg-warning/5 p-2 flex gap-2 items-start text-[11px] text-warning-foreground">
            <AlertTriangle className="h-3.5 w-3.5 text-warning mt-0.5 shrink-0" />
            <span>
              TDS filing is <b>off</b> on RazorpayX. You are responsible for TDS deposit and quarterly returns.
            </span>
          </div>
        )}
      </Section>

      {/* Section: PF */}
      <Section title="PF Settings">
        <SwitchRow
          label="Include employer contribution to PF in employee CTC"
          checked={!!draft.pf_include_employer_in_ctc}
          onChange={v => set("pf_include_employer_in_ctc", v)}
          disabled={readOnly}
        />
        <SwitchRow
          label="Include PF EDLI + admin charges in employee CTC"
          checked={!!draft.pf_include_admin_edli_in_ctc}
          onChange={v => set("pf_include_admin_edli_in_ctc", v)}
          disabled={readOnly}
        />
        <SwitchRow
          label="Use only basic salary for calculating PF"
          hint="If OFF, Basic + DA is used as PF wages."
          checked={!!draft.pf_wages_basic_only}
          onChange={v => set("pf_wages_basic_only", v)}
          disabled={readOnly}
        />
        <SwitchRow
          label="Use PF limit of ₹15,000 while calculating contributions"
          hint="Employer/employee PF capped at 12% of min(Basic, ₹15,000)."
          checked={!!draft.pf_wage_cap_15000}
          onChange={v => set("pf_wage_cap_15000", v)}
          disabled={readOnly}
        />
      </Section>

      {/* Section: ESI */}
      <Section title="ESI Settings">
        <SwitchRow
          label="Include employer contribution to ESI in employee CTC"
          checked={!!draft.esi_include_employer_in_ctc}
          onChange={v => set("esi_include_employer_in_ctc", v)}
          disabled={readOnly}
        />
        <SwitchRow
          label="Include payroll additions and one-time payments to ESI wages"
          checked={!!draft.esi_include_additions_in_wages}
          onChange={v => set("esi_include_additions_in_wages", v)}
          disabled={readOnly}
        />
      </Section>

      <div className="flex items-center gap-2 text-[11px] text-muted-foreground pt-1">
        <Badge variant="outline" className="text-[10px]">MIRROR</Badge>
        These values do not push to RazorpayX (the API has no org-settings endpoint) — they only control HRMS-side expectations and drift alerts.
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

function SwitchRow({
  label, hint, checked, onChange, disabled,
}: {
  label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}) {
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
