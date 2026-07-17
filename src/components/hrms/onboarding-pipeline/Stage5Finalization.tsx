import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaginated } from "@/lib/fetchAllRows";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { CheckCircle2, AlertTriangle, Fingerprint } from "lucide-react";

interface Stage5Props {
  onboardingRecord: any;
  onFinalize: (data: any) => Promise<void>;
  onBack: () => void;
  readOnly?: boolean;
}

export function Stage5Finalization({ onboardingRecord, onFinalize, onBack, readOnly }: Stage5Props) {
  const [form, setForm] = useState({
    date_of_joining: "",
    essl_badge_id: "",
    create_erp_account: false,
    erp_role_id: "",
    reporting_manager_id: "",
  });
  const [finalizing, setFinalizing] = useState(false);

  useEffect(() => {
    if (onboardingRecord) {
      setForm({
        date_of_joining: onboardingRecord.date_of_joining || "",
        essl_badge_id: onboardingRecord.essl_badge_id || "",
        create_erp_account: onboardingRecord.create_erp_account || false,
        erp_role_id: onboardingRecord.erp_role_id || "",
        reporting_manager_id: onboardingRecord.reporting_manager_id || "",
      });
    }
  }, [onboardingRecord]);

  const { data: roles } = useQuery({
    queryKey: ["erp-roles-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("roles")
        .select("id, name")
        .order("name");
      if (error) throw error;
      return data?.filter(r => !["admin", "super_admin", "Admin", "Super Admin"].includes(r.name)) || [];
    },
    enabled: form.create_erp_account,
  });

  const { data: managers } = useQuery({
    queryKey: ["managers-list-stage5"],
    queryFn: async () => {
      const data = await fetchAllPaginated<any>(() => supabase.from("hr_employees").select("id, first_name, last_name").eq("is_active", true).order("first_name"));
      return data;
    },
  });

  // Live eSSL device-user roster: only PINs actually seen by a device.
  const { data: devicePins = [], isLoading: pinsLoading } = useQuery({
    queryKey: ["hr_biometric_device_users_for_stage5"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_biometric_device_users")
        .select("pin, name, device_serial, matched_employee_id, last_seen_at")
        .order("last_seen_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
    refetchInterval: 30_000,
  });

  const pinStatus = useMemo(() => {
    const val = (form.essl_badge_id || "").trim();
    if (!val) return null as null | { kind: "empty" | "unknown" | "conflict" | "ok"; msg: string; matches?: any[] };
    const matches = (devicePins || []).filter((p: any) => (p.pin || "").trim() === val);
    if (matches.length === 0) return { kind: "unknown", msg: "PIN not seen on any active eSSL device yet — punches from this ID will be rejected until the device syncs.", matches };
    const conflict = matches.find((m: any) => m.matched_employee_id && m.matched_employee_id !== onboardingRecord?.employee_id);
    if (conflict) return { kind: "conflict", msg: `PIN already mapped to another employee on device ${conflict.device_serial}.`, matches };
    return { kind: "ok", msg: `Found on ${matches.length} device${matches.length === 1 ? "" : "s"}${matches[0]?.name ? ` — device name: ${matches[0].name}` : ""}.`, matches };
  }, [form.essl_badge_id, devicePins, onboardingRecord?.employee_id]);

  const unassignedPins = useMemo(() => {
    return (devicePins || []).filter((p: any) => !p.matched_employee_id);
  }, [devicePins]);


  const validate = () => {
    if (!form.date_of_joining) { toast.error("Date of Joining is mandatory"); return false; }
    if (!form.essl_badge_id.trim()) { toast.error("ESSL Badge ID is mandatory"); return false; }
    if (pinStatus?.kind === "conflict") { toast.error(pinStatus.msg); return false; }
    if (pinStatus?.kind === "unknown") {
      if (!window.confirm(`${pinStatus.msg}\n\nSave this PIN anyway?`)) return false;
    }
    if (form.create_erp_account && !form.erp_role_id) { toast.error("Please select a role for ERP account"); return false; }
    // Payability warning (S2): confirm activation of an employee who can't be paid yet
    const docs = (onboardingRecord?.documents as any) || {};
    const hasBank = !!docs.bank_details?.value;
    const hasSalary = !!(onboardingRecord?.salary_template_id || Number(onboardingRecord?.ctc) > 0);
    if (!hasBank || !hasSalary) {
      const missing = [!hasBank && "Bank details", !hasSalary && "Salary/CTC"].filter(Boolean).join(" & ");
      if (!window.confirm(`${missing} missing. Activate anyway? Payroll will fail until these are filled.`)) {
        return false;
      }
    }
    return true;
  };

  const handleFinalize = async () => {
    if (!validate()) return;
    setFinalizing(true);
    try {
      await onFinalize(form);
    } finally {
      setFinalizing(false);
    }
  };

  const firstName = onboardingRecord?.first_name || "";
  const lastName = onboardingRecord?.last_name || "";
  const generatedUsername = `${firstName.toLowerCase()}${lastName.toLowerCase()}`.replace(/\s/g, "");

  return (
    <Card>
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-base flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" /> Stage 5: Finalization & System Activation
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary */}
        <div className="rounded-lg border p-4 bg-muted/30 space-y-2">
          <p className="text-sm font-medium">Onboarding Summary</p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <span className="text-muted-foreground">Name:</span>
            <span>{firstName} {lastName}</span>
            <span className="text-muted-foreground">Email:</span>
            <span>{onboardingRecord?.email || "—"}</span>
            <span className="text-muted-foreground">CTC:</span>
            <span>{onboardingRecord?.ctc ? `₹${Number(onboardingRecord.ctc).toLocaleString()}` : "—"}</span>
            <span className="text-muted-foreground">Documents:</span>
            <Badge variant={onboardingRecord?.document_collection_status === "completed" ? "default" : "destructive"}>
              {onboardingRecord?.document_collection_status || "pending"}
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>Date of Joining *</Label>
            <Input
              type="date"
              value={form.date_of_joining}
              onChange={e => setForm(p => ({ ...p, date_of_joining: e.target.value }))}
              disabled={readOnly}
            />
          </div>
          <div>
            <Label>ESSL Badge ID *</Label>
            <Input
              placeholder="e.g. EMP001"
              value={form.essl_badge_id}
              onChange={e => setForm(p => ({ ...p, essl_badge_id: e.target.value }))}
              disabled={readOnly}
            />
          </div>
          <div>
            <Label>Reporting Manager</Label>
            <Select value={form.reporting_manager_id} onValueChange={v => setForm(p => ({ ...p, reporting_manager_id: v }))} disabled={readOnly}>
              <SelectTrigger><SelectValue placeholder="Select Manager" /></SelectTrigger>
              <SelectContent>
                {managers?.map(m => <SelectItem key={m.id} value={m.id}>{`${m.first_name} ${m.last_name || ''}`.trim()}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* ERP Account */}
        <div className="rounded-lg border p-4 space-y-3">
          <div className="flex items-center gap-3">
            <Switch
              checked={form.create_erp_account}
              onCheckedChange={v => setForm(p => ({ ...p, create_erp_account: v }))}
              disabled={readOnly}
            />
            <Label>Create ERP Account & Send Credentials</Label>
          </div>
          {form.create_erp_account && (
            <div className="space-y-3 pl-2 border-l-2 ml-4">
              <div>
                <Label className="text-xs text-muted-foreground">Auto-generated Username</Label>
                <p className="text-sm font-mono bg-muted px-2 py-1 rounded">{generatedUsername || "—"}</p>
              </div>
              <div>
                <Label>Role *</Label>
                <Select
                  value={form.erp_role_id}
                  onValueChange={v => setForm(p => ({ ...p, erp_role_id: v }))}
                  disabled={readOnly}
                >
                  <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                  <SelectContent>
                    {roles?.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-start gap-2 text-xs text-muted-foreground">
                <AlertTriangle className="h-3 w-3 mt-0.5 text-warning" />
                <span>A system-generated password will be emailed. User will be forced to change it on first login.</span>
              </div>
            </div>
          )}
        </div>

        {!readOnly && (
          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={onBack}>← Back</Button>
            <Button
              onClick={handleFinalize}
              disabled={finalizing}
              className="bg-success hover:bg-success text-primary-foreground"
            >
              {finalizing ? "Creating Employee..." : "✅ Finalize & Create Employee"}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
