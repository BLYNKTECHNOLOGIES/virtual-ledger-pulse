import { useState } from 'react';
import { format } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

// ─── Shift definitions (IST boundaries in hours/minutes) ───
const SHIFTS = {
  shift1: { label: 'S1', fullLabel: 'Shift 1 (1AM–9AM)', startH: 1, startM: 0, endH: 9, endM: 0 },
  shift2: { label: 'S2', fullLabel: 'Shift 2 (9AM–5:30PM)', startH: 9, startM: 0, endH: 17, endM: 30 },
  shift3: { label: 'S3', fullLabel: 'Shift 3 (5:30PM–1AM)', startH: 17, startM: 30, endH: 25, endM: 0 }, // 25 = next day 1AM
} as const;

export type ShiftKey = 'all' | 'shift1' | 'shift2' | 'shift3';

export type TimeFilter =
  | { mode: '1d'; date: Date; shift: ShiftKey }
  | { mode: '7d' | '30d' | '1y' };

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

export function getTimestampsForFilter(filter: TimeFilter): { startTimestamp: number; endTimestamp: number } {
  const now = Date.now();

  if (filter.mode !== '1d') {
    switch (filter.mode) {
      case '7d':
        return { startTimestamp: now - 7 * 24 * 60 * 60 * 1000, endTimestamp: now };
      case '30d':
        return { startTimestamp: now - 30 * 24 * 60 * 60 * 1000, endTimestamp: now };
      case '1y':
        return { startTimestamp: now - 365 * 24 * 60 * 60 * 1000, endTimestamp: now };
    }
  }

  const date = filter.date;
  const shift = filter.shift;

  if (shift === 'all') {
    // Full day: 00:00 IST → min(next day 00:00 IST, now)
    const start = istToUtc(date, 0, 0);
    const end = istToUtc(date, 24, 0);
    return { startTimestamp: start, endTimestamp: Math.min(end, now) };
  }

  const def = SHIFTS[shift];
  const start = istToUtc(date, def.startH, def.startM);
  const end = istToUtc(date, def.endH, def.endM);
  return { startTimestamp: start, endTimestamp: Math.min(end, now) };
}

// ─── Backward compatibility ───
export type TimePeriod = '1d' | '7d' | '30d' | '1y';

export function getTimestampsForPeriod(period: TimePeriod) {
  if (period === '1d') {
    return getTimestampsForFilter({ mode: '1d', date: new Date(), shift: 'all' });
  }
  return getTimestampsForFilter({ mode: period });
}

// ─── Serialization helpers for user prefs ───
export function serializeTimeFilter(f: TimeFilter): string {
  if (f.mode === '1d') {
    return JSON.stringify({ mode: '1d', date: f.date.toISOString(), shift: f.shift });
  }
  return JSON.stringify({ mode: f.mode });
}

export function deserializeTimeFilter(raw: string | undefined | null): TimeFilter {
  if (!raw) return { mode: '1d', date: new Date(), shift: 'all' };
  try {
    const obj = JSON.parse(raw);
    if (obj.mode === '1d') {
      return { mode: '1d', date: new Date(obj.date), shift: obj.shift || 'all' };
    }
    if (['7d', '30d', '1y'].includes(obj.mode)) {
      return { mode: obj.mode };
    }
  } catch {}
  // Legacy: plain period string like "30d"
  if (['7d', '30d', '1y'].includes(raw)) return { mode: raw as any };
  return { mode: '1d', date: new Date(), shift: 'all' };
}

export function getFilterLabel(filter: TimeFilter): string {
  if (filter.mode === '1d') {
    const isToday = new Date().toDateString() === filter.date.toDateString();
    const dateStr = isToday ? 'Today' : format(filter.date, 'dd MMM yyyy');
    if (filter.shift === 'all') return dateStr;
    return `${dateStr} · ${SHIFTS[filter.shift].fullLabel}`;
  }
  if (filter.mode === '7d') return 'Last 7 Days';
  if (filter.mode === '30d') return 'Last 30 Days';
  return 'Last 1 Year';
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
  const isDayMode = value.mode === '1d';
  const selectedDate = isDayMode ? value.date : new Date();
  const activeShift = isDayMode ? value.shift : 'all';

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {/* Date picker */}
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
        <PopoverContent className="w-auto p-0" align="start">
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

      {/* Shift chips — only in day mode */}
      {isDayMode && (
        <div className="flex items-center gap-0.5 bg-secondary rounded-lg p-0.5">
          {shiftOptions.map((s) => (
            <Button
              key={s.value}
              variant={activeShift === s.value ? 'default' : 'ghost'}
              size="sm"
              className={cn(
                'h-6 text-[10px] px-2',
                activeShift === s.value
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              onClick={() => onChange({ mode: '1d', date: selectedDate, shift: s.value })}
            >
              {s.label}
            </Button>
          ))}
        </div>
      )}

      {/* Range presets */}
      <div className="flex items-center gap-0.5 bg-secondary rounded-lg p-0.5">
        {rangePeriods.map((p) => (
          <Button
            key={p.value}
            variant={value.mode === p.value ? 'default' : 'ghost'}
            size="sm"
            className={cn(
              'h-6 text-[10px] px-2.5',
              value.mode === p.value
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
            onClick={() => onChange({ mode: p.value })}
          >
            {p.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
