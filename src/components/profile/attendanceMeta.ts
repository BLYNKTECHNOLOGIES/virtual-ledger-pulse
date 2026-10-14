import type { LucideIcon } from 'lucide-react';
import { CheckCircle2, PieChart, XCircle, Palmtree, PartyPopper, Coffee, Timer, Circle, Loader } from 'lucide-react';
import type { StatusTone } from './primitives';
import { resolveDayStatus, type AttendanceDay } from '@/hooks/hrms/useAttendanceDay';

/**
 * One look for every attendance status on the profile page (calendar, today
 * card, day list, overview). Colours use the theme's status tokens only.
 */
export type DayKey =
  | 'present'
  | 'half_day'
  | 'absent'
  | 'on_leave'
  | 'holiday'
  | 'week_off'
  | 'incomplete'
  | 'in_progress'
  | 'no_punch'
  | 'upcoming';

export const DAY_META: Record<
  DayKey,
  { label: string; short: string; hint?: string; icon: LucideIcon; tone: StatusTone; cell: string; text: string; dot: string }
> = {
  present: {
    label: 'Present', short: 'P', hint: 'Marked present', icon: CheckCircle2, tone: 'success',
    cell: 'bg-success/10 border-success/30', text: 'text-success', dot: 'bg-success',
  },
  half_day: {
    label: 'Half day', short: '½', hint: 'Half day credited', icon: PieChart, tone: 'warning',
    cell: 'bg-warning/10 border-warning/40', text: 'text-warning', dot: 'bg-warning',
  },
  absent: {
    label: 'Absent', short: 'A', hint: 'Marked absent', icon: XCircle, tone: 'danger',
    cell: 'bg-destructive/10 border-destructive/30', text: 'text-destructive', dot: 'bg-destructive',
  },
  on_leave: {
    label: 'On leave', short: 'L', hint: 'Approved leave', icon: Palmtree, tone: 'info',
    cell: 'bg-primary/10 border-primary/30', text: 'text-primary', dot: 'bg-primary',
  },
  holiday: {
    label: 'Holiday', short: 'H', hint: 'Company holiday', icon: PartyPopper, tone: 'neutral',
    cell: 'bg-muted border-border', text: 'text-foreground', dot: 'bg-foreground/60',
  },
  week_off: {
    label: 'Week off', short: 'W', hint: 'Weekly off', icon: Coffee, tone: 'neutral',
    cell: 'bg-muted/50 border-border/70', text: 'text-muted-foreground', dot: 'bg-muted-foreground/50',
  },
  incomplete: {
    label: 'Punch-out missing', short: '!', hint: 'Punch-out missing — pending HR review', icon: Timer, tone: 'warning',
    cell: 'bg-warning/15 border-warning/60', text: 'text-warning', dot: 'bg-warning',
  },
  in_progress: {
    label: 'In progress', short: '•', hint: 'Shift still running', icon: Loader, tone: 'info',
    cell: 'bg-card border-primary/60', text: 'text-primary', dot: 'bg-primary',
  },
  no_punch: {
    label: 'No punch', short: '—', hint: 'No punch recorded', icon: Circle, tone: 'neutral',
    cell: 'bg-background border-dashed border-border', text: 'text-muted-foreground', dot: 'bg-muted-foreground/30',
  },
  upcoming: {
    label: 'Upcoming', short: '', icon: Circle, tone: 'neutral',
    cell: 'bg-transparent border-border/40', text: 'text-muted-foreground/60', dot: 'bg-transparent',
  },
};

/** Legend order shown under the calendar. */
export const LEGEND_ORDER: DayKey[] = ['present', 'half_day', 'absent', 'on_leave', 'holiday', 'week_off', 'incomplete', 'in_progress', 'no_punch'];

/** Calendar key for a day row, via the same resolver HR's calendar uses. */
export function dayKeyOf(day?: AttendanceDay | null): DayKey {
  if (!day) return 'no_punch';
  const s = resolveDayStatus(day) as string;
  return (s in DAY_META ? s : 'no_punch') as DayKey;
}
