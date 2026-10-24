import { useState, useEffect, useRef, useCallback } from "react";
import { FillsRequirementPicker } from "./FillsRequirementPicker";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { User } from "lucide-react";
import { CandidateInviteCard } from "./CandidateInviteCard";
import { composeAddress, parseAddress } from "@/lib/addressParse";

const ADDRESS_KEYS = ["address", "city", "state", "zip", "country"];

interface Stage1Props {
  data: any;
  onSave: (data: any, options?: { silent?: boolean }) => Promise<void>;
  onComplete: (data: any) => Promise<void>;
  readOnly?: boolean;
}

export function Stage1BasicDetails({ data, onSave, onComplete, readOnly }: Stage1Props) {
  const [isCompleting, setIsCompleting] = useState(false);
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    phone: "",
    gender: "",
    marital_status: "",
    date_of_birth: "",
    address: "",
    city: "",
    state: "",
    zip: "",
    country: "",
    department_id: "",
    position_id: "",
    job_role: "",
    shift_id: "",
    hiring_requirement_id: "",
    hiring_requirement_declined: false,
    employee_type: "",
    probation_end_date: "",
  });
  const [fullAddress, setFullAddress] = useState("");
  /** A save should be scheduled (an edit not yet sent). */
  const dirtyRef = useRef(false);
  /**
   * Edits not yet confirmed saved: field → edit count. A field stays protected until
   * a save that carried its latest value succeeds, so a record refresh never reverts it
   * and a failed save never loses it. Untouched fields follow the saved record (another
   * screen, the candidate's form or an import may change it), and once the record exists
   * only edited fields are saved, so newer values written elsewhere are not overwritten.
   */
  const editsRef = useRef<Map<string, number>>(new Map());
  const touch = useCallback((...keys: string[]) => {
    dirtyRef.current = true;
    for (const k of keys) editsRef.current.set(k, (editsRef.current.get(k) || 0) + 1);
  }, []);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Saves run one after another, never overlapping, so they reach the database in order. */
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  const formRef = useRef(form);
  formRef.current = form;
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  const recordIdRef = useRef<string | null>(null);
  recordIdRef.current = data?.id || null;

  /** Save every pending edit, after any save already running. Rejects if the save fails (the edits stay pending). */
  const savePending = useCallback((): Promise<void> => {
    const run = saveChainRef.current.catch(() => {}).then(async () => {
      const sent = new Map(editsRef.current);
      dirtyRef.current = false;
      if (!sent.size) return;
      const current = formRef.current as Record<string, unknown>;
      // A new draft is created from the whole form; an existing record gets only what was edited.
      const payload = recordIdRef.current
        ? Object.fromEntries([...sent.keys()].filter((k) => k in current).map((k) => [k, current[k]]))
        : current;
      try {
        await onSaveRef.current(payload, { silent: true });
      } catch (err) {
        dirtyRef.current = true;
        throw err;
      }
      // Saved: a field stays protected only if it was edited again meanwhile.
      for (const [k, n] of sent) if (editsRef.current.get(k) === n) editsRef.current.delete(k);
      if (editsRef.current.size) dirtyRef.current = true;
    });
    saveChainRef.current = run;
    return run;
  }, []);

  useEffect(() => {
    if (data) {
      // Legacy drafts stored `full_time` / `part_time`; the Select only offers
      // permanent/contract/intern now. Map legacy → permanent so the field
      // hydrates visibly (and downstream inserts get a valid value) instead
      // of silently blanking the trigger while the DB keeps the old value.
      const rawType = data.employee_type || "";
      const normalizedType = rawType === "full_time" || rawType === "part_time" ? "permanent" : rawType;
      const fromData = {
        first_name: data.first_name || "",
        last_name: data.last_name || "",
        email: data.email || "",
        phone: data.phone || "",
        gender: data.gender || "",
        marital_status: data.marital_status ? (String(data.marital_status).charAt(0).toUpperCase() + String(data.marital_status).slice(1).toLowerCase()) : "",
        date_of_birth: data.date_of_birth || "",
        address: data.address || "",
        city: data.city || "",
        state: data.state || "",
        zip: data.zip || "",
        country: data.country || "",
        department_id: data.department_id || "",
        position_id: data.position_id || "",
        job_role: data.job_role || "",
        shift_id: data.shift_id || "",
        hiring_requirement_id: data.hiring_requirement_id || "",
        hiring_requirement_declined: !!data.hiring_requirement_declined,
        employee_type: normalizedType,
        probation_end_date: data.probation_end_date || "",
      };
      const savedAddress = composeAddress({
        address: data.address || "",
        city: data.city || "",
        state: data.state || "",
        zip: data.zip || "",
        country: data.country || "",
      });
      const edited = editsRef.current;
      if (edited.size) {
        // Edits not yet saved stay as typed; everything else follows the saved record.
        setForm((prev) => {
          const next: Record<string, unknown> = { ...fromData };
          for (const k of edited.keys()) if (k in prev) next[k] = (prev as Record<string, unknown>)[k];
          return next as typeof prev;
        });
        if (!ADDRESS_KEYS.some((k) => edited.has(k))) setFullAddress(savedAddress);
      } else {
        setForm(fromData);
        setFullAddress(savedAddress);
      }
      // If we rewrote the legacy value, mark it edited so the autosave persists
      // the normalized value back to the draft on the next tick.
      if (rawType && rawType !== normalizedType) touch("employee_type");
    }
  }, [data, touch]);


  const { data: departments } = useQuery({
    queryKey: ["departments-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("departments").select("id, name").eq("is_active", true).order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: positions } = useQuery({
    queryKey: ["positions-list", form.department_id],
    queryFn: async () => {
      let q = supabase.from("positions").select("id, title").eq("is_active", true).order("title");
      if (form.department_id) q = q.eq("department_id", form.department_id);
      const { data, error } = await q;
      if (error) throw error;
      return data;
    },
  });

  const { data: shifts } = useQuery({
    queryKey: ["shifts-list"],
    queryFn: async () => {
      const { data, error } = await supabase.from("hr_shifts").select("id, name").eq("is_active", true).order("name");
      if (error) throw error;
      return data;
    },
  });


  useEffect(() => {
    if (!dirtyRef.current || readOnly) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      savePending().catch((err: any) => {
        // The edits stay pending: the next change or "Send onboarding form" saves them again.
        console.warn("Stage 1 autosave failed:", err);
        toast.error(`Stage 1 changes were not saved${err?.message ? `: ${err.message}` : ""}. They will be saved with your next change, or when you send the onboarding form.`, { id: "stage1-autosave" });
      });
    }, 900);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [form, onSave, readOnly, savePending]);

  const update = (field: string, value: string) => {
    // The field, and what changing it resets.
    if (field === "position_id") touch(field, "job_role", "hiring_requirement_id", "hiring_requirement_declined");
    else if (field === "department_id") touch(field, "position_id", "job_role", "hiring_requirement_id", "hiring_requirement_declined");
    else if (field === "hiring_requirement_id") touch(field, "hiring_requirement_declined");
    else touch(field);
    setForm(prev => {
      const next: any = { ...prev, [field]: value };
      // The designation is the only title (the database keeps job_role equal to it). Mirror the
      // chosen designation title into the legacy job_role field so downstream
      // finalization / RazorpayX push keep resolving a title.
      if (field === "position_id") {
        next.job_role = positions?.find((p: any) => p.id === value)?.title || "";
        if (value !== prev.position_id) { next.hiring_requirement_id = ""; next.hiring_requirement_declined = false; }
      }
      if (field === "department_id") {
        next.position_id = "";
        next.job_role = "";
        next.hiring_requirement_id = "";
        next.hiring_requirement_declined = false;
      }
      if (field === "hiring_requirement_id") next.hiring_requirement_declined = false;
      return next;
    });
  };
  const setRequirement = useCallback((v: string) => update("hiring_requirement_id", v), [positions]); // eslint-disable-line react-hooks/exhaustive-deps
  const declineRequirement = useCallback(() => {
    touch("hiring_requirement_id", "hiring_requirement_declined");
    setForm((prev: any) => ({ ...prev, hiring_requirement_id: "", hiring_requirement_declined: true }));
  }, [touch]);

  // One input, structured storage: parse the typed line into
  // address / city / state / zip / country on every keystroke.
  const updateAddress = (value: string) => {
    touch(...ADDRESS_KEYS);
    setFullAddress(value);
    const parsed = parseAddress(value);
    setForm(prev => ({ ...prev, ...parsed }));
  };


  const validate = () => {
    if (!form.first_name.trim()) { toast.error("First name is required"); return false; }
    if (!form.email.trim()) { toast.error("Email is required"); return false; }
    if (!form.department_id) { toast.error("Department is required"); return false; }
    if (!form.employee_type) { toast.error("Employee type is required"); return false; }
    return true;
  };

  const handleSave = () => onSave(form);
  /**
   * Save pending edits now (and wait for an autosave already running), so the
   * send dialog starts from the saved record. A failed save keeps the edits
   * pending and is reported — the dialog must not open on stale details.
   */
  const flushDraft = useCallback(async () => {
    if (readOnly) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    await savePending();
  }, [readOnly, savePending]);
  const handleComplete = async () => {
    if (!validate()) return;
    setIsCompleting(true);
    try {
      // Completing writes the whole form; let a running autosave land first so it cannot overwrite it.
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      await saveChainRef.current.catch(() => {});
      await onComplete(form);
    } catch {
      // Parent wizard shows the detailed failure toast.
    } finally {
      setIsCompleting(false);
    }
  };

  return (
    <div className="space-y-4">
    {/* Candidate self-service onboarding form — kept at the top so the invite
        link / email is the first action available in Stage 1. */}
    <CandidateInviteCard
      onboardingId={data?.id}
      beforeOpen={flushDraft}
      packageEnabled={!!(data as any)?.prejoining?.enabled}
      recordVersion={(data as any)?.updated_at || null}
    />
    <Card>
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-base flex items-center gap-2">
          <User className="h-4 w-4" /> Stage 1: Basic Details
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Label>First Name *</Label>
            <Input value={form.first_name} onChange={e => update("first_name", e.target.value)} disabled={readOnly} />
          </div>
          <div>
            <Label>Last Name</Label>
            <Input value={form.last_name} onChange={e => update("last_name", e.target.value)} disabled={readOnly} />
          </div>
          <div>
            <Label>Email *</Label>
            <Input type="email" value={form.email} onChange={e => update("email", e.target.value)} disabled={readOnly} />
          </div>
          <div>
            <Label>Phone</Label>
            <Input value={form.phone} onChange={e => update("phone", e.target.value)} disabled={readOnly} />
          </div>
          <div>
            <Label>Gender</Label>
            <Select value={form.gender} onValueChange={v => update("gender", v)} disabled={readOnly}>
              <SelectTrigger><SelectValue placeholder="Select gender" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="female">Female</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Marital Status</Label>
            <Select value={form.marital_status} onValueChange={v => update("marital_status", v)} disabled={readOnly}>
              <SelectTrigger><SelectValue placeholder="Select marital status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="Single">Single</SelectItem>
                <SelectItem value="Married">Married</SelectItem>
                <SelectItem value="Divorced">Divorced</SelectItem>
                <SelectItem value="Widowed">Widowed</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Date of Birth</Label>
            <Input type="date" value={form.date_of_birth} onChange={e => update("date_of_birth", e.target.value)} disabled={readOnly} />
          </div>

          {/* Single free-text address capture. We still persist city / state /
              PIN / country separately behind the scenes for payroll + statutory. */}
          <div className="sm:col-span-2">
            <Label>Address</Label>
            <Textarea
              rows={2}
              value={fullAddress}
              onChange={e => updateAddress(e.target.value)}
              disabled={readOnly}
              placeholder="House / street / locality, City, State, PIN, Country"
            />
            {(form.city || form.state || form.zip || form.country) && (
              <p className="mt-1 text-xs text-muted-foreground">
                Saved as — City: {form.city || "—"} · State: {form.state || "—"} · PIN: {form.zip || "—"} · Country: {form.country || "—"}
              </p>
            )}
          </div>


          <div>
            <Label>Department *</Label>
            <Select value={form.department_id} onValueChange={v => update("department_id", v)} disabled={readOnly}>
              <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
              <SelectContent>
                {departments?.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Designation</Label>
            <Select value={form.position_id} onValueChange={v => update("position_id", v)} disabled={readOnly}>
              <SelectTrigger><SelectValue placeholder="Select designation" /></SelectTrigger>
              <SelectContent>
                {positions?.map(p => <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Shift</Label>
            <Select value={form.shift_id} onValueChange={v => update("shift_id", v)} disabled={readOnly}>
              <SelectTrigger><SelectValue placeholder="Select shift" /></SelectTrigger>
              <SelectContent>
                {shifts?.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Employee Type *</Label>
            <Select value={form.employee_type} onValueChange={v => update("employee_type", v)} disabled={readOnly}>
              <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
              <SelectContent>
                {/* RazorpayX-aligned employee types only. */}
                <SelectItem value="permanent">Permanent</SelectItem>
                <SelectItem value="contract">Contract</SelectItem>
                <SelectItem value="intern">Intern</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <FillsRequirementPicker departmentId={form.department_id} positionId={form.position_id} shiftId={form.shift_id}
            value={form.hiring_requirement_id} onChange={setRequirement}
            declined={!!form.hiring_requirement_declined} onDecline={declineRequirement} disabled={readOnly || data?.status === "completed"} />
          <div>
            <Label>Probation End Date <span className="text-muted-foreground font-normal">(optional)</span></Label>
            <Input
              type="date"
              value={form.probation_end_date}
              onChange={e => update("probation_end_date", e.target.value)}
              disabled={readOnly}
            />

          </div>

        </div>
        {!readOnly && (
          <div className="flex gap-2 pt-2">
            <Button onClick={handleComplete} disabled={isCompleting}>
              {isCompleting ? "Completing..." : "Complete & Next →"}
            </Button>
          </div>
        )}
      </CardContent>
      </Card>

    </div>
  );
}
