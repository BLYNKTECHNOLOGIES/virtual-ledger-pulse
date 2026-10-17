import { useEffect, useMemo, useState } from "react";
import { ClipboardList, Plus, Search, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ErrorState } from "@/components/shared/ErrorState";
import { TableSkeleton } from "@/components/ui/skeleton";
import { usePermissions } from "@/hooks/usePermissions";
import { HiringRequirementDialog } from "@/components/horilla/workforce/HiringRequirementDialog";
import { HiringRequirementDetailDialog } from "@/components/horilla/workforce/HiringRequirementDetailDialog";
import { useHeadcountPlans, useHiringRequirements, useStaffingMatrix } from "@/hooks/hrms/useWorkforcePlanning";
import { requirementLineIssues } from "@/hooks/hrms/useWorkforceAlerts";
import { useRequirementJobs, useRequirementPipeline } from "@/hooks/hrms/useRequirementLifecycle";
import { useLinkableJobs } from "@/lib/ats/jobRequirements";
import { JobStatusBadge } from "@/components/ats/AtsBits";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  PRIORITY_CLASS,
  PRIORITY_LABEL,
  REQ_STATUS_CLASS,
  REQ_STATUS_LABEL,
  formatIstDate,
} from "@/lib/hrms/workforce";

type Tab = "open" | "pending" | "active" | "closed" | "all";

const TABS: { value: Tab; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "pending", label: "Awaiting approval" },
  { value: "active", label: "In recruitment" },
  { value: "closed", label: "Closed" },
  { value: "all", label: "All" },
];

function inTab(status: string, tab: Tab) {
  switch (tab) {
    case "open":
      return ["draft", "pending_approval", "approved", "recruitment_active", "partially_fulfilled"].includes(
        status,
      );
    case "pending":
      return status === "pending_approval";
    case "active":
      return ["recruitment_active", "partially_fulfilled"].includes(status);
    case "closed":
      return ["fulfilled", "cancelled", "rejected"].includes(status);
    default:
      return true;
  }
}

