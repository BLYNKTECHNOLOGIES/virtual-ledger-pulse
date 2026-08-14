
import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { isStandbyRoles, isStandbyAllowedPath } from '@/hooks/useIsStandby';

interface AuthCheckProps {
  children: React.ReactNode;
}

export function AuthCheck({ children }: AuthCheckProps) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isLoading } = useAuth();

  // Standby lockdown: only the profile section is reachable.
  const standbyBlocked =
    !!user && isStandbyRoles(user.roles) && !isStandbyAllowedPath(location.pathname);

  useEffect(() => {
    if (standbyBlocked) {
      navigate('/profile', { replace: true });
    }
  }, [standbyBlocked, navigate]);


  useEffect(() => {
    if (isLoading) return;

    if (user) {
      setIsAuthenticated(true);
      return;
    }

    const checkAuth = async () => {
      // Fallback: Check legacy localStorage session only after AuthProvider has settled.
      const isLoggedIn = localStorage.getItem('isLoggedIn');
      const userSession = localStorage.getItem('userSession');
      
      if (isLoggedIn === 'true' && userSession) {
        try {
          const parsed = JSON.parse(userSession);
          if (parsed?.user?.id) {
            setIsAuthenticated(true);
            return;
          }
        } catch { /* invalid session */ }
      }
      
      navigate('/');
    };

    checkAuth();
  }, [isLoading, navigate, user]);

  if (isLoading || isAuthenticated === null || standbyBlocked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }


  return <>{children}</>;
}
