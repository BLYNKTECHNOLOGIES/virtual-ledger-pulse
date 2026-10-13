
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
      // Cached identity is never proof of a live, active ERP account.
      setIsAuthenticated(false);
      
      if (location.pathname === '/terminal/register-device') {
        navigate(`/?next=${encodeURIComponent(location.pathname + location.search)}`);
      } else {
        navigate('/');
      }
    };

    checkAuth();
  }, [isLoading, navigate, user, location.pathname, location.search]);

  if (isLoading || !user || isAuthenticated !== true || standbyBlocked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }


  return <>{children}</>;
}
