
import { ModernNavbar } from './ModernNavbar';
import { ModernFooter } from './ModernFooter';

interface WebsiteLayoutProps {
  children: React.ReactNode;
}

export function WebsiteLayout({ children }: WebsiteLayoutProps) {
  return (
    <div className="min-h-screen w-full">
      <ModernNavbar />
      <main className="w-full">
        {children}
      </main>
      <ModernFooter />
    </div>
  );
}
