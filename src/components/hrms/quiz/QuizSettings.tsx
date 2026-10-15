import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { quizRpc, useInvalidateQuiz } from "./quizShared";
import { useGradingCounts } from "./QuizGrading";
import { AI_NUMBERS, NUMBERS, TEXTS, settingsProblems, type Settings } from "@/lib/cbt/quizBank";
import { Switch } from "@/components/ui/switch";

export function QuizSettings({ settings, canAdmin, canGrade = false }: { settings: Settings | null; canAdmin: boolean; canGrade?: boolean }) {
  const { toast } = useToast();
  const invalidate = useInvalidateQuiz();
  const [f, setF] = useState<Settings>({});
  useEffect(() => { if (settings) setF({ ...settings }); }, [settings?.updated_at]); // eslint-disable-line react-hooks/exhaustive-deps
  const problems = settingsProblems(f);
  const { data: aiUsage } = useGradingCounts(canGrade);
  const save = useMutation({
    mutationFn: () => quizRpc("cbt_update_settings", {
      p: Object.fromEntries([...TEXTS.map((t) => t.key), ...NUMBERS.map((n) => n.key), "on_warning_limit", "typing_practice_passage", ...AI_NUMBERS.map((n) => n.key)].map((k) => [k, f[k] ?? ""]).concat([["ai_grading_enabled", f.ai_grading_enabled !== false]])),
    }),
    onSuccess: () => { toast({ title: "Settings saved" }); void invalidate(); },
    onError: (e: Error) => toast({ title: "Not saved", description: e.message, variant: "destructive" }),
  });
  if (!settings) return <p className="text-sm text-muted-foreground">Settings unavailable.</p>;
  const ro = !canAdmin;
  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {TEXTS.map((t) => (
          <div key={t.key}><Label htmlFor={`st-${t.key}`}>{t.label}</Label>
            <Input id={`st-${t.key}`} readOnly={ro} className="text-foreground" value={f[t.key] ?? ""} onChange={(e) => setF((x) => ({ ...x, [t.key]: e.target.value }))} /></div>
        ))}
      </section>
      <section className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2 lg:grid-cols-3">
        {NUMBERS.map((n) => (
          <div key={n.key}><Label htmlFor={`st-${n.key}`}>{n.label} <span className="text-muted-foreground">({n.unit})</span></Label>
            <Input id={`st-${n.key}`} readOnly={ro} inputMode="numeric" className="text-foreground" value={f[n.key] ?? ""} onChange={(e) => setF((x) => ({ ...x, [n.key]: e.target.value.replace(/\D/g, "") }))} />
            <p className="mt-1 text-xs text-muted-foreground">{n.min}–{n.max}</p></div>
        ))}
        <div><Label>At the warning limit</Label>
          <Select disabled={ro} value={f.on_warning_limit ?? "flag_only"} onValueChange={(v) => setF((x) => ({ ...x, on_warning_limit: v }))}>
            <SelectTrigger className="text-foreground"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="flag_only">Record and flag for HR</SelectItem><SelectItem value="auto_submit">Submit the test automatically</SelectItem></SelectContent>
          </Select></div>
      </section>
      <section className="space-y-3 border-t border-border pt-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="font-medium">AI grading of written answers</p><p className="text-xs text-muted-foreground">Grades apply automatically only when the AI is confident, nothing is flagged and the total is not near a cut-off; everything else goes to Grading → Needs a check. Billed from workspace AI credits.</p></div>
          <div className="flex items-center gap-2"><Switch id="st-ai" disabled={ro} checked={f.ai_grading_enabled !== false} onCheckedChange={(v) => setF((x) => ({ ...x, ai_grading_enabled: v }))} /><Label htmlFor="st-ai">{f.ai_grading_enabled !== false ? "On" : "Off"}</Label></div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          {AI_NUMBERS.map((n) => (
            <div key={n.key}><Label htmlFor={`st-${n.key}`}>{n.label} <span className="text-muted-foreground">({n.unit})</span></Label>
              <Input id={`st-${n.key}`} readOnly={ro} inputMode={n.decimal ? "decimal" : "numeric"} className="text-foreground" value={f[n.key] ?? ""} onChange={(e) => setF((x) => ({ ...x, [n.key]: e.target.value.replace(n.decimal ? /[^\d.]/g : /\D/g, "") }))} /></div>
          ))}
        </div>
        {aiUsage && <p className="text-xs text-muted-foreground">AI gradings: {aiUsage.ai_today} today · {aiUsage.ai_this_month} this month.</p>}
      </section>
      <section className="border-t border-border pt-4">
        <Label htmlFor="st-pp">Typing practice passage</Label>
        <Textarea id="st-pp" readOnly={ro} rows={5} className="text-foreground" value={f.typing_practice_passage ?? ""} onChange={(e) => setF((x) => ({ ...x, typing_practice_passage: e.target.value }))} />
        <p className="mt-1 text-xs text-muted-foreground">Used only for warm-up; never scored. Plain keyboard characters, up to 3000.</p>
      </section>
      {canAdmin ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={problems.length > 0} loading={save.isPending} onClick={() => save.mutate()}>Save settings</Button>
          {problems.length > 0 && <p className="text-sm text-destructive">{problems[0]}</p>}
        </div>
      ) : <p className="text-xs text-muted-foreground">Only Quiz administrators can change these settings.</p>}
    </div>
  );
}
