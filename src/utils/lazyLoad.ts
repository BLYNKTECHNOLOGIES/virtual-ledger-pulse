
import { lazy, createElement } from 'react';

// Utility function for lazy loading with error boundary
export const lazyLoad = (importFunc: () => Promise<any>) => {
  return lazy(() => 
    importFunc().catch(() => ({
      default: () => createElement('div', null, 'Error loading component')
    }))
  );
};

// Preload function for critical routes
export const preloadRoute = (importFunc: () => Promise<any>) => {
  importFunc();
};
