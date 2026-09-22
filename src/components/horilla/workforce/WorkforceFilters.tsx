import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  EMPLOYMENT_TYPES,
  EMPTY_FILTERS,
  PRIORITIES,
  PRIORITY_LABEL,
  STATUS_LABEL,
  type WorkforceFilterState,
} from "@/lib/hrms/workforce";

interface WorkforceFiltersProps {
  value: WorkforceFilterState;
  onChange: (next: WorkforceFilterState) => void;
  departments: { id: string; name: string }[];
  positions: { id: string; title: string }[];
  shifts: { id: string; name: string }[];
  /** Hide the staffing-status filter on pages where it has no meaning. */
  showStatus?: boolean;
  showPriority?: boolean;
  showDates?: boolean;
}

export function WorkforceFilters({
  value,
  onChange,
  departments,
  positions,
  shifts,
  showStatus = true,
  showPriority = true,
  showDates = true,
}: WorkforceFiltersProps) {
  const set = (patch: Partial<WorkforceFilterState>) =>
    onChange({ ...value, ...patch });

  return (
    <div className="rounded-xl border border-border bg-card p-3 md:p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Department</Label>
          <Select value={value.departmentId} onValueChange={(v) => set({ departmentId: v })}>
            <SelectTrigger className="h-9 text-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All departments</SelectItem>
              {departments.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Position</Label>
          <Select value={value.positionId} onValueChange={(v) => set({ positionId: v })}>
            <SelectTrigger className="h-9 text-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All positions</SelectItem>
              {positions.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Shift</Label>
          <Select value={value.shift} onValueChange={(v) => set({ shift: v })}>
            <SelectTrigger className="h-9 text-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All shifts</SelectItem>
              {shifts.map((s) => (
                <SelectItem key={s.id} value={s.name}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Employment type</Label>
          <Select
            value={value.employmentType}
            onValueChange={(v) => set({ employmentType: v })}
          >
            <SelectTrigger className="h-9 text-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {EMPLOYMENT_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {showStatus && (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Staffing status</Label>
            <Select value={value.status} onValueChange={(v) => set({ status: v })}>
              <SelectTrigger className="h-9 text-foreground">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {Object.entries(STATUS_LABEL).map(([k, label]) => (
                  <SelectItem key={k} value={k}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {showPriority && (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Priority</Label>
            <Select value={value.priority} onValueChange={(v) => set({ priority: v })}>
              <SelectTrigger className="h-9 text-foreground">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All priorities</SelectItem>
                {PRIORITIES.map((p) => (
                  <SelectItem key={p} value={p}>
                    {PRIORITY_LABEL[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {showDates && (
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Target from</Label>
              <Input
                type="date"
                className="h-9 text-foreground"
                value={value.fromDate}
                onChange={(e) => set({ fromDate: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Target to</Label>
              <Input
                type="date"
                className="h-9 text-foreground"
                value={value.toDate}
                onChange={(e) => set({ toDate: e.target.value })}
              />
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 flex justify-end">
        <Button
          variant="outline"
          className="h-8"
          onClick={() => onChange({ ...EMPTY_FILTERS })}
        >
          <RotateCcw className="h-3.5 w-3.5" /> Reset filters
        </Button>
      </div>
    </div>
  );
}
