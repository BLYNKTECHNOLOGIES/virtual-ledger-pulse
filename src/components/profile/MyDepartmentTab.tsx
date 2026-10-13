import { useState } from "react";
import { UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useDepartmentRequestHiring, type MyDepartmentLine } from "@/hooks/hrms/useWorkforceBudget";
import { REQ_STATUS_CLASS, REQ_STATUS_LABEL, formatIstDate, istToday } from "@/lib/hrms/workforce";

/** Read-only staffing for the departments this employee heads, with "Request more people". */
export default function MyDepartmentTab({ lines }: { lines: MyDepartmentLine[] }) {
  const [target, setTarget] = useState<MyDepartmentLine | null>(null);
  const depts = Array.from(new Map(lines.map((l) => [l.department_id, l.department_name])).entries());
  return (
    <div className="space-y-4">
      {depts.map(([id, name]) => {
        const ls = lines.filter((l) => l.department_id === id);
        return (
          <Card key={id}>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{name}</CardTitle>
              <p className="text-xs text-muted-foreground">You head this department. Requests go to HR for approval.</p>
            </CardHeader>
            <CardContent className="space-y-2">
              {ls.length === 0 && <p className="text-sm text-muted-foreground">No staffing lines planned yet.</p>}
              {ls.map((l) => (
                <div key={l.plan_id} className="rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">{l.position_title} · {l.shift_label}</p>
                      <p className="text-xs text-muted-foreground tabular-nums">
                        Required {l.required_hc} · On roll {l.on_roll_hc} · Short {l.short_hc} · In training {l.in_training_hc}
                      </p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => setTarget(l)}>
                      <UserPlus className="h-4 w-4" /> Request more people
                    </Button>
                  </div>
                  {l.requests.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {l.requests.map((r) => (
                        <Badge key={r.id} variant="outline" className={REQ_STATUS_CLASS[r.status]}>
                          {r.requirement_no} · {(r.adds_headcount ?? 0) > 0 ? `adds +${r.adds_headcount}` : r.number_required} · {REQ_STATUS_LABEL[r.status] ?? r.status}
                          {r.source === "department_request" ? " · your request" : ""}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}
      {target && <RequestDialog line={target} onClose={() => setTarget(null)} />}
    </div>
  );
}

function RequestDialog({ line, onClose }: { line: MyDepartmentLine; onClose: () => void }) {
  const gap = Math.max(0, line.short_hc);
  const [mode, setMode] = useState<"gap" | "add">(gap > 0 ? "gap" : "add");
  const [n, setN] = useState("1");
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  const m = useDepartmentRequestHiring();
  const num = Number(n);
  const max = mode === "gap" ? gap : 50;
  const valid = Number.isInteger(num) && num >= 1 && num <= max && reason.trim().length > 0;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Request people — {line.position_title} · {line.shift_label}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <RadioGroup value={mode} onValueChange={(v) => { setMode(v as "gap" | "add"); setN("1"); }} className="space-y-2">
            <label className={`flex items-start gap-2 rounded-md border border-border p-2.5 ${gap === 0 ? "opacity-50" : ""}`}>
              <RadioGroupItem value="gap" disabled={gap === 0} className="mt-0.5" />
              <span className="text-sm text-foreground">Fill the current gap
                <span className="block text-xs text-muted-foreground">{gap > 0 ? `This line requires ${line.required_hc} and has ${line.on_roll_hc} on roll — up to ${gap}.` : "This line has no gap today."}</span>
              </span>
            </label>
            <label className="flex items-start gap-2 rounded-md border border-border p-2.5">
              <RadioGroupItem value="add" className="mt-0.5" />
              <span className="text-sm text-foreground">Add headcount
                <span className="block text-xs text-muted-foreground">More people beyond the line's required {line.required_hc}. If HR approves, the line's required number rises by the same amount.</span>
              </span>
            </label>
          </RadioGroup>
          <div>
            <Label>{mode === "gap" ? `How many people (1–${gap})` : "How many additional people (+N)"}</Label>
            <Input type="number" min={1} max={max} value={n} onChange={(e) => setN(e.target.value)} className="mt-1 h-9 text-foreground" />
            {mode === "add" && valid && <p className="mt-1 text-xs text-muted-foreground">Required would become {line.required_hc + num}.</p>}
          </div>
          <div>
            <Label>Needed by (optional)</Label>
            <Input type="date" min={istToday()} value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 h-9 text-foreground" />
            {date && <p className="mt-1 text-xs text-muted-foreground">{formatIstDate(date)}</p>}
          </div>
          <div>
            <Label>Reason *</Label>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 text-foreground" placeholder="Why does the team need more people?" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!valid || m.isPending}
            onClick={() => m.mutate({ planId: line.plan_id, number: num, target: date || null, reason: reason.trim(), adds: mode === "add" }, { onSuccess: onClose })}>
            {m.isPending ? "Sending…" : "Send for approval"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
