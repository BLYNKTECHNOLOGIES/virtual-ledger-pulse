import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { atsErrorMessage } from "@/lib/ats/errors";
import { atsKeys, useAtsSources, useEmployeesLookup } from "@/lib/ats/api";
import { candKeys, type AtsCandidate } from "@/lib/ats/candidates";
import { ChipInput } from "./AtsBits";

type Form = Record<string, any>;
const TEXT = ["full_name", "email", "phone", "alt_phone", "city", "state", "current_company", "current_title", "ctc_note", "education", "linkedin_url", "portfolio_url", "summary", "source_detail"] as const;
const NUM = ["total_experience_years", "current_ctc_monthly", "expected_ctc_monthly", "notice_period_days"] as const;
const ARR = ["shift_preferences", "skills", "languages", "tags"] as const;

const toForm = (c: AtsCandidate): Form => {
  const f: Form = {};
  for (const k of TEXT) f[k] = (c as any)[k] ?? "";
  for (const k of NUM) f[k] = (c as any)[k] == null ? "" : String((c as any)[k]);
  for (const k of ARR) f[k] = (c as any)[k] ?? [];
  f.source_id = c.source_id ?? "";
  f.referred_by_employee_id = c.referred_by_employee_id ?? "";
  f.keep_for_future = !!c.keep_for_future;
  return f;
};

export function validateCandidateNumbers(f: Form): string | null {
  const n = (k: string) => (f[k] === "" || f[k] == null ? null : Number(f[k]));
  const exp = n("total_experience_years"), np = n("notice_period_days"), cc = n("current_ctc_monthly"), ec = n("expected_ctc_monthly");
  if (exp != null && (isNaN(exp) || exp < 0 || exp > 60)) return "Experience must be between 0 and 60 years.";
  if (np != null && (isNaN(np) || np < 0 || np > 365 || !Number.isInteger(np))) return "Notice period must be 0 to 365 days.";
  if ((cc != null && (isNaN(cc) || cc < 0)) || (ec != null && (isNaN(ec) || ec < 0))) return "CTC can't be negative.";
  return null;
}

