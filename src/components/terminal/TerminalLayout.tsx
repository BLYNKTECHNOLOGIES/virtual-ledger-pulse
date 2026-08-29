import { Suspense } from 'react';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { TerminalSidebar } from './TerminalSidebar';
import { TerminalHeader } from './TerminalHeader';
import { TerminalAuthProvider, useTerminalAuth } from '@/hooks/useTerminalAuth';
import { BiometricAuthGate } from './BiometricAuthGate';
import { TerminalStandby } from './TerminalStandby';
import { ShieldOff, Loader2 } from 'lucide-react';
import { usePermissions } from '@/hooks/usePermissions';
import { TerminalPresenceAndAlerts } from './TerminalPresenceAndAlerts';
import { ExchangeAccountProvider } from '@/contexts/ExchangeAccountContext';
import { TerminalShortcutsProvider } from '@/contexts/TerminalShortcutsProvider';
import { TerminalThemeProvider, useTerminalTheme } from '@/contexts/TerminalThemeContext';

interface TerminalLayoutProps {
  children: React.ReactNode;
}

function TerminalAccessGate({ children }: { children: React.ReactNode }) {
  const { terminalRoles, isLoading, userId, isTerminalAdmin } = useTerminalAuth();
  const { hasPermission, isLoading: permsLoading } = usePermissions();
  // Once the terminal has rendered, never unmount it for a background
  // revalidation (e.g. tab-focus token refresh) — that would destroy open
  // chat workspaces and page state. The full-screen spinner is first-load only.
  const hasRenderedRef = useRef(false);
  const loading = isLoading || permsLoading;
  if (!loading) hasRenderedRef.current = true;

  if (loading && !hasRenderedRef.current) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const hasTerminalRole = terminalRoles.length > 0 || isTerminalAdmin;
  const canEnterStandby = hasPermission('terminal_view');

  // No ERP Terminal access grant at all — nothing to show.
  if (!userId || (!hasTerminalRole && !canEnterStandby)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background gap-4 px-4 text-center">
        <ShieldOff className="h-16 w-16 text-muted-foreground/40" />
        <h1 className="text-xl font-semibold text-foreground">Access Denied</h1>
        <p className="text-sm text-muted-foreground max-w-md">
          You don't have permission to access the P2P Trading Terminal. Contact an administrator to request access.
        </p>
      </div>
    );
  }

  // Signed in, but no Terminal role yet — standby mode: biometric enrolment only.
  if (!hasTerminalRole) {
    return <TerminalStandby />;
  }

  return <>{children}</>;
}

function TerminalThemedShell({ children }: { children: React.ReactNode }) {
  const { theme } = useTerminalTheme();
  return <div className={`terminal ${theme === 'light' ? 't-light' : 't-dark'}`}>{children}</div>;
}

export function TerminalLayout({ children }: TerminalLayoutProps) {
  return (
    <TerminalThemeProvider>
      <TerminalThemedShell>

      <TerminalAuthProvider>
        <TerminalAccessGate>
          <BiometricAuthGate>
           <ExchangeAccountProvider>
             <TerminalShortcutsProvider>
               <TerminalPresenceAndAlerts />
               <SidebarProvider>
                  <div className="flex w-full min-h-screen bg-background">
                    <div className="hidden md:block">
                      <TerminalSidebar />
                    </div>
                    <SidebarInset className="flex flex-col flex-1 min-w-0">
                      <TerminalHeader />
                      <main className="flex-1 overflow-auto t-grid-bg">
                        <div className="t-mount">
                          <Suspense
                            fallback={
                              <div className="flex min-h-[50vh] items-center justify-center bg-background">
                                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                              </div>
                            }
                          >
                            {children}
                          </Suspense>
                        </div>
                      </main>
                    </SidebarInset>
                  </div>
                </SidebarProvider>
             </TerminalShortcutsProvider>
           </ExchangeAccountProvider>
          </BiometricAuthGate>
        </TerminalAccessGate>
      </TerminalAuthProvider>
      </TerminalThemedShell>
    </TerminalThemeProvider>
  );
}

