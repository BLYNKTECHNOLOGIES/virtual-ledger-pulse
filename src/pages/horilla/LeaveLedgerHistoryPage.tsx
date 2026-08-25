import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllPaginated } from "@/lib/fetchAllRows";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Download, ArrowUpCircle, ArrowDownCircle, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { PageHeader } from "@/components/shared/PageHeader";
import { format, parseISO } from "date-fns";
import { toast } from "sonner";

type LedgerEvent = {
  id: string;
  at: string;
  employeeId: string;
  employeeName: string;
  badgeId: string;
  direction: "credit" | "debit";
  kind: string;
  leaveTypeName: string;
  leaveTypeColor?: string;
  days: number;
  detail: string;
};

const fmtDays = (n: number) => `${Number(n) % 1 === 0 ? Number(n) : Number(n).toFixed(1)}d`;

export default function LeaveLedgerHistoryPage() {
  const [search, setSearch] = useState("");
  const [directionFilter, setDirectionFilter] = useState<"all" | "credit" | "debit">("all");

  const { data, isLoading } = useQuery({
    queryKey: ["hr_leave_ledger_history"],
    queryFn: async () => {
      const [employees, leaveTypes, allocations, accruals, compoffCredits, compoffSettlements, consumption, requests] =
        await Promise.all([
          fetchAllPaginated<any>(() =>
            (supabase as any).from("hr_employees").select("id, badge_id, first_name, last_name")
          ),
          (supabase as any).from("hr_leave_types").select("id, name, code, color").then((r: any) => r.data || []),
          fetchAllPaginated<any>(() =>
            (supabase as any)
              .from("hr_leave_allocations")
              .select("id, employee_id, leave_type_id, year, quarter, allocated_days, created_at")
          ),
          fetchAllPaginated<any>(() =>
            (supabase as any)
              .from("hr_leave_accrual_log")
              .select("id, employee_id, accrued_days, accrual_date, year, quarter, created_at")
          ),
          fetchAllPaginated<any>(() =>
            (supabase as any)
              .from("hr_compoff_credits")
              .select("id, employee_id, credit_date, credit_type, credit_days, notes, created_at")
          ),
          fetchAllPaginated<any>(() =>
            (supabase as any)
              .from("hr_compoff_settlements")
              .select("id, employee_id, period_month, days_offset_lop, days_encashed, amount, settled_at, created_at")
          ),
          fetchAllPaginated<any>(() =>
            (supabase as any)
              .from("hr_leave_request_consumption")
              .select("id, employee_id, leave_type_id, request_id, days, source, created_at")
          ),
          fetchAllPaginated<any>(() =>
            (supabase as any)
              .from("hr_leave_requests")
              .select("id, start_date, end_date, total_days, status")
          ),
        ]);

      const empMap = new Map<string, any>((employees || []).map((e: any) => [e.id, e]));
      const ltMap = new Map<string, any>((leaveTypes || []).map((t: any) => [t.id, t]));
      const reqMap = new Map<string, any>((requests || []).map((r: any) => [r.id, r]));

      const nameOf = (id: string) => {
        const e = empMap.get(id);
        return e ? `${e.first_name || ""} ${e.last_name || ""}`.trim() || "Unknown" : "Unknown employee";
      };
      const badgeOf = (id: string) => empMap.get(id)?.badge_id || "—";
      const typeOf = (id?: string | null) => ltMap.get(id || "") || null;

      const events: LedgerEvent[] = [];

      for (const a of allocations || []) {
        if (!Number(a.allocated_days)) continue;
        const lt = typeOf(a.leave_type_id);
        events.push({
          id: `alloc-${a.id}`,
          at: a.created_at,
          employeeId: a.employee_id,
          employeeName: nameOf(a.employee_id),
          badgeId: badgeOf(a.employee_id),
          direction: "credit",
          kind: "Allocation",
          leaveTypeName: lt?.name || "Leave",
          leaveTypeColor: lt?.color,
          days: Number(a.allocated_days),
          detail: `Allocated for Q${a.quarter || "-"} ${a.year}`,
        });
      }

      for (const r of accruals || []) {
        if (!Number(r.accrued_days)) continue;
        events.push({
          id: `accr-${r.id}`,
          at: r.created_at || r.accrual_date,
          employeeId: r.employee_id,
          employeeName: nameOf(r.employee_id),
          badgeId: badgeOf(r.employee_id),
          direction: "credit",
          kind: "Monthly accrual",
          leaveTypeName: "Accrual plan",
          days: Number(r.accrued_days),
          detail: `Accrued on ${r.accrual_date ? format(parseISO(r.accrual_date), "dd MMM yyyy") : "—"} (Q${r.quarter || "-"} ${r.year || ""})`,
        });
      }

      for (const c of compoffCredits || []) {
        if (!Number(c.credit_days)) continue;
        events.push({
          id: `co-${c.id}`,
          at: c.created_at || c.credit_date,
          employeeId: c.employee_id,
          employeeName: nameOf(c.employee_id),
          badgeId: badgeOf(c.employee_id),
          direction: "credit",
          kind: "Comp-off earned",
          leaveTypeName: "Compensatory Off",
          days: Number(c.credit_days),
          detail: [
            c.credit_type ? `${c.credit_type.replace(/_/g, " ")} work` : null,
            c.credit_date ? `on ${format(parseISO(c.credit_date), "dd MMM yyyy")}` : null,
            c.notes,
          ]
            .filter(Boolean)
            .join(" · "),
        });
      }

      for (const s of compoffSettlements || []) {
        const period = s.period_month ? format(parseISO(s.period_month), "MMM yyyy") : "—";
        if (Number(s.days_offset_lop)) {
          events.push({
            id: `cos-lop-${s.id}`,
            at: s.settled_at || s.created_at,
            employeeId: s.employee_id,
            employeeName: nameOf(s.employee_id),
            badgeId: badgeOf(s.employee_id),
            direction: "debit",
            kind: "Comp-off offset LOP",
            leaveTypeName: "Compensatory Off",
            days: Number(s.days_offset_lop),
            detail: `Offset loss of pay for ${period}`,
          });
        }
        if (Number(s.days_encashed)) {
          events.push({
            id: `cos-enc-${s.id}`,
            at: s.settled_at || s.created_at,
            employeeId: s.employee_id,
            employeeName: nameOf(s.employee_id),
            badgeId: badgeOf(s.employee_id),
            direction: "debit",
            kind: "Comp-off encashed",
            leaveTypeName: "Compensatory Off",
            days: Number(s.days_encashed),
            detail: `Encashed in ${period}${s.amount ? ` · ₹${Number(s.amount).toLocaleString("en-IN")}` : ""}`,
          });
        }
      }

      for (const c of consumption || []) {
        if (!Number(c.days)) continue;
        const lt = typeOf(c.leave_type_id);
        const req = reqMap.get(c.request_id);
        events.push({
          id: `cons-${c.id}`,
          at: c.created_at,
          employeeId: c.employee_id,
          employeeName: nameOf(c.employee_id),
          badgeId: badgeOf(c.employee_id),
          direction: "debit",
          kind: c.source === "lop" ? "Leave taken (unpaid)" : "Leave redeemed",
          leaveTypeName: lt?.name || (c.source ? c.source.replace(/_/g, " ") : "Leave"),
          leaveTypeColor: lt?.color,
          days: Number(c.days),
          detail: [
            c.source ? `Source: ${c.source.replace(/_/g, " ")}` : null,
            req?.start_date
              ? `Leave ${format(parseISO(req.start_date), "dd MMM")}–${format(parseISO(req.end_date), "dd MMM yyyy")}`
              : null,
          ]
            .filter(Boolean)
            .join(" · "),
        });
      }

      return events
        .filter((e) => !!e.at)
        .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    },
  });

  const events = data || [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return events.filter((e) => {
      if (directionFilter !== "all" && e.direction !== directionFilter) return false;
      if (!q) return true;
      return (
        e.employeeName.toLowerCase().includes(q) ||
        String(e.badgeId).toLowerCase().includes(q) ||
        e.leaveTypeName.toLowerCase().includes(q) ||
        e.kind.toLowerCase().includes(q)
      );
    });
  }, [events, search, directionFilter]);

  const grouped = useMemo(() => {
    const map = new Map<string, LedgerEvent[]>();
    for (const e of filtered) {
      const key = `${e.employeeName}|||${e.badgeId}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return Array.from(map.entries())
      .map(([key, list]) => ({
        name: key.split("|||")[0],
        badge: key.split("|||")[1],
        list,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [filtered]);

  const exportCsv = () => {
    const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const header = ["Employee", "Badge", "Date & Time", "Direction", "Event", "Leave Type", "Days", "Details"];
    const rows = grouped.flatMap((g) =>
      g.list.map((e) => [
        g.name,
        g.badge,
        format(new Date(e.at), "dd MMM yyyy HH:mm"),
        e.direction === "credit" ? "Credit" : "Debit",
        e.kind,
        e.leaveTypeName,
        e.days,
        e.detail,
      ])
    );
    const csv = [header, ...rows].map((r) => r.map(esc).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `leave-ledger-history-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("History exported");
  };

  const navigate = useNavigate();

  return (
    <div className="p-4 md:p-6 space-y-4 page-mount">
      <PageHeader
        title="Leave Allocation & Redemption History"
        description="Every credit (allocation, monthly accrual, comp-off earned) and every debit (leave redeemed, comp-off encashed or offset against loss of pay), grouped by employee and ordered newest first."
        actions={
          <Button variant="outline" className="h-9" onClick={() => navigate("/hrms/leave/allocations")}>
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to Allocations
          </Button>
        }
      />

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search employee, badge or leave type..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 h-9 text-foreground"
          />
        </div>
        <Select value={directionFilter} onValueChange={(v) => setDirectionFilter(v as any)}>
          <SelectTrigger className="w-[170px] h-9 text-foreground"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All movements</SelectItem>
            <SelectItem value="credit">Credits only</SelectItem>
            <SelectItem value="debit">Debits only</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" className="h-9" onClick={exportCsv} disabled={filtered.length === 0}>
          <Download className="h-4 w-4 mr-2" /> Export CSV
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Loading history…</p>
        ) : grouped.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No leave movements recorded yet.</p>
        ) : (
          grouped.map((g) => (
            <div key={`${g.name}-${g.badge}`} className="rounded-lg border border-border">
              <div className="flex items-center justify-between px-3 py-2 bg-muted/40 rounded-t-lg">
                <p className="text-sm font-semibold">
                  {g.name} <span className="text-xs font-normal text-muted-foreground">· {g.badge}</span>
                </p>
                <p className="text-[11px] text-muted-foreground tabular-nums">
                  +{fmtDays(g.list.filter((e) => e.direction === "credit").reduce((s, e) => s + e.days, 0))} / −
                  {fmtDays(g.list.filter((e) => e.direction === "debit").reduce((s, e) => s + e.days, 0))}
                </p>
              </div>
              <div className="divide-y divide-border">
                {g.list.map((e) => (
                  <div key={e.id} className="flex items-start gap-3 px-3 py-2">
                    {e.direction === "credit" ? (
                      <ArrowUpCircle className="h-4 w-4 mt-0.5 text-success shrink-0" />
                    ) : (
                      <ArrowDownCircle className="h-4 w-4 mt-0.5 text-warning shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium flex items-center gap-2 flex-wrap">
                        {e.leaveTypeColor && (
                          <span
                            className="w-2 h-2 rounded-full inline-block"
                            style={{ backgroundColor: e.leaveTypeColor }}
                          />
                        )}
                        {e.kind}
                        <span className="text-xs font-normal text-muted-foreground">{e.leaveTypeName}</span>
                      </p>
                      {e.detail && <p className="text-[11px] text-muted-foreground">{e.detail}</p>}
                    </div>
                    <div className="text-right shrink-0">
                      <p
                        className={`text-sm font-semibold tabular-nums ${
                          e.direction === "credit" ? "text-success" : "text-warning"
                        }`}
                      >
                        {e.direction === "credit" ? "+" : "−"}
                        {fmtDays(e.days)}
                      </p>
                      <p className="text-[10px] text-muted-foreground tabular-nums">
                        {format(new Date(e.at), "dd MMM yyyy HH:mm")}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
