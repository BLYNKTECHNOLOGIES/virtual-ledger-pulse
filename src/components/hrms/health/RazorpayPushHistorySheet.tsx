import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ChevronDown, ChevronRight, Download } from "lucide-react";
import { useUserNames } from "@/hooks/useUserNames";

/**
 * Complete history of every WRITE sent to RazorpayX. Source is
 * hr_razorpay_sync_log, which razorpay-payroll-proxy writes for every call
 * regardless of which HRMS screen (Data Health, onboarding, salary revision,
 * payroll inputs, F&F, separation, cron…) triggered it. Read-only calls are
 * excluded.
 */

type Category = "employee" | "salary" | "payroll" | "separation" | "attendance" | "contractor" | "other";

const WRITE_ACTIONS: Record<string, { label: string; cat: Category }> = {
  create_person: { label: "Employee created", cat: "employee" },
  create_draft: { label: "Draft employee created", cat: "employee" },
  push_create: { label: "Employee created", cat: "employee" },
  push_update: { label: "Employee updated", cat: "employee" },
  push_person: { label: "Employee details pushed", cat: "employee" },
  push_bank: { label: "Bank details pushed", cat: "employee" },
  push_salary: { label: "Salary structure pushed", cat: "salary" },
  advance_salary_create: { label: "Salary advance created", cat: "salary" },
  payroll_add_additions: { label: "Payroll addition", cat: "payroll" },
  payroll_add_deduction: { label: "Payroll deduction", cat: "payroll" },
  payroll_reset_modifications: { label: "Payroll adjustments reset", cat: "payroll" },
  payroll_do_not_pay: { label: "Do-not-pay set", cat: "payroll" },
  payroll_recall: { label: "Payroll recalled", cat: "payroll" },
  apply_payroll_pilot: { label: "Payroll applied (pilot)", cat: "payroll" },
  apply_payroll_bulk: { label: "Payroll applied (bulk)", cat: "payroll" },
  lock_payroll_period: { label: "Payroll period locked", cat: "payroll" },
  unlock_bulk: { label: "Payroll unlocked", cat: "payroll" },
  people_dismiss: { label: "Employee dismissed", cat: "separation" },
  push_attendance: { label: "Attendance pushed", cat: "attendance" },
  push_attendance_recall: { label: "Attendance recalled", cat: "attendance" },
  attendance_edit_patch: { label: "Attendance edited", cat: "attendance" },
  contractor_payment_create: { label: "Contractor payment created", cat: "contractor" },
  contractor_payment_delete: { label: "Contractor payment deleted", cat: "contractor" },
  apply_error: { label: "Push error", cat: "other" },
};

const CAT_LABEL: Record<Category, string> = {
  employee: "Employee details", salary: "Salary", payroll: "Payroll inputs",
  separation: "Separation", attendance: "Attendance", contractor: "Contractors", other: "Other",
};

const RANGES: Record<string, number | null> = { "7": 7, "30": 30, "90": 90, "365": 365, all: null };

interface Row {
  id: string; action: string; http_status: number | null; error_text: string | null;
  field_diff_summary: any; hr_employee_id: string | null; razorpay_employee_id: string | null;
  actor_user_id: string | null; created_at: string;
}

