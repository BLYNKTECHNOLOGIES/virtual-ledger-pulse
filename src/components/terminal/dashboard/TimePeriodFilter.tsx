import { useState } from 'react';
import { format } from 'date-fns';
import { CalendarIcon, CalendarRange } from 'lucide-react';
import { DateRange } from 'react-day-picker';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

// ─── Shift definitions (IST boundaries in hours/minutes) ───
const SHIFTS = {
  shift1: { label: 'Night', fullLabel: 'Night (1AM–9AM)', startH: 1, startM: 0, endH: 9, endM: 0 },
  shift2: { label: 'Morning', fullLabel: 'Morning (9AM–5:30PM)', startH: 9, startM: 0, endH: 17, endM: 30 },
  shift3: { label: 'Evening', fullLabel: 'Evening (5:30PM–1AM)', startH: 17, startM: 30, endH: 25, endM: 0 },
} as const;

export type ShiftKey = 'all' | 'shift1' | 'shift2' | 'shift3';

export type TimeFilter =
  | { mode: '1d'; date: Date; shift: ShiftKey }
  | { mode: 'range'; from: Date; to: Date; shift: ShiftKey }
  | { mode: '7d' | '30d' | '1y'; shift: ShiftKey };

// IST offset in ms (+5:30)
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

/** Convert a Date + hour/minute (IST) to UTC timestamp */
function istToUtc(date: Date, hours: number, minutes: number): number {
  // Get the calendar date in IST terms
  const y = date.getFullYear();
  const m = date.getMonth();
  const d = date.getDate();
  // Extra days if hours >= 24 (shift3 end crosses midnight)
  const extraDays = Math.floor(hours / 24);
  const h = hours % 24;
  // Create as if UTC, then subtract IST offset
  const utc = Date.UTC(y, m, d + extraDays, h, minutes, 0, 0);
  return utc - IST_OFFSET_MS;
}

const PRESET_DAYS: Record<'7d' | '30d' | '1y', number> = { '7d': 7, '30d': 30, '1y': 365 };

export function getFilterShift(filter: TimeFilter): ShiftKey {
  return (filter as any).shift || 'all';
}

/** Calendar day span (IST) covered by a filter, used when a shift is applied. */
function getDaySpan(filter: TimeFilter): { from: Date; to: Date } {
  if (filter.mode === '1d') return { from: filter.date, to: filter.date };
  if (filter.mode === 'range') return { from: filter.from, to: filter.to };
  const to = new Date();
  const from = new Date();
  from.setDate(from.getDate() - (PRESET_DAYS[filter.mode] - 1));
  return { from, to };
}

export type TimeWindow = { start: number; end: number };

/**
 * Per-day windows for the filter. With a shift selected, every calendar day in
 * the range contributes only that shift's slice (the evening shift keeps its
 * after-midnight tail). "Full Day" collapses to one continuous window.
 */
export function buildShiftWindows(filter: TimeFilter): TimeWindow[] {
  const now = Date.now();
  const shift = getFilterShift(filter);
  const { from, to } = getDaySpan(filter);

  if (shift === 'all') {
    if (filter.mode === '7d' || filter.mode === '30d' || filter.mode === '1y') {
      // Preserve the existing rolling-window behaviour for full-day presets
      return [{ start: now - PRESET_DAYS[filter.mode] * 86400000, end: now }];
    }
    return [{ start: istToUtc(from, 0, 0), end: Math.min(istToUtc(to, 24, 0), now) }];
  }

  const def = SHIFTS[shift];
  const windows: TimeWindow[] = [];
  const cursor = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const last = new Date(to.getFullYear(), to.getMonth(), to.getDate());
  while (cursor <= last) {
    const start = istToUtc(cursor, def.startH, def.startM);
    const end = istToUtc(cursor, def.endH, def.endM);
    if (start < now) windows.push({ start, end: Math.min(end, now) });
    cursor.setDate(cursor.getDate() + 1);
  }
  return windows;
}

