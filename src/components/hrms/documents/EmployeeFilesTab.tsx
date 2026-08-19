import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/EmptyState";
import { ExternalLink, FileText, Search, Info } from "lucide-react";

/**
 * Read-only view over the existing employee compliance uploads
 * (public.hr_employee_documents). Nothing here writes or deletes — the record
 * of truth stays with the Employee Documents page and the employee profile.
 */
export function EmployeeFilesTab() {
  const [search, setSearch] = useState("");

  const { data: docs = [], isLoading } = useQuery({
    queryKey: ["hr_doc_studio_employee_files"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_employee_documents")
        .select("id, employee_id, document_type, document_name, file_url, uploaded_at, is_verified")
        .order("uploaded_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["hr_doc_studio_employee_names"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_employees").select("id, first_name, last_name, badge_id").limit(2000);
      if (error) throw error;
      return data || [];
    },
  });

  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of employees as any[]) {
      m.set(e.id, [e.first_name, e.last_name].filter(Boolean).join(" ") || e.badge_id || "Unknown");
    }
    return m;
  }, [employees]);

  const filtered = docs.filter((d: any) => {
    const q = search.toLowerCase();
    return (
      !q ||
      d.document_name?.toLowerCase().includes(q) ||
      d.document_type?.toLowerCase().includes(q) ||
      (nameById.get(d.employee_id) || "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground flex items-center gap-1.5">
        <Info className="h-3.5 w-3.5" />
        Existing employee uploads (Aadhaar, PAN, certificates) shown read-only. Manage them from the employee profile.
      </p>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search by employee, type or file name..." value={search}
          onChange={(e) => setSearch(e.target.value)} className="pl-9 h-9" />
      </div>

      {isLoading ? (
        <p className="text-xs text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <EmptyState icon={FileText} title="No employee files" description="Nothing matches this search." />
      ) : (
        <Card>
          <CardContent className="p-0 divide-y divide-border">
            {filtered.map((d: any) => (
              <div key={d.id} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="text-sm text-foreground truncate">{d.document_name}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {nameById.get(d.employee_id) || "Unknown employee"} · {d.document_type}
                    {d.uploaded_at ? ` · ${new Date(d.uploaded_at).toLocaleDateString()}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {d.is_verified && <Badge variant="outline" className="text-[10px]">verified</Badge>}
                  {d.file_url && (
                    <Button size="sm" variant="ghost" asChild>
                      <a href={d.file_url} target="_blank" rel="noreferrer"><ExternalLink className="h-4 w-4" /></a>
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default EmployeeFilesTab;
