
import { useEffect } from 'react';

export function usePerformance() {
  useEffect(() => {
    // Monitor Core Web Vitals
    const observer = new PerformanceObserver((list) => {
      list.getEntries().forEach((entry) => {
        if (entry.entryType === 'navigation') {
          const navEntry = entry as PerformanceNavigationTiming;
          console.log('Page Load Time:', navEntry.loadEventEnd - navEntry.fetchStart);
        }
      });
    });

    observer.observe({ entryTypes: ['navigation'] });

    return () => observer.disconnect();
  }, []);
}
