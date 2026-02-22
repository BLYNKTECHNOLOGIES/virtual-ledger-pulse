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

export default function CompOffPage() {
  const qc = useQueryClient();
  const [yearFilter, setYearFilter] = useState(new Date().getFullYear().toString());

  // Fetch comp-off credits
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

  // Allocate comp-off as leave
  const allocateMutation = useMutation({
    mutationFn: async (credit: any) => {
      // Find or create "Comp-Off" leave type
      let { data: compOffType } = await (supabase as any)
        .from("hr_leave_types")
        .select("id")
        .eq("code", "CO")
        .maybeSingle();

      if (!compOffType) {
        const { data: newType, error: typeErr } = await (supabase as any)
          .from("hr_leave_types")
          .insert({
            name: "Comp-Off",
            code: "CO",
            max_days_per_year: 365,
            is_paid: true,
            requires_approval: false,
            color: "#10b981",
            carry_forward: true,
            is_active: true,
          })
          .select("id")
          .single();
        if (typeErr) throw typeErr;
        compOffType = newType;
      }

      const quarter = Math.ceil((new Date(credit.credit_date).getMonth() + 1) / 3);
      const year = new Date(credit.credit_date).getFullYear();

      // Check if allocation exists for this employee+type+quarter
      const { data: existing } = await (supabase as any)
        .from("hr_leave_allocations")
        .select("id, allocated_days")
        .eq("employee_id", credit.employee_id)
        .eq("leave_type_id", compOffType.id)
        .eq("year", year)
        .eq("quarter", quarter)
        .maybeSingle();

      if (existing) {
        // Increment existing allocation
        await (supabase as any)
          .from("hr_leave_allocations")
          .update({ allocated_days: existing.allocated_days + Number(credit.credit_days) })
          .eq("id", existing.id);
      } else {
        // Create new allocation
        const { error: allocErr } = await (supabase as any)
          .from("hr_leave_allocations")
          .insert({
            employee_id: credit.employee_id,
            leave_type_id: compOffType.id,
            year,
            quarter,
            allocated_days: Number(credit.credit_days),
            carry_forward_days: 0,
            used_days: 0,
          });
        if (allocErr) throw allocErr;
      }

      // Mark credit as allocated
      await (supabase as any)
        .from("hr_compoff_credits")
        .update({ is_allocated: true, allocated_at: new Date().toISOString() })
        .eq("id", credit.id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hr_compoff_credits"] });
      qc.invalidateQueries({ queryKey: ["hr_leave_allocations_all"] });
      toast.success("Comp-Off leave allocated successfully");
    },
    onError: (e: any) => toast.error(e.message),
  });

  // Bulk allocate all pending
  const bulkAllocateMutation = useMutation({
    mutationFn: async () => {
      const pending = credits.filter((c: any) => !c.is_allocated);
      for (const credit of pending) {
        await allocateMutation.mutateAsync(credit);
      }
      return pending.length;
    },
    onSuccess: (count) => {
      toast.success(`Allocated ${count} comp-off credits as leave`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const totalCredits = credits.reduce((s: number, c: any) => s + Number(c.credit_days), 0);
  const allocated = credits.filter((c: any) => c.is_allocated);
  const pending = credits.filter((c: any) => !c.is_allocated);
  const sundayCount = credits.filter((c: any) => c.credit_type === "sunday").length;
  const holidayCount = credits.filter((c: any) => c.credit_type === "holiday").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Comp-Off Management</h1>
          <p className="text-sm text-muted-foreground">Auto-credited when employees work on Sundays or holidays. Allocate as leave balance.</p>
        </div>
        <div className="flex items-center gap-3">
          <Input type="number" value={yearFilter} onChange={(e) => setYearFilter(e.target.value)} className="w-24" min="2020" max="2030" />
          {pending.length > 0 && (
            <Button onClick={() => bulkAllocateMutation.mutate()} disabled={bulkAllocateMutation.isPending} className="bg-emerald-600 hover:bg-emerald-700">
              <Gift className="h-4 w-4 mr-1" /> Allocate All ({pending.length})
            </Button>
          )}
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Credits", value: `${totalCredits} days`, icon: Gift, color: "text-emerald-600", bg: "bg-emerald-50" },
          { label: "Sunday Work", value: sundayCount, icon: Calendar, color: "text-blue-600", bg: "bg-blue-50" },
          { label: "Holiday Work", value: holidayCount, icon: Clock, color: "text-orange-600", bg: "bg-orange-50" },
          { label: "Allocated as Leave", value: `${allocated.length}/${credits.length}`, icon: CheckCircle, color: "text-green-600", bg: "bg-green-50" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`p-2 rounded-lg ${s.bg}`}><s.icon className={`h-5 w-5 ${s.color}`} /></div>
              <div><p className="text-xl font-bold">{s.value}</p><p className="text-xs text-muted-foreground">{s.label}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Credits Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead>Date Worked</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Credit</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
              ) : credits.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No comp-off credits for {yearFilter}. Credits are auto-generated when employees clock in on Sundays or holidays.</TableCell></TableRow>
              ) : (
                credits.map((c: any) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">
                      {c.hr_employees?.first_name} {c.hr_employees?.last_name}
                      <span className="text-xs text-muted-foreground ml-1">({c.hr_employees?.badge_id})</span>
                    </TableCell>
                    <TableCell>{c.credit_date}</TableCell>
                    <TableCell>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        c.credit_type === "sunday" ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700"
                      }`}>
                        {c.credit_type === "sunday" ? "Sunday" : "Holiday"}
                      </span>
                    </TableCell>
                    <TableCell className="font-medium text-emerald-600">{c.credit_days} day{c.credit_days > 1 ? "s" : ""}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{c.expires_at || "Year-end"}</TableCell>
                    <TableCell>
                      {c.is_allocated ? (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-700">Allocated</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-xs bg-yellow-100 text-yellow-700">Pending</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {!c.is_allocated && (
                        <Button size="sm" variant="outline" className="h-7 text-xs text-emerald-600 border-emerald-200 hover:bg-emerald-50" onClick={() => allocateMutation.mutate(c)}>
                          <ArrowRight className="h-3 w-3 mr-1" /> Allocate Leave
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
