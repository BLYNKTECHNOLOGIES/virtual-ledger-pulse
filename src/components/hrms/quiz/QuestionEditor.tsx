import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { fmtIst, pretty, quizRpc, useInvalidateQuiz } from "./quizShared";

export type Subject = { key: string; pool: "hiring" | "staff" | "shared"; display_name: string; description: string | null; is_retired: boolean };
export type ItemType = "mcq" | "numeric" | "written" | "typing_passage" | "data_entry_record" | "match_pair";
export type EditableQuestion = {
  question_id: string; type: ItemType; category_tag: string; pool: string; difficulty: string; status: string;
  applicable_role_codes: string[] | null; version_no: number | null; version_count: number; current_served: boolean;
  content: Record<string, any> | null; answer_key: Record<string, any> | null;
};

export const TYPE_LABEL: Record<ItemType, string> = {
  mcq: "Multiple choice", numeric: "Numeric answer", written: "Written answer",
  typing_passage: "Typing passage", data_entry_record: "Data-entry record", match_pair: "Match pair",
};
export const POOL_LABEL: Record<string, string> = { hiring: "Hiring", staff: "Staff", shared: "Shared" };
const SKILL_DRILL: ItemType[] = ["typing_passage", "data_entry_record", "match_pair"];
const DE_FIELDS = [
  { key: "name", label: "Name", hint: "" }, { key: "pan", label: "PAN", hint: "ABCDE1234F" },
  { key: "account_number", label: "Account number", hint: "9–18 digits" }, { key: "ifsc", label: "IFSC", hint: "SBIN0001234" },
  { key: "utr", label: "UTR", hint: "8–22 letters/digits" }, { key: "amount", label: "Amount", hint: "12,345.50" },
  { key: "txn_date", label: "Date", hint: "DD/MM/YYYY" },
] as const;

type Form = {
  type: ItemType; pool: string; subject: string; difficulty: string; status: string; roleCodes: string[];
  prompt: string; marks: string; options: { id: string; text: string }[]; correct: string; explanation: string;
  numericAnswer: string; tolerance: string; unit: string; minWords: string; maxWords: string;
  covers: string[]; mustNot: string[]; maxMarks: string; passage: string; level: string;
  record: Record<string, string>; left: string; right: string; isMatch: "yes" | "no" | ""; differs: string;
};

const blank = (type: ItemType = "mcq"): Form => ({
  type, pool: SKILL_DRILL.includes(type) ? "shared" : "hiring", subject: "", difficulty: "medium", status: "needs_review", roleCodes: [],
  prompt: "", marks: "1", options: ["a", "b", "c", "d"].map((id) => ({ id, text: "" })), correct: "a", explanation: "",
  numericAnswer: "", tolerance: "0", unit: "", minWords: "", maxWords: "", covers: [""], mustNot: [""], maxMarks: "20",
  passage: "", level: "intermediate", record: {}, left: "", right: "", isMatch: "", differs: "",
});

function fromQuestion(q: EditableQuestion): Form {
  const c = q.content ?? {}; const k = q.answer_key ?? {}; const rub = k.rubric ?? {};
  return {
    ...blank(q.type), pool: q.pool, subject: q.category_tag, difficulty: q.difficulty, status: q.status, roleCodes: q.applicable_role_codes ?? [],
    prompt: c.prompt ?? "", marks: String(c.marks ?? 1),
    options: Array.isArray(c.options) && c.options.length ? c.options.map((o: any) => ({ id: o.id, text: o.text ?? "" })) : blank().options,
    correct: k.correct_option_id ?? "a", explanation: q.type === "match_pair" ? "" : k.explanation ?? "",
    numericAnswer: k.numeric_answer != null ? String(k.numeric_answer) : "", tolerance: String(k.numeric_tolerance ?? 0), unit: c.unit ?? "",
    minWords: c.min_words != null ? String(c.min_words) : "", maxWords: c.max_words != null ? String(c.max_words) : "",
    covers: Array.isArray(rub.covers) && rub.covers.length ? rub.covers : Array.isArray(rub.criteria) ? rub.criteria.map((x: any) => x.name) : [""],
    mustNot: Array.isArray(rub.must_not) && rub.must_not.length ? rub.must_not : [""], maxMarks: String(rub.max_marks ?? 20),
    passage: c.passage ?? "", level: c.level ?? "intermediate", record: { ...(c.record ?? {}) },
    left: c.left ?? "", right: c.right ?? "", isMatch: k.pair_is_match === true ? "yes" : k.pair_is_match === false ? "no" : "",
    differs: q.type === "match_pair" ? k.explanation ?? "" : "",
  };
}

