import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Filter,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  X,
  RotateCcw,
  TrendingUp,
  TrendingDown,
  Sparkles,
  Minus,
  Calendar,
  Users,
  IndianRupee,
} from "lucide-react";
import { INDIAN_STATES_AND_UTS } from "@/data/indianStatesAndUTs";
import { cn } from "@/lib/utils";

export interface ClientFilters {
  // Basic filters (multi-select)
  riskLevels: string[];
  kycStatuses: string[];
  priorities: string[];
  cosmosStatus: 'all' | 'alert' | 'normal';
  states: string[];
  assignedRMs: string[];
  
  // Amount range filters (custom inputs)
  totalValueMin: string;
  totalValueMax: string;
  avgOrderMin: string;
  avgOrderMax: string;
  monthlyUsageMin: string;
  monthlyUsageMax: string;
  
  // Order count range filters
  totalOrdersMin: string;
  totalOrdersMax: string;
  
  // Activity filters
  daysSinceLastOrderMin: string;
  daysSinceLastOrderMax: string;
  clientStatus: string[];
  
  // Volume trend filters
  volumePeriod: '10-day' | 'month';
  volumeTrends: string[];
  volumeChangeMin: string;
  volumeChangeMax: string;
  
  // Client age filter
  clientAgeMin: string;
  clientAgeMax: string;
}

export const defaultFilters: ClientFilters = {
  riskLevels: [],
  kycStatuses: [],
  priorities: [],
  cosmosStatus: 'all',
  states: [],
  assignedRMs: [],
  totalValueMin: '',
  totalValueMax: '',
  avgOrderMin: '',
  avgOrderMax: '',
  monthlyUsageMin: '',
  monthlyUsageMax: '',
  totalOrdersMin: '',
  totalOrdersMax: '',
  daysSinceLastOrderMin: '',
  daysSinceLastOrderMax: '',
  clientStatus: [],
  volumePeriod: '10-day',
  volumeTrends: [],
  volumeChangeMin: '',
  volumeChangeMax: '',
  clientAgeMin: '',
  clientAgeMax: '',
};

interface ClientDirectoryFiltersProps {
  filters: ClientFilters;
  onFiltersChange: (filters: ClientFilters) => void;
  availableRMs: string[];
  clientType: 'buyers' | 'sellers';
}

const RISK_LEVELS = ['PREMIUM', 'ESTABLISHED', 'STANDARD', 'CAUTIOUS', 'HIGH_RISK'];
const RISK_LABELS: Record<string, string> = {
  PREMIUM: 'Premium',
  ESTABLISHED: 'Established',
  STANDARD: 'Standard',
  CAUTIOUS: 'Cautious',
  HIGH_RISK: 'High Risk',
};
const KYC_STATUSES = ['VERIFIED', 'PENDING', 'REJECTED'];
const PRIORITIES = ['Platinum', 'Gold', 'Silver', 'General'];

type ToneKey = 'success' | 'warning' | 'destructive' | 'info' | 'primary' | 'muted';

const CLIENT_STATUS_CHIPS: { value: string; label: string; tone: ToneKey }[] = [
  { value: 'active', label: 'Active · ≤15d', tone: 'success' },
  { value: 'inactive', label: 'Inactive · 15–45d', tone: 'warning' },
  { value: 'dormant', label: 'Dormant · 45d+', tone: 'destructive' },
  { value: 'new', label: 'New · no orders', tone: 'info' },
];

const COSMOS_OPTIONS: { value: 'all' | 'alert' | 'normal'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'alert', label: 'Alert' },
  { value: 'normal', label: 'Normal' },
];

const VOLUME_PERIOD_OPTIONS: { value: '10-day' | 'month'; label: string }[] = [
  { value: '10-day', label: '10-Day Rolling' },
  { value: 'month', label: 'Month-on-Month' },
];

