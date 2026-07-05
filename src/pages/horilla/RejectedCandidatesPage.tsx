import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { UserX, ArrowLeft, Calendar, User, Search } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { TableSkeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function RejectedCandidatesPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");

  const { data: rejected = [], isLoading } = useQuery({
    queryKey: ["hr_rejected_candidates_all"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("hr_rejected_candidates")
        .select("*, hr_candidates!hr_rejected_candidates_candidate_id_fkey(name, email, mobile, is_active, hr_recruitments!hr_candidates_recruitment_id_fkey(title))")
        .order("rejected_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const filtered = rejected.filter((r: any) => {
    const name = r.hr_candidates?.name || "";
    const email = r.hr_candidates?.email || "";
    const reason = r.reject_reason || "";
    const q = search.toLowerCase();
    return name.toLowerCase().includes(q) || email.toLowerCase().includes(q) || reason.toLowerCase().includes(q);
  });

  return (
    <div className="p-4 md:p-6 space-y-4">
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            <div className="p-1.5 bg-destructive/10 rounded-lg inline-flex">
              <UserX className="h-5 w-5 text-destructive" />
            </div>
            Rejected Candidates
          </span>
        }
        description={`${filtered.length} rejected candidate${filtered.length !== 1 ? "s" : ""}`}
        actions={
          <Button variant="ghost" size="sm" className="h-9" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
        }
      />

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search by name, email, or reason..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-9" />
      </div>

      {isLoading ? (
        <TableSkeleton rows={5} columns={4} />
      ) : filtered.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-8">
          <EmptyState icon={UserX} title="No rejected candidates found" description="Rejected candidates will appear here" />
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/50 border-b border-border">
                <th className="text-left py-3 px-4 text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Candidate</th>
                <th className="text-left py-3 px-4 text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Recruitment</th>
                <th className="text-left py-3 px-4 text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Rejected On</th>
                <th className="text-left py-3 px-4 text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Reason / Stage</th>
                <th className="text-left py-3 px-4 text-[11px] uppercase tracking-wide text-muted-foreground font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r: any) => (
                <tr key={r.id} className="border-b border-muted/20 hover:bg-muted/50 transition-colors">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-destructive/10 flex items-center justify-center shrink-0">
                        <User className="h-3.5 w-3.5 text-destructive" />
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{r.hr_candidates?.name || "Unknown"}</p>
                        <p className="text-[11px] text-muted-foreground">{r.hr_candidates?.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    {r.hr_candidates?.hr_recruitments?.title ? (
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
                        {r.hr_candidates.hr_recruitments.title}
                      </span>
                    ) : <span className="text-muted-foreground text-xs">—</span>}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
                      <Calendar className="h-3 w-3" />
                      {new Date(r.rejected_at).toLocaleDateString("en-IN")}
                      {r.rejected_by && <span className="ml-1">· {r.rejected_by}</span>}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <div className="space-y-1">
                      {r.rejection_stage && (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-destructive/10 text-destructive border border-destructive/20 inline-block">
                          {r.rejection_stage}
                        </span>
                      )}
                      {r.reject_reason && (
                        <p className="text-xs text-muted-foreground">{r.reject_reason}</p>
                      )}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    <Button size="sm" variant="ghost" className="h-8 text-xs text-[#E8604C] hover:text-[#E8604C] hover:bg-[#E8604C]/10"
                      onClick={() => navigate(`/hrms/recruitment/candidates/${r.candidate_id}`)}>
                      View Profile →
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
