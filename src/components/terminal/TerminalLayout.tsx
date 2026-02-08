import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { TerminalSidebar } from './TerminalSidebar';
import { TerminalHeader } from './TerminalHeader';

interface TerminalLayoutProps {
  children: React.ReactNode;
}

export function TerminalLayout({ children }: TerminalLayoutProps) {
  return (
    <div className="terminal">
      <SidebarProvider>
        <div className="flex w-full min-h-screen bg-background">
          <div className="hidden md:block">
            <TerminalSidebar />
          </div>
          <SidebarInset className="flex flex-col flex-1 min-w-0">
            <TerminalHeader />
            <main className="flex-1 overflow-auto bg-background">
              {children}
            </main>
          </SidebarInset>
        </div>
      </SidebarProvider>
    </div>
  );
}