/** Predicate matching a timestamp against the filter's per-day shift windows. */
export function makeShiftPredicate(filter: TimeFilter): (ts: number) => boolean {
  const windows = buildShiftWindows(filter);
  return (ts: number) => windows.some((w) => ts >= w.start && ts <= w.end);
}

export function getTimestampsForFilter(filter: TimeFilter): { startTimestamp: number; endTimestamp: number } {
  const windows = buildShiftWindows(filter);
  if (windows.length === 0) {
    const now = Date.now();
    return { startTimestamp: now, endTimestamp: now };
  }
  return {
    startTimestamp: Math.min(...windows.map((w) => w.start)),
    endTimestamp: Math.max(...windows.map((w) => w.end)),
  };
}

// ─── Backward compatibility ───
export type TimePeriod = '1d' | '7d' | '30d' | '1y';

export function getTimestampsForPeriod(period: TimePeriod) {
  if (period === '1d') {
    return getTimestampsForFilter({ mode: '1d', date: new Date(), shift: 'all' });
  }
  return getTimestampsForFilter({ mode: period, shift: 'all' });
}

// ─── Serialization helpers for user prefs ───
export function serializeTimeFilter(f: TimeFilter): string {
  if (f.mode === '1d') {
    return JSON.stringify({ mode: '1d', date: f.date.toISOString(), shift: f.shift });
  }
  if (f.mode === 'range') {
    return JSON.stringify({ mode: 'range', from: f.from.toISOString(), to: f.to.toISOString(), shift: f.shift });
  }
  return JSON.stringify({ mode: f.mode, shift: f.shift });
}

export function deserializeTimeFilter(raw: string | undefined | null): TimeFilter {
  if (!raw) return { mode: '1d', date: new Date(), shift: 'all' };
  try {
    const obj = JSON.parse(raw);
    const shift: ShiftKey = obj.shift || 'all';
    if (obj.mode === '1d') {
      return { mode: '1d', date: new Date(obj.date), shift };
    }
    if (obj.mode === 'range' && obj.from && obj.to) {
      return { mode: 'range', from: new Date(obj.from), to: new Date(obj.to), shift };
    }
    if (['7d', '30d', '1y'].includes(obj.mode)) {
      return { mode: obj.mode, shift };
    }
  } catch {}
  // Legacy: plain period string like "30d"
  if (['7d', '30d', '1y'].includes(raw)) return { mode: raw as any, shift: 'all' };
  return { mode: '1d', date: new Date(), shift: 'all' };
}

export function getFilterLabel(filter: TimeFilter): string {
  const shift = getFilterShift(filter);
  const suffix = shift === 'all' ? '' : ` · ${SHIFTS[shift].fullLabel}`;
  if (filter.mode === '1d') {
    const isToday = new Date().toDateString() === filter.date.toDateString();
    const dateStr = isToday ? 'Today' : format(filter.date, 'dd MMM yyyy');
    return `${dateStr}${suffix}`;
  }
  if (filter.mode === 'range') {
    const sameYear = filter.from.getFullYear() === filter.to.getFullYear();
    const fromStr = format(filter.from, sameYear ? 'dd MMM' : 'dd MMM yyyy');
    const toStr = format(filter.to, 'dd MMM yyyy');
    return `${fromStr} – ${toStr}${suffix}`;
  }
  if (filter.mode === '7d') return `Last 7 Days${suffix}`;
  if (filter.mode === '30d') return `Last 30 Days${suffix}`;
  return `Last 1 Year${suffix}`;
}


// ─── Component ───
const rangePeriods = [
  { label: '7D', value: '7d' as const },
  { label: '30D', value: '30d' as const },
  { label: '1Y', value: '1y' as const },
];

const shiftOptions: { label: string; value: ShiftKey }[] = [
  { label: 'Full Day', value: 'all' },
  { label: 'S1', value: 'shift1' },
  { label: 'S2', value: 'shift2' },
  { label: 'S3', value: 'shift3' },
];

interface Props {
  value: TimeFilter;
  onChange: (v: TimeFilter) => void;
}

