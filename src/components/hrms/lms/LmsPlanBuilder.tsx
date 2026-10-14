import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, CalendarDays, Info, ListPlus, Loader2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  indexBy, useLmsAccess, useLmsCertifications, useLmsChecklistIndex, useLmsEmployees, useLmsInvalidate, useLmsKras, useLmsModuleKras, useLmsModules,
  useLmsPlanItemsIndex, useLmsPlans, useLmsSeats, useLmsSettings,
} from "@/hooks/lms/useLmsData";
import { useLmsNav } from "@/hooks/lms/useLmsNav";
import { createPlan } from "@/lib/lms/actions";
import { DAY_MINUTES_WARN, ITEM_TYPE_LABEL, LANGUAGE_LABEL, PLAN_TYPE_LABEL } from "@/lib/lms/constants";
import { fmtDate, minutesLabel, parseDate, planDayDate, todayIso } from "@/lib/lms/format";
import { buildPlanItems, minutesByDay, resolvePlanModules, suggestModuleDays, type DraftItem } from "@/lib/lms/planBuilder";
import { completedModuleIds as completedIds } from "@/lib/lms/versions";
import type { LmsLanguage, LmsPlanType } from "@/lib/lms/types";
import { ErrorBlock, ItemTypeIcon, LoadingBlock, ReadOnlyNote, errorText } from "./LmsShared";
import { EmployeeSelect, KraPickerDialog, employeeLabel } from "./LmsPickers";

const INCLUDE_DEFAULTS: Record<LmsPlanType, { company: boolean; department: boolean; subdepartment: boolean; platform: boolean }> = {
  induction: { company: true, department: true, subdepartment: true, platform: true },
  reskilling: { company: false, department: true, subdepartment: true, platform: true },
  refresher: { company: false, department: false, subdepartment: false, platform: false },
};

function parseTestDays(text: string): number[] {
  return Array.from(new Set(text.split(/[^0-9]+/).filter(Boolean).map(Number).filter((n) => n >= 1 && n <= 240))).sort((a, b) => a - b);
}

