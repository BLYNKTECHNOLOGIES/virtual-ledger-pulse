import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Info, Lock, Pencil, Save, X, AlertTriangle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

/**
 * Offer Letter Policy — parametric rules that drive:
 *   Clause 6a  training-period salary (level-band lookup)
 *   Clause 6b  25% refundable security deposit
 *   Clause 7   probation duration + statutory exemption window
 *   Clause 8   leave entitlements + SL medical-cert gate
 *   Clause 18  3-day abandonment scanner
 *   Clause 19  notice periods (confirmed / probation forfeiture)
 *
 * Single row (is_singleton = true). Every downstream automation reads from
 * this row, so operators can tune parameters without a code change.
 */

type Policy = {
  id: string;
  is_singleton: boolean;
  training_period_months: number;
  training_flat_by_level: Record<string, number>;
  training_pct_by_level: Record<string, number>;
  training_statutory_exempt: boolean;
  training_razorpay_structure_id: string | null;
  deposit_pct: number;
  deposit_months: number[];
  deposit_refundable: boolean;
  sl_medical_cert_threshold_days: number;
  cl_per_month: number;
  cl_carry_forward: boolean;
  sl_per_year: number;
  sl_lapses: boolean;
  abandonment_days: number;
  abandonment_requires_approval: boolean;
  abandonment_forfeits_deposit: boolean;
  probation_months: number;
  notice_confirmed_days: number;
  notice_probation_forfeit_days: number;
  updated_at: string;
  updated_by: string | null;
};

const LEVEL_BANDS = ["L1", "L2", "L3", "L4", "L5", "L6", "L7", "L8"];

