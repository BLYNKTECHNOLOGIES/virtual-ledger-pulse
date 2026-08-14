import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { format } from "date-fns";
import { Gift, Calendar, CheckCircle, Clock, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { TableSkeleton } from "@/components/ui/skeleton";

export default function CompOffPage() {
  const qc = useQueryClient();
  const [yearFilter, setYearFilter] = useState(new Date().getFullYear().toString());

  const { data: credits = [], isLoading } = useQuery({
    queryKey: ["hr_compoff_credits", yearFilter],
    queryFn: async () => {
      const startDate = `${yearFilter}-01-01`;
      const endDate = `${yearFilter}-12-31`;
      const { data, error } = await (supabase as any)
        .from("hr_compoff_credits")
        .select("*, hr_employees!hr_compoff_credits_employee_id_fkey(badge_id, first_name, last_name)")
        .gte("credit_date", startDate)
        .lte("credit_date", endDate)
        .order("credit_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // NOTE: comp-off credits are allocated to the leave balance automatically by the
  // database trigger `fn_allocate_compoff_credit` at INSERT time. A manual "allocate"
  // action here previously added the same credit days a second (and third) time,
  // inflating balances (e.g. 3 credits → 47 days). It has been removed on purpose —
  // this page is read-only reporting over the comp-off ledger.


  const totalCredits = credits.reduce((s: number, c: any) => s + Number(c.credit_days), 0);
  
  const openDays = credits
    .filter((c: any) => !c.settled_period_month)
    .reduce((s: number, c: any) => s + Number(c.credit_days), 0);
  const sundayCount = credits.filter((c: any) => c.credit_type === "sunday").length;
  const holidayCount = credits.filter((c: any) => c.credit_type === "holiday").length;

  return (
    <div className="p-4 md:p-6 space-y-4 page-mount">
      <PageHeader
        title="Comp-Off Management"
        description="Auto-credited for weekly-off/holiday work. Comp-off never carries forward: each month it is taken as leave, offset against that month's LOP, and any remainder is encashed in that month's payroll."
        actions={
          <div className="flex items-center gap-3">
            <Input type="number" value={yearFilter} onChange={(e) => setYearFilter(e.target.value)} className="w-24 h-9" min="2020" max="2030" />
          </div>
        }

      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Credits", value: `${totalCredits} days`, icon: Gift, color: "text-success", bg: "bg-success/10" },
          { label: "Sunday Work", value: sundayCount, icon: Calendar, color: "text-info", bg: "bg-info/10" },
          { label: "Holiday Work", value: holidayCount, icon: Clock, color: "text-warning", bg: "bg-warning/10" },
          { label: "Open (unsettled)", value: `${openDays} days`, icon: CheckCircle, color: "text-warning", bg: "bg-warning/10" },
        ].map((s) => (

          <Card key={s.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg ${s.bg}`}><s.icon className={`h-5 w-5 ${s.color}`} /></div>
              <div><p className="text-xl font-bold tabular-nums">{s.value}</p><p className="text-xs text-muted-foreground">{s.label}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      {isLoading ? (
        <TableSkeleton rows={5} columns={7} />
      ) : credits.length === 0 ? (
        <Card>
          <CardContent className="p-0">
            <EmptyState
              icon={Gift}
              title={`No comp-off credits for ${yearFilter}`}
              description="Credits are auto-generated when employees clock in on Sundays or holidays."
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Employee</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Date Worked</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Type</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Credit</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Settled in</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Status</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Outcome</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {credits.map((c: any) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">
                      {c.hr_employees?.first_name} {c.hr_employees?.last_name}
                      <span className="text-xs text-muted-foreground ml-1">({c.hr_employees?.badge_id})</span>
                    </TableCell>
                    <TableCell className="tabular-nums">{c.credit_date}</TableCell>
                    <TableCell>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                        c.credit_type === "sunday" ? "bg-info/10 text-info border-info/20" : "bg-warning/10 text-warning border-warning/20"
                      }`}>
                        {c.credit_type === "sunday" ? "Sunday" : "Holiday"}
                      </span>
                    </TableCell>
                    <TableCell className="font-medium text-success tabular-nums">{c.credit_days} day{c.credit_days > 1 ? "s" : ""}</TableCell>
                    <TableCell className="text-sm text-muted-foreground tabular-nums">
                      {c.settled_period_month ? String(c.settled_period_month).slice(0, 7) : "Open — settles this month"}
                    </TableCell>
                    <TableCell>
                      {c.settled_period_month ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium border bg-muted text-muted-foreground border-border">Settled</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium border bg-success/10 text-success border-success/20">Available</span>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {c.settlement_outcome === "settled_in_payroll"
                        ? "Taken as leave / offset against LOP / encashed"
                        : c.settlement_outcome || (c.settled_period_month ? "Settled" : "Taken as leave, offset against LOP, or encashed at month close")}
                    </TableCell>


                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