export function LmsPlanBuilder() {
  const { go, params } = useLmsNav();
  const { canManage } = useLmsAccess();
  const invalidate = useLmsInvalidate();
  const settingsQ = useLmsSettings();
  const krasQ = useLmsKras();
  const modulesQ = useLmsModules();
  const linksQ = useLmsModuleKras();
  const seatsQ = useLmsSeats();
  const peopleQ = useLmsEmployees();
  const plansQ = useLmsPlans();
  const itemsQ = useLmsPlanItemsIndex();
  const certsQ = useLmsCertifications();
  const checklistQ = useLmsChecklistIndex();

  const [employeeId, setEmployeeId] = useState<string | null>(params.get("employee"));
  const [planType, setPlanType] = useState<LmsPlanType>("induction");
  const [language, setLanguage] = useState<LmsLanguage>("en");
  const [languageTouched, setLanguageTouched] = useState(false);
  const [startDate, setStartDate] = useState(todayIso());
  const [trainerId, setTrainerId] = useState<string | null>(null);
  const [supervisorId, setSupervisorId] = useState<string | null>(null);
  const [seatId, setSeatId] = useState<string>(params.get("seat") ?? "none");
  const [seatApplied, setSeatApplied] = useState(false);
  const [kraCodes, setKraCodes] = useState<string[]>([]);
  const [include, setInclude] = useState(INCLUDE_DEFAULTS.induction);
  const [skipCompleted, setSkipCompleted] = useState(true);
  const [title, setTitle] = useState("");
  const [titleTouched, setTitleTouched] = useState(false);
  const [moduleDays, setModuleDays] = useState(15);
  const [totalDays, setTotalDays] = useState(30);
  const [testDaysText, setTestDaysText] = useState("8, 15");
  const [frameTouched, setFrameTouched] = useState(false);
  const [notes, setNotes] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState<null | "draft" | "start">(null);

  const settings = settingsQ.data;
  const kraMap = useMemo(() => new Map((krasQ.data ?? []).map((k) => [k.code, k])), [krasQ.data]);
  const people = useMemo(() => indexBy(peopleQ.data, "id"), [peopleQ.data]);
  const seat = seatId !== "none" ? (seatsQ.data ?? []).find((s) => s.id === seatId) ?? null : null;
  const person = employeeId ? people.get(employeeId) ?? null : null;

  useEffect(() => {
    if (settings && !languageTouched) setLanguage(settings.default_language ?? "en");
  }, [settings, languageTouched]);

  // Opened from a seat card: fill in that seat's KRAs once the seats load.
  useEffect(() => {
    if (seatApplied || seatId === "none" || !seatsQ.data) return;
    const s = seatsQ.data.find((x) => x.id === seatId);
    if (s) setKraCodes(s.kra_codes);
    else setSeatId("none");
    setSeatApplied(true);
  }, [seatApplied, seatId, seatsQ.data]);

  // A future joiner's plan starts on the joining date.
  useEffect(() => {
    const j = parseDate(person?.joining_date);
    if (j && person?.joining_date && person.joining_date > todayIso()) setStartDate(person.joining_date);
  }, [person?.id, person?.joining_date]);

  const completedModuleIds = useMemo(
    () => (employeeId ? completedIds(employeeId, plansQ.data, itemsQ.data, checklistQ.data) : new Set<string>()),
    [employeeId, plansQ.data, itemsQ.data, checklistQ.data],
  );

  const certifiedCodes = useMemo(
    () => new Set((certsQ.data ?? []).filter((c) => c.employee_id === employeeId && c.status === "certified").map((c) => c.kra_code)),
    [certsQ.data, employeeId],
  );
  const openPlans = useMemo(
    () => (plansQ.data ?? []).filter((p) => p.employee_id === employeeId && (p.status === "active" || p.status === "draft")),
    [plansQ.data, employeeId],
  );

  const resolved = useMemo(
    () =>
      resolvePlanModules({
        kraCodes, kras: kraMap, modules: modulesQ.data ?? [], moduleKras: linksQ.data ?? [], include,
        completedModuleIds: skipCompleted ? completedModuleIds : undefined,
      }),
    [kraCodes, kraMap, modulesQ.data, linksQ.data, include, skipCompleted, completedModuleIds],
  );
  const totalMinutes = resolved.modules.reduce((s, m) => s + (m.duration_minutes || 0), 0);

  // Default day frame: the programme settings for an induction, teaching time for anything shorter.
  useEffect(() => {
    if (frameTouched) return;
    if (planType === "induction") {
      setModuleDays(settings?.module_days ?? 15);
      setTotalDays(settings?.programme_days ?? 30);
      setTestDaysText((settings?.test_days ?? [8, 15]).join(", "));
    } else {
      const md = Math.min(180, suggestModuleDays(totalMinutes));
      setModuleDays(md);
      setTotalDays(md);
      setTestDaysText(md >= 8 ? `${Math.ceil(md / 2)}, ${md}` : String(md));
    }
  }, [planType, totalMinutes, settings, frameTouched]);

  useEffect(() => {
    if (titleTouched) return;
    setTitle(`${seat ? seat.name : "Custom KRAs"} — ${PLAN_TYPE_LABEL[planType]}`);
  }, [seat, planType, titleTouched]);

  const testDays = parseTestDays(testDaysText);
  const build = useMemo(
    () =>
      buildPlanItems({
        kraCodes, kras: kraMap, modules: modulesQ.data ?? [], moduleKras: linksQ.data ?? [], include,
        completedModuleIds: skipCompleted ? completedModuleIds : undefined,
        moduleDays: Math.max(1, moduleDays || 1), totalDays: Math.max(moduleDays || 1, totalDays || 1), testDays, planType,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kraCodes, kraMap, modulesQ.data, linksQ.data, include, skipCompleted, completedModuleIds, moduleDays, totalDays, testDaysText, planType],
  );
  const dayMinutes = useMemo(() => minutesByDay(build.items), [build.items]);
  const days = useMemo(() => {
    const out = new Map<number, DraftItem[]>();
    for (const it of build.items) out.set(it.day_no, [...(out.get(it.day_no) ?? []), it]);
    return Array.from(out.entries()).sort((a, b) => a[0] - b[0]);
  }, [build.items]);

  const problems: string[] = [];
  if (!employeeId) problems.push("Choose the trainee.");
  if (kraCodes.length === 0) problems.push("Add at least one KRA.");
  if (!parseDate(startDate)) problems.push("Enter a valid start date.");
  if (!(moduleDays >= 1 && moduleDays <= 180)) problems.push("Module days must be between 1 and 180.");
  if (!(totalDays >= moduleDays && totalDays <= 240)) problems.push("Total days must be at least the module days and at most 240.");
  if (kraCodes.length > 0 && build.items.filter((i) => i.item_type === "module").length === 0) {
    problems.push(build.skippedCompleted.length ? "Every module for these KRAs is already completed; see the note above." : "No module was found for these KRAs.");
  }

  const onSeat = (id: string) => {
    setSeatId(id);
    const s = (seatsQ.data ?? []).find((x) => x.id === id);
    if (s) setKraCodes(s.kra_codes);
  };
  const onType = (t: LmsPlanType) => {
    setPlanType(t);
    setInclude(INCLUDE_DEFAULTS[t]);
    // A refresher re-teaches what the person already did, so completed modules stay in.
    setSkipCompleted(t !== "refresher");
  };

  const save = async (start: boolean) => {
    if (problems.length || !employeeId) return;
    setSaving(start ? "start" : "draft");
    try {
      const id = await createPlan({
        employee_id: employeeId,
        seat_id: seat?.id ?? null,
        plan_type: planType,
        title,
        language,
        start_date: startDate,
        module_days: Math.max(1, moduleDays),
        total_days: Math.max(moduleDays, totalDays),
        trainer_employee_id: trainerId,
        supervisor_employee_id: supervisorId,
        notes: notes || null,
        start,
        kra_codes: kraCodes,
        items: build.items.map((i) => ({
          day_no: i.day_no, item_type: i.item_type, module_id: i.module_id, module_version: i.module_version, title: i.title, test_kind: i.test_kind,
        })),
      });
      toast.success(start ? "Training plan created and started" : "Draft training plan created");
      await invalidate();
      go("plans", { plan: id });
    } catch (e) {
      toast.error(`Couldn't create the plan: ${errorText(e)}`);
    } finally {
      setSaving(null);
    }
  };

  const loading = krasQ.isLoading || modulesQ.isLoading || linksQ.isLoading || peopleQ.isLoading || settingsQ.isLoading;
  const err = krasQ.error || modulesQ.error || linksQ.error || peopleQ.error;
  if (err && !krasQ.data) return <ErrorBlock error={err} onRetry={() => { krasQ.refetch(); modulesQ.refetch(); linksQ.refetch(); peopleQ.refetch(); }} />;
  if (loading) return <LoadingBlock rows={6} />;
  if (!canManage) return <ReadOnlyNote>Creating training plans needs the LMS Manage permission.</ReadOnlyNote>;

  const selectedKras = kraCodes.map((c) => kraMap.get(c)).filter(Boolean);

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" className="-ml-2" onClick={() => go("plans")}><ArrowLeft className="mr-1.5 h-4 w-4" /> All trainees</Button>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3"><CardTitle className="t-card-title">1. Trainee and plan</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="lms-trainee">Trainee</Label>
                <EmployeeSelect id="lms-trainee" employees={peopleQ.data} value={employeeId} onChange={setEmployeeId} placeholder="Choose the trainee" />
                {person ? (
                  <p className="t-secondary">{[person.position_title, person.department_name, person.joining_date ? `joined ${fmtDate(person.joining_date)}` : null].filter(Boolean).join(" · ")}</p>
                ) : null}
                {openPlans.length ? (
                  <p className="flex items-start gap-1.5 text-xs text-warning">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                    {employeeLabel(person)} already has {openPlans.length === 1 ? "an open plan" : `${openPlans.length} open plans`} ({openPlans.map((p) => p.title).join(", ")}).
                  </p>
                ) : null}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Plan type</Label>
                  <Select value={planType} onValueChange={(v) => onType(v as LmsPlanType)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(Object.keys(PLAN_TYPE_LABEL) as LmsPlanType[]).map((t) => <SelectItem key={t} value={t}>{PLAN_TYPE_LABEL[t]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Language</Label>
                  <Select value={language} onValueChange={(v) => { setLanguage(v as LmsLanguage); setLanguageTouched(true); }}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">{LANGUAGE_LABEL.en}</SelectItem>
                      <SelectItem value="hinglish">{LANGUAGE_LABEL.hinglish}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lms-start">Start date</Label>
                  <Input id="lms-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Seat (KRA set)</Label>
                  <Select value={seatId} onValueChange={(v) => (v === "none" ? setSeatId("none") : onSeat(v))}>
                    <SelectTrigger><SelectValue placeholder="No seat" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No seat — pick KRAs by hand</SelectItem>
                      {(seatsQ.data ?? []).filter((s) => s.is_active).map((s) => (
                        <SelectItem key={s.id} value={s.id}>{s.name} ({s.kra_codes.length} KRAs)</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Trainer</Label>
                  <EmployeeSelect employees={peopleQ.data} value={trainerId} onChange={setTrainerId} placeholder="Who teaches" allowClear />
                </div>
                <div className="space-y-1.5">
                  <Label>Department senior (live supervision)</Label>
                  <EmployeeSelect employees={peopleQ.data} value={supervisorId} onChange={setSupervisorId} placeholder="Who supervises live work" allowClear />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lms-title">Plan title</Label>
                <Input id="lms-title" value={title} onChange={(e) => { setTitle(e.target.value); setTitleTouched(true); }} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="lms-notes">Notes (optional)</Label>
                <Textarea id="lms-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
              <CardTitle className="t-card-title">2. KRAs ({kraCodes.length})</CardTitle>
              <Button size="sm" variant="outline" onClick={() => setPickerOpen(true)}><ListPlus className="mr-1.5 h-4 w-4" /> Choose KRAs</Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {selectedKras.length === 0 ? (
                <p className="text-sm text-muted-foreground">Pick a seat above, or choose KRAs from the catalogue.</p>
              ) : (
                <ul className="max-h-64 space-y-1 overflow-y-auto pr-1">
                  {selectedKras.map((k) => (
                    <li key={k!.code} className="flex items-start justify-between gap-2 rounded-md border border-border px-2.5 py-1.5">
                      <div className="min-w-0">
                        <p className="text-sm"><span className="t-mono mr-1.5 text-xs text-muted-foreground">{k!.code}</span>{k!.name}</p>
                        <div className="mt-0.5 flex flex-wrap gap-1">
                          {k!.platform ? <Badge variant="outline" className="text-[10px]">{k!.platform}</Badge> : null}
                          {certifiedCodes.has(k!.code) ? <Badge variant="success" className="text-[10px]">Already certified</Badge> : null}
                          {!k!.is_active ? <Badge variant="destructive-soft" className="text-[10px]">Removed from catalogue</Badge> : null}
                        </div>
                      </div>
                      <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" aria-label={`Remove ${k!.code}`} onClick={() => setKraCodes((c) => c.filter((x) => x !== k!.code))}>
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="grid gap-2 sm:grid-cols-2">
                {([
                  ["company", "Company orientation"],
                  ["department", "Department orientation"],
                  ["subdepartment", "Sub-department orientation"],
                  ["platform", "Platform modules"],
                ] as const).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2 text-sm">
                    <Checkbox checked={include[key]} onCheckedChange={(v) => setInclude((s) => ({ ...s, [key]: v === true }))} /> {label}
                  </label>
                ))}
                <label className="flex items-center gap-2 text-sm sm:col-span-2">
                  <Checkbox checked={skipCompleted} onCheckedChange={(v) => setSkipCompleted(v === true)} />
                  Leave out modules this person already completed{completedModuleIds.size ? ` (${completedModuleIds.size})` : ""}
                </label>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3"><CardTitle className="t-card-title">3. Days</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label htmlFor="lms-md">Module days</Label>
                  <Input id="lms-md" type="number" min={1} max={180} value={moduleDays} onChange={(e) => { setModuleDays(Number(e.target.value)); setFrameTouched(true); }} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lms-td">Total days</Label>
                  <Input id="lms-td" type="number" min={1} max={240} value={totalDays} onChange={(e) => { setTotalDays(Number(e.target.value)); setFrameTouched(true); }} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lms-tests">Test days</Label>
                  <Input id="lms-tests" value={testDaysText} onChange={(e) => { setTestDaysText(e.target.value); setFrameTouched(true); }} placeholder="8, 15" />
                </div>
              </div>
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                Days after the module days are supervised live work. The last module day always holds the final test. {resolved.modules.length} module{resolved.modules.length === 1 ? "" : "s"}, {minutesLabel(totalMinutes)} of teaching.
                {frameTouched ? (
                  <button type="button" className="ml-1 underline" onClick={() => setFrameTouched(false)}>Use defaults</button>
                ) : null}
              </p>
            </CardContent>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
            <CardTitle className="t-card-title flex items-center gap-2"><CalendarDays className="h-4 w-4 text-muted-foreground" aria-hidden /> Schedule preview</CardTitle>
            <span className="t-secondary">{build.items.length} items · {Math.max(moduleDays, totalDays)} days</span>
          </CardHeader>
          <CardContent className="space-y-3">
            {build.warnings.map((w) => (
              <p key={w} className="flex items-start gap-1.5 rounded-md bg-warning/10 px-2.5 py-1.5 text-xs text-warning">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden /> {w}
              </p>
            ))}
            {build.skippedCompleted.length ? (
              <p className="text-xs text-muted-foreground">Left out as already completed: {build.skippedCompleted.map((m) => m.code).join(", ")}.</p>
            ) : null}
            {kraCodes.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">The day-by-day schedule appears here once KRAs are chosen.</p>
            ) : (
              <ol className="max-h-[70vh] space-y-2 overflow-y-auto pr-1">
                {days.map(([day, its]) => {
                  const date = planDayDate(startDate, day);
                  const mins = dayMinutes.get(day) ?? 0;
                  const live = day > moduleDays;
                  return (
                    <li key={day} className="rounded-lg border border-border">
                      <div className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-3 py-1.5">
                        <span className="text-sm font-medium">Day {day}<span className="ml-2 text-xs font-normal text-muted-foreground">{fmtDate(date, "EEE dd MMM")}</span></span>
                        <span className="flex items-center gap-1.5">
                          {live ? <Badge variant="success" className="text-[10px]">Live</Badge> : null}
                          {mins > DAY_MINUTES_WARN ? <Badge variant="warning" className="text-[10px]">{minutesLabel(mins)} — heavy day</Badge> : mins ? <span className="t-mono text-xs text-muted-foreground">{minutesLabel(mins)}</span> : null}
                        </span>
                      </div>
                      <ul className="space-y-1 px-3 py-2">
                        {its.map((it) => (
                          <li key={it.key} className="flex items-center gap-2 text-sm">
                            <ItemTypeIcon type={it.item_type} />
                            <span className="min-w-0 flex-1 truncate">
                              {it.module_code ? <span className="t-mono mr-1.5 text-xs text-muted-foreground">{it.module_code}</span> : null}
                              {it.title}
                            </span>
                            <span className="shrink-0 text-xs text-muted-foreground">{it.item_type === "module" ? minutesLabel(it.minutes) : ITEM_TYPE_LABEL[it.item_type]}</span>
                          </li>
                        ))}
                      </ul>
                    </li>
                  );
                })}
              </ol>
            )}
            {problems.length ? (
              <ul className="space-y-1 text-xs text-muted-foreground">
                {problems.map((p) => <li key={p} className="flex items-center gap-1.5"><Info className="h-3.5 w-3.5 shrink-0" aria-hidden /> {p}</li>)}
              </ul>
            ) : null}
            <div className="flex flex-col-reverse gap-2 border-t border-border pt-3 sm:flex-row sm:justify-end">
              <Button variant="outline" disabled={!!problems.length || !!saving} onClick={() => save(false)}>
                {saving === "draft" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null} Save as draft
              </Button>
              <Button disabled={!!problems.length || !!saving} onClick={() => save(true)}>
                {saving === "start" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null} Create and start
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">You can move, add or remove items on the plan page after it is created.</p>
          </CardContent>
        </Card>
      </div>

      <KraPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        kras={krasQ.data}
        selected={kraCodes}
        certifiedCodes={certifiedCodes}
        onDone={(codes) => setKraCodes(codes.sort((a, b) => (kraMap.get(a)?.sort_order ?? 0) - (kraMap.get(b)?.sort_order ?? 0)))}
        title="Choose the KRAs to train"
      />
    </div>
  );
}
