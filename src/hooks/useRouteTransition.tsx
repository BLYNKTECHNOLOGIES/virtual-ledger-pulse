
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

export const useRouteTransition = () => {
  const [isTransitioning, setIsTransitioning] = useState(false);
  const location = useLocation();

  useEffect(() => {
    setIsTransitioning(true);
    const timer = setTimeout(() => {
      setIsTransitioning(false);
    }, 150); // Short transition time

    return () => clearTimeout(timer);
  }, [location.pathname]);

  return { isTransitioning, currentRoute: location.pathname };
};
