import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Search } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { CardSkeleton } from "@/components/ui/skeleton";

/** Long policies start collapsed; "Read full policy" opens them. */
const isLong = (text: string) => text.length > 280 || text.split("\n").length > 4;

function PolicyBody({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  if (!isLong(text)) return <p className="text-sm text-muted-foreground whitespace-pre-wrap">{text}</p>;
  return (
    <div>
      <p className={`text-sm text-muted-foreground whitespace-pre-wrap ${open ? "" : "line-clamp-4"}`}>{text}</p>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="mt-1 text-xs font-medium text-primary hover:underline"
      >
        {open ? "Show less" : "Read full policy"}
      </button>
    </div>
  );
}

export default function HRPoliciesPage() {
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

  const q = search.trim().toLowerCase();
  const filtered = policies.filter((p: any) =>
    !q || p.title?.toLowerCase().includes(q) || p.body?.toLowerCase().includes(q)
  );

  return (
    <div className="p-4 md:p-6 space-y-4 page-mount">
      <PageHeader
        title="HR Policies"
        description="Company policies and guidelines"
      />

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search policies..."
          aria-label="Search policies"
          className="w-full h-9 pl-9 pr-3 text-sm border border-border rounded-lg bg-background text-foreground focus:outline-none focus:border-primary"
        />
      </div>

      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => <CardSkeleton key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No policies found"
          description={q ? "Try a different search." : "No HR policies have been added yet."}
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((policy: any) => (
            <Card key={policy.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">{policy.title}</CardTitle>
              </CardHeader>
              <CardContent>
                {!policy.body ? (
                  <p className="text-sm text-muted-foreground">No text added yet.</p>
                ) : (
                  <PolicyBody text={policy.body} />
                )}
                <p className="text-[10px] tabular-nums text-muted-foreground mt-3">
                  Updated {new Date(policy.updated_at || policy.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
