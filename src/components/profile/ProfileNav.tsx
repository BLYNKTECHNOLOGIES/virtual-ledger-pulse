import { Fragment, useEffect, useRef } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard, ListChecks, Inbox, Building2, CalendarCheck2, CalendarDays, IndianRupee, Receipt,
  Landmark, FileText, Laptop, BookOpen, LifeBuoy, Settings,
} from 'lucide-react';
import { TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { CountBadge } from './primitives';

export interface ProfileNavItem {
  value: string;
  label: string;
  icon: LucideIcon;
  count?: number;
  countTone?: 'info' | 'warning' | 'neutral';
}

/** Tab values are part of the URL contract (?tab=…) — don't rename them. */
export function buildProfileNav({
  showDepartment,
  counts,
}: {
  showDepartment: boolean;
  counts: { requests?: number; tasks?: number };
}): Array<{ group: string | null; items: ProfileNavItem[] }> {
  return [
    { group: null, items: [{ value: 'profile', label: 'Overview', icon: LayoutDashboard }] },
    {
      group: 'Time',
      items: [
        { value: 'attendance', label: 'Attendance', icon: CalendarCheck2 },
        { value: 'leaves', label: 'Leave', icon: CalendarDays },
      ],
    },
    {
      group: 'Pay',
      items: [
        { value: 'salary', label: 'Salary & PF', icon: IndianRupee },
        { value: 'payslips', label: 'Payslips', icon: Receipt },
        { value: 'banking', label: 'Bank details', icon: Landmark },
      ],
    },
    {
      group: 'Work',
      items: [
        { value: 'requests', label: 'Requests', icon: Inbox, count: counts.requests, countTone: 'warning' },
        { value: 'tasks', label: 'My tasks', icon: ListChecks, count: counts.tasks, countTone: 'neutral' },
        ...(showDepartment ? [{ value: 'my-department', label: 'My department', icon: Building2 }] : []),
      ],
    },
    {
      group: 'Records',
      items: [
        { value: 'documents', label: 'Documents', icon: FileText },
        { value: 'assets', label: 'Assets', icon: Laptop },
      ],
    },
    {
      group: 'Company',
      items: [
        { value: 'policies', label: 'Policies', icon: BookOpen },
        { value: 'helpdesk', label: 'Help desk', icon: LifeBuoy },
      ],
    },
    { group: 'Account', items: [{ value: 'settings', label: 'Settings', icon: Settings }] },
  ];
}

/**
 * Section navigation for the profile page: a sticky, grouped list on wide
 * screens and a single scrollable row of pills on phones and tablets.
 * Must be rendered inside the page's <Tabs>.
 */
export function ProfileNav({ groups, active }: { groups: ReturnType<typeof buildProfileNav>; active?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  // On phones the pills scroll sideways: keep the current section in view.
  useEffect(() => {
    const list = ref.current;
    if (!list || list.scrollWidth <= list.clientWidth + 1) return;
    const el = list.querySelector<HTMLElement>('[role="tab"][data-state="active"]');
    if (!el) return;
    const lr = list.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    const delta = er.left - lr.left - (lr.width - er.width) / 2;
    list.scrollBy({ left: delta, behavior: 'smooth' });
  }, [active]);

  return (
    <TabsList
      ref={ref}
      aria-label="Profile sections"
      className={cn(
        'flex h-auto min-h-0 w-full flex-nowrap items-center justify-start gap-1.5 overflow-x-auto rounded-none border-0 bg-transparent p-0 text-muted-foreground',
        '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        'xl:sticky xl:top-4 xl:flex-col xl:items-stretch xl:gap-0.5 xl:overflow-visible xl:rounded-[var(--radius-card)] xl:border xl:border-border xl:bg-card xl:p-2',
      )}
    >
      {groups.map((g, gi) => (
        <Fragment key={g.group ?? `g${gi}`}>
          {g.group && (
            <div className="hidden px-2.5 pb-1 pt-3 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground/80 xl:block" aria-hidden>
              {g.group}
            </div>
          )}
          {g.items.map((item) => {
            const Icon = item.icon;
            return (
              <TabsTrigger
                key={item.value}
                value={item.value}
                className={cn(
                  'group relative shrink-0 justify-start gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-[13px] font-medium text-muted-foreground shadow-none',
                  'hover:text-foreground',
                  'data-[state=active]:border-primary/30 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:shadow-none',
                  'xl:w-full xl:rounded-md xl:border-transparent xl:bg-transparent xl:px-2.5 xl:py-2',
                  'xl:hover:bg-muted/60 xl:data-[state=active]:border-transparent xl:data-[state=active]:bg-primary/10 xl:data-[state=active]:font-semibold',
                )}
              >
                <Icon className="h-4 w-4 shrink-0 opacity-80 group-data-[state=active]:opacity-100" aria-hidden />
                <span className="truncate">{item.label}</span>
                {!!item.count && <CountBadge count={item.count} tone={item.countTone} className="xl:ml-auto" />}
              </TabsTrigger>
            );
          })}
        </Fragment>
      ))}
    </TabsList>
  );
}
