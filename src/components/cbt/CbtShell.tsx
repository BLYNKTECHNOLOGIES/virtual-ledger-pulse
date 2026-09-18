import { ReactNode } from 'react';
import { AlertTriangle, ShieldCheck } from 'lucide-react';
import { formatClock } from '@/lib/cbt/api';

type Props = {
  brand?: string;
  company?: string;
  logoUrl?: string | null;
  candidateName?: string;
  roleName?: string;
  publicRef?: string;
  secondsLeft?: number | null;
  warningCount?: number;
  maxWarnings?: number | null;
  progress?: { current: number; total: number } | null;
  children: ReactNode;
};

export function CbtShell({
  brand,
  company,
  logoUrl,
  candidateName,
  roleName,
  publicRef,
  secondsLeft,
  warningCount = 0,
  maxWarnings,
  progress,
  children,
}: Props) {
  const lowTime = typeof secondsLeft === 'number' && secondsLeft <= 60;
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2 px-3 py-2 sm:gap-3 sm:px-4 sm:py-3">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            {logoUrl ? (
              <img src={logoUrl} alt={`${brand ?? 'Company'} logo`} className="h-7 w-auto sm:h-8" />
            ) : (
              <ShieldCheck className="h-5 w-5 text-primary sm:h-6 sm:w-6" aria-hidden />
            )}
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{brand ?? 'Assessment'}</p>
              <p className="truncate text-xs text-muted-foreground">{company ?? ''}</p>
            </div>
          </div>

          <div className="ml-auto flex flex-wrap items-center justify-end gap-2 text-xs sm:gap-3">
            {candidateName && (
              <div className="hidden text-right sm:block">
                <p className="font-medium">{candidateName}</p>
                <p className="text-muted-foreground">
                  {roleName}
                  {publicRef ? ` · ${publicRef}` : ''}
                </p>
              </div>
            )}
            {progress && (
              <span className="rounded-md border border-border px-2 py-1 text-muted-foreground">
                Section {progress.current} of {progress.total}
              </span>
            )}
            {typeof maxWarnings === 'number' && warningCount > 0 && (
              <span className="flex items-center gap-1 rounded-md bg-destructive/10 px-2 py-1 font-medium text-destructive">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                Warning {warningCount} of {maxWarnings}
              </span>
            )}
            {typeof secondsLeft === 'number' && (
              <span
                aria-live="polite"
                className={`rounded-md px-3 py-1 font-mono text-base font-semibold tabular-nums ${
                  lowTime ? 'bg-destructive text-destructive-foreground' : 'bg-muted text-foreground'
                }`}
              >
                {formatClock(secondsLeft)}
              </span>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl px-3 py-4 pb-24 sm:px-4 sm:py-6 sm:pb-6">{children}</main>
    </div>
  );
}