export default function OfferLetterPolicyPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<Partial<Policy>>({});

  const { data: policy, isLoading } = useQuery({
    queryKey: ["hr_offer_letter_policy"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_offer_letter_policy")
        .select("*")
        .eq("is_singleton", true)
        .maybeSingle();
      if (error) throw error;
      return data as Policy | null;
    },
  });

  useEffect(() => {
    if (policy && !editing) setDraft({ ...policy });
  }, [policy, editing]);

  function set<K extends keyof Policy>(k: K, v: Policy[K]) {
    setDraft(prev => ({ ...prev, [k]: v }));
  }

  function setLevelMap(field: "training_flat_by_level" | "training_pct_by_level", level: string, value: number) {
    setDraft(prev => ({
      ...prev,
      [field]: { ...(prev[field] as Record<string, number> ?? {}), [level]: value },
    }));
  }

  function removeLevel(field: "training_flat_by_level" | "training_pct_by_level", level: string) {
    setDraft(prev => {
      const copy = { ...(prev[field] as Record<string, number> ?? {}) };
      delete copy[level];
      return { ...prev, [field]: copy };
    });
  }

  async function handleSave() {
    if (!policy) return;
    setSaving(true);
    try {
      const { data: userRes } = await supabase.auth.getUser();
      const patch = {
        training_period_months: Number(draft.training_period_months ?? policy.training_period_months),
        training_flat_by_level: draft.training_flat_by_level ?? policy.training_flat_by_level,
        training_pct_by_level: draft.training_pct_by_level ?? policy.training_pct_by_level,
        training_statutory_exempt: !!draft.training_statutory_exempt,
        training_razorpay_structure_id: draft.training_razorpay_structure_id?.toString().trim() || null,
        deposit_pct: Number(draft.deposit_pct ?? policy.deposit_pct),
        deposit_months: (draft.deposit_months ?? policy.deposit_months).map(Number).filter(n => n > 0),
        deposit_refundable: !!draft.deposit_refundable,
        sl_medical_cert_threshold_days: Number(draft.sl_medical_cert_threshold_days ?? policy.sl_medical_cert_threshold_days),
        cl_per_month: Number(draft.cl_per_month ?? policy.cl_per_month),
        cl_carry_forward: !!draft.cl_carry_forward,
        sl_per_year: Number(draft.sl_per_year ?? policy.sl_per_year),
        sl_lapses: !!draft.sl_lapses,
        abandonment_days: Number(draft.abandonment_days ?? policy.abandonment_days),
        abandonment_requires_approval: !!draft.abandonment_requires_approval,
        abandonment_forfeits_deposit: !!draft.abandonment_forfeits_deposit,
        probation_months: Number(draft.probation_months ?? policy.probation_months),
        notice_confirmed_days: Number(draft.notice_confirmed_days ?? policy.notice_confirmed_days),
        notice_probation_forfeit_days: Number(draft.notice_probation_forfeit_days ?? policy.notice_probation_forfeit_days),
        updated_by: userRes.user?.id ?? null,
      };
      const { error } = await (supabase as any)
        .from("hr_offer_letter_policy")
        .update(patch)
        .eq("id", policy.id);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["hr_offer_letter_policy"] });
      toast.success("Offer-letter policy saved.");
      setEditing(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save policy.");
    } finally {
      setSaving(false);
    }
  }

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Loading policy…</div>;
  if (!policy) {
    return (
      <div className="p-6 space-y-3">
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-4 text-sm">
          <AlertTriangle className="mr-2 inline h-4 w-4 text-destructive" />
          Policy singleton row is missing. Contact an administrator.
        </div>
      </div>
    );
  }

  const flatMap = (draft.training_flat_by_level ?? policy.training_flat_by_level) as Record<string, number>;
  const pctMap = (draft.training_pct_by_level ?? policy.training_pct_by_level) as Record<string, number>;
  const depositMonthsStr = (draft.deposit_months ?? policy.deposit_months).join(", ");

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold">Offer Letter Policy</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Parametric rules from Clauses 6–19 of the standard offer letter.
            Every downstream automation — payroll, deposits, F&F, abandonment
            scanner — reads from this row.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="gap-1">
            <Info className="h-3 w-3" />
            Updated {formatDistanceToNow(new Date(policy.updated_at), { addSuffix: true })}
          </Badge>
          {!editing ? (
            <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
              <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
            </Button>
          ) : (
            <>
              <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setDraft({ ...policy }); }}>
                <X className="mr-1.5 h-3.5 w-3.5" /> Cancel
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                <Save className="mr-1.5 h-3.5 w-3.5" /> {saving ? "Saving…" : "Save"}
              </Button>
            </>
          )}
        </div>
      </div>
      {/* Path A doctrine toggle (lives on hr_razorpay_settings) */}
      <PathADoctrineCard />


      {/* Clause 6a — training salary */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Clause 6a — Training-period salary</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <FieldRow label="Training period (months)">
            <NumInput editing={editing} value={draft.training_period_months ?? policy.training_period_months} onChange={v => set("training_period_months", v)} />
          </FieldRow>
          <FieldRow label="Statutory exemption during training">
            <Switch checked={!!(draft.training_statutory_exempt ?? policy.training_statutory_exempt)} onCheckedChange={v => set("training_statutory_exempt", v)} disabled={!editing} />
          </FieldRow>
          <FieldRow label="RazorpayX training structure ID (Path A)">
            <div className="w-full">
              <Input
                value={draft.training_razorpay_structure_id ?? policy.training_razorpay_structure_id ?? ""}
                onChange={e => set("training_razorpay_structure_id", e.target.value)}
                disabled={!editing}
                placeholder="e.g. sst_XXXXXXXXXXXX"
                className="max-w-sm"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Optional. If set and Path A is enabled, hires are assigned this
                structure for month 1 and swapped to the real structure at the
                end of the training period. Path A is live in the proxy — flip
                the doctrine toggle on the RazorpayX Compliance Settings page
                and the daily <code>hr-schedule-training-swaps</code> cron
                (01:00 UTC) will handle the swap + statutory toggle-off
                automatically.
              </p>
            </div>
          </FieldRow>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Flat training pay by level (₹/month)</Label>
              <div className="mt-2 space-y-2">
                {LEVEL_BANDS.map(lb => (
                  <div key={`flat-${lb}`} className="flex items-center gap-2">
                    <span className="w-10 text-sm font-mono">{lb}</span>
                    <Input
                      type="number"
                      className="max-w-[140px]"
                      value={flatMap[lb] ?? ""}
                      onChange={e => setLevelMap("training_flat_by_level", lb, Number(e.target.value))}
                      onBlur={e => { if (!e.target.value) removeLevel("training_flat_by_level", lb); }}
                      disabled={!editing}
                      placeholder="—"
                    />
                  </div>
                ))}
              </div>
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Percentage of real CTC by level (0–1)</Label>
              <div className="mt-2 space-y-2">
                {LEVEL_BANDS.map(lb => (
                  <div key={`pct-${lb}`} className="flex items-center gap-2">
                    <span className="w-10 text-sm font-mono">{lb}</span>
                    <Input
                      type="number"
                      step="0.05"
                      min="0"
                      max="1"
                      className="max-w-[140px]"
                      value={pctMap[lb] ?? ""}
                      onChange={e => setLevelMap("training_pct_by_level", lb, Number(e.target.value))}
                      onBlur={e => { if (!e.target.value) removeLevel("training_pct_by_level", lb); }}
                      disabled={!editing}
                      placeholder="—"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Clause 6b — deposit */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Clause 6b — Security deposit</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <FieldRow label="Deposit as fraction of monthly CTC (e.g. 0.25 = 25%)">
            <NumInput editing={editing} step={0.01} value={draft.deposit_pct ?? policy.deposit_pct} onChange={v => set("deposit_pct", v)} />
          </FieldRow>
          <FieldRow label="Collected in months (comma-separated, relative to hire date)">
            <Input
              value={depositMonthsStr}
              onChange={e => set("deposit_months", e.target.value.split(",").map(s => Number(s.trim())).filter(n => n > 0) as any)}
              disabled={!editing}
              className="max-w-[200px]"
              placeholder="2, 3"
            />
          </FieldRow>
          <FieldRow label="Refundable on separation">
            <Switch checked={!!(draft.deposit_refundable ?? policy.deposit_refundable)} onCheckedChange={v => set("deposit_refundable", v)} disabled={!editing} />
          </FieldRow>
        </CardContent>
      </Card>

      {/* Clause 7 + 19 — probation & notice */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Clause 7 & 19 — Probation and notice</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <FieldRow label="Probation duration (months)">
            <NumInput editing={editing} value={draft.probation_months ?? policy.probation_months} onChange={v => set("probation_months", v)} />
          </FieldRow>
          <FieldRow label="Notice period after confirmation (days)">
            <NumInput editing={editing} value={draft.notice_confirmed_days ?? policy.notice_confirmed_days} onChange={v => set("notice_confirmed_days", v)} />
          </FieldRow>
          <FieldRow label="Notice-shortfall recovery during probation (days of salary)">
            <NumInput editing={editing} value={draft.notice_probation_forfeit_days ?? policy.notice_probation_forfeit_days} onChange={v => set("notice_probation_forfeit_days", v)} />
          </FieldRow>
        </CardContent>
      </Card>

      {/* Clause 8 — leave */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Clause 8 — Leave rules</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <FieldRow label="Casual leave accrual per month">
            <NumInput editing={editing} step={0.25} value={draft.cl_per_month ?? policy.cl_per_month} onChange={v => set("cl_per_month", v)} />
          </FieldRow>
          <FieldRow label="Casual leave carries forward to next year">
            <Switch checked={!!(draft.cl_carry_forward ?? policy.cl_carry_forward)} onCheckedChange={v => set("cl_carry_forward", v)} disabled={!editing} />
          </FieldRow>
          <FieldRow label="Sick leave entitlement per year">
            <NumInput editing={editing} step={0.5} value={draft.sl_per_year ?? policy.sl_per_year} onChange={v => set("sl_per_year", v)} />
          </FieldRow>
          <FieldRow label="Sick leave lapses at year-end">
            <Switch checked={!!(draft.sl_lapses ?? policy.sl_lapses)} onCheckedChange={v => set("sl_lapses", v)} disabled={!editing} />
          </FieldRow>
          <FieldRow label="Medical certificate required beyond N sick days">
            <NumInput editing={editing} value={draft.sl_medical_cert_threshold_days ?? policy.sl_medical_cert_threshold_days} onChange={v => set("sl_medical_cert_threshold_days", v)} />
          </FieldRow>
        </CardContent>
      </Card>

      {/* Clause 18 — abandonment */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Clause 18 — Abandonment</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <FieldRow label="Consecutive absent days to flag abandonment">
            <NumInput editing={editing} value={draft.abandonment_days ?? policy.abandonment_days} onChange={v => set("abandonment_days", v)} />
          </FieldRow>
          <FieldRow label="Requires HR approval before separation">
            <Switch checked={!!(draft.abandonment_requires_approval ?? policy.abandonment_requires_approval)} onCheckedChange={v => set("abandonment_requires_approval", v)} disabled={!editing} />
          </FieldRow>
          <FieldRow label="Forfeits security deposit on abandonment">
            <Switch checked={!!(draft.abandonment_forfeits_deposit ?? policy.abandonment_forfeits_deposit)} onCheckedChange={v => set("abandonment_forfeits_deposit", v)} disabled={!editing} />
          </FieldRow>
        </CardContent>
      </Card>

      {!editing && (
        <div className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Lock className="h-3 w-3" />
          Read-only. Click <span className="font-medium text-foreground">Edit</span> above to change any field.
        </div>
      )}
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <Label className="text-sm text-foreground/90">{label}</Label>
      <div className="sm:min-w-[220px] flex sm:justify-end">{children}</div>
    </div>
  );
}

function NumInput({ editing, value, onChange, step }: { editing: boolean; value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <Input
      type="number"
      step={step ?? 1}
      value={Number.isFinite(value) ? value : 0}
      onChange={e => onChange(Number(e.target.value))}
      disabled={!editing}
      className="max-w-[140px]"
    />
  );
}
