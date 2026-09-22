import { useMemo, useState } from "react";
import { ClipboardList, Pencil, Plus, Trash2, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/shared/PageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { TableSkeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { usePermissions } from "@/hooks/usePermissions";
import { WorkforceFilters } from "@/components/horilla/workforce/WorkforceFilters";
import { HeadcountPlanDialog } from "@/components/horilla/workforce/HeadcountPlanDialog";
import { HiringRequirementDialog } from "@/components/horilla/workforce/HiringRequirementDialog";
import {
  useDeleteHeadcountPlan,
  useHeadcountPlans,
  useStaffingMatrix,
  useWorkforceLookups,
} from "@/hooks/hrms/useWorkforcePlanning";
import {
  EMPTY_FILTERS,
  PRIORITY_CLASS,
  PRIORITY_LABEL,
  STATUS_CLASS,
  STATUS_LABEL,
  formatIstDate,
  matchesFilters,
  type StaffingDerived,
  type WorkforceFilterState,
} from "@/lib/hrms/workforce";

export default function StaffingPlanPage() {
  const { hasPermission } = usePermissions();
  const canManage = hasPermission("hrms_manage");

  const [filters, setFilters] = useState<WorkforceFilterState>({ ...EMPTY_FILTERS });
  const [planDialog, setPlanDialog] = useState<{ open: boolean; initial?: any }>({
    open: false,
  });
  const [requirementSeed, setRequirementSeed] = useState<any | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StaffingDerived | null>(null);

  const { rows, isLoading } = useStaffingMatrix();
  const { data: lookups } = useWorkforceLookups();
  const { data: plans = [] } = useHeadcountPlans();
  const deletePlan = useDeleteHeadcountPlan();

  const filtered = useMemo(
    () => rows.filter((r) => matchesFilters(r, filters)),
    [rows, filters],
  );

  const planById = useMemo(
    () => new Map(plans.map((p: any) => [p.id, p])),
    [plans],
  );

  const openEdit = (row: StaffingDerived) => {
    const plan = planById.get(row.plan_id);
    setPlanDialog({
      open: true,
      initial: plan
        ? {
            id: plan.id,
            department_id: plan.department_id,
            position_id: plan.position_id,
            shift_id: plan.shift_id,
            shift_label: plan.shift_label,
            employment_type: plan.employment_type,
            approved_hc: plan.approved_hc,
            required_hc: plan.required_hc,
            target_date: plan.target_date,
            priority: plan.priority,
            notes: plan.notes,
          }
        : {
            department_id: row.department_id ?? "",
            position_id: row.position_id ?? "",
          },
    });
  };

  return (
    <div className="space-y-4 p-3 md:p-6">
      <PageHeader
        title="Staffing plan"
        description="Approved, required and actual staffing for every role and shift. On-roll numbers are counted from active employees, so nothing is typed in twice."
        actions={
          canManage && (
            <Button onClick={() => setPlanDialog({ open: true })}>
              <Plus className="h-4 w-4" /> Add staffing line
            </Button>
          )
        }
      />

      <WorkforceFilters
        value={filters}
        onChange={setFilters}
        departments={lookups?.departments || []}
        positions={lookups?.positions || []}
        shifts={lookups?.shifts || []}
      />

      {isLoading ? (
        <TableSkeleton />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title="No staffing lines yet"
          description="Add a line for each role and shift with its approved and required numbers. The rest is calculated for you."
        />
      ) : (
        <>
          {/* Desktop table */}
          <Card className="hidden md:block">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-border bg-muted/40">
                    <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-3 py-2">Department / position</th>
                      <th className="px-3 py-2">Shift</th>
                      <th className="px-3 py-2 text-right">Approved</th>
                      <th className="px-3 py-2 text-right">On roll</th>
                      <th className="px-3 py-2 text-right">Required</th>
                      <th className="px-3 py-2 text-right">Available seats</th>
                      <th className="px-3 py-2 text-right">Vacancy</th>
                      <th className="px-3 py-2 text-right">Gap</th>
                      <th className="px-3 py-2 text-right">Pipeline</th>
                      <th className="px-3 py-2 text-right">Joining</th>
                      <th className="px-3 py-2 text-right">Net need</th>
                      <th className="px-3 py-2 text-right">Open hiring</th>
                      <th className="px-3 py-2 text-right">Uncovered</th>
                      <th className="px-3 py-2">Target</th>
                      <th className="px-3 py-2">Priority</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r) => (
                      <tr key={r.plan_id} className="border-b border-border/60 last:border-0">
                        <td className="px-3 py-2">
                          <p className="font-medium text-foreground">{r.position_title}</p>
                          <p className="text-xs text-muted-foreground">{r.department_name}</p>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{r.shift_name || "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.approved_hc}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.current_hc}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.required_hc}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.availableSeats}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.availableSeats}</td>
                        <td
                          className={
                            r.staffingGap > 0
                              ? "px-3 py-2 text-right font-semibold tabular-nums text-destructive"
                              : r.staffingGap < 0
                                ? "px-3 py-2 text-right font-semibold tabular-nums text-amber-600"
                                : "px-3 py-2 text-right tabular-nums"
                          }
                        >
                          {r.staffingGap}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.pipeline_hc}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {r.pending_joining_hc}
                        </td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums">
                          {r.netHiringRequirement}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.open_requirement_hc}</td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums text-destructive">
                          {r.uncoveredHiringRequirement}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {formatIstDate(r.target_date)}
                        </td>
                        <td className="px-3 py-2">
                          <Badge variant="outline" className={PRIORITY_CLASS[r.priority]}>
                            {PRIORITY_LABEL[r.priority]}
                          </Badge>
                        </td>
                        <td className="px-3 py-2">
                          <Badge variant="outline" className={STATUS_CLASS[r.status]}>
                            {STATUS_LABEL[r.status]}
                          </Badge>
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center justify-end gap-1">
                            {canManage && r.uncoveredHiringRequirement > 0 && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  setRequirementSeed({
                                    department_id: r.department_id!,
                                    position_id: r.position_id!,
                                    shift_id: r.shift_id,
                                    shift_label: r.shift_name,
                                    employment_type: r.employment_type,
                                    number_required: r.uncoveredHiringRequirement,
                                    target_joining_date: r.target_date,
                                    priority: r.priority,
                                  })
                                }
                              >
                                <UserPlus className="h-3.5 w-3.5" /> Hire
                              </Button>
                            )}
                            {canManage && (
                              <>
                                <Button size="icon" variant="ghost" onClick={() => openEdit(r)}>
                                  <Pencil className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="text-destructive"
                                  onClick={() => setDeleteTarget(r)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Mobile cards */}
          <div className="space-y-2 md:hidden">
            {filtered.map((r) => (
              <Card key={r.plan_id}>
                <CardContent className="space-y-2 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground">{r.position_title}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.department_name}
                        {r.shift_name ? ` · ${r.shift_name}` : ""}
                      </p>
                    </div>
                    <Badge variant="outline" className={STATUS_CLASS[r.status]}>
                      {STATUS_LABEL[r.status]}
                    </Badge>
                  </div>
                   <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <p className="text-muted-foreground">Approved</p>
                      <p className="font-semibold text-foreground">{r.approved_hc}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">On roll</p>
                      <p className="font-semibold text-foreground">{r.current_hc}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Required</p>
                      <p className="font-semibold text-foreground">{r.required_hc}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Gap</p>
                      <p className="font-semibold text-foreground">{r.staffingGap}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Pipeline</p>
                      <p className="font-semibold text-foreground">{r.pipeline_hc}</p>
                    </div>
                    <div>
                       <p className="text-muted-foreground">Net need</p>
                      <p className="font-semibold text-foreground">{r.netHiringRequirement}</p>
                    </div>
                     <div>
                       <p className="text-muted-foreground">Open hiring</p>
                       <p className="font-semibold text-foreground">{r.open_requirement_hc}</p>
                     </div>
                     <div>
                       <p className="text-muted-foreground">Uncovered</p>
                       <p className="font-semibold text-destructive">{r.uncoveredHiringRequirement}</p>
                     </div>
                  </div>
                  {canManage && (
                    <div className="flex flex-wrap gap-2">
                       {r.uncoveredHiringRequirement > 0 && (
                        <Button
                          size="sm"
                          onClick={() =>
                            setRequirementSeed({
                              department_id: r.department_id!,
                              position_id: r.position_id!,
                              shift_id: r.shift_id,
                              shift_label: r.shift_name,
                              employment_type: r.employment_type,
                              number_required: r.uncoveredHiringRequirement,
                              target_joining_date: r.target_date,
                              priority: r.priority,
                            })
                          }
                        >
                          <UserPlus className="h-3.5 w-3.5" /> Create requirement
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => openEdit(r)}>
                        <Pencil className="h-3.5 w-3.5" /> Edit
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      <HeadcountPlanDialog
        open={planDialog.open}
        onOpenChange={(open) => setPlanDialog({ open, initial: open ? planDialog.initial : undefined })}
        initial={planDialog.initial}
      />

      <HiringRequirementDialog
        open={!!requirementSeed}
        onOpenChange={(o) => !o && setRequirementSeed(null)}
        initial={requirementSeed ?? undefined}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this staffing line?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.position_title} in {deleteTarget?.department_name} will no longer
              appear in the plan. Employee records are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteTarget) deletePlan.mutate(deleteTarget.plan_id);
                setDeleteTarget(null);
              }}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