const VOLUME_TREND_CHIPS: {
  value: string;
  label: string;
  icon: typeof TrendingUp;
  tone: ToneKey;
}[] = [
  { value: 'growing', label: 'Growing +10%', icon: TrendingUp, tone: 'success' },
  { value: 'stable', label: 'Stable ±10%', icon: Minus, tone: 'muted' },
  { value: 'declining', label: 'Declining −10 to −30%', icon: TrendingDown, tone: 'warning' },
  { value: 'dropping', label: 'Dropping < −30%', icon: TrendingDown, tone: 'destructive' },
  { value: 'new', label: 'New', icon: Sparkles, tone: 'primary' },
];

// ---- Tone class maps (static so Tailwind keeps them) ----
const toneSelectedClass: Record<ToneKey, string> = {
  success: 'bg-success/10 text-success border-success/30',
  warning: 'bg-warning/10 text-warning border-warning/30',
  destructive: 'bg-destructive/10 text-destructive border-destructive/30',
  info: 'bg-info/10 text-info border-info/30',
  primary: 'bg-primary/10 text-primary border-primary/30',
  muted: 'bg-muted text-foreground border-border',
};

// ============================================================
// MultiSelectFilter
// ============================================================
function MultiSelectFilter({
  label,
  options,
  selected,
  onSelectionChange,
  renderOption,
}: {
  label: string;
  options: { value: string; label: string; icon?: any; color?: string }[];
  selected: string[];
  onSelectionChange: (selected: string[]) => void;
  renderOption?: (option: { value: string; label: string; icon?: any; color?: string }) => React.ReactNode;
}) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);

  const toggleOption = (value: string) => {
    if (selected.includes(value)) {
      onSelectionChange(selected.filter(v => v !== value));
    } else {
      onSelectionChange([...selected, value]);
    }
  };

  const labelFor = (value: string) =>
    options.find(o => o.value === value)?.label ?? value;

  const triggerText = useMemo(() => {
    if (selected.length === 0) return 'All';
    if (selected.length === 1) return labelFor(selected[0]);
    if (selected.length === 2) return `${labelFor(selected[0])}, ${labelFor(selected[1])}`;
    return `${labelFor(selected[0])} +${selected.length - 1}`;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, options]);

  const showSearch = options.length > 8;
  const filteredOptions = useMemo(() => {
    if (!showSearch || !search.trim()) return options;
    const q = search.toLowerCase();
    return options.filter(o => o.label.toLowerCase().includes(q));
  }, [options, search, showSearch]);

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSearch(''); }}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="h-9 w-full justify-between font-normal"
        >
          <span className={cn('truncate', selected.length === 0 && 'text-muted-foreground')}>
            {triggerText}
          </span>
          <ChevronDown className="h-3.5 w-3.5 ml-1 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[240px] p-2" align="start">
        {showSearch && (
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${label.toLowerCase()}...`}
            className="h-8 mb-2 text-sm"
          />
        )}
        <ScrollArea className="max-h-[220px]">
          <div className="space-y-1">
            {filteredOptions.map((option) => (
              <div
                key={option.value}
                className="flex items-center space-x-2 py-1.5 px-2 hover:bg-muted rounded-md cursor-pointer"
                onClick={() => toggleOption(option.value)}
              >
                <Checkbox
                  checked={selected.includes(option.value)}
                  onCheckedChange={() => toggleOption(option.value)}
                  className="pointer-events-none"
                />
                <span className="text-sm flex items-center gap-1.5">
                  {renderOption ? renderOption(option) : (
                    <>
                      {option.icon && <option.icon className={`h-3.5 w-3.5 ${option.color || ''}`} />}
                      {option.label}
                    </>
                  )}
                </span>
              </div>
            ))}
          </div>
        </ScrollArea>
        {selected.length > 0 && (
          <div className="pt-2 border-t mt-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full h-8 text-xs"
              onClick={() => onSelectionChange([])}
            >
              Clear selection
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

// ============================================================
// Segmented control
// ============================================================
function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  activeAccent,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  activeAccent?: Partial<Record<T, string>>;
}) {
  return (
    <div className="inline-flex h-9 items-center rounded-md border border-border bg-muted/40 p-0.5 w-full">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              'flex-1 h-8 px-3 text-xs font-medium rounded-[5px] transition-colors',
              active
                ? cn('bg-background shadow-sm text-foreground', activeAccent?.[opt.value])
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

// ============================================================
// Toggle chip
// ============================================================
function ToggleChip({
  label,
  tone,
  selected,
  onToggle,
  icon: Icon,
}: {
  label: string;
  tone: ToneKey;
  selected: boolean;
  onToggle: () => void;
  icon?: typeof TrendingUp;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onToggle}
      className={cn(
        'inline-flex items-center gap-1.5 h-8 px-3 rounded-full border text-xs font-medium transition-colors',
        selected
          ? toneSelectedClass[tone]
          : 'border-border bg-background text-muted-foreground hover:bg-muted/60 hover:text-foreground'
      )}
    >
      {Icon && <Icon className="h-3.5 w-3.5" />}
      {label}
    </button>
  );
}

// ============================================================
// Range input component
// ============================================================
function RangeFilter({
  label,
  minValue,
  maxValue,
  onMinChange,
  onMaxChange,
  prefix = '',
  suffix = '',
  placeholder = { min: 'Min', max: 'Max' },
}: {
  label: string;
  minValue: string;
  maxValue: string;
  onMinChange: (value: string) => void;
  onMaxChange: (value: string) => void;
  prefix?: string;
  suffix?: string;
  placeholder?: { min: string; max: string };
}) {
  const renderInput = (
    value: string,
    onChange: (v: string) => void,
    ph: string
  ) => (
    <div className="relative flex-1">
      {prefix && (
        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          {prefix}
        </span>
      )}
      <Input
        type="number"
        placeholder={ph}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn('h-9 text-sm tabular-nums', prefix && 'pl-5', suffix && 'pr-6')}
      />
      {suffix && (
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          {suffix}
        </span>
      )}
    </div>
  );

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <div className="flex items-center gap-1.5">
        {renderInput(minValue, onMinChange, placeholder.min)}
        <span className="text-xs text-muted-foreground">–</span>
        {renderInput(maxValue, onMaxChange, placeholder.max)}
      </div>
    </div>
  );
}

// ============================================================
// Labeled field wrapper
// ============================================================
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

// ============================================================
// Section header
// ============================================================
function SectionHeader({
  icon: Icon,
  children,
}: {
  icon: typeof Users;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
      <Icon className="h-3.5 w-3.5" />
      {children}
    </div>
  );
}

// ============================================================
// Active filter count helper (shared with button)
// ============================================================
function computeActiveFilterCount(filters: ClientFilters): number {
  let count = 0;
  if (filters.riskLevels.length > 0) count++;
  if (filters.kycStatuses.length > 0) count++;
  if (filters.priorities.length > 0) count++;
  if (filters.cosmosStatus !== 'all') count++;
  if (filters.states.length > 0) count++;
  if (filters.assignedRMs.length > 0) count++;
  if (filters.totalValueMin || filters.totalValueMax) count++;
  if (filters.avgOrderMin || filters.avgOrderMax) count++;
  if (filters.monthlyUsageMin || filters.monthlyUsageMax) count++;
  if (filters.totalOrdersMin || filters.totalOrdersMax) count++;
  if (filters.daysSinceLastOrderMin || filters.daysSinceLastOrderMax) count++;
  if (filters.clientStatus.length > 0) count++;
  if (filters.volumeTrends.length > 0) count++;
  if (filters.volumeChangeMin || filters.volumeChangeMax) count++;
  if (filters.clientAgeMin || filters.clientAgeMax) count++;
  return count;
}

// ============================================================
// Filter Button Component (for inline placement) — unchanged behaviour
// ============================================================
export function ClientDirectoryFilterButton({
  filters,
  onFiltersChange,
  isOpen,
  onToggle
}: {
  filters: ClientFilters;
  onFiltersChange: (filters: ClientFilters) => void;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const activeFilterCount = useMemo(() => computeActiveFilterCount(filters), [filters]);

  const clearAllFilters = () => {
    onFiltersChange(defaultFilters);
  };

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size="sm"
        className="gap-2"
        onClick={onToggle}
      >
        <Filter className="h-4 w-4" />
        Filters
        {activeFilterCount > 0 && (
          <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">
            {activeFilterCount}
          </Badge>
        )}
        {isOpen ? (
          <ChevronUp className="h-3.5 w-3.5 ml-1" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 ml-1" />
        )}
      </Button>

      {activeFilterCount > 0 && (
        <Button
          variant="ghost"
          size="sm"
          onClick={clearAllFilters}
          className="gap-1.5 text-muted-foreground hover:text-foreground"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Clear
        </Button>
      )}
    </div>
  );
}

// ============================================================
// Filter Content Panel Component
// ============================================================
export function ClientDirectoryFilterPanel({
  filters,
  onFiltersChange,
  availableRMs,
  clientType,
  isOpen
}: ClientDirectoryFiltersProps & { isOpen: boolean }) {
  const updateFilter = <K extends keyof ClientFilters>(key: K, value: ClientFilters[K]) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const toggleInArray = (key: keyof ClientFilters, value: string) => {
    const current = filters[key] as string[];
    const next = current.includes(value)
      ? current.filter(v => v !== value)
      : [...current, value];
    onFiltersChange({ ...filters, [key]: next });
  };

  const rmOptions = useMemo(() =>
    availableRMs.map(rm => ({ value: rm, label: rm })),
    [availableRMs]
  );

  const stateOptions = useMemo(() =>
    INDIAN_STATES_AND_UTS.map(state => ({ value: state, label: state })),
    []
  );

  const activeCount = useMemo(() => computeActiveFilterCount(filters), [filters]);
  const hasActive = activeCount > 0;

  if (!isOpen) return null;

  return (
    <div className="mt-4 rounded-lg border bg-card overflow-hidden">
      {/* ---- Header strip ---- */}
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-foreground">Filters</span>
            {hasActive && (
              <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                {activeCount}
              </Badge>
            )}
          </div>
          {hasActive && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onFiltersChange(defaultFilters)}
              className="gap-1.5 text-muted-foreground hover:text-foreground"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Clear all
            </Button>
          )}
        </div>

        {hasActive && (
          <div className="flex flex-wrap gap-1.5">
            {filters.riskLevels.map(r => (
              <Badge key={r} variant="secondary" className="gap-1 pr-1">
                Risk: {RISK_LABELS[r] ?? r}
                <X
                  className="h-3 w-3 cursor-pointer hover:text-destructive"
                  onClick={() => updateFilter('riskLevels', filters.riskLevels.filter(v => v !== r))}
                />
              </Badge>
            ))}
            {filters.kycStatuses.map(s => (
              <Badge key={s} variant="secondary" className="gap-1 pr-1">
                KYC: {s}
                <X
                  className="h-3 w-3 cursor-pointer hover:text-destructive"
                  onClick={() => updateFilter('kycStatuses', filters.kycStatuses.filter(v => v !== s))}
                />
              </Badge>
            ))}
            {filters.priorities.map(p => (
              <Badge key={p} variant="secondary" className="gap-1 pr-1">
                {p}
                <X
                  className="h-3 w-3 cursor-pointer hover:text-destructive"
                  onClick={() => updateFilter('priorities', filters.priorities.filter(v => v !== p))}
                />
              </Badge>
            ))}
            {filters.cosmosStatus !== 'all' && (
              <Badge variant="secondary" className="gap-1 pr-1">
                COSMOS: {filters.cosmosStatus}
                <X
                  className="h-3 w-3 cursor-pointer hover:text-destructive"
                  onClick={() => updateFilter('cosmosStatus', 'all')}
                />
              </Badge>
            )}
            {filters.states.length > 0 && (
              <Badge variant="secondary" className="gap-1 pr-1">
                States: {filters.states.length}
                <X
                  className="h-3 w-3 cursor-pointer hover:text-destructive"
                  onClick={() => updateFilter('states', [])}
                />
              </Badge>
            )}
            {filters.assignedRMs.length > 0 && (
              <Badge variant="secondary" className="gap-1 pr-1">
                RMs: {filters.assignedRMs.length}
                <X
                  className="h-3 w-3 cursor-pointer hover:text-destructive"
                  onClick={() => updateFilter('assignedRMs', [])}
                />
              </Badge>
            )}
            {(filters.totalValueMin || filters.totalValueMax) && (
              <Badge variant="secondary" className="gap-1 pr-1">
                Value: ₹{filters.totalValueMin || '0'} - ₹{filters.totalValueMax || '∞'}
                <X
                  className="h-3 w-3 cursor-pointer hover:text-destructive"
                  onClick={() => onFiltersChange({ ...filters, totalValueMin: '', totalValueMax: '' })}
                />
              </Badge>
            )}
            {(filters.avgOrderMin || filters.avgOrderMax) && (
              <Badge variant="secondary" className="gap-1 pr-1">
                Avg: ₹{filters.avgOrderMin || '0'} - ₹{filters.avgOrderMax || '∞'}
                <X
                  className="h-3 w-3 cursor-pointer hover:text-destructive"
                  onClick={() => onFiltersChange({ ...filters, avgOrderMin: '', avgOrderMax: '' })}
                />
              </Badge>
            )}
            {(filters.monthlyUsageMin || filters.monthlyUsageMax) && (
              <Badge variant="secondary" className="gap-1 pr-1">
                Usage: {filters.monthlyUsageMin || '0'}% - {filters.monthlyUsageMax || '∞'}%
                <X
                  className="h-3 w-3 cursor-pointer hover:text-destructive"
                  onClick={() => onFiltersChange({ ...filters, monthlyUsageMin: '', monthlyUsageMax: '' })}
                />
              </Badge>
            )}
            {filters.volumeTrends.length > 0 && (
              <Badge variant="secondary" className="gap-1 pr-1">
                Trend: {filters.volumeTrends.length} selected ({filters.volumePeriod})
                <X
                  className="h-3 w-3 cursor-pointer hover:text-destructive"
                  onClick={() => updateFilter('volumeTrends', [])}
                />
              </Badge>
            )}
            {(filters.volumeChangeMin || filters.volumeChangeMax) && (
              <Badge variant="secondary" className="gap-1 pr-1">
                Vol Δ: {filters.volumeChangeMin || '-∞'}% - {filters.volumeChangeMax || '+∞'}%
                <X
                  className="h-3 w-3 cursor-pointer hover:text-destructive"
                  onClick={() => onFiltersChange({ ...filters, volumeChangeMin: '', volumeChangeMax: '' })}
                />
              </Badge>
            )}
            {(filters.totalOrdersMin || filters.totalOrdersMax) && (
              <Badge variant="secondary" className="gap-1 pr-1">
                Orders: {filters.totalOrdersMin || '0'} - {filters.totalOrdersMax || '∞'}
                <X
                  className="h-3 w-3 cursor-pointer hover:text-destructive"
                  onClick={() => onFiltersChange({ ...filters, totalOrdersMin: '', totalOrdersMax: '' })}
                />
              </Badge>
            )}
            {(filters.daysSinceLastOrderMin || filters.daysSinceLastOrderMax) && (
              <Badge variant="secondary" className="gap-1 pr-1">
                Last Order: {filters.daysSinceLastOrderMin || '0'} - {filters.daysSinceLastOrderMax || '∞'} days
                <X
                  className="h-3 w-3 cursor-pointer hover:text-destructive"
                  onClick={() => onFiltersChange({ ...filters, daysSinceLastOrderMin: '', daysSinceLastOrderMax: '' })}
                />
              </Badge>
            )}
            {(filters.clientAgeMin || filters.clientAgeMax) && (
              <Badge variant="secondary" className="gap-1 pr-1">
                Client Age: {filters.clientAgeMin || '0'} - {filters.clientAgeMax || '∞'} days
                <X
                  className="h-3 w-3 cursor-pointer hover:text-destructive"
                  onClick={() => onFiltersChange({ ...filters, clientAgeMin: '', clientAgeMax: '' })}
                />
              </Badge>
            )}
            {filters.clientStatus.map(s => (
              <Badge key={s} variant="secondary" className="gap-1 pr-1">
                Status: {s}
                <X
                  className="h-3 w-3 cursor-pointer hover:text-destructive"
                  onClick={() => updateFilter('clientStatus', filters.clientStatus.filter(v => v !== s))}
                />
              </Badge>
            ))}
          </div>
        )}
      </div>

      {/* ---- Section 1: Client Profile ---- */}
      <div className="border-t border-border p-4 space-y-3">
        <SectionHeader icon={Users}>Client Profile</SectionHeader>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <Field label="Risk Level">
            <MultiSelectFilter
              label="Risk Level"
              options={RISK_LEVELS.map(r => ({ value: r, label: RISK_LABELS[r] ?? r }))}
              selected={filters.riskLevels}
              onSelectionChange={(v) => updateFilter('riskLevels', v)}
            />
          </Field>
          <Field label="KYC Status">
            <MultiSelectFilter
              label="KYC Status"
              options={KYC_STATUSES.map(s => ({ value: s, label: s }))}
              selected={filters.kycStatuses}
              onSelectionChange={(v) => updateFilter('kycStatuses', v)}
            />
          </Field>
          <Field label="Priority">
            <MultiSelectFilter
              label="Priority"
              options={PRIORITIES.map(p => ({ value: p, label: p }))}
              selected={filters.priorities}
              onSelectionChange={(v) => updateFilter('priorities', v)}
            />
          </Field>
          <Field label="COSMOS">
            <SegmentedControl
              options={COSMOS_OPTIONS}
              value={filters.cosmosStatus}
              onChange={(v) => updateFilter('cosmosStatus', v)}
              activeAccent={{ alert: 'text-destructive', normal: 'text-success' }}
            />
          </Field>
          <Field label="State">
            <MultiSelectFilter
              label="State"
              options={stateOptions}
              selected={filters.states}
              onSelectionChange={(v) => updateFilter('states', v)}
            />
          </Field>
          <Field label="Assigned RM">
            <MultiSelectFilter
              label="Assigned RM"
              options={rmOptions}
              selected={filters.assignedRMs}
              onSelectionChange={(v) => updateFilter('assignedRMs', v)}
            />
          </Field>
        </div>
      </div>

      {/* ---- Section 2: Activity ---- */}
      <div className="border-t border-border p-4 space-y-3">
        <SectionHeader icon={Calendar}>Activity</SectionHeader>
        <div className="flex flex-wrap gap-2">
          {CLIENT_STATUS_CHIPS.map(chip => (
            <ToggleChip
              key={chip.value}
              label={chip.label}
              tone={chip.tone}
              selected={filters.clientStatus.includes(chip.value)}
              onToggle={() => toggleInArray('clientStatus', chip.value)}
            />
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <RangeFilter
            label="Total Orders"
            minValue={filters.totalOrdersMin}
            maxValue={filters.totalOrdersMax}
            onMinChange={(v) => updateFilter('totalOrdersMin', v)}
            onMaxChange={(v) => updateFilter('totalOrdersMax', v)}
          />
          <RangeFilter
            label="Days Since Last Order"
            minValue={filters.daysSinceLastOrderMin}
            maxValue={filters.daysSinceLastOrderMax}
            onMinChange={(v) => updateFilter('daysSinceLastOrderMin', v)}
            onMaxChange={(v) => updateFilter('daysSinceLastOrderMax', v)}
            suffix="d"
          />
          <RangeFilter
            label="Days Since Onboarding"
            minValue={filters.clientAgeMin}
            maxValue={filters.clientAgeMax}
            onMinChange={(v) => updateFilter('clientAgeMin', v)}
            onMaxChange={(v) => updateFilter('clientAgeMax', v)}
            suffix="d"
          />
        </div>
      </div>

      {/* ---- Section 3: Volume Trend ---- */}
      <div className="border-t border-border p-4 space-y-3">
        <SectionHeader icon={TrendingUp}>Volume Trend</SectionHeader>
        <p className="text-xs text-muted-foreground">
          Compares recent volume against the prior period for the selected window.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Comparison Period">
            <div className="w-[280px] max-w-full">
              <SegmentedControl
                options={VOLUME_PERIOD_OPTIONS}
                value={filters.volumePeriod}
                onChange={(v) => updateFilter('volumePeriod', v)}
              />
            </div>
          </Field>
          <div className="w-[260px] max-w-full">
            <RangeFilter
              label="Volume Change (%)"
              minValue={filters.volumeChangeMin}
              maxValue={filters.volumeChangeMax}
              onMinChange={(v) => updateFilter('volumeChangeMin', v)}
              onMaxChange={(v) => updateFilter('volumeChangeMax', v)}
              suffix="%"
              placeholder={{ min: '-100', max: '+∞' }}
            />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {VOLUME_TREND_CHIPS.map(chip => (
            <ToggleChip
              key={chip.value}
              label={chip.label}
              tone={chip.tone}
              icon={chip.icon}
              selected={filters.volumeTrends.includes(chip.value)}
              onToggle={() => toggleInArray('volumeTrends', chip.value)}
            />
          ))}
        </div>
      </div>

      {/* ---- Section 4: Transaction Value ---- */}
      <div className="border-t border-border p-4 space-y-3">
        <SectionHeader icon={IndianRupee}>Transaction Value</SectionHeader>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <RangeFilter
            label="Total Transaction Value"
            minValue={filters.totalValueMin}
            maxValue={filters.totalValueMax}
            onMinChange={(v) => updateFilter('totalValueMin', v)}
            onMaxChange={(v) => updateFilter('totalValueMax', v)}
            prefix="₹"
          />
          <RangeFilter
            label="Average Order Value"
            minValue={filters.avgOrderMin}
            maxValue={filters.avgOrderMax}
            onMinChange={(v) => updateFilter('avgOrderMin', v)}
            onMaxChange={(v) => updateFilter('avgOrderMax', v)}
            prefix="₹"
          />
          <RangeFilter
            label="Monthly Limit Usage"
            minValue={filters.monthlyUsageMin}
            maxValue={filters.monthlyUsageMax}
            onMinChange={(v) => updateFilter('monthlyUsageMin', v)}
            onMaxChange={(v) => updateFilter('monthlyUsageMax', v)}
            suffix="%"
          />
        </div>
      </div>
    </div>
  );
}

// Legacy component for backwards compatibility (combines both)
export function ClientDirectoryFilters({
  filters,
  onFiltersChange,
  availableRMs,
  clientType
}: ClientDirectoryFiltersProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="w-full space-y-0">
      <ClientDirectoryFilterButton
        filters={filters}
        onFiltersChange={onFiltersChange}
        isOpen={isOpen}
        onToggle={() => setIsOpen(!isOpen)}
      />
      <ClientDirectoryFilterPanel
        filters={filters}
        onFiltersChange={onFiltersChange}
        availableRMs={availableRMs}
        clientType={clientType}
        isOpen={isOpen}
      />
    </div>
  );
}