export default function HiringRequirementsPage() {
  const { hasPermission } = usePermissions();
  const canManage = hasPermission("hrms_manage");

  const [tab, setTab] = useState<Tab>(() => (new URLSearchParams(window.location.search).get("tab") === "pending" ? "pending" : "open") as Tab);
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<any | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: allForLink } = useHiringRequirements();
  // Deep link from the staffing plan / overview: ?req=<requirement id>
  useEffect(() => {
    const id = searchParams.get("req");
    if (!id || !allForLink) return;
    const found = (allForLink as any[]).find((r) => r.id === id);
    if (found) setDetail(found);
    searchParams.delete("req");
    setSearchParams(searchParams, { replace: true });
  }, [searchParams, allForLink, setSearchParams]);

  const { data: requirements = [], isLoading, isError, error, refetch } = useHiringRequirements();
  const navigate = useNavigate();
  const { data: activePlans = [] } = useHeadcountPlans();
  const lineIssue = useMemo(() => {
    const x = requirementLineIssues(requirements as any[], activePlans as any[]);
    return { unlinked: new Set(x.unlinked.map((r: any) => r.id)), inactive: new Set(x.onInactiveLine.map((r: any) => r.id)) };
  }, [requirements, activePlans]);
  const pipeline = useRequirementPipeline();
  const reqJobs = useRequirementJobs();
  const linkable = useLinkableJobs(requirements.filter((r: any) => ["approved", "recruitment_active", "partially_fulfilled"].includes(r.status)) as any[]);
  const matrix = useStaffingMatrix();
  const lineById = useMemo(() => new Map(matrix.rows.map((l) => [l.plan_id, l])), [matrix.rows]);
  const pendingCount = requirements.filter((r: any) => r.status === "pending_approval").length;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return requirements.filter((r: any) => {
      if (!inTab(r.status, tab)) return false;
      if (!q) return true;
      return [
        r.requirement_no,
        r.positions?.title,
        r.departments?.name,
        r.shift_label,
      ]
        .filter(Boolean)
        .some((v: string) => v.toLowerCase().includes(q));
    });
  }, [requirements, tab, search]);

  return (
    <div className="space-y-4 p-3 md:p-6">
      <PageHeader
        title="Hiring requirements"
        description="The bridge between planning and recruitment: who we need to hire, how many, for which shift and by when. Approved requirements can be opened as ATS jobs."
        actions={
          canManage && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4" /> Create hiring requirement
            </Button>
          )
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
          <TabsList>
            {TABS.map((t) => (
              <TabsTrigger key={t.value} value={t.value}>
                {t.label}
                {t.value === "pending" && pendingCount > 0 && (
                  <Badge variant="secondary" className="ml-1.5 h-5 px-1.5 text-[10px]">{pendingCount}</Badge>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
        <div className="relative sm:w-72">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8 text-foreground"
            placeholder="Search by number, role or department"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {isLoading ? (
        <TableSkeleton />
      ) : isError ? (
        <ErrorState title="Couldn't load hiring requirements" error={error} onRetry={() => refetch()} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No hiring requirements here"
          description="Raise a requirement from the staffing plan, or create one directly when a role opens up."
        />
      ) : (
        <div className="space-y-2">
          {filtered.map((r: any) => {
            const filled = r.positions_filled ?? 0;
            const needed = r.number_required ?? 0;
            const pct = needed > 0 ? Math.min(100, (filled / needed) * 100) : 0;
            const pp = pipeline.data?.get(r.id);
            const line = r.staffing_plan_id ? lineById.get(r.staffing_plan_id) : undefined;
            const jobs = reqJobs.data?.get(r.id) ?? [];
            const job = jobs.find((j: any) => ["open", "paused"].includes(j.status)) ?? jobs[jobs.length - 1];
            const repName = r.replacement ? [r.replacement.first_name, r.replacement.last_name].filter(Boolean).join(" ") : "";
            return (
              <Card
                key={r.id}
                className="cursor-pointer transition-colors hover:border-primary/50"
                onClick={() => setDetail(r)}
              >
                <CardContent className="p-3 md:p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">
                          {r.requirement_no}
                        </span>
                        <Badge variant="outline" className={REQ_STATUS_CLASS[r.status]}>
                          {REQ_STATUS_LABEL[r.status] ?? r.status}
                        </Badge>
                        <Badge variant="outline" className={PRIORITY_CLASS[r.priority]}>
                          {PRIORITY_LABEL[r.priority] ?? r.priority}
                        </Badge>
                        {r.replacement_employee_id || r.source === "employee_separation" ? (
                          <Badge variant="outline">Replacement for {repName || "employee"}</Badge>
                        ) : r.source === "department_request" ? (
                          <Badge variant="outline" className="border-info/30 bg-info/10 text-info">Department request · {r.requested_by_name || "head"}</Badge>
                        ) : r.source === "capacity_occupancy" ? (
                          <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                            Capacity gap
                          </Badge>
                        ) : (
                          <Badge variant="outline">Manual</Badge>
                        )}
                        {job && <JobStatusBadge status={job.status} />}
                        {lineIssue.unlinked.has(r.id) && (
                          <Badge variant="outline" className="border-destructive/40 bg-destructive/10 text-destructive">Not linked to a staffing line</Badge>
                        )}
                        {lineIssue.inactive.has(r.id) && (
                          <Badge variant="outline" className="border-destructive/40 bg-destructive/10 text-destructive">Line removed — move it</Badge>
                        )}
                        {line && line.over_requested_hc > 0 && (
                          <Badge variant="outline" className="border-warning/40 bg-warning/10 text-warning">
                            Line over-requested by {line.over_requested_hc}
                          </Badge>
                        )}
                      </div>
                      <p className="truncate font-medium text-foreground">
                        {r.positions?.title ?? "Position"} · {r.departments?.name ?? "Department"}
                        {line ? ` · ${line.shiftLabel}` : r.shift_label ? ` · ${r.shift_label}` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {needed} requested
                        {line ? ` · line needs ${line.netHiringRequirement} now` : ""}
                        {pp ? ` · ${pp.applied} applications · ${pp.hired} hired · ${pp.joining} joining` : ""}
                        {` · target ${formatIstDate(r.target_joining_date)}`}
                      </p>
                    </div>

                    <div className="flex items-center gap-4 md:w-72">
                      <div className="min-w-0 flex-1">
                        <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                          <span>Filled</span>
                          <span>
                            {filled}/{needed}
                          </span>
                        </div>
                        <Progress value={pct} />
                      </div>
                      {canManage && ["approved", "recruitment_active", "partially_fulfilled"].includes(r.status) && !jobs.some((j: any) => ["open", "paused"].includes(j.status)) && (() => {
                        const lj = linkable.data?.get(r.id) ?? [];
                        return (
                          <div className="flex flex-col gap-1">
                            {lj.map((j) => (
                              <Button key={j.id} size="sm" onClick={(e) => { e.stopPropagation(); navigate(`/hrms/ats/jobs?edit=${j.id}&requirement=${r.id}`); }}>
                                <Send className="h-3.5 w-3.5" /> Link to {j.job_code ?? j.title}
                              </Button>
                            ))}
                            <Button size="sm" variant={lj.length ? "outline" : "default"} onClick={(e) => { e.stopPropagation(); navigate(`/hrms/ats/jobs?new=1&requirement=${r.id}`); }}>
                              <Send className="h-3.5 w-3.5" /> {lj.length ? "Create a new job" : "Create ATS job"}
                            </Button>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <HiringRequirementDialog open={createOpen} onOpenChange={setCreateOpen} />

      <HiringRequirementDetailDialog
        open={!!detail}
        onOpenChange={(o) => !o && setDetail(null)}
        requirement={detail}
        canApprove={canManage}
        canManage={canManage}
      />
    </div>
  );
}
