import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FileText, Search } from "lucide-react";

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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">HR Policies</h1>
        <p className="text-sm text-muted-foreground">Company policies and guidelines</p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search policies..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary"
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
        <p className="text-muted-foreground text-center py-8">Loading policies...</p>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No policies found</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((policy: any) => (
            <Card key={policy.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <CardTitle className="text-sm">{policy.title}</CardTitle>
                  <Badge variant="secondary" className="text-[10px] shrink-0">
                    {policy.category || "General"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-4">
                  {policy.content}
                </p>
                <p className="text-[10px] text-muted-foreground mt-3">
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
