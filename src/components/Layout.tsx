
import { SidebarProvider } from '@/components/ui/sidebar';
import { AppSidebar } from '@/components/AppSidebar';
import { TopHeader } from '@/components/TopHeader';
import { ScreenShareRequestHandler } from './user-management/ScreenShareRequestHandler';
import { ErrorBoundary } from './ErrorBoundary';

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <SidebarProvider defaultOpen={false}>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <main className="flex-1 flex flex-col relative">
          <TopHeader />
          <div className="flex-1 overflow-auto">
            <ErrorBoundary>
              {children}
            </ErrorBoundary>
          </div>
          
          {/* Add screen share request handler for all users */}
          <ScreenShareRequestHandler />
        </main>
      </div>
    </SidebarProvider>
  );
}