const ok = (r: Row) => r.action !== "apply_error" && !r.error_text && (r.http_status == null || (r.http_status >= 200 && r.http_status < 300));
const fmtIST = (s: string) =>
  new Date(s).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function RazorpayPushHistorySheet({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [range, setRange] = useState("30");
  const [cat, setCat] = useState<string>("all");
  const [action, setAction] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [emp, setEmp] = useState<string>("all");
  const [actor, setActor] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [limit, setLimit] = useState(200);

  const q = useQuery({
    queryKey: ["rzp-push-history", range],
    enabled: open,
    queryFn: async () => {
      const all: Row[] = [];
      const days = RANGES[range];
      for (let from = 0; ; from += 1000) {
        let b = (supabase as any)
          .from("hr_razorpay_sync_log")
          .select("id, action, http_status, error_text, field_diff_summary, hr_employee_id, razorpay_employee_id, actor_user_id, created_at")
          .in("action", Object.keys(WRITE_ACTIONS))
          .order("created_at", { ascending: false })
          .range(from, from + 999);
        if (days) b = b.gte("created_at", new Date(Date.now() - days * 864e5).toISOString());
        const { data, error } = await b;
        if (error) throw error;
        all.push(...(data ?? []));
        if (!data || data.length < 1000) break;
      }
      return all;
    },
  });

  const rows = q.data ?? [];
  const empIds = useMemo(() => [...new Set(rows.map((r) => r.hr_employee_id).filter(Boolean))] as string[], [rows]);
  const empQ = useQuery({
    queryKey: ["rzp-history-emps", empIds],
    enabled: empIds.length > 0,
    queryFn: async () => {
      const { data } = await (supabase as any).from("hr_employees").select("id, first_name, last_name, badge_id").in("id", empIds);
      const m: Record<string, string> = {};
      (data ?? []).forEach((e: any) => (m[e.id] = `${e.first_name ?? ""} ${e.last_name ?? ""}`.trim() + (e.badge_id ? ` (${e.badge_id})` : "")));
      return m;
    },
  });
  const empName = (id: string | null, rp: string | null) => (id && empQ.data?.[id]) || (rp ? `RazorpayX #${rp}` : "—");
  const { nameFor } = useUserNames(rows.map((r) => r.actor_user_id));
  const actorLabel = (id: string | null) => (id ? nameFor(id, "Staff") : "System / scheduled");

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows.filter((r) => {
      const meta = WRITE_ACTIONS[r.action];
      if (cat !== "all" && meta?.cat !== cat) return false;
      if (action !== "all" && r.action !== action) return false;
      if (status === "success" && !ok(r)) return false;
      if (status === "failed" && ok(r)) return false;
      if (emp !== "all" && r.hr_employee_id !== emp) return false;
      if (actor !== "all" && (actor === "system" ? r.actor_user_id : r.actor_user_id !== actor)) return false;
      if (s) {
        const hay = `${empName(r.hr_employee_id, r.razorpay_employee_id)} ${meta?.label} ${r.error_text ?? ""} ${JSON.stringify(r.field_diff_summary ?? "")}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, cat, action, status, emp, actor, search, empQ.data]);

  const stats = useMemo(() => ({ total: filtered.length, failed: filtered.filter((r) => !ok(r)).length }), [filtered]);
  const actionOptions = Object.entries(WRITE_ACTIONS).filter(([, v]) => cat === "all" || v.cat === cat);
  const actors = useMemo(() => [...new Set(rows.map((r) => r.actor_user_id).filter(Boolean))] as string[], [rows]);

  const reset = () => { setCat("all"); setAction("all"); setStatus("all"); setEmp("all"); setActor("all"); setSearch(""); };

  const exportCsv = () => {
    const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [["Time (IST)", "Category", "Action", "Employee", "By", "Result", "HTTP", "Error", "Details"].join(",")];
    filtered.forEach((r) => {
      const m = WRITE_ACTIONS[r.action];
      lines.push([fmtIST(r.created_at), m ? CAT_LABEL[m.cat] : "", m?.label ?? r.action, empName(r.hr_employee_id, r.razorpay_employee_id),
        actorLabel(r.actor_user_id), ok(r) ? "Success" : "Failed", r.http_status ?? "", r.error_text ?? "", JSON.stringify(r.field_diff_summary ?? "")].map(esc).join(","));
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([lines.join("\n")], { type: "text/csv" }));
    a.download = `razorpayx-push-history-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-3xl p-0 flex flex-col">
        <SheetHeader className="px-4 pt-4 pb-2 border-b border-border">
          <SheetTitle>RazorpayX push history</SheetTitle>
          <SheetDescription>Everything HRMS has sent to RazorpayX, from any screen or scheduled job. Times in IST.</SheetDescription>
        </SheetHeader>

        <div className="px-4 py-3 space-y-2 border-b border-border">
          <Input placeholder="Search employee, change, error…" value={search} onChange={(e) => setSearch(e.target.value)} className="text-foreground" />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            <Select value={range} onValueChange={setRange}>
              <SelectTrigger className="text-foreground"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
                <SelectItem value="365">Last 12 months</SelectItem>
                <SelectItem value="all">All time</SelectItem>
              </SelectContent>
            </Select>
            <Select value={cat} onValueChange={(v) => { setCat(v); setAction("all"); }}>
              <SelectTrigger className="text-foreground"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {Object.entries(CAT_LABEL).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={action} onValueChange={setAction}>
              <SelectTrigger className="text-foreground"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All actions</SelectItem>
                {actionOptions.map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="text-foreground"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All results</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
            <Select value={emp} onValueChange={setEmp}>
              <SelectTrigger className="text-foreground"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All employees</SelectItem>
                {empIds.map((id) => ({ id, n: empQ.data?.[id] ?? id })).sort((a, b) => a.n.localeCompare(b.n))
                  .map(({ id, n }) => <SelectItem key={id} value={id}>{n}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={actor} onValueChange={setActor}>
              <SelectTrigger className="text-foreground"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Anyone</SelectItem>
                <SelectItem value="system">System / scheduled</SelectItem>
                {actors.map((id) => <SelectItem key={id} value={id}>{nameFor(id, "Staff")}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>{stats.total} pushes · <span className={stats.failed ? "text-destructive" : ""}>{stats.failed} failed</span></span>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={reset}>Clear filters</Button>
              <Button size="sm" variant="outline" onClick={exportCsv} disabled={!filtered.length}><Download className="h-3.5 w-3.5 mr-1" />CSV</Button>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-2">
          {q.isLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : q.error ? (
            <p className="text-sm text-destructive py-6">Couldn't load history: {(q.error as Error).message}</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No pushes match these filters.</p>
          ) : (
            <ul className="divide-y divide-border">
              {filtered.slice(0, limit).map((r) => {
                const m = WRITE_ACTIONS[r.action];
                const isOpen = expanded === r.id;
                const good = ok(r);
                return (
                  <li key={r.id} className="py-2 min-w-0">
                    <button className="w-full text-left flex items-start gap-2" onClick={() => setExpanded(isOpen ? null : r.id)}>
                      {isOpen ? <ChevronDown className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium text-foreground">{m?.label ?? r.action}</span>
                          <Badge variant={good ? "secondary" : "destructive"} className="text-[10px]">{good ? "Success" : "Failed"}</Badge>
                          {m && <span className="text-[10px] text-muted-foreground uppercase">{CAT_LABEL[m.cat]}</span>}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {empName(r.hr_employee_id, r.razorpay_employee_id)} · {actorLabel(r.actor_user_id)} · {fmtIST(r.created_at)}
                        </div>
                        {!good && r.error_text && <div className="text-xs text-destructive line-clamp-2">{r.error_text}</div>}
                      </div>
                    </button>
                    {isOpen && (
                      <div className="mt-2 ml-6 rounded-md bg-muted p-2 text-xs space-y-1 min-w-0">
                        {r.http_status != null && <div>HTTP {r.http_status}</div>}
                        {r.razorpay_employee_id && <div>RazorpayX employee #{r.razorpay_employee_id}</div>}
                        {r.field_diff_summary?.changed?.length ? <div>Changed: {r.field_diff_summary.changed.join(", ")}</div> : null}
                        {r.field_diff_summary && (
                          <pre className="whitespace-pre-wrap break-all font-mono text-[11px] text-foreground">{JSON.stringify(r.field_diff_summary, null, 2)}</pre>
                        )}
                        {r.error_text && <div className="text-destructive break-words">{r.error_text}</div>}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {filtered.length > limit && (
            <div className="py-3 text-center"><Button size="sm" variant="outline" onClick={() => setLimit((l) => l + 200)}>Show more ({filtered.length - limit} left)</Button></div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
