
import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { ModernNavbar } from './ModernNavbar';
import { ModernFooter } from './ModernFooter';

interface WebsiteLayoutProps {
  children: React.ReactNode;
}

function scrollToTop() {
  // Some environments (and certain layouts) scroll a container instead of the window.
  const candidates: Array<HTMLElement | null> = [
    document.scrollingElement as HTMLElement | null,
    document.documentElement,
    document.body,
    document.getElementById('root'),
    document.querySelector('main'),
  ];

  // Also target any common "overflow" containers inside the app.
  const overflowNodes = Array.from(
    document.querySelectorAll<HTMLElement>('.overflow-y-auto, .overflow-auto')
  );

  const unique = Array.from(new Set([...candidates, ...overflowNodes].filter(Boolean))) as HTMLElement[];

  for (const el of unique) {
    try {
      el.scrollTop = 0;
      el.scrollLeft = 0;
    } catch {
      // ignore
    }
  }

  // Final window fallback
  window.scrollTo({ top: 0, left: 0 });

  // Debug (visible in console): helps confirm which element actually had scroll
  const top = (document.scrollingElement as HTMLElement | null)?.scrollTop ?? 0;
  // eslint-disable-next-line no-console
  console.debug('[scrollToTop] applied', { top, pathname: window.location.pathname });
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
