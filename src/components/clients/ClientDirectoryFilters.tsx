import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Filter, ChevronDown, ChevronUp, X, RotateCcw } from "lucide-react";
import { INDIAN_STATES_AND_UTS } from "@/data/indianStatesAndUTs";

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
};

interface ClientDirectoryFiltersProps {
  filters: ClientFilters;
  onFiltersChange: (filters: ClientFilters) => void;
  availableRMs: string[];
  clientType: 'buyers' | 'sellers';
}

const RISK_LEVELS = ['HIGH', 'MEDIUM', 'LOW', 'NO_RISK'];
const KYC_STATUSES = ['VERIFIED', 'PENDING', 'REJECTED'];
const PRIORITIES = ['Platinum', 'Gold', 'Silver', 'General'];
const CLIENT_STATUSES = [
  { value: 'active', label: 'Active (≤15 days)' },
  { value: 'inactive', label: 'Inactive (15-45 days)' },
  { value: 'dormant', label: 'Dormant (45+ days)' },
  { value: 'new', label: 'New (No orders)' },
];
const COSMOS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'alert', label: 'Alert' },
  { value: 'normal', label: 'Normal' },
];

// Multi-select dropdown component
function MultiSelectFilter({
  label,
  options,
  selected,
  onSelectionChange,
  renderOption,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: string[];
  onSelectionChange: (selected: string[]) => void;
  renderOption?: (option: { value: string; label: string }) => React.ReactNode;
}) {
  const toggleOption = (value: string) => {
    if (selected.includes(value)) {
      onSelectionChange(selected.filter(v => v !== value));
    } else {
      onSelectionChange([...selected, value]);
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button 
          variant="outline" 
          size="sm" 
          className="h-9 justify-between min-w-[140px] max-w-[200px]"
        >
          <span className="truncate">
            {selected.length > 0 ? `${selected.length} selected` : label}
          </span>
          <ChevronDown className="h-3.5 w-3.5 ml-1 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[220px] p-2" align="start">
        <ScrollArea className="h-[200px]">
          <div className="space-y-1">
            {options.map((option) => (
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
                <span className="text-sm">
                  {renderOption ? renderOption(option) : option.label}
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

// Range input component
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
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      <div className="flex items-center gap-1.5">
        <div className="relative flex-1">
          {prefix && (
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              {prefix}
            </span>
          )}
          <Input
            type="number"
            placeholder={placeholder.min}
            value={minValue}
            onChange={(e) => onMinChange(e.target.value)}
            className={`h-8 text-sm ${prefix ? 'pl-5' : ''} ${suffix ? 'pr-6' : ''}`}
          />
          {suffix && (
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              {suffix}
            </span>
          )}
        </div>
        <span className="text-xs text-muted-foreground">to</span>
        <div className="relative flex-1">
          {prefix && (
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              {prefix}
            </span>
          )}
          <Input
            type="number"
            placeholder={placeholder.max}
            value={maxValue}
            onChange={(e) => onMaxChange(e.target.value)}
            className={`h-8 text-sm ${prefix ? 'pl-5' : ''} ${suffix ? 'pr-6' : ''}`}
          />
          {suffix && (
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
              {suffix}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function ClientDirectoryFilters({ 
  filters, 
  onFiltersChange, 
  availableRMs,
  clientType 
}: ClientDirectoryFiltersProps) {
  const [isOpen, setIsOpen] = useState(false);

  const activeFilterCount = useMemo(() => {
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
    return count;
  }, [filters]);

  const updateFilter = <K extends keyof ClientFilters>(key: K, value: ClientFilters[K]) => {
    onFiltersChange({ ...filters, [key]: value });
  };

  const clearAllFilters = () => {
    onFiltersChange(defaultFilters);
  };

  const rmOptions = useMemo(() => 
    availableRMs.map(rm => ({ value: rm, label: rm })),
    [availableRMs]
  );

  const stateOptions = useMemo(() => 
    INDIAN_STATES_AND_UTS.map(state => ({ value: state, label: state })),
    []
  );

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="w-full">
      <div className="flex items-center justify-between">
        <CollapsibleTrigger asChild>
          <Button 
            variant="outline" 
            size="sm" 
            className="gap-2"
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
        </CollapsibleTrigger>
        
        {activeFilterCount > 0 && (
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={clearAllFilters}
            className="gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Clear all
          </Button>
        )}
      </div>

      <CollapsibleContent className="mt-4">
        <div className="rounded-lg border bg-card p-4 space-y-5">
          {/* Section 1: Basic Filters */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Basic Filters
            </h4>
            <div className="flex flex-wrap gap-2">
              <MultiSelectFilter
                label="Risk Level"
                options={RISK_LEVELS.map(r => ({ value: r, label: r.replace('_', ' ') }))}
                selected={filters.riskLevels}
                onSelectionChange={(v) => updateFilter('riskLevels', v)}
              />
              <MultiSelectFilter
                label="KYC Status"
                options={KYC_STATUSES.map(s => ({ value: s, label: s }))}
                selected={filters.kycStatuses}
                onSelectionChange={(v) => updateFilter('kycStatuses', v)}
              />
              <MultiSelectFilter
                label="Priority"
                options={PRIORITIES.map(p => ({ value: p, label: p }))}
                selected={filters.priorities}
                onSelectionChange={(v) => updateFilter('priorities', v)}
              />
              <Popover>
                <PopoverTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="h-9 justify-between min-w-[120px]"
                  >
                    <span>
                      COSMOS: {filters.cosmosStatus === 'all' ? 'All' : 
                               filters.cosmosStatus === 'alert' ? 'Alert' : 'Normal'}
                    </span>
                    <ChevronDown className="h-3.5 w-3.5 ml-1 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[140px] p-2" align="start">
                  <div className="space-y-1">
                    {COSMOS_OPTIONS.map((option) => (
                      <div 
                        key={option.value} 
                        className={`flex items-center py-1.5 px-2 rounded-md cursor-pointer ${
                          filters.cosmosStatus === option.value 
                            ? 'bg-primary/10 text-primary' 
                            : 'hover:bg-muted'
                        }`}
                        onClick={() => updateFilter('cosmosStatus', option.value as 'all' | 'alert' | 'normal')}
                      >
                        <span className="text-sm">{option.label}</span>
                      </div>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
              <MultiSelectFilter
                label="State"
                options={stateOptions}
                selected={filters.states}
                onSelectionChange={(v) => updateFilter('states', v)}
              />
              <MultiSelectFilter
                label="Assigned RM"
                options={rmOptions}
                selected={filters.assignedRMs}
                onSelectionChange={(v) => updateFilter('assignedRMs', v)}
              />
            </div>
          </div>

          {/* Section 2: Transaction Filters */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Transaction Filters
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <RangeFilter
                label="Total Transaction Value (₹)"
                minValue={filters.totalValueMin}
                maxValue={filters.totalValueMax}
                onMinChange={(v) => updateFilter('totalValueMin', v)}
                onMaxChange={(v) => updateFilter('totalValueMax', v)}
                prefix="₹"
              />
              <RangeFilter
                label="Average Order Value (₹)"
                minValue={filters.avgOrderMin}
                maxValue={filters.avgOrderMax}
                onMinChange={(v) => updateFilter('avgOrderMin', v)}
                onMaxChange={(v) => updateFilter('avgOrderMax', v)}
                prefix="₹"
              />
              <RangeFilter
                label="Monthly Usage (%)"
                minValue={filters.monthlyUsageMin}
                maxValue={filters.monthlyUsageMax}
                onMinChange={(v) => updateFilter('monthlyUsageMin', v)}
                onMaxChange={(v) => updateFilter('monthlyUsageMax', v)}
                suffix="%"
              />
            </div>
          </div>

          {/* Section 3: Activity Filters */}
          <div className="space-y-3">
            <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Activity & Re-Targeting
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                suffix="days"
              />
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Client Status</label>
                <MultiSelectFilter
                  label="Select status"
                  options={CLIENT_STATUSES}
                  selected={filters.clientStatus}
                  onSelectionChange={(v) => updateFilter('clientStatus', v)}
                />
              </div>
            </div>
          </div>

          {/* Active Filters Summary */}
          {activeFilterCount > 0 && (
            <div className="pt-3 border-t">
              <div className="flex flex-wrap gap-1.5">
                {filters.riskLevels.map(r => (
                  <Badge key={r} variant="secondary" className="gap-1 pr-1">
                    Risk: {r.replace('_', ' ')}
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
                      onClick={() => {
                        updateFilter('totalValueMin', '');
                        updateFilter('totalValueMax', '');
                      }}
                    />
                  </Badge>
                )}
                {(filters.avgOrderMin || filters.avgOrderMax) && (
                  <Badge variant="secondary" className="gap-1 pr-1">
                    Avg: ₹{filters.avgOrderMin || '0'} - ₹{filters.avgOrderMax || '∞'}
                    <X 
                      className="h-3 w-3 cursor-pointer hover:text-destructive" 
                      onClick={() => {
                        updateFilter('avgOrderMin', '');
                        updateFilter('avgOrderMax', '');
                      }}
                    />
                  </Badge>
                )}
                {(filters.monthlyUsageMin || filters.monthlyUsageMax) && (
                  <Badge variant="secondary" className="gap-1 pr-1">
                    Usage: {filters.monthlyUsageMin || '0'}% - {filters.monthlyUsageMax || '∞'}%
                    <X 
                      className="h-3 w-3 cursor-pointer hover:text-destructive" 
                      onClick={() => {
                        updateFilter('monthlyUsageMin', '');
                        updateFilter('monthlyUsageMax', '');
                      }}
                    />
                  </Badge>
                )}
                {(filters.totalOrdersMin || filters.totalOrdersMax) && (
                  <Badge variant="secondary" className="gap-1 pr-1">
                    Orders: {filters.totalOrdersMin || '0'} - {filters.totalOrdersMax || '∞'}
                    <X 
                      className="h-3 w-3 cursor-pointer hover:text-destructive" 
                      onClick={() => {
                        updateFilter('totalOrdersMin', '');
                        updateFilter('totalOrdersMax', '');
                      }}
                    />
                  </Badge>
                )}
                {(filters.daysSinceLastOrderMin || filters.daysSinceLastOrderMax) && (
                  <Badge variant="secondary" className="gap-1 pr-1">
                    Last Order: {filters.daysSinceLastOrderMin || '0'} - {filters.daysSinceLastOrderMax || '∞'} days
                    <X 
                      className="h-3 w-3 cursor-pointer hover:text-destructive" 
                      onClick={() => {
                        updateFilter('daysSinceLastOrderMin', '');
                        updateFilter('daysSinceLastOrderMax', '');
                      }}
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
            </div>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
