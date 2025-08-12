import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { MessageSquare, Flame, Lock, ArrowRight, MapPin, Briefcase, IndianRupee, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface JobPosting {
  id: string;
  title: string;
  department: string;
  job_type: string;
  location: string | null;
  status: string;
  salary_range_min: number | null;
  salary_range_max: number | null;
  experience_required: string | null;
  qualifications: string | null;
  created_at: string;
}

export function ActiveJobPostings() {
  const { toast } = useToast();

  // Fetch active job postings
  const { data: jobs, isLoading: jobsLoading } = useQuery<JobPosting[]>({
    queryKey: ["active_job_postings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("job_postings")
        .select("*")
        .eq("status", "OPEN")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as JobPosting[];
    },
  });

  // Fetch applicants for these jobs (for counts)
  const jobIds = useMemo(() => (jobs ?? []).map((j) => j.id), [jobs]);

  const { data: applicantsByJob, isLoading: applicantsLoading } = useQuery({
    queryKey: ["applicants_counts", jobIds],
    enabled: jobIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("job_applicants")
        .select("id, job_posting_id, is_interested, stage, status")
        .in("job_posting_id", jobIds);
      if (error) throw error;
      const grouped = new Map<string, { responses: number; hotLeads: number }>();
      data?.forEach((a) => {
        const current = grouped.get(a.job_posting_id) || { responses: 0, hotLeads: 0 };
        current.responses += 1;
        const stageStr = String(a.stage || "").toUpperCase();
        const statusStr = String(a.status || "").toUpperCase();
        if (a.is_interested || stageStr.includes("INTERVIEW") || stageStr.includes("SHORTLIST") || statusStr === "SELECTED") {
          current.hotLeads += 1;
        }
        grouped.set(a.job_posting_id, current);
      });
      return grouped;
    },
  });

  // Fetch total available candidates in DB (for the right-most metric)
  const { data: totalCandidates, isLoading: totalCandidatesLoading } = useQuery({
    queryKey: ["total_candidates_db"],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("job_applicants")
        .select("id", { count: "exact", head: true });
      if (error) throw error;
      return count ?? 0;
    },
  });

  const loading = jobsLoading || applicantsLoading || totalCandidatesLoading;

  const onSoon = (label: string) =>
    toast({ title: label, description: "This action will be available soon." });

  const formatSalary = (min?: number | null, max?: number | null) => {
    if (!min && !max) return "Not specified";
    const fmt = (v: number) => new Intl.NumberFormat("en-IN").format(v);
    if (min && max) return `₹${fmt(min)} - ₹${fmt(max)} per month`;
    if (min) return `From ₹${fmt(min)} per month`;
    if (max) return `Up to ₹${fmt(max)} per month`;
    return "Not specified";
  };

  return (
    <section aria-labelledby="active-jobs-title" className="space-y-4">
      <header className="flex items-center justify-between">
        <h2 id="active-jobs-title" className="text-xl font-semibold text-slate-800">Active Job Postings</h2>
      </header>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-2">
          {[1, 2].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-6 w-48 bg-gray-200 rounded" />
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="h-4 w-80 bg-gray-200 rounded" />
                <div className="h-4 w-64 bg-gray-200 rounded" />
                <div className="grid grid-cols-3 gap-3">
                  {[0, 1, 2].map((k) => (
                    <div key={k} className="h-16 bg-gray-100 rounded" />
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {jobs?.map((job) => {
            const counts = applicantsByJob?.get(job.id) || { responses: 0, hotLeads: 0 };
            return (
              <article key={job.id} className="relative">
                <Card className="overflow-hidden">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-lg text-slate-800 flex items-center gap-2">
                          {job.title}
                          <Badge className="bg-green-100 text-green-800">Active</Badge>
                        </CardTitle>
                        <div className="mt-1 text-sm text-slate-600 flex flex-wrap items-center gap-3">
                          {job.department && (
                            <span className="inline-flex items-center gap-1"><Briefcase className="h-4 w-4" />{job.department}</span>
                          )}
                          {job.location && (
                            <span className="inline-flex items-center gap-1"><MapPin className="h-4 w-4" />{job.location}</span>
                          )}
                          {job.job_type && (
                            <span className="inline-flex items-center gap-1"><Clock className="h-4 w-4" />{job.job_type}</span>
                          )}
                        </div>
                      </div>
                      <Button variant="ghost" size="sm" onClick={() => onSoon("Edit Job")}>Edit Job</Button>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-4">
                    <div className="text-sm text-slate-600 flex flex-wrap items-center gap-3">
                      {job.experience_required && <span>{job.experience_required}</span>}
                      {job.qualifications && <span>• {job.qualifications}</span>}
                      <span className="inline-flex items-center gap-1">
                        • <IndianRupee className="h-4 w-4" /> {formatSalary(job.salary_range_min, job.salary_range_max)}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div className="rounded-lg border bg-white p-4 shadow-sm">
                        <div className="flex items-center justify-between text-slate-700">
                          <div className="flex items-center gap-2 font-medium">
                            <MessageSquare className="h-4 w-4" /> {counts.responses} Responses
                          </div>
                          <ArrowRight className="h-4 w-4" />
                        </div>
                        <p className="mt-1 text-xs text-slate-500">From candidates</p>
                      </div>

                      <div className="rounded-lg border bg-white p-4 shadow-sm">
                        <div className="flex items-center justify-between text-slate-700">
                          <div className="flex items-center gap-2 font-medium">
                            <Flame className="h-4 w-4 text-orange-500" /> {counts.hotLeads} Hot Leads
                          </div>
                          <ArrowRight className="h-4 w-4" />
                        </div>
                        <p className="mt-1 text-xs text-slate-500">Match your job post</p>
                      </div>

                      <div className="rounded-lg border bg-white p-4 shadow-sm">
                        <div className="flex items-center justify-between text-slate-700">
                          <div className="flex items-center gap-2 font-medium">
                            <Lock className="h-4 w-4" /> {totalCandidates ?? 0} Candidates
                          </div>
                          <ArrowRight className="h-4 w-4" />
                        </div>
                        <p className="mt-1 text-xs text-slate-500">Available in database</p>
                      </div>
                    </div>

                    <Separator className="my-1" />

                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>
                        Posted on: {new Date(job.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "2-digit" })}
                      </span>
                      <Button variant="outline" size="sm" className="h-7" onClick={() => onSoon("Add more job details")}>
                        Add more job details
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </article>
            );
          })}

          {(!jobs || jobs.length === 0) && (
            <Card>
              <CardContent className="py-10 text-center text-slate-500">
                No active job postings. Create your first job to get started.
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </section>
  );
}