/** The payload cbt_save_question expects. Kept pure so it can be unit tested. */
export function buildPayload(f: Form) {
  const content: Record<string, unknown> = { marks: Number(f.marks) };
  const key: Record<string, unknown> = {};
  switch (f.type) {
    case "mcq":
      content.prompt = f.prompt; content.options = f.options.map((o) => ({ id: o.id, text: o.text.trim() }));
      key.correct_option_id = f.correct; key.explanation = f.explanation; break;
    case "numeric":
      content.prompt = f.prompt; content.unit = f.unit;
      key.numeric_answer = f.numericAnswer.trim(); key.numeric_tolerance = f.tolerance.trim() || "0"; key.explanation = f.explanation; break;
    case "written":
      content.prompt = f.prompt; content.min_words = f.minWords.trim(); content.max_words = f.maxWords.trim();
      key.rubric = { covers: f.covers.map((x) => x.trim()).filter(Boolean), must_not: f.mustNot.map((x) => x.trim()).filter(Boolean), max_marks: f.maxMarks.trim() };
      break;
    case "typing_passage":
      content.passage = f.passage; content.level = f.level; break;
    case "data_entry_record":
      content.prompt = f.prompt || undefined;
      content.record = Object.fromEntries(DE_FIELDS.map((d) => [d.key, (f.record[d.key] ?? "").trim().toUpperCase() === "" ? "" :
        d.key === "name" || d.key === "amount" || d.key === "txn_date" ? (f.record[d.key] ?? "").trim() : (f.record[d.key] ?? "").trim().toUpperCase()]));
      break;
    case "match_pair":
      content.prompt = f.prompt || undefined; content.left = f.left; content.right = f.right;
      key.pair_is_match = f.isMatch === "yes" ? true : f.isMatch === "no" ? false : null; key.explanation = f.differs; break;
  }
  return { type: f.type, pool: f.pool, subject: f.subject, difficulty: f.difficulty, status: f.status, role_codes: f.roleCodes, content, key };
}

type SaveResult = { question_id: string; version_no: number; new_version: boolean; key_changed: boolean; affected_attempts: number };
type Target = { attempt_id: string; public_ref: string; status: string; decision: string; decision_source: string; total_score: number | null };

function RescoreOffer({ questionId, onDone }: { questionId: string; onDone: () => void }) {
  const { toast } = useToast();
  const invalidate = useInvalidateQuiz();
  const { data: targets = [], isLoading } = useQuery({
    queryKey: ["cbt", "rescore-targets", questionId],
    queryFn: () => quizRpc<Target[]>("cbt_question_rescore_targets", { p_question_id: questionId }),
  });
  const run = useMutation({
    mutationFn: () => quizRpc<number>("cbt_rescore_question_attempts", { p_question_id: questionId, p_attempt_ids: targets.map((t) => t.attempt_id) }),
    onSuccess: (n) => { toast({ title: `Re-scored ${n} attempt${n === 1 ? "" : "s"}`, description: "HR-set decisions were kept." }); void invalidate(); onDone(); },
    onError: (e: Error) => toast({ title: "Not re-scored", description: e.message, variant: "destructive" }),
  });
  return (
    <div className="space-y-3">
      <p className="text-sm">The answer key changed on a version people have already answered.</p>
      {isLoading ? <p className="text-sm text-muted-foreground">Finding attempts…</p> : (
        <ul className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-border p-2 text-sm">
          {targets.map((t) => (
            <li key={t.attempt_id} className="flex justify-between gap-2"><span className="font-mono">{t.public_ref}</span>
              <span className="text-muted-foreground">{t.total_score ?? "—"} · {pretty(t.decision)}{t.decision_source === "manual" ? " (HR, kept)" : ""}</span></li>
          ))}
        </ul>
      )}
      <DialogFooter>
        <Button variant="outline" onClick={onDone}>Not now</Button>
        <Button disabled={!targets.length} loading={run.isPending} onClick={() => run.mutate()}>Re-score the {targets.length} attempt{targets.length === 1 ? "" : "s"} that used it</Button>
      </DialogFooter>
    </div>
  );
}

