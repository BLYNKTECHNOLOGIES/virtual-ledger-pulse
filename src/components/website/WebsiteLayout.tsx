
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { ModernNavbar } from './ModernNavbar';
import { ModernFooter } from './ModernFooter';

interface WebsiteLayoutProps {
  children: React.ReactNode;
}

function scrollToTop() {
  // React Router + data routers can preserve scroll; also some layouts scroll a container.
  const scrollingEl = document.scrollingElement as HTMLElement | null;
  if (scrollingEl) {
    scrollingEl.scrollTo({ top: 0, left: 0 });
  }

  // Fallbacks (older browsers / edge cases)
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
  window.scrollTo({ top: 0, left: 0 });
}

export function WebsiteLayout({ children }: WebsiteLayoutProps) {
  const { pathname } = useLocation();

  useEffect(() => {
    // Ensure it runs after route transition + layout paint
    const raf1 = requestAnimationFrame(() => {
      const raf2 = requestAnimationFrame(() => {
        scrollToTop();
      });
      // cleanup inner RAF
      return () => cancelAnimationFrame(raf2);
    });

    return () => cancelAnimationFrame(raf1);
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
