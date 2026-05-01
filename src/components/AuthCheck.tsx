
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';

interface AuthCheckProps {
  children: React.ReactNode;
}

export function AuthCheck({ children }: AuthCheckProps) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const navigate = useNavigate();
  const { user, isLoading } = useAuth();

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

  if (isLoading || isAuthenticated === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return <>{children}</>;
}