function History({ questionId }: { questionId: string }) {
  const { data } = useQuery({
    queryKey: ["cbt", "question-history", questionId],
    queryFn: () => quizRpc<{ versions: { version_no: number; created_at: string; first_served_at: string | null; is_current: boolean; served: number }[];
      audit: { action: string; at: string; actor: string | null; reason: string | null }[] }>("cbt_question_history", { p_question_id: questionId }),
  });
  if (!data) return null;
  return (
    <div className="space-y-2 border-t border-border pt-3 text-xs">
      <p className="font-semibold">History</p>
      {data.versions.map((v) => (
        <p key={v.version_no} className="text-muted-foreground">
          <span className="font-medium text-foreground">Version {v.version_no}</span>{v.is_current ? " (current)" : ""} · created {fmtIst(v.created_at)} ·{" "}
          {v.first_served_at ? `served ${v.served} time${v.served === 1 ? "" : "s"} — locked` : "not served yet"}
        </p>
      ))}
      {data.audit.slice(0, 8).map((a, i) => (
        <p key={i} className="text-muted-foreground">{pretty(a.action)} · {a.actor ?? "System"} · {fmtIst(a.at)}</p>
      ))}
    </div>
  );
}

function ListInput({ label, values, onChange, placeholder }: { label: string; values: string[]; onChange: (v: string[]) => void; placeholder: string }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {values.map((v, i) => (
        <div key={i} className="flex gap-2">
          <Input className="text-foreground" value={v} placeholder={placeholder} onChange={(e) => onChange(values.map((x, j) => (j === i ? e.target.value : x)))} />
          <Button type="button" variant="ghost" size="icon" aria-label="Remove" disabled={values.length === 1} onClick={() => onChange(values.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...values, ""])}><Plus className="h-4 w-4" />Add</Button>
    </div>
  );
}

export function QuestionEditor({ open, onOpenChange, question, subjects, roleCodes }: {
  open: boolean; onOpenChange: (o: boolean) => void; question: EditableQuestion | null; subjects: Subject[]; roleCodes: { code: string; name: string }[];
}) {
  const { toast } = useToast();
  const invalidate = useInvalidateQuiz();
  const [f, setF] = useState<Form>(blank());
  const [rescoreFor, setRescoreFor] = useState<string | null>(null);
  // Fill only when the dialog opens or a different item is opened.
  useEffect(() => { if (open) { setF(question ? fromQuestion(question) : blank()); setRescoreFor(null); } }, [open, question?.question_id]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));

  const poolSubjects = subjects.filter((s) => (!s.is_retired || s.key === f.subject) &&
    (s.pool === f.pool || s.pool === "shared" || f.pool === "shared"));

  const save = useMutation({
    mutationFn: () => quizRpc<SaveResult>("cbt_save_question", { p_question_id: question?.question_id ?? null, p: buildPayload(f) }),
    onSuccess: (res) => {
      void invalidate();
      toast({ title: question ? (res.new_version ? `Saved as version ${res.version_no}` : "Saved") : "Item added",
        description: res.new_version ? "The earlier version stays as it was for people who already saw it." : undefined });
      if (res.key_changed && res.affected_attempts > 0) setRescoreFor(res.question_id);
      else onOpenChange(false);
    },
    onError: (e: Error) => toast({ title: "Not saved", description: e.message, variant: "destructive" }),
  });

  const words = f.passage.trim() ? f.passage.trim().split(/\s+/).length : 0;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{rescoreFor ? "Re-score attempts?" : question ? `Edit ${TYPE_LABEL[f.type].toLowerCase()}` : "Add an item"}</DialogTitle>
          <DialogDescription>
            {question ? `Version ${question.version_no ?? 1}${question.current_served ? " has been served — changing the content saves a new version." : " has not been served yet — changes apply in place."}`
              : "Answer keys are stored privately and never sent to candidates."}
          </DialogDescription>
        </DialogHeader>
        {rescoreFor ? <RescoreOffer questionId={rescoreFor} onDone={() => onOpenChange(false)} /> : (
          <>
            <div className="grid gap-4">
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div><Label>Type</Label>
                  <Select value={f.type} disabled={Boolean(question)} onValueChange={(v: ItemType) => setF((x) => ({ ...blank(v), subject: "", status: x.status }))}>
                    <SelectTrigger className="text-foreground"><SelectValue /></SelectTrigger>
                    <SelectContent>{(Object.keys(TYPE_LABEL) as ItemType[]).map((t) => <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Pool</Label>
                  <Select value={f.pool} onValueChange={(v) => setF((x) => ({ ...x, pool: v, subject: "" }))}>
                    <SelectTrigger className="text-foreground"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="hiring">Hiring</SelectItem><SelectItem value="staff">Staff</SelectItem>
                      {SKILL_DRILL.includes(f.type) && <SelectItem value="shared">Shared</SelectItem>}
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Subject</Label>
                  <Select value={f.subject} onValueChange={(v) => set("subject", v)}>
                    <SelectTrigger className="text-foreground"><SelectValue placeholder="Choose" /></SelectTrigger>
                    <SelectContent>{poolSubjects.map((s) => <SelectItem key={s.key} value={s.key}>{s.display_name}{s.is_retired ? " (retired)" : ""}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Difficulty</Label>
                  <Select value={f.difficulty} onValueChange={(v) => set("difficulty", v)}>
                    <SelectTrigger className="text-foreground"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="easy">Easy</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="hard">Hard</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>
              {f.pool === "hiring" && <p className="-mt-2 text-xs text-muted-foreground">Hiring questions stay general — not specific to our business. Company scenarios belong in the Staff pool.</p>}

              {(f.type === "mcq" || f.type === "numeric" || f.type === "written") && (
                <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
                  <div><Label htmlFor="qe-prompt">Question</Label><Textarea id="qe-prompt" rows={3} className="text-foreground" value={f.prompt} onChange={(e) => set("prompt", e.target.value)} /></div>
                  <div><Label htmlFor="qe-marks">Marks</Label><Input id="qe-marks" inputMode="decimal" className="text-foreground" value={f.marks} onChange={(e) => set("marks", e.target.value)} /></div>
                </div>
              )}

              {f.type === "mcq" && (
                <div className="space-y-2">
                  <Label>Options — choose the one correct answer</Label>
                  <div role="radiogroup" className="space-y-2">
                    {f.options.map((o, i) => (
                      <div key={o.id} className="flex items-center gap-2">
                        <button type="button" role="radio" aria-checked={f.correct === o.id} aria-label={`Option ${o.id.toUpperCase()} is correct`}
                          onClick={() => set("correct", o.id)}
                          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-semibold ${f.correct === o.id ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}>
                          {o.id.toUpperCase()}
                        </button>
                        <Input className="text-foreground" value={o.text} onChange={(e) => set("options", f.options.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />
                        <Button type="button" variant="ghost" size="icon" aria-label="Remove option" disabled={f.options.length <= 2}
                          onClick={() => setF((x) => { const opts = x.options.filter((_, j) => j !== i); return { ...x, options: opts, correct: opts.some((y) => y.id === x.correct) ? x.correct : opts[0].id }; })}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  {f.options.length < 6 && (
                    <Button type="button" variant="outline" size="sm" onClick={() => {
                      const used = new Set(f.options.map((o) => o.id));
                      const id = "abcdef".split("").find((c) => !used.has(c)) ?? "f";
                      set("options", [...f.options, { id, text: "" }]);
                    }}><Plus className="h-4 w-4" />Add option</Button>
                  )}
                </div>
              )}

              {f.type === "numeric" && (
                <div className="grid gap-3 sm:grid-cols-3">
                  <div><Label htmlFor="qe-ans">Correct answer</Label><Input id="qe-ans" inputMode="decimal" className="text-foreground" value={f.numericAnswer} onChange={(e) => set("numericAnswer", e.target.value)} /></div>
                  <div><Label htmlFor="qe-tol">Tolerance (±)</Label><Input id="qe-tol" inputMode="decimal" className="text-foreground" value={f.tolerance} onChange={(e) => set("tolerance", e.target.value)} /></div>
                  <div><Label htmlFor="qe-unit">Unit (optional)</Label><Input id="qe-unit" className="text-foreground" value={f.unit} onChange={(e) => set("unit", e.target.value)} placeholder="e.g. ₹" /></div>
                </div>
              )}

              {(f.type === "mcq" || f.type === "numeric") && (
                <div><Label htmlFor="qe-exp">Explanation (optional, staff only)</Label><Textarea id="qe-exp" rows={2} className="text-foreground" value={f.explanation} onChange={(e) => set("explanation", e.target.value)} /></div>
              )}

              {f.type === "written" && (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div><Label htmlFor="qe-min">Minimum words</Label><Input id="qe-min" inputMode="numeric" className="text-foreground" value={f.minWords} onChange={(e) => set("minWords", e.target.value)} placeholder="Optional" /></div>
                    <div><Label htmlFor="qe-max">Maximum words</Label><Input id="qe-max" inputMode="numeric" className="text-foreground" value={f.maxWords} onChange={(e) => set("maxWords", e.target.value)} placeholder="Optional" /></div>
                  </div>
                  <div className="space-y-3 rounded-md border border-border p-3">
                    <p className="text-sm font-semibold">Marking guide</p>
                    <ListInput label="Points a good answer covers" values={f.covers} onChange={(v) => set("covers", v)} placeholder="e.g. Checks the bank statement before acting" />
                    <ListInput label="Things that must not appear" values={f.mustNot} onChange={(v) => set("mustNot", v)} placeholder="e.g. Promises a refund without checking" />
                    <div className="max-w-[160px]"><Label htmlFor="qe-mm">Maximum marks (up to 20)</Label><Input id="qe-mm" inputMode="numeric" className="text-foreground" value={f.maxMarks} onChange={(e) => set("maxMarks", e.target.value)} /></div>
                  </div>
                </>
              )}

              {f.type === "typing_passage" && (
                <>
                  <div className="max-w-[220px]"><Label>Level</Label>
                    <Select value={f.level} onValueChange={(v) => set("level", v)}>
                      <SelectTrigger className="text-foreground"><SelectValue /></SelectTrigger>
                      <SelectContent><SelectItem value="beginner">Beginner</SelectItem><SelectItem value="intermediate">Intermediate</SelectItem><SelectItem value="advanced">Advanced</SelectItem></SelectContent>
                    </Select>
                  </div>
                  <div><Label htmlFor="qe-pass">Passage</Label><Textarea id="qe-pass" rows={8} className="text-foreground" value={f.passage} onChange={(e) => set("passage", e.target.value)} />
                    <p className={`mt-1 text-xs ${words < 40 ? "text-destructive" : "text-muted-foreground"}`}>{words} words · at least 40 · plain keyboard characters only</p></div>
                </>
              )}

              {f.type === "data_entry_record" && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {DE_FIELDS.map((d) => (
                    <div key={d.key} className={d.key === "name" ? "sm:col-span-2" : ""}>
                      <Label htmlFor={`qe-${d.key}`}>{d.label}{d.hint ? <span className="text-muted-foreground"> · {d.hint}</span> : null}</Label>
                      <Input id={`qe-${d.key}`} className="font-mono text-foreground" value={f.record[d.key] ?? ""} onChange={(e) => set("record", { ...f.record, [d.key]: e.target.value })} />
                    </div>
                  ))}
                </div>
              )}

              {f.type === "match_pair" && (
                <>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div><Label htmlFor="qe-l">Record A</Label><Textarea id="qe-l" rows={3} className="font-mono text-foreground" value={f.left} onChange={(e) => set("left", e.target.value)} /></div>
                    <div><Label htmlFor="qe-r">Record B</Label><Textarea id="qe-r" rows={3} className="font-mono text-foreground" value={f.right} onChange={(e) => set("right", e.target.value)} /></div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Label className="mr-2">Do they match?</Label>
                    <Button type="button" size="sm" variant={f.isMatch === "yes" ? "default" : "outline"} onClick={() => set("isMatch", "yes")}>Yes, identical</Button>
                    <Button type="button" size="sm" variant={f.isMatch === "no" ? "default" : "outline"} onClick={() => set("isMatch", "no")}>No</Button>
                  </div>
                  {f.isMatch === "no" && <div><Label htmlFor="qe-diff">What differs (staff only)</Label><Input id="qe-diff" className="text-foreground" value={f.differs} onChange={(e) => set("differs", e.target.value)} placeholder="e.g. IFSC digit 7 vs 1" /></div>}
                </>
              )}

              {roleCodes.length > 0 && (
                <div><Label>Applies to tests</Label>
                  <div className="mt-1 flex flex-wrap gap-3 rounded-md border border-border p-3 text-sm">
                    <span className="text-xs text-muted-foreground">{f.roleCodes.length ? "" : "All tests (none selected)"}</span>
                    {roleCodes.map((r) => (
                      <label key={r.code} className="flex items-center gap-2"><Checkbox checked={f.roleCodes.includes(r.code)}
                        onCheckedChange={(v) => set("roleCodes", v ? [...f.roleCodes, r.code] : f.roleCodes.filter((x) => x !== r.code))} />{r.name}</label>
                    ))}
                  </div>
                </div>
              )}

              {!question && (
                <div className="max-w-[220px]"><Label>Save as</Label>
                  <Select value={f.status} onValueChange={(v) => set("status", v)}>
                    <SelectTrigger className="text-foreground"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="draft">Draft</SelectItem><SelectItem value="needs_review">Needs review</SelectItem><SelectItem value="approved">Approved (served)</SelectItem></SelectContent>
                  </Select>
                </div>
              )}
              {question && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Badge variant="muted">{pretty(question.status)}</Badge>Use Approve / Retire in the bank to change status.</div>}
              {question && <History questionId={question.question_id} />}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button disabled={!f.subject} loading={save.isPending} onClick={() => save.mutate()}>{question ? "Save" : "Add item"}</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
