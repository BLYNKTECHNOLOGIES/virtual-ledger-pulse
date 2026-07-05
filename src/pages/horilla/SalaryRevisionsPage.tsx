import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Search } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { TableSkeleton } from "@/components/ui/skeleton";
import { useState } from "react";
import { format } from "date-fns";

export default function SalaryRevisionsPage() {
  const [search, setSearch] = useState("");

  const { data: revisions = [], isLoading } = useQuery({
    queryKey: ["hr_salary_revisions"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_salary_revisions")
        .select("*, hr_employees!hr_salary_revisions_employee_id_fkey(first_name, last_name, badge_id)")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const filtered = revisions.filter((r: any) => {
    const name = `${r.hr_employees?.first_name} ${r.hr_employees?.last_name}`.toLowerCase();
    return name.includes(search.toLowerCase());
  });

  return (
    <div className="p-4 md:p-6 space-y-4 page-mount">
      <PageHeader
        title="Salary Revision History"
        description="Auto-tracked whenever an employee's salary is updated"
      />

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search by employee name..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
      </div>

      {isLoading ? (
        <TableSkeleton rows={4} columns={4} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={TrendingUp} title="No salary revisions recorded yet" description="Revisions are auto-created when you update an employee's salary" />
      ) : (
        <div className="space-y-3">
          {filtered.map((r: any) => {
            const isIncrease = Number(r.new_total || 0) > Number(r.previous_total || 0);
            const diff = Number(r.new_total || 0) - Number(r.previous_total || 0);
            return (
              <Card key={r.id}>
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {isIncrease ? (
                      <TrendingUp className="h-5 w-5 text-success shrink-0" />
                    ) : (
                      <TrendingDown className="h-5 w-5 text-destructive shrink-0" />
                    )}
                    <div>
                      <p className="font-medium text-foreground">{r.hr_employees?.first_name} {r.hr_employees?.last_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(r.created_at), "dd MMM yyyy, hh:mm a")} · Effective: {r.effective_from}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground line-through tabular-nums">₹{Number(r.previous_total || 0).toLocaleString("en-IN")}</span>
                      <span className="text-foreground font-semibold tabular-nums">→ ₹{Number(r.new_total || 0).toLocaleString("en-IN")}</span>
                    </div>
                    <Badge variant={isIncrease ? "default" : "destructive"} className="text-xs mt-1">
                      {isIncrease ? "+" : ""}₹{diff.toLocaleString("en-IN")} · {r.revision_type}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
