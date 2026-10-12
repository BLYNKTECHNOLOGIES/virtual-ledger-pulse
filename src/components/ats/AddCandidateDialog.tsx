import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ResponsiveDialog } from "@/components/horilla/primitives/ResponsiveDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { atsErrorMessage } from "@/lib/ats/errors";
import { atsKeys, useAtsJobs, useAtsSources, useShiftsLookup } from "@/lib/ats/api";
import { candKeys } from "@/lib/ats/candidates";
import { fmtDate } from "@/lib/ats/format";
import { uploadAtsFile, AtsFileError, validateAtsFile } from "@/lib/ats/files";
import { ChipInput, MultiSelect } from "./AtsBits";
import { appStatusLabel } from "./CandidateBits";
import { FileDropZone } from "./CandidateReviewPanel";
import { validateCandidateNumbers } from "./EditProfileSheet";

const LAST_SOURCE = "ats.addCandidate.lastSource";
const readLast = () => { try { return localStorage.getItem(LAST_SOURCE) ?? ""; } catch { return ""; } };
const writeLast = (v: string) => { try { localStorage.setItem(LAST_SOURCE, v); } catch { /* ignore */ } };

interface Dup { candidate_id: string; ref_no: string; full_name: string; email: string | null; phone: string | null; matched_on: string; application_count: number; last_applied_at: string | null; last_status: string | null }

const empty = () => ({
  full_name: "", email: "", phone: "", job: "general", source_id: "", source_detail: "", current_company: "", current_title: "",
  total_experience_years: "", current_ctc_monthly: "", expected_ctc_monthly: "", notice_period_days: "", city: "",
  skills: [] as string[], shift_preferences: [] as string[],
});

