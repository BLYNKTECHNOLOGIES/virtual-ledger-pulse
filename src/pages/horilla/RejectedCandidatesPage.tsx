import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { UserX, ArrowLeft, Calendar, User, Search } from "lucide-react";
import { useState } from "react";
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
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2">
          <div className="p-2 bg-destructive/10 rounded-lg">
            <UserX className="h-5 w-5 text-destructive" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Rejected Candidates</h1>
            <p className="text-sm text-muted-foreground">{filtered.length} rejected candidate{filtered.length !== 1 ? "s" : ""}</p>
          </div>
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search by name, email, or reason..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">No rejected candidates found</CardContent></Card>
      ) : (
        <div className="grid gap-3">
          {filtered.map((r: any) => (
            <Card key={r.id} className="hover:shadow-sm transition-shadow">
              <CardContent className="py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="font-medium text-foreground truncate">{r.hr_candidates?.name || "Unknown"}</span>
                      {r.hr_candidates?.hr_recruitments?.title && (
                        <Badge variant="outline" className="text-xs shrink-0">{r.hr_candidates.hr_recruitments.title}</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{r.hr_candidates?.email}</p>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      Rejected: {new Date(r.rejected_at).toLocaleDateString("en-IN")}
                      {r.rejected_by && <span className="ml-2">by {r.rejected_by}</span>}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <Badge variant="destructive" className="text-xs">{r.rejection_stage || "—"}</Badge>
                  </div>
                </div>
                {r.reject_reason && (
                  <div className="mt-2 p-2 bg-muted/50 rounded text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">Reason:</span> {r.reject_reason}
                  </div>
                )}
                <div className="mt-2 flex justify-end">
                  <Button size="sm" variant="ghost" className="text-xs" onClick={() => navigate(`/hrms/recruitment/candidates/${r.candidate_id}`)}>
                    View Profile →
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