export function EditProfileSheet({ open, onOpenChange, candidate }: { open: boolean; onOpenChange: (o: boolean) => void; candidate: AtsCandidate }) {
  const qc = useQueryClient();
  const sources = useAtsSources();
  const emps = useEmployeesLookup();
  const [f, setF] = useState<Form>(() => toForm(candidate));
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setF(toForm(candidate)); }, [open, candidate]);
  const set = (k: string, v: any) => setF((p) => ({ ...p, [k]: v }));

  const name = String(f.full_name ?? "").trim();
  const err = !name || name.length > 120 ? "Enter the candidate's name (up to 120 characters)." : validateCandidateNumbers(f);

  const save = async () => {
    if (err || busy) { if (err) toast.error(err); return; }
    const patch: Form = {};
    for (const k of TEXT) patch[k] = String(f[k] ?? "").trim() || null;
    patch.full_name = name;
    for (const k of NUM) patch[k] = f[k] === "" ? null : Number(f[k]);
    for (const k of ARR) patch[k] = f[k];
    patch.source_id = f.source_id || null;
    patch.referred_by_employee_id = f.referred_by_employee_id || null;
    patch.keep_for_future = !!f.keep_for_future;
    setBusy(true);
    const { error } = await supabase.from("ats_candidates").update(patch).eq("id", candidate.id);
    setBusy(false);
    if (error) return toast.error(atsErrorMessage(error));
    toast.success("Profile saved");
    qc.invalidateQueries({ queryKey: candKeys.all });
    qc.invalidateQueries({ queryKey: atsKeys.overview });
    onOpenChange(false);
  };

  const txt = (k: string, label: string, type = "text") => (
    <div className="space-y-1.5"><Label htmlFor={`ep-${k}`}>{label}</Label><Input id={`ep-${k}`} type={type} value={f[k] ?? ""} onChange={(e) => set(k, e.target.value)} className="text-foreground" /></div>
  );
  const num = (k: string, label: string, max?: number) => (
    <div className="space-y-1.5"><Label htmlFor={`ep-${k}`}>{label}</Label><Input id={`ep-${k}`} type="number" inputMode="decimal" min={0} max={max} value={f[k] ?? ""} onChange={(e) => set(k, e.target.value)} className="text-foreground" /></div>
  );

  return (
    <Sheet open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <SheetContent className="flex w-full flex-col sm:max-w-lg">
        <SheetHeader><SheetTitle>Edit profile</SheetTitle></SheetHeader>
        <form id="ats-edit-profile" className="-mx-6 flex-1 space-y-4 overflow-y-auto px-6 py-2" onSubmit={(e) => { e.preventDefault(); save(); }}>
          {txt("full_name", "Full name")}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {txt("email", "Email", "email")}{txt("phone", "Phone", "tel")}{txt("alt_phone", "Alternate phone", "tel")}
            {txt("city", "City")}{txt("state", "State")}
            {txt("current_company", "Current company")}{txt("current_title", "Current title")}
            {num("total_experience_years", "Experience (years)", 60)}{num("notice_period_days", "Notice period (days)", 365)}
            {num("current_ctc_monthly", "Current CTC / month (₹)")}{num("expected_ctc_monthly", "Expected CTC / month (₹)")}
          </div>
          {txt("ctc_note", "CTC note")}
          <div className="space-y-1.5"><Label>Shift preference</Label><ChipInput value={f.shift_preferences} onChange={(v) => set("shift_preferences", v)} placeholder="Type and press Enter" /></div>
          <div className="space-y-1.5"><Label>Skills</Label><ChipInput value={f.skills} onChange={(v) => set("skills", v)} placeholder="Type and press Enter" /></div>
          <div className="space-y-1.5"><Label>Languages</Label><ChipInput value={f.languages} onChange={(v) => set("languages", v)} placeholder="Type and press Enter" /></div>
          <div className="space-y-1.5"><Label>Tags</Label><ChipInput value={f.tags} onChange={(v) => set("tags", v)} placeholder="Type and press Enter" /></div>
          <div className="space-y-1.5"><Label htmlFor="ep-education">Education</Label><Textarea id="ep-education" rows={2} value={f.education} onChange={(e) => set("education", e.target.value)} className="text-foreground" /></div>
          {txt("linkedin_url", "LinkedIn URL", "url")}{txt("portfolio_url", "Portfolio URL", "url")}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Source</Label>
              <Select value={f.source_id || "__none"} onValueChange={(v) => set("source_id", v === "__none" ? "" : v)}>
                <SelectTrigger className="text-foreground"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="__none">—</SelectItem>{(sources.data ?? []).filter((s) => s.is_active || s.id === f.source_id).map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {txt("source_detail", "Source detail")}
          </div>
          <div className="space-y-1.5">
            <Label>Referred by</Label>
            <Select value={f.referred_by_employee_id || "__none"} onValueChange={(v) => set("referred_by_employee_id", v === "__none" ? "" : v)}>
              <SelectTrigger className="text-foreground"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="__none">—</SelectItem>{(emps.data ?? []).map((e) => <SelectItem key={e.id} value={e.id}>{e.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label htmlFor="ep-summary">Summary</Label><Textarea id="ep-summary" rows={3} value={f.summary} onChange={(e) => set("summary", e.target.value)} className="text-foreground" /></div>
          <label className="flex items-center justify-between gap-3 rounded-md border border-border p-3 text-sm">
            Keep for future openings <Switch checked={!!f.keep_for_future} onCheckedChange={(v) => set("keep_for_future", v)} />
          </label>
        </form>
        <SheetFooter className="gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button type="submit" form="ats-edit-profile" disabled={busy || !!err}>Save</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
