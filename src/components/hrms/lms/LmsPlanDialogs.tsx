import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ResponsiveDialog } from "@/components/horilla/primitives/ResponsiveDialog";
import { useLmsModule } from "@/hooks/lms/useLmsData";
import {
  addPlanItem, certifyKras, closePlan, extendPlan, logLiveDay, moveItem, recordTest, shiftPlanDays, shiftProblem, signoffItem, updatePlan,
} from "@/lib/lms/actions";
import { ITEM_TYPE_LABEL, LANGUAGE_LABEL } from "@/lib/lms/constants";
import { decidingTests, firstFinalTestDay } from "@/lib/lms/planBuilder";
import { fmtDate, todayIso } from "@/lib/lms/format";
import type {
  LmsEmployee, LmsItemType, LmsLanguage, LmsModule, LmsPlan, LmsPlanItem, LmsPlanOutcome, LmsSettings, LmsTestKind,
} from "@/lib/lms/types";
import { errorText } from "./LmsShared";
import { EmployeeSelect, ModuleSelect } from "./LmsPickers";

function useBusy() {
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>, failMsg: string) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast.error(`${failMsg}: ${errorText(e)}`);
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
}

function Footer({ busy, onCancel, onSave, saveLabel = "Save", disabled, destructive }: {
  busy: boolean; onCancel: () => void; onSave: () => void; saveLabel?: string; disabled?: boolean; destructive?: boolean;
}) {
  return (
    <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <Button variant="outline" onClick={onCancel} disabled={busy}>Cancel</Button>
      <Button onClick={onSave} disabled={busy || disabled} variant={destructive ? "destructive" : "default"}>
        {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
        {saveLabel}
      </Button>
    </div>
  );
}

/* ───────────── test result (with the fail → extend → exit path) ───────────── */

export function TestResultDialog({
  open, onOpenChange, item, plan, items, settings, onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  item: LmsPlanItem | null;
  plan: LmsPlan;
  items: LmsPlanItem[];
  settings: LmsSettings | null | undefined;
  onSaved: () => void;
}) {
  const [score, setScore] = useState("");
  const [criticalOk, setCriticalOk] = useState(true);
  const [ref, setRef] = useState("");
  const [remarks, setRemarks] = useState("");
  const [stage, setStage] = useState<"form" | "failed">("form");
  const [extDays, setExtDays] = useState(5);
  const [exitNote, setExitNote] = useState("");
  const { busy, run } = useBusy();
  const passMark = settings?.pass_mark ?? 80;
  const maxAttempts = settings?.max_attempts ?? 2;

  useEffect(() => {
    if (open && item) {
      setScore(item.score_pct !== null && item.score_pct !== undefined ? String(item.score_pct) : "");
      setCriticalOk(item.critical_ok !== false);
      setRef(item.quiz_reference ?? "");
      setRemarks(item.remarks ?? "");
      setStage("form");
      setExtDays(settings?.extension_days || 5);
      setExitNote("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item?.id]);

  if (!item) return null;
  const num = Number(score);
  const valid = score.trim() !== "" && !Number.isNaN(num) && num >= 0 && num <= 100;
  const willPass = valid && num >= passMark && criticalOk;
  // The final test and later retests decide, in day order; only the last of them decides what happens
  // next (an earlier one is just being corrected). A test before the final test is like a mid test.
  const deciding = decidingTests(items);
  const pos = deciding.findIndex((t) => t.id === item.id);
  const isDeciding = pos >= 0;
  const isLatest = pos === deciding.length - 1;
  const attempt = isDeciding ? pos + 1 : item.test_attempt ?? 1;
  const extProblem = shiftProblem(plan, "extend", Math.round(extDays));

  const save = () =>
    run(async () => {
      const passed = await recordTest(item, { score_pct: num, critical_ok: criticalOk, quiz_reference: ref, remarks }, passMark);
      onSaved();
      if (passed) {
        toast.success(`Passed with ${num}%`);
        onOpenChange(false);
      } else if (!isDeciding) {
        toast.warning(`Below the pass mark (${num}%). Plan extra revision before the final test.`);
        onOpenChange(false);
      } else if (!isLatest) {
        toast.message("Result saved. A later retest is already on the plan, so nothing else changes.");
        onOpenChange(false);
      } else {
        setStage("failed");
      }
    }, "Couldn't save the result");

  const extend = () =>
    run(async () => {
      await extendPlan(plan, Math.round(extDays), true);
      toast.success(`Training extended by ${Math.round(extDays)} days, with a retest at the end`);
      onSaved();
      onOpenChange(false);
    }, "Couldn't extend the plan");

  const exit = () =>
    run(async () => {
      await closePlan(plan, "exit_recommended", exitNote || `Did not clear ${item.title} (attempt ${attempt} of ${maxAttempts}).`);
      toast.success("Plan closed: exit recommended");
      onSaved();
      onOpenChange(false);
    }, "Couldn't close the plan");

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(o) => !busy && onOpenChange(o)}
      title={stage === "form" ? `Test result — ${item.title}` : "Test not cleared"}
      description={stage === "form" ? `Pass mark ${passMark}%. A missed critical question fails the test whatever the score. Attempt ${attempt}.` : "Choose what happens next."}
      footer={
        stage === "form" ? (
          <Footer busy={busy} onCancel={() => onOpenChange(false)} onSave={save} disabled={!valid} saveLabel="Save result" />
        ) : (
          <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Decide later</Button>
            {attempt < maxAttempts ? (
              <Button onClick={extend} disabled={busy || !!extProblem}>
                {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null} Extend and add retest
              </Button>
            ) : (
              <Button variant="destructive" onClick={exit} disabled={busy}>
                {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null} Close plan: recommend exit
              </Button>
            )}
          </div>
        )
      }
    >
      {stage === "form" ? (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="lms-score">Score (%)</Label>
              <Input id="lms-score" type="number" min={0} max={100} step="0.5" value={score} onChange={(e) => setScore(e.target.value)} autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lms-qref">Quiz reference (optional)</Label>
              <Input id="lms-qref" value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Quiz attempt ID or link" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={criticalOk} onCheckedChange={(v) => setCriticalOk(v === true)} /> Every critical question answered correctly
          </label>
          <div className="space-y-1.5">
            <Label htmlFor="lms-tremarks">Remarks</Label>
            <Textarea id="lms-tremarks" rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </div>
          {valid ? (
            <p className={`flex items-center gap-1.5 text-sm ${willPass ? "text-success" : "text-destructive"}`}>
              {willPass ? <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden /> : <XCircle className="h-4 w-4 shrink-0" aria-hidden />}
              {willPass ? "This is a pass." : !criticalOk ? "Not a pass: a critical question was missed." : `Not a pass: below ${passMark}%.`}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3 text-sm">
          <p className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
            {attempt < maxAttempts
              ? `This was attempt ${attempt} of ${maxAttempts}. The rule is longer training, then one more test.`
              : `This was attempt ${attempt} of ${maxAttempts}. The rule is that a second fail leads to exit.`}
          </p>
          {attempt < maxAttempts ? (
            <div className="space-y-1.5">
              <Label htmlFor="lms-ext">Extra training days</Label>
              <Input id="lms-ext" type="number" min={1} max={60} value={extDays} onChange={(e) => setExtDays(Number(e.target.value))} />
              {extProblem ? <p className="text-xs text-destructive">{extProblem}</p> : null}
              <p className="text-xs text-muted-foreground">The days are added after the module days with revision, and the retest goes on the last one. Live days move back.</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="lms-exitnote">Note for HR</Label>
              <Textarea id="lms-exitnote" rows={2} value={exitNote} onChange={(e) => setExitNote(e.target.value)} placeholder="Why the plan is closed" />
              <p className="text-xs text-muted-foreground">The plan closes as "exit recommended". HR takes the decision and any separation steps in HRMS as usual.</p>
            </div>
          )}
        </div>
      )}
    </ResponsiveDialog>
  );
}

/* ───────────── practical sign-off ───────────── */

export function SignoffDialog({
  open, onOpenChange, item, employees, defaultSignerId, onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  item: LmsPlanItem | null;
  employees: LmsEmployee[] | undefined;
  defaultSignerId: string | null;
  onSaved: () => void;
}) {
  const moduleQ = useLmsModule(open ? item?.module_id : null);
  const checklist = moduleQ.data?.checklist ?? [];
  const [marks, setMarks] = useState<Record<string, "pass" | "fail">>({});
  const [result, setResult] = useState<"passed" | "failed">("passed");
  const [resultTouched, setResultTouched] = useState(false);
  const [by, setBy] = useState<string | null>(null);
  const [demo, setDemo] = useState(true);
  const [remarks, setRemarks] = useState("");
  const { busy, run } = useBusy();

  useEffect(() => {
    if (open && item) {
      setMarks(item.checklist ?? {});
      setResult(item.signoff_result ?? "passed");
      setResultTouched(Boolean(item.signoff_result));
      setBy(item.signoff_by_employee_id ?? defaultSignerId);
      setDemo(item.demo_done || !item.signoff_result);
      setRemarks(item.remarks ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item?.id]);

  const criticalFail = checklist.some((c) => c.is_critical && marks[c.id] === "fail");
  const criticalUnmarked = checklist.filter((c) => c.is_critical && !marks[c.id]).length;
  const unmarked = checklist.filter((c) => !marks[c.id]).length;
  // A pass needs every critical step marked "done right".
  const passBlocked = result === "passed" && (criticalFail || criticalUnmarked > 0);
  useEffect(() => {
    if (!resultTouched && checklist.length) setResult(criticalFail ? "failed" : "passed");
  }, [criticalFail, resultTouched, checklist.length]);

  if (!item) return null;
  const save = () =>
    run(async () => {
      await signoffItem(item, { result, checklist: marks, by_employee_id: by, demo_done: demo, remarks });
      toast.success(result === "passed" ? "Practical signed off" : "Practical recorded as not passed");
      onSaved();
      onOpenChange(false);
    }, "Couldn't save the sign-off");

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(o) => !busy && onOpenChange(o)}
      title={`Practical sign-off — ${item.title}`}
      description="Tick each step the trainee did correctly on the live screen or a mock case. Critical steps must pass."
      contentClassName="max-w-2xl"
      footer={<Footer busy={busy} onCancel={() => onOpenChange(false)} onSave={save} disabled={passBlocked || moduleQ.isLoading} saveLabel="Save sign-off" />}
    >
      <div className="space-y-4">
        {moduleQ.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading the checklist…</p>
        ) : checklist.length === 0 ? (
          <p className="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">This module has no practical checklist yet. Add one in the module library; you can still record the result here.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {checklist.map((c) => (
              <li key={c.id} className="flex flex-col gap-2 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-sm">
                  {c.item}
                  {c.is_critical ? <Badge variant="destructive-soft" className="ml-2 text-[10px]">Critical</Badge> : null}
                </span>
                <div className="flex shrink-0 gap-1">
                  {(["pass", "fail"] as const).map((v) => (
                    <Button
                      key={v}
                      type="button"
                      size="sm"
                      variant={marks[c.id] === v ? (v === "pass" ? "default" : "destructive") : "outline"}
                      onClick={() => setMarks((m) => ({ ...m, [c.id]: v }))}
                    >
                      {v === "pass" ? "Done right" : "Not yet"}
                    </Button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
        {unmarked > 0 && checklist.length > 0 ? <p className="text-xs text-muted-foreground">{unmarked} step{unmarked === 1 ? "" : "s"} not marked.</p> : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Result</Label>
            <Select value={result} onValueChange={(v) => { setResult(v as "passed" | "failed"); setResultTouched(true); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="passed">Passed</SelectItem>
                <SelectItem value="failed">Not passed — repeat practice</SelectItem>
              </SelectContent>
            </Select>
            {criticalFail && result === "passed" ? <p className="text-xs text-destructive">A critical step is marked "not yet", so this can't be a pass.</p> : null}
            {!criticalFail && criticalUnmarked > 0 && result === "passed" ? <p className="text-xs text-warning">Mark the {criticalUnmarked} critical step{criticalUnmarked === 1 ? "" : "s"} before passing.</p> : null}
          </div>
          <div className="space-y-1.5">
            <Label>Signed off by</Label>
            <EmployeeSelect employees={employees} value={by} onChange={setBy} placeholder="Trainer or department senior" allowClear />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={demo} onCheckedChange={(v) => setDemo(v === true)} /> Live demonstration given
        </label>
        <div className="space-y-1.5">
          <Label htmlFor="lms-sremarks">Remarks</Label>
          <Textarea id="lms-sremarks" rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
        </div>
      </div>
    </ResponsiveDialog>
  );
}

/* ───────────── supervised live day ───────────── */

export function LiveDayDialog({ open, onOpenChange, item, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; item: LmsPlanItem | null; onSaved: () => void;
}) {
  const [orders, setOrders] = useState("");
  const [errors, setErrors] = useState("");
  const [critical, setCritical] = useState(false);
  const [remarks, setRemarks] = useState("");
  const { busy, run } = useBusy();
  useEffect(() => {
    if (open && item) {
      setOrders(item.live_orders !== null && item.live_orders !== undefined ? String(item.live_orders) : "");
      setErrors(item.live_errors !== null && item.live_errors !== undefined ? String(item.live_errors) : "");
      setCritical(Boolean(item.live_critical_error));
      setRemarks(item.remarks ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item?.id]);
  if (!item) return null;
  const toInt = (s: string) => (s.trim() === "" ? null : Math.max(0, Math.round(Number(s))));
  const bad = [orders, errors].some((s) => s.trim() !== "" && Number.isNaN(Number(s)));
  const save = () =>
    run(async () => {
      await logLiveDay(item, { live_orders: toInt(orders), live_errors: toInt(errors), live_critical_error: critical, remarks });
      toast.success("Live day logged");
      onSaved();
      onOpenChange(false);
    }, "Couldn't log the day");
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(o) => !busy && onOpenChange(o)}
      title={`Log live day — day ${item.day_no}`}
      description="Orders handled under supervision and any mistakes the senior caught."
      footer={<Footer busy={busy} onCancel={() => onOpenChange(false)} onSave={save} disabled={bad} saveLabel="Save day" />}
    >
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="lms-orders">Orders handled</Label>
            <Input id="lms-orders" type="number" min={0} value={orders} onChange={(e) => setOrders(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lms-errors">Mistakes caught</Label>
            <Input id="lms-errors" type="number" min={0} value={errors} onChange={(e) => setErrors(e.target.value)} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={critical} onCheckedChange={(v) => setCritical(v === true)} /> A critical mistake happened (money, KYC or compliance risk)
        </label>
        <div className="space-y-1.5">
          <Label htmlFor="lms-lremarks">Remarks</Label>
          <Textarea id="lms-lremarks" rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
        </div>
      </div>
    </ResponsiveDialog>
  );
}

/* ───────────── add / move items ───────────── */

export function AddItemDialog({ open, onOpenChange, plan, items, modules, defaultDay, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; plan: LmsPlan; items: LmsPlanItem[]; modules: LmsModule[] | undefined;
  defaultDay: number; onSaved: () => void;
}) {
  const [day, setDay] = useState(defaultDay);
  const [type, setType] = useState<LmsItemType>("module");
  const [module, setModule] = useState<LmsModule | null>(null);
  const [title, setTitle] = useState("");
  const [testKind, setTestKind] = useState<LmsTestKind>("retest");
  const [kindTouched, setKindTouched] = useState(false);
  const finalDay = firstFinalTestDay(items);
  const { busy, run } = useBusy();
  useEffect(() => {
    if (open) {
      setDay(defaultDay);
      setType("module");
      setModule(null);
      setTitle("");
      setTestKind(finalDay !== null && defaultDay < finalDay ? "mid" : "retest");
      setKindTouched(false);
    }
  }, [open, defaultDay]);
  // Before the final test an added test is a mid-way test by default; on or after it, a retest.
  useEffect(() => {
    if (!kindTouched) setTestKind(finalDay !== null && day < finalDay ? "mid" : "retest");
  }, [day, finalDay, kindTouched]);
  const attempts = decidingTests(items).length;
  const finalTitle = type === "module" ? module?.title ?? "" : title.trim() || (type === "test" ? (testKind === "retest" ? "Retest" : testKind === "final" ? "Final test" : "Test") : ITEM_TYPE_LABEL[type]);
  const save = () =>
    run(async () => {
      await addPlanItem(plan, items.filter((i) => i.day_no === day), {
        day_no: day,
        item_type: type,
        module_id: type === "module" ? module?.id ?? null : null,
        module_version: type === "module" ? module?.version ?? null : null,
        title: finalTitle,
        test_kind: type === "test" ? testKind : null,
        test_attempt: type === "test" ? (testKind === "retest" ? attempts + 1 : 1) : null,
      });
      toast.success("Item added");
      onSaved();
      onOpenChange(false);
    }, "Couldn't add the item");
  const invalid = !(day >= 1 && day <= 240) || (type === "module" && !module) || (type !== "module" && !finalTitle);
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(o) => !busy && onOpenChange(o)}
      title="Add to the plan"
      description="A module from the library, a practice or live day, a test or a note."
      footer={<Footer busy={busy} onCancel={() => onOpenChange(false)} onSave={save} disabled={invalid} saveLabel="Add" />}
    >
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="lms-addday">Day</Label>
            <Input id="lms-addday" type="number" min={1} max={240} value={day} onChange={(e) => setDay(Number(e.target.value))} />
          </div>
          <div className="space-y-1.5">
            <Label>What</Label>
            <Select value={type} onValueChange={(v) => setType(v as LmsItemType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(["module", "practice", "test", "live", "note"] as LmsItemType[]).map((t) => <SelectItem key={t} value={t}>{ITEM_TYPE_LABEL[t]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        {type === "module" ? (
          <div className="space-y-1.5">
            <Label>Module</Label>
            <ModuleSelect modules={modules} value={module?.id ?? null} onChange={setModule} />
          </div>
        ) : (
          <>
            {type === "test" ? (
              <div className="space-y-1.5">
                <Label>Kind of test</Label>
                <Select value={testKind} onValueChange={(v) => { setTestKind(v as LmsTestKind); setKindTouched(true); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mid">Mid-way test</SelectItem>
                    <SelectItem value="final">Final test</SelectItem>
                    <SelectItem value="retest">Retest (attempt {attempts + 1})</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="lms-addtitle">{type === "note" ? "Note" : "Title"}</Label>
              <Input id="lms-addtitle" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={finalTitle || ITEM_TYPE_LABEL[type]} />
            </div>
          </>
        )}
        {day > plan.total_days ? <p className="text-xs text-muted-foreground">The plan grows to {day} days.</p> : null}
      </div>
    </ResponsiveDialog>
  );
}

export function MoveItemDialog({ open, onOpenChange, item, plan, items, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; item: LmsPlanItem | null; plan: LmsPlan; items: LmsPlanItem[]; onSaved: () => void;
}) {
  const [day, setDay] = useState(1);
  const { busy, run } = useBusy();
  useEffect(() => {
    if (open && item) setDay(item.day_no);
  }, [open, item]);
  if (!item) return null;
  const save = () =>
    run(async () => {
      await moveItem(item, plan, day, items.filter((i) => i.day_no === day && i.id !== item.id));
      toast.success(`Moved to day ${day}`);
      onSaved();
      onOpenChange(false);
    }, "Couldn't move the item");
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(o) => !busy && onOpenChange(o)}
      title={`Move "${item.title}"`}
      description={`Now on day ${item.day_no}.`}
      footer={<Footer busy={busy} onCancel={() => onOpenChange(false)} onSave={save} disabled={!(day >= 1 && day <= 240) || day === item.day_no} saveLabel="Move" />}
    >
      <div className="space-y-1.5">
        <Label htmlFor="lms-moveday">To day</Label>
        <Input id="lms-moveday" type="number" min={1} max={240} value={day} onChange={(e) => setDay(Number(e.target.value))} />
        {day > plan.total_days ? <p className="text-xs text-muted-foreground">The plan grows to {day} days.</p> : null}
      </div>
    </ResponsiveDialog>
  );
}

/* ───────────── plan details, extension, shifting, closing ───────────── */

export function PlanEditDialog({ open, onOpenChange, plan, employees, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; plan: LmsPlan; employees: LmsEmployee[] | undefined; onSaved: () => void;
}) {
  const [title, setTitle] = useState(plan.title);
  const [start, setStart] = useState(plan.start_date);
  const [language, setLanguage] = useState<LmsLanguage>(plan.language);
  const [trainer, setTrainer] = useState<string | null>(plan.trainer_employee_id);
  const [supervisor, setSupervisor] = useState<string | null>(plan.supervisor_employee_id);
  const [notes, setNotes] = useState(plan.notes ?? "");
  const { busy, run } = useBusy();
  useEffect(() => {
    if (open) {
      setTitle(plan.title);
      setStart(plan.start_date);
      setLanguage(plan.language);
      setTrainer(plan.trainer_employee_id);
      setSupervisor(plan.supervisor_employee_id);
      setNotes(plan.notes ?? "");
    }
  }, [open, plan]);
  const save = () =>
    run(async () => {
      await updatePlan(plan.id, {
        title: title.trim() || plan.title, start_date: start, language, trainer_employee_id: trainer,
        supervisor_employee_id: supervisor, notes: notes.trim() || null,
      });
      toast.success("Plan updated");
      onSaved();
      onOpenChange(false);
    }, "Couldn't update the plan");
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(o) => !busy && onOpenChange(o)}
      title="Edit plan details"
      description="Changing the start date moves every day's date; the days themselves stay as they are."
      footer={<Footer busy={busy} onCancel={() => onOpenChange(false)} onSave={save} disabled={!start} />}
    >
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="lms-etitle">Title</Label>
          <Input id="lms-etitle" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="lms-estart">Start date</Label>
            <Input id="lms-estart" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Language</Label>
            <Select value={language} onValueChange={(v) => setLanguage(v as LmsLanguage)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="en">{LANGUAGE_LABEL.en}</SelectItem>
                <SelectItem value="hinglish">{LANGUAGE_LABEL.hinglish}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Trainer</Label>
            <EmployeeSelect employees={employees} value={trainer} onChange={setTrainer} allowClear />
          </div>
          <div className="space-y-1.5">
            <Label>Department senior</Label>
            <EmployeeSelect employees={employees} value={supervisor} onChange={setSupervisor} allowClear />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lms-enotes">Notes</Label>
          <Textarea id="lms-enotes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
    </ResponsiveDialog>
  );
}

export function ExtendDialog({ open, onOpenChange, plan, settings, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; plan: LmsPlan; settings: LmsSettings | null | undefined; onSaved: () => void;
}) {
  const [days, setDays] = useState(5);
  const [retest, setRetest] = useState(true);
  const { busy, run } = useBusy();
  useEffect(() => {
    if (open) {
      setDays(settings?.extension_days || 5);
      setRetest(true);
    }
  }, [open, settings?.extension_days]);
  const problem = shiftProblem(plan, "extend", Math.round(days));
  const save = () =>
    run(async () => {
      await extendPlan(plan, Math.round(days), retest);
      toast.success(`Training extended by ${Math.round(days)} days`);
      onSaved();
      onOpenChange(false);
    }, "Couldn't extend the plan");
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(o) => !busy && onOpenChange(o)}
      title="Extend the training"
      description={`New days go right after day ${plan.module_days} (the last module day). Live days move back by the same number.`}
      footer={<Footer busy={busy} onCancel={() => onOpenChange(false)} onSave={save} disabled={!!problem} saveLabel="Extend" />}
    >
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="lms-extdays">Extra days</Label>
          <Input id="lms-extdays" type="number" min={1} max={60} value={days} onChange={(e) => setDays(Number(e.target.value))} />
          {problem ? <p className="text-xs text-destructive">{problem}</p> : null}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={retest} onCheckedChange={(v) => setRetest(v === true)} /> Put a retest on the last extra day
        </label>
      </div>
    </ResponsiveDialog>
  );
}

export function ShiftDialog({ open, onOpenChange, plan, defaultFrom, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; plan: LmsPlan; defaultFrom: number; onSaved: () => void;
}) {
  const [from, setFrom] = useState(defaultFrom);
  const [by, setBy] = useState(1);
  const { busy, run } = useBusy();
  useEffect(() => {
    if (open) {
      setFrom(defaultFrom);
      setBy(1);
    }
  }, [open, defaultFrom]);
  const problem = shiftProblem(plan, "shift", Math.round(by), Math.round(from));
  const save = () =>
    run(async () => {
      await shiftPlanDays(plan, Math.round(from), Math.round(by));
      toast.success(`Schedule from day ${from} pushed back by ${by} day${by === 1 ? "" : "s"}`);
      onSaved();
      onOpenChange(false);
    }, "Couldn't move the schedule");
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(o) => !busy && onOpenChange(o)}
      title="Push the schedule back"
      description="For an absence, a holiday or a weekly off: everything from the chosen day moves later and the plan grows by the same number of days."
      footer={<Footer busy={busy} onCancel={() => onOpenChange(false)} onSave={save} disabled={!!problem} saveLabel="Push back" />}
    >
      <div className="space-y-2">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="lms-shfrom">From day</Label>
            <Input id="lms-shfrom" type="number" min={1} max={plan.total_days} value={from} onChange={(e) => setFrom(Number(e.target.value))} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lms-shby">By days</Label>
            <Input id="lms-shby" type="number" min={1} max={60} value={by} onChange={(e) => setBy(Number(e.target.value))} />
          </div>
        </div>
        {problem ? <p className="text-xs text-destructive">{problem}</p> : null}
      </div>
    </ResponsiveDialog>
  );
}

const OUTCOME_LABEL: Record<LmsPlanOutcome, string> = {
  certified: "Certified — cleared everything",
  partially_certified: "Partly certified — some KRAs cleared",
  exit_recommended: "Not cleared — recommend exit",
  withdrawn: "Withdrawn — left or stopped",
};

/**
 * Closing a plan. Only KRAs that meet the readiness rule are offered for
 * certification by default; certifying the others is a separate, explicit tick.
 * Anything still in training afterwards is marked not cleared.
 */
export function ClosePlanDialog({ open, onOpenChange, plan, readyCodes, notReadyCodes, certifiedCount, onCertify, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; plan: LmsPlan; readyCodes: string[]; notReadyCodes: string[]; certifiedCount: number;
  onCertify: (codes: string[]) => Promise<void>; onSaved: () => void;
}) {
  const suggested: LmsPlanOutcome | "" =
    notReadyCodes.length === 0 && readyCodes.length + certifiedCount > 0 ? "certified" :
    readyCodes.length + certifiedCount > 0 ? "partially_certified" : "";
  const [outcome, setOutcome] = useState<LmsPlanOutcome | "">(suggested);
  const [certifyReady, setCertifyReady] = useState(true);
  const [certifyOthers, setCertifyOthers] = useState(false);
  const [note, setNote] = useState("");
  const { busy, run } = useBusy();
  useEffect(() => {
    if (open) {
      setOutcome(suggested);
      setCertifyReady(true);
      setCertifyOthers(false);
      setNote("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const certifying = outcome === "certified" || outcome === "partially_certified";
  const toCertify = certifying ? [...(certifyReady ? readyCodes : []), ...(certifyOthers ? notReadyCodes : [])] : [];
  const leftOver = readyCodes.length + notReadyCodes.length - toCertify.length;
  const save = () =>
    run(async () => {
      if (!outcome) return;
      if (toCertify.length) await onCertify(toCertify);
      await closePlan(plan, outcome, note || null);
      toast.success("Plan closed");
      onSaved();
      onOpenChange(false);
    }, "Couldn't close the plan");
  const list = (codes: string[]) => `${codes.slice(0, 6).join(", ")}${codes.length > 6 ? "…" : ""}`;
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(o) => !busy && onOpenChange(o)}
      title="Close the plan"
      description="Records how the training ended. It can be reopened later."
      footer={<Footer busy={busy} onCancel={() => onOpenChange(false)} onSave={save} disabled={!outcome} saveLabel="Close plan" destructive={outcome === "exit_recommended"} />}
    >
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Label>Outcome</Label>
          <Select value={outcome || undefined} onValueChange={(v) => setOutcome(v as LmsPlanOutcome)}>
            <SelectTrigger><SelectValue placeholder="Choose how the training ended" /></SelectTrigger>
            <SelectContent>
              {(Object.keys(OUTCOME_LABEL) as LmsPlanOutcome[]).map((o) => <SelectItem key={o} value={o}>{OUTCOME_LABEL[o]}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        {certifying && readyCodes.length ? (
          <label className="flex items-start gap-2 text-sm">
            <Checkbox className="mt-0.5" checked={certifyReady} onCheckedChange={(v) => setCertifyReady(v === true)} />
            <span>Certify the {readyCodes.length} KRA{readyCodes.length === 1 ? " that is" : "s that are"} ready ({list(readyCodes)})</span>
          </label>
        ) : null}
        {certifying && notReadyCodes.length ? (
          <label className="flex items-start gap-2 text-sm">
            <Checkbox className="mt-0.5" checked={certifyOthers} onCheckedChange={(v) => setCertifyOthers(v === true)} />
            <span>
              Also certify the {notReadyCodes.length} KRA{notReadyCodes.length === 1 ? " that is" : "s that are"} not ready ({list(notReadyCodes)})
              <span className="block text-xs text-muted-foreground">Only if the trainer is sure: their module, practical or final test isn't complete.</span>
            </span>
          </label>
        ) : null}
        {leftOver > 0 ? (
          <p className="text-xs text-muted-foreground">{leftOver} KRA{leftOver === 1 ? "" : "s"} still in training will be marked not cleared.</p>
        ) : null}
        {outcome === "certified" && leftOver > 0 ? (
          <p className="text-xs text-warning">Some KRAs won't be certified, so "Partly certified" may describe this better.</p>
        ) : null}
        <div className="space-y-1.5">
          <Label htmlFor="lms-cnote">Closing note</Label>
          <Textarea id="lms-cnote" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        {outcome === "exit_recommended" ? (
          <p className="text-xs text-muted-foreground">This only records the training result. Any separation is handled by HR in HRMS as usual.</p>
        ) : null}
      </div>
    </ResponsiveDialog>
  );
}

export function CertifyDialog({ open, onOpenChange, plan, codes, names, versionsByKra, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; plan: LmsPlan; codes: string[]; names: Map<string, string>;
  versionsByKra: Record<string, Record<string, string>>; onSaved: () => void;
}) {
  const [date, setDate] = useState(todayIso());
  const [remarks, setRemarks] = useState("");
  const { busy, run } = useBusy();
  useEffect(() => {
    if (open) {
      setDate(todayIso());
      setRemarks("");
    }
  }, [open]);
  const list = useMemo(() => codes.map((c) => ({ code: c, name: names.get(c) ?? "" })), [codes, names]);
  const save = () =>
    run(async () => {
      const at = new Date(`${date}T12:00:00`).toISOString();
      await certifyKras(plan, codes, { certifiedAt: at, remarks, versionsByKra });
      toast.success(`${codes.length} KRA${codes.length === 1 ? "" : "s"} certified`);
      onSaved();
      onOpenChange(false);
    }, "Couldn't certify");
  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={(o) => !busy && onOpenChange(o)}
      title={codes.length === 1 ? "Certify this KRA" : `Certify ${codes.length} KRAs`}
      description="The certificate records the module versions taught, so a later module change can call for a refresher."
      footer={<Footer busy={busy} onCancel={() => onOpenChange(false)} onSave={save} disabled={!date || !codes.length} saveLabel="Certify" />}
    >
      <div className="space-y-3">
        <ul className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-border p-2 text-sm">
          {list.map((k) => (
            <li key={k.code}><span className="t-mono mr-1.5 text-xs text-muted-foreground">{k.code}</span>{k.name}</li>
          ))}
        </ul>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="lms-cdate">Certified on</Label>
            <Input id="lms-cdate" type="date" value={date} onChange={(e) => setDate(e.target.value)} max={todayIso()} />
            <p className="text-xs text-muted-foreground">{fmtDate(date)}</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lms-cremarks">Remarks</Label>
            <Textarea id="lms-cremarks" rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
          </div>
        </div>
      </div>
    </ResponsiveDialog>
  );
}
