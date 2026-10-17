import { SlidersHorizontal, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FilterChip } from "@/components/ui/filter-chip";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  EMPLOYMENT_TYPE_OPTIONS,
  EMPTY_FILTERS,
  PRIORITIES,
  PRIORITY_LABEL,
  QUICK_RANGES,
  STATUS_FILTER_OPTIONS,
  formatIstDate,
  quickRange,
  type WorkforceFilterState,
} from "@/lib/hrms/workforce";
import { cn } from "@/lib/utils";

interface WorkforceFiltersProps {
  value: WorkforceFilterState;
  onChange: (next: WorkforceFilterState) => void;
  departments: { id: string; name: string }[];
  /** Roles; those outside workforce planning are left out, and a chosen department narrows the list. */
  positions: { id: string; title: string; department_id?: string | null; in_workforce_planning?: boolean | null }[];
  /** Pass planning shifts only (shifts that count as themselves, no training shifts). */
  shifts: { id: string; name: string }[];
  /** Hide the staffing-status filter on pages where it has no meaning. */
  showStatus?: boolean;
  showPriority?: boolean;
  showDates?: boolean;
  /** Hide the employment-type filter where it has nothing to filter. */
  showEmploymentType?: boolean;
  className?: string;
}

/** One compact filter row shared by the Workforce pages: department, role, shift, and "More" for the rest. */
export function WorkforceFilters({
  value, onChange, departments, positions, shifts,
  showStatus = true, showPriority = true, showDates = true, showEmploymentType = true, className,
}: WorkforceFiltersProps) {
  const set = (patch: Partial<WorkforceFilterState>) => onChange({ ...value, ...patch });
  const roles = positions
    .filter((p) => p.in_workforce_planning !== false)
    .filter((p) => value.departmentId === "all" || !p.department_id || p.department_id === value.departmentId);
  const hasMore = showStatus || showPriority || showDates || showEmploymentType;

  const chips: { key: string; label: string; text: string; clear: Partial<WorkforceFilterState> }[] = [];
  if (showEmploymentType && value.employmentType !== "all")
    chips.push({ key: "type", label: "Type", text: EMPLOYMENT_TYPE_OPTIONS.find((o) => o.value === value.employmentType)?.label ?? value.employmentType, clear: { employmentType: "all" } });
  if (showStatus && value.status !== "all")
    chips.push({ key: "status", label: "Staffing", text: STATUS_FILTER_OPTIONS.find((o) => o.value === value.status)?.label ?? value.status, clear: { status: "all" } });
  if (showPriority && value.priority !== "all")
    chips.push({ key: "priority", label: "Priority", text: PRIORITY_LABEL[value.priority] ?? value.priority, clear: { priority: "all" } });
  if (showDates && (value.fromDate || value.toDate))
    chips.push({
      key: "dates", label: "Target",
      text: `${value.fromDate ? formatIstDate(value.fromDate) : "any"} – ${value.toDate ? formatIstDate(value.toDate) : "any"}`,
      clear: { fromDate: "", toDate: "" },
    });
  const anyActive = value.departmentId !== "all" || value.positionId !== "all" || value.shift !== "all" || chips.length > 0;

  return (
    <div className={cn("space-y-2", className)}>
      <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-2 sm:flex sm:flex-wrap sm:items-center">
        <Select value={value.departmentId} onValueChange={(v) => {
          // Keep the chosen role when it belongs to the new department.
          const role = positions.find((p) => p.id === value.positionId);
          const keep = value.positionId === "all" || v === "all" || !role?.department_id || role.department_id === v;
          set({ departmentId: v, positionId: keep ? value.positionId : "all" });
        }}>
          <SelectTrigger aria-label="Department" className={cn("h-9 text-foreground sm:w-52", value.departmentId !== "all" && "border-primary/50")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All departments</SelectItem>
            {departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={value.positionId} onValueChange={(v) => set({ positionId: v })}>
          <SelectTrigger aria-label="Role" className={cn("h-9 text-foreground sm:w-56", value.positionId !== "all" && "border-primary/50")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All designations</SelectItem>
            {roles.map((p) => <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}
            {value.positionId !== "all" && !roles.some((p) => p.id === value.positionId) && (
              <SelectItem value={value.positionId}>{positions.find((p) => p.id === value.positionId)?.title ?? "Selected designation"}</SelectItem>
            )}
          </SelectContent>
        </Select>

        <Select value={value.shift} onValueChange={(v) => set({ shift: v })}>
          <SelectTrigger aria-label="Shift" className={cn("h-9 text-foreground sm:w-44", value.shift !== "all" && "border-primary/50")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All shifts</SelectItem>
            {shifts.map((s) => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2">
          {hasMore && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="h-9 flex-1 gap-1.5 text-foreground sm:flex-none">
                  <SlidersHorizontal className="h-4 w-4" /> More
                  {chips.length > 0 && <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">{chips.length}</Badge>}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[min(20rem,calc(100vw-2rem))] space-y-3">
                {showEmploymentType && (
                  <Field label="Employment type">
                    <Select value={value.employmentType} onValueChange={(v) => set({ employmentType: v })}>
                      <SelectTrigger className="h-9 text-foreground"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All types</SelectItem>
                        {EMPLOYMENT_TYPE_OPTIONS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
                {showStatus && (
                  <Field label="Staffing">
                    <Select value={value.status} onValueChange={(v) => set({ status: v })}>
                      <SelectTrigger className="h-9 text-foreground"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Short, met and over</SelectItem>
                        {STATUS_FILTER_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
                {showPriority && (
                  <Field label="Priority">
                    <Select value={value.priority} onValueChange={(v) => set({ priority: v })}>
                      <SelectTrigger className="h-9 text-foreground"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All priorities</SelectItem>
                        {PRIORITIES.map((p) => <SelectItem key={p} value={p}>{PRIORITY_LABEL[p]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                )}
                {showDates && (
                  <Field label="Target joining date">
                    <div className="grid grid-cols-2 gap-2">
                      <Input type="date" aria-label="From" className="h-9 text-foreground" value={value.fromDate}
                        onChange={(e) => set({ fromDate: e.target.value })} />
                      <Input type="date" aria-label="To" className="h-9 text-foreground" value={value.toDate}
                        min={value.fromDate || undefined} onChange={(e) => set({ toDate: e.target.value })} />
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {QUICK_RANGES.map((r) => (
                        <Button key={r.value} type="button" variant="outline" size="sm" className="h-7 px-2 text-xs"
                          onClick={() => set(quickRange(r.value))}>{r.label}</Button>
                      ))}
                    </div>
                  </Field>
                )}
              </PopoverContent>
            </Popover>
          )}
          {anyActive && (
            <Button variant="ghost" className="h-9 shrink-0 px-2.5 text-muted-foreground" onClick={() => onChange({ ...EMPTY_FILTERS })}>
              <X className="h-4 w-4" /> Clear
            </Button>
          )}
        </div>
      </div>
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {chips.map((c) => <FilterChip key={c.key} label={`${c.label}:`} value={c.text} onRemove={() => set(c.clear)} />)}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
