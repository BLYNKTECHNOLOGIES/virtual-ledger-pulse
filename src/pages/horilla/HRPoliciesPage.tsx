import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, Search } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { CardSkeleton } from "@/components/ui/skeleton";

const CATEGORIES = ["All", "General", "Leave", "Attendance", "Conduct", "Benefits", "Safety", "Other"];

export default function HRPoliciesPage() {
  const [category, setCategory] = useState("All");
  const [search, setSearch] = useState("");

  const { data: policies = [], isLoading } = useQuery({
    queryKey: ["hr_policies_all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("hr_policies")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const filtered = policies.filter((p: any) => {
    const matchCat = category === "All" || p.category === category;
    const matchSearch = !search || p.title?.toLowerCase().includes(search.toLowerCase()) || p.content?.toLowerCase().includes(search.toLowerCase());
    return matchCat && matchSearch;
  });

  return (
    <div className="p-4 md:p-6 space-y-4 page-mount">
      <PageHeader
        title="HR Policies"
        description="Company policies and guidelines"
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search policies..."
            className="w-full h-9 pl-9 pr-3 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary"
          />
        </div>
        <div className="flex gap-1 flex-wrap">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition ${
                category === cat
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No policies found"
          description={search || category !== "All" ? "Try adjusting your search or filter." : "No HR policies have been added yet."}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((policy: any) => (
            <Card key={policy.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-sm font-semibold">{policy.title}</CardTitle>
                  <span className="bg-muted/10 border border-muted/20 rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0 text-muted-foreground">
                    {policy.category || "General"}
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-4">
                  {policy.content}
                </p>
                <p className="text-[10px] tabular-nums text-muted-foreground mt-3">
                  Updated {new Date(policy.updated_at || policy.created_at).toLocaleDateString("en-IN")}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
