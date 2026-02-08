import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { TerminalSidebar } from './TerminalSidebar';
import { TerminalHeader } from './TerminalHeader';
import { TerminalAuthProvider, useTerminalAuth } from '@/hooks/useTerminalAuth';
import { ShieldOff, Loader2 } from 'lucide-react';

interface TerminalLayoutProps {
  children: React.ReactNode;
}

function TerminalAccessGate({ children }: { children: React.ReactNode }) {
  const { terminalRoles, isLoading, userId } = useTerminalAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!userId || terminalRoles.length === 0) {
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

  return <>{children}</>;
}

export function TerminalLayout({ children }: TerminalLayoutProps) {
  return (
    <div className="terminal">
      <TerminalAuthProvider>
        <TerminalAccessGate>
          <SidebarProvider>
            <div className="flex w-full min-h-screen bg-background">
              <div className="hidden md:block">
                <TerminalSidebar />
              </div>
              <SidebarInset className="flex flex-col flex-1 min-w-0">
                <TerminalHeader />
                <main className="flex-1 overflow-auto">
                  {children}
                </main>
              </SidebarInset>
            </div>
          </SidebarProvider>
        </TerminalAccessGate>
      </TerminalAuthProvider>
    </div>
  );
}
