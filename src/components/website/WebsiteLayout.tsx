
import { ModernNavbar } from './ModernNavbar';
import { ModernFooter } from './ModernFooter';
import { ScrollToTop } from '../ScrollToTop';

interface WebsiteLayoutProps {
  children: React.ReactNode;
}

export function WebsiteLayout({ children }: WebsiteLayoutProps) {
  return (
    <div className="min-h-screen w-full">
      <ScrollToTop />
      <ModernNavbar />
      <main className="w-full">
        {children}
      </main>
      <ModernFooter />
    </div>
  );
}
