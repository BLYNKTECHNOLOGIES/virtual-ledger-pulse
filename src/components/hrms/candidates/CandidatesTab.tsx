import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
import { Search, Filter, ChevronDown, Phone, Mail, FileText, UserCircle, Calendar } from "lucide-react";

interface Applicant {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  address: string | null;
  stage: string | null;
  status: string;
  is_interested: boolean | null;
  resume_url: string | null;
  applied_at: string;
  updated_at: string;
  job_postings?: {
    title?: string | null;
    department?: string | null;
    location?: string | null;
  } | null;
}

// Small reusable badge for statuses using design tokens
const StatusBadge = ({ status }: { status: string }) => {
  const cls =
    status === "APPLIED"
      ? "bg-primary/10 text-primary"
      : status === "INTERVIEW"
      ? "bg-yellow-500/10 text-yellow-700"
      : status === "SELECTED" || status === "ONBOARDED"
      ? "bg-emerald-500/10 text-emerald-700"
      : status === "REJECTED" || status === "NOT_INTERESTED"
      ? "bg-destructive/10 text-destructive"
      : "bg-muted text-muted-foreground";
  return <Badge className={cls}>{status}</Badge>;
};

export function CandidatesTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // UI state
  const [search, setSearch] = useState("");
  const [hasResume, setHasResume] = useState(false);
  const [stageFilter, setStageFilter] = useState<string[]>([]);
  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState("recent");

  // Fetch applicants (single query, client-side refine for snappy UX)
  const { data: applicants = [], isLoading } = useQuery<Applicant[]>({
    queryKey: ["candidates", { search, hasResume }],
    queryFn: async () => {
      let query = supabase
        .from("job_applicants")
        .select(
          `id,name,email,phone,address,stage,status,is_interested,resume_url,applied_at,updated_at, job_postings:job_posting_id(title,department,location)`
        )
        .order("updated_at", { ascending: false });

      if (search) {
        query = query.or(
          `name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%,address.ilike.%${search}%`
        );
      }
      if (hasResume) {
        query = query.not("resume_url", "is", null);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data as unknown) as Applicant[];
    },
  });

  const filtered = useMemo(() => {
    let list = [...applicants];

    if (stageFilter.length) {
      list = list.filter((a) => (a.stage ? stageFilter.includes(a.stage) : false));
    }
    if (statusFilter.length) {
      list = list.filter((a) => statusFilter.includes(a.status));
    }

    if (sortBy === "recent") {
      list.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    } else if (sortBy === "applied") {
      list.sort((a, b) => new Date(b.applied_at).getTime() - new Date(a.applied_at).getTime());
    } else if (sortBy === "name") {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }

    return list;
  }, [applicants, stageFilter, statusFilter, sortBy]);

  // Quick counts for header tabs
  const counts = useMemo(() => {
    const all = applicants.length;
    const applied = applicants.filter((a) => a.stage === "APPLIED" || a.status === "APPLIED").length;
    const contacted = applicants.filter((a) => a.status === "CONTACTED").length;
    const suggested = applicants.filter((a) => a.status === "SUGGESTED").length;
    return { all, applied, contacted, suggested };
  }, [applicants]);

  const markNotInterested = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("job_applicants")
        .update({ is_interested: false, status: "NOT_INTERESTED" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "Updated", description: "Marked as not interested." });
      queryClient.invalidateQueries({ queryKey: ["candidates"] });
    },
    onError: (e) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Filters */}
      <aside className="lg:col-span-3">
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold text-foreground">All Filters</h2>
          </div>
          <div className="flex items-center gap-2 rounded-lg border px-3 py-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search name, email, phone, address"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="border-0 shadow-none focus-visible:ring-0"
            />
          </div>
          <Separator className="my-4" />

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Has Resume</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant={hasResume ? "default" : "outline"} size="sm">
                    {hasResume ? "Yes" : "Any"}
                    <ChevronDown className="ml-2 h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="z-50 bg-popover">
                  <DropdownMenuLabel>Has Resume</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuCheckboxItem checked={!hasResume} onCheckedChange={() => setHasResume(false)}>
                    Any
                  </DropdownMenuCheckboxItem>
                  <DropdownMenuCheckboxItem checked={hasResume} onCheckedChange={() => setHasResume(true)}>
                    Yes
                  </DropdownMenuCheckboxItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div>
              <p className="text-sm font-medium mb-2">Stage</p>
              <div className="flex flex-wrap gap-2">
                {[
                  "APPLIED",
                  "CONTACTED",
                  "INTERVIEW",
                  "SELECTED",
                  "REJECTED",
                  "ONBOARDED",
                ].map((s) => (
                  <Button
                    key={s}
                    size="sm"
                    variant={stageFilter.includes(s) ? "default" : "outline"}
                    onClick={() =>
                      setStageFilter((prev) =>
                        prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
                      )
                    }
                  >
                    {s}
                  </Button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-sm font-medium mb-2">Status</p>
              <div className="flex flex-wrap gap-2">
                {["APPLIED", "SUGGESTED", "CONTACTED", "NOT_INTERESTED"].map((s) => (
                  <Button
                    key={s}
                    size="sm"
                    variant={statusFilter.includes(s) ? "default" : "outline"}
                    onClick={() =>
                      setStatusFilter((prev) =>
                        prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]
                      )
                    }
                  >
                    {s}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        </Card>
      </aside>

      {/* Main content */}
      <main className="lg:col-span-9">
        <header className="mb-4">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" size="sm">
              All candidates <Badge className="ml-2">{counts.all}</Badge>
            </Button>
            <Button variant="ghost" size="sm">
              Applied <Badge className="ml-2">{counts.applied}</Badge>
            </Button>
            <Button variant="ghost" size="sm">
              Contacted <Badge className="ml-2">{counts.contacted}</Badge>
            </Button>
            <Button variant="ghost" size="sm">
              Suggested <Badge className="ml-2">{counts.suggested}</Badge>
            </Button>

            <div className="ml-auto flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Sort by</span>
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-40 bg-background z-50">
                  <SelectValue placeholder="Sort" />
                </SelectTrigger>
                <SelectContent className="z-50 bg-popover">
                  <SelectItem value="recent">Recent Activity</SelectItem>
                  <SelectItem value="applied">Recently Applied</SelectItem>
                  <SelectItem value="name">Name A-Z</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </header>

        <Card>
          <ScrollArea className="max-h-[70vh]">
            {isLoading ? (
              <div className="py-12 text-center text-muted-foreground">Loading candidates...</div>
            ) : (
              <ul className="divide-y">
                {filtered.map((a) => (
                  <li key={a.id} className="p-4">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                          <UserCircle className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="font-semibold text-foreground">{a.name}</h3>
                            {a.is_interested === false ? (
                              <Badge variant="secondary">Not Interested</Badge>
                            ) : (
                              <Badge variant="outline">Interested</Badge>
                            )}
                          </div>
                          <div className="mt-1 text-sm text-muted-foreground">
                            {a.job_postings?.title ? (
                              <span>
                                {a.job_postings?.title} • {a.job_postings?.department}
                                {a.job_postings?.location ? ` • ${a.job_postings.location}` : ""}
                              </span>
                            ) : (
                              <span>General Application</span>
                            )}
                          </div>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            {a.stage && <StatusBadge status={a.stage} />}
                            <StatusBadge status={a.status} />
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {a.phone && (
                          <Button variant="outline" size="sm" asChild>
                            <a href={`tel:${a.phone}`} aria-label="Call candidate">
                              <Phone className="h-4 w-4 mr-2" /> Call
                            </a>
                          </Button>
                        )}
                        <Button variant="outline" size="sm" asChild>
                          <a href={`mailto:${a.email}`} aria-label="Email candidate">
                            <Mail className="h-4 w-4 mr-2" /> Email
                          </a>
                        </Button>
                        {a.resume_url && (
                          <Button variant="outline" size="sm" asChild>
                            <a href={a.resume_url} target="_blank" rel="noopener noreferrer">
                              <FileText className="h-4 w-4 mr-2" /> Resume
                            </a>
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => markNotInterested.mutate(a.id)}
                          disabled={a.is_interested === false}
                        >
                          Mark Not Interested
                        </Button>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2 text-sm text-muted-foreground">
                      <div>
                        <span className="font-medium text-foreground">Email:</span> {a.email}
                      </div>
                      {a.phone && (
                        <div>
                          <span className="font-medium text-foreground">Phone:</span> {a.phone}
                        </div>
                      )}
                      {a.address && (
                        <div>
                          <span className="font-medium text-foreground">Address:</span> {a.address}
                        </div>
                      )}
                      <div className="flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        <span>Applied {new Date(a.applied_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                  </li>
                ))}

                {filtered.length === 0 && (
                  <li className="py-12 text-center text-muted-foreground">No candidates found.</li>
                )}
              </ul>
            )}
          </ScrollArea>
        </Card>
      </main>
    </div>
  );
}

export default CandidatesTab;
