
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { ModernNavbar } from './ModernNavbar';
import { ModernFooter } from './ModernFooter';

interface WebsiteLayoutProps {
  children: React.ReactNode;
}

export function WebsiteLayout({ children }: WebsiteLayoutProps) {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

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