export function TimePeriodFilter({ value, onChange }: Props) {
  const [calOpen, setCalOpen] = useState(false);
  const [rangeOpen, setRangeOpen] = useState(false);
  const isDayMode = value.mode === '1d';
  const isRangeMode = value.mode === 'range';
  const selectedDate = isDayMode ? value.date : new Date();
  const activeShift = getFilterShift(value);
  const [draftRange, setDraftRange] = useState<DateRange | undefined>(
    isRangeMode ? { from: value.from, to: value.to } : undefined,
  );

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {/* Single date picker */}
      <Popover open={calOpen} onOpenChange={setCalOpen}>
        <PopoverTrigger asChild>
          <Button
            variant={isDayMode ? 'default' : 'outline'}
            size="sm"
            className={cn(
              'h-7 text-xs px-2.5 gap-1.5',
              isDayMode
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <CalendarIcon className="h-3 w-3" />
            {isDayMode ? format(selectedDate, 'dd MMM') : 'Date'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 t-scale-in" align="start">
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={(d) => {
              if (d) {
                onChange({ mode: '1d', date: d, shift: activeShift });
                setCalOpen(false);
              }
            }}
            disabled={(d) => d > new Date()}
            initialFocus
            className="p-3 pointer-events-auto"
          />
        </PopoverContent>
      </Popover>

      {/* Custom date range picker */}
      <Popover
        open={rangeOpen}
        onOpenChange={(o) => {
          setRangeOpen(o);
          if (o) setDraftRange(isRangeMode ? { from: value.from, to: value.to } : undefined);
        }}
      >
        <PopoverTrigger asChild>
          <Button
            variant={isRangeMode ? 'default' : 'outline'}
            size="sm"
            className={cn(
              'h-7 text-xs px-2.5 gap-1.5',
              isRangeMode
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <CalendarRange className="h-3 w-3" />
            {isRangeMode
              ? `${format(value.from, 'dd MMM')} – ${format(value.to, 'dd MMM')}`
              : 'Range'}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 t-scale-in" align="start">
          <Calendar
            mode="range"
            selected={draftRange}
            onSelect={(r) => setDraftRange(r)}
            disabled={(d) => d > new Date()}
            numberOfMonths={2}
            initialFocus
            className="p-3 pointer-events-auto"
          />
          <div className="flex items-center justify-end gap-2 border-t border-border p-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                setDraftRange(undefined);
                setRangeOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="h-7 text-xs"
              disabled={!draftRange?.from}
              onClick={() => {
                if (draftRange?.from) {
                  const from = draftRange.from;
                  const to = draftRange.to ?? draftRange.from;
                  onChange({ mode: 'range', from, to, shift: activeShift });
                  setRangeOpen(false);
                }
              }}
            >
              Apply
            </Button>
          </div>
        </PopoverContent>
      </Popover>


      {/* Shift chips — apply to single date, custom range and presets */}
      <div className="flex items-center gap-0.5 bg-secondary p-0.5 rounded-md border border-border h-7">
        {shiftOptions.map((s) => (
          <button
            key={s.value}
            type="button"
            className={cn(
              'h-6 px-2.5 text-[11px] rounded transition-colors duration-150',
              activeShift === s.value
                ? 'bg-card text-foreground border border-border'
                : 'text-muted-foreground hover:text-foreground'
            )}
            onClick={() => {
              if (value.mode === '1d') onChange({ mode: '1d', date: selectedDate, shift: s.value });
              else if (value.mode === 'range') onChange({ mode: 'range', from: value.from, to: value.to, shift: s.value });
              else onChange({ mode: value.mode, shift: s.value });
            }}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Range presets */}
      <div className="flex items-center gap-0.5 bg-secondary p-0.5 rounded-md border border-border h-7">
        {rangePeriods.map((p) => (
          <button
            key={p.value}
            type="button"
            className={cn(
              'h-6 px-2.5 text-[11px] rounded transition-colors duration-150',
              value.mode === p.value
                ? 'bg-card text-foreground border border-border'
                : 'text-muted-foreground hover:text-foreground'
            )}
            onClick={() => onChange({ mode: p.value, shift: activeShift })}

          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}
