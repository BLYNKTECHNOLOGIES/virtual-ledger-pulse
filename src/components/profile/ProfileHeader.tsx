import type { ReactNode } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Clock, Mail, Phone, CalendarHeart, Building2 } from 'lucide-react';
import { StatusPill } from './primitives';
import { fmtDay, tenure } from './format';

/**
 * Identity card at the top of the profile page — who I am, where I sit and
 * the two things people come here to do most (apply for leave, fix a punch).
 */
export function ProfileHeader({
  displayName,
  avatarUrl,
  initials,
  isActive,
  badgeId,
  jobTitle,
  deptName,
  shiftName,
  joiningDate,
  email,
  phone,
  actions,
}: {
  displayName: string;
  avatarUrl?: string | null;
  initials: string;
  isActive?: boolean | null;
  badgeId?: string | number | null;
  jobTitle?: string | null;
  deptName?: string | null;
  shiftName?: string | null;
  joiningDate?: string | null;
  email?: string | null;
  phone?: string | null;
  actions?: ReactNode;
}) {
  const since = tenure(joiningDate);
  return (
    <header className="ds-panel relative overflow-hidden">
      <div aria-hidden className="absolute inset-x-0 top-0 h-[3px] bg-primary" />
      <div className="flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <Avatar className="h-14 w-14 shrink-0 border border-border sm:h-16 sm:w-16">
            {avatarUrl ? (
              <img src={avatarUrl} alt={displayName || 'Profile'} className="h-full w-full object-cover" />
            ) : (
              <AvatarFallback className="bg-primary/10 text-base font-semibold text-primary">{initials || 'U'}</AvatarFallback>
            )}
          </Avatar>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h1 className="t-page-title truncate text-foreground">{displayName}</h1>
              {isActive !== undefined && isActive !== null && (
                <StatusPill tone={isActive === false ? 'neutral' : 'success'}>{isActive === false ? 'Inactive' : 'Active'}</StatusPill>
              )}
            </div>

            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[13px] text-muted-foreground">
              {badgeId != null && badgeId !== '' && <span className="rounded bg-muted px-1.5 font-mono text-[12px] text-foreground">#{badgeId}</span>}
              {jobTitle && <span className="font-medium text-foreground">{jobTitle}</span>}
              {deptName && <span className="inline-flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />{deptName}</span>}
            </p>

            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
              {shiftName && (
                <span className="inline-flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 shrink-0" />{shiftName}</span>
              )}
              {joiningDate && (
                <span className="inline-flex items-center gap-1.5">
                  <CalendarHeart className="h-3.5 w-3.5 shrink-0" />
                  Joined {fmtDay(joiningDate)}{since ? ` · ${since}` : ''}
                </span>
              )}
              {email && (
                <span className="inline-flex min-w-0 items-center gap-1.5"><Mail className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{email}</span></span>
              )}
              {phone && (
                <span className="inline-flex items-center gap-1.5"><Phone className="h-3.5 w-3.5 shrink-0" />{phone}</span>
              )}
            </div>
          </div>
        </div>

        {actions && <div className="flex shrink-0 flex-wrap gap-2 [&>*]:flex-1 sm:[&>*]:flex-none">{actions}</div>}
      </div>
    </header>
  );
}