export function AddCandidateDialog({ open, onOpenChange, jobId }: { open: boolean; onOpenChange: (o: boolean) => void; jobId?: string | null }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const jobs = useAtsJobs();
  const sources = useAtsSources();
  const shifts = useShiftsLookup();
  const [f, setF] = useState(empty);
  const [file, setFile] = useState<File | null>(null);
  const [dups, setDups] = useState<Dup[]>([]);
  const [existing, setExisting] = useState<Dup | null>(null);
  const [busy, setBusy] = useState(false);

  const activeSources = useMemo(() => (sources.data ?? []).filter((s) => s.is_active), [sources.data]);
  const jobOptions = useMemo(() => (jobs.data ?? []).filter((j) => j.status === "open" || j.status === "paused"), [jobs.data]);
  const shiftOptions = useMemo(() => (shifts.data ?? []).map((s) => ({ id: s.label.split(" (")[0], label: s.label.split(" (")[0] })), [shifts.data]);

  useEffect(() => {
    if (!open) return;
    const last = readLast();
    setF({ ...empty(), job: jobId || "general", source_id: activeSources.some((s) => s.id === last) ? last : "" });
    setFile(null); setDups([]); setExisting(null);
  }, [open, jobId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (open && !f.source_id) { const last = readLast(); if (activeSources.some((s) => s.id === last)) setF((p) => ({ ...p, source_id: last })); }
  }, [activeSources]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k: keyof ReturnType<typeof empty>, v: any) => setF((p) => ({ ...p, [k]: v }));

  const checkDups = async () => {
    const email = f.email.trim(), phone = f.phone.trim();
    if (!email && !phone) { setDups([]); return; }
    const { data, error } = await supabase.rpc("ats_find_duplicates", { p_email: email || null, p_phone: phone || null, p_exclude: null } as any);
    if (error) return;
    const rows = (data ?? []) as Dup[];
    setDups(rows);
    if (existing && !rows.some((r) => r.candidate_id === existing.candidate_id)) setExisting(null);
  };

  const name = f.full_name.trim();
  const err = !name || name.length > 120 ? "Enter the candidate's name."
    : !f.email.trim() && !f.phone.trim() ? "Enter an email or a phone number."
    : !f.source_id ? "Choose a source."
    : validateCandidateNumbers(f) ?? (file ? validateAtsFile(file) : null);

  const save = async () => {
    if (busy) return;
    if (err) { toast.error(err); return; }
    setBusy(true);
    const src = activeSources.find((s) => s.id === f.source_id);
    const job = f.job === "general" ? null : jobOptions.find((j) => j.id === f.job) ?? null;
    const n = (v: string) => (v === "" ? null : Number(v));
    const p_candidate: Record<string, unknown> = {
      full_name: name, email: f.email.trim() || null, phone: f.phone.trim() || null,
      current_company: f.current_company.trim() || null, current_title: f.current_title.trim() || null,
      total_experience_years: n(f.total_experience_years), current_ctc_monthly: n(f.current_ctc_monthly),
      expected_ctc_monthly: n(f.expected_ctc_monthly), notice_period_days: n(f.notice_period_days),
      city: f.city.trim() || null, skills: f.skills, shift_preferences: f.shift_preferences,
      source_id: f.source_id, source_detail: f.source_detail.trim() || null,
    };
    const via = src?.kind === "referral" ? "referral" : src?.kind === "walk_in" ? "walk_in" : "manual";
    try {
      const { data, error } = await supabase.rpc("ats_create_application", {
        p_candidate: p_candidate as any, p_job_id: job?.id ?? null, p_source_id: f.source_id, p_applied_via: via,
        p_position_text: job?.title ?? null, p_existing_candidate_id: existing?.candidate_id ?? null,
        p_source_detail: f.source_detail.trim() || null,
      } as any);
      if (error) throw error;
      writeLast(f.source_id);
      const res = data as unknown as { candidate_id: string; application_id: string; existing_application: boolean };
      const href = `/hrms/ats/candidates/${res.candidate_id}?app=${res.application_id}`;
      qc.invalidateQueries({ queryKey: candKeys.all });
      qc.invalidateQueries({ queryKey: atsKeys.overview });
      qc.invalidateQueries({ queryKey: atsKeys.jobSummary });
      if (res.existing_application) {
        toast.info(`${existing?.full_name ?? name} has already applied for this job`);
        onOpenChange(false); navigate(href); return;
      }
      if (file) {
        try {
          await uploadAtsFile({ file, candidateId: res.candidate_id, applicationId: res.application_id, kind: "resume" });
          toast.success("Candidate added");
        } catch (e) {
          if (e instanceof AtsFileError && e.reason === "duplicate") toast.success("Candidate added");
          else toast.warning("Candidate saved, but the resume upload failed. Upload it again from Files.");
        }
        qc.invalidateQueries({ queryKey: candKeys.all });
      } else toast.success("Candidate added");
      onOpenChange(false);
      navigate(href);
    } catch (e) {
      toast.error(atsErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const txt = (k: keyof ReturnType<typeof empty>, label: string, opts: { type?: string; onBlur?: () => void; inputMode?: any } = {}) => (
    <div className="space-y-1.5">
      <Label htmlFor={`ac-${k}`}>{label}</Label>
      <Input id={`ac-${k}`} type={opts.type ?? "text"} inputMode={opts.inputMode} value={f[k] as string} onBlur={opts.onBlur}
        onChange={(e) => set(k, e.target.value)} className="text-foreground" disabled={busy} />
    </div>
  );

  return (
    <ResponsiveDialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)} title="Add candidate" contentClassName="max-w-2xl"
      footer={<>
        <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
        <Button type="submit" form="ats-add-candidate" disabled={busy || !!err}>{busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}{existing ? `Add application for ${existing.full_name}` : "Add candidate"}</Button>
      </>}>
      <form id="ats-add-candidate" className="max-h-[65vh] space-y-4 overflow-y-auto pr-1" onSubmit={(e) => { e.preventDefault(); save(); }}>
        {txt("full_name", "Full name *")}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {txt("email", "Email", { type: "email", onBlur: checkDups })}
          {txt("phone", "Phone", { type: "tel", onBlur: checkDups })}
        </div>
        <p className="-mt-2 text-xs text-muted-foreground">Enter at least an email or a phone number.</p>

        {dups.length > 0 && (
          <div className="space-y-2 rounded-lg border border-warning/50 bg-warning/10 p-3 text-sm" role="status">
            <p className="flex items-center gap-1.5 font-medium text-foreground"><AlertTriangle className="h-4 w-4 text-warning" /> Possible existing candidate{dups.length > 1 ? "s" : ""}</p>
            <ul className="space-y-2">
              {dups.map((d) => (
                <li key={d.candidate_id} className="rounded-md border border-border bg-background p-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="min-w-0"><span className="t-mono text-xs text-muted-foreground">{d.ref_no}</span> <span className="font-medium text-foreground">{d.full_name}</span></span>
                    <a href={`/hrms/ats/candidates/${d.candidate_id}`} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline">Open</a>
                  </div>
                  <p className="text-xs text-muted-foreground">{[d.email, d.phone].filter(Boolean).join(" · ")} · matched on {d.matched_on}</p>
                  <p className="text-xs text-muted-foreground">{d.application_count} application{d.application_count === 1 ? "" : "s"}{d.last_applied_at ? `, last ${appStatusLabel(d.last_status).toLowerCase()} on ${fmtDate(d.last_applied_at)}` : ""}</p>
                  <Button type="button" size="sm" variant={existing?.candidate_id === d.candidate_id ? "default" : "outline"} className="mt-1.5 h-7"
                    onClick={() => setExisting(existing?.candidate_id === d.candidate_id ? null : d)}>
                    {existing?.candidate_id === d.candidate_id ? "Selected" : `Add as a new application for ${d.full_name}`}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Job</Label>
            <Select value={f.job} onValueChange={(v) => set("job", v)} disabled={busy}>
              <SelectTrigger className="text-foreground"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="general">General application</SelectItem>
                {jobOptions.map((j) => <SelectItem key={j.id} value={j.id}>{j.title}{j.status === "paused" ? " (paused)" : ""}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Source *</Label>
            <Select value={f.source_id} onValueChange={(v) => set("source_id", v)} disabled={busy}>
              <SelectTrigger className="text-foreground"><SelectValue placeholder="Choose a source" /></SelectTrigger>
              <SelectContent>{activeSources.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        {txt("source_detail", "Source detail")}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {txt("current_company", "Current company")}
          {txt("current_title", "Current title")}
          {txt("total_experience_years", "Total experience (years)", { type: "number", inputMode: "decimal" })}
          {txt("notice_period_days", "Notice period (days)", { type: "number", inputMode: "numeric" })}
          {txt("current_ctc_monthly", "Current CTC / month (₹)", { type: "number", inputMode: "decimal" })}
          {txt("expected_ctc_monthly", "Expected CTC / month (₹)", { type: "number", inputMode: "decimal" })}
          {txt("city", "City")}
        </div>
        <div className="space-y-1.5"><Label>Skills</Label><ChipInput value={f.skills} onChange={(v) => set("skills", v)} placeholder="Type and press Enter" /></div>
        <div className="space-y-1.5"><Label>Shift preference</Label><MultiSelect options={shiftOptions} value={f.shift_preferences} onChange={(v) => set("shift_preferences", v)} placeholder="Any" /></div>
        <div className="space-y-1.5"><Label>Resume (optional)</Label><FileDropZone file={file} onFile={setFile} disabled={busy} /></div>
      </form>
    </ResponsiveDialog>
  );
}
