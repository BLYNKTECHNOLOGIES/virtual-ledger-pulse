import { useMemo, useState } from "react";
import { ClipboardList, Plus, Search, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { TableSkeleton } from "@/components/ui/skeleton";
import { usePermissions } from "@/hooks/usePermissions";
import { HiringRequirementDialog } from "@/components/horilla/workforce/HiringRequirementDialog";
import { HiringRequirementDetailDialog } from "@/components/horilla/workforce/HiringRequirementDetailDialog";
import { useHiringRequirements, useSendToRecruitment } from "@/hooks/hrms/useWorkforcePlanning";
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

  const [tab, setTab] = useState<Tab>("open");
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<any | null>(null);

  const { data: requirements = [], isLoading } = useHiringRequirements();
  const sendToRecruitment = useSendToRecruitment();

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
        description="The bridge between planning and recruitment: who we need to hire, how many, for which shift and by when. Approved requirements can be opened as recruitment postings."
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
                        {r.replacement_employee_id && (
                          <Badge variant="outline">Replacement</Badge>
                        )}
                        {r.source === "capacity_occupancy" && (
                          <Badge variant="outline" className="border-primary/30 bg-primary/10 text-primary">
                            Capacity gap
                          </Badge>
                        )}
                      </div>
                      <p className="truncate font-medium text-foreground">
                        {r.positions?.title ?? "Position"} · {r.departments?.name ?? "Department"}
                        {r.shift_label ? ` · ${r.shift_label} shift` : ""}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {needed} required · target {formatIstDate(r.target_joining_date)}
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
                      {canManage && r.status === "approved" && !r.recruitment_id && (
                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            sendToRecruitment.mutate(r.id);
                          }}
                          disabled={sendToRecruitment.isPending}
                        >
                          <Send className="h-3.5 w-3.5" /> Recruit
                        </Button>
                      )}
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
